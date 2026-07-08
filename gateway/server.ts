import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pipeline, Readable } from "node:stream";
import type { Registry } from "../src/types";
import { loadRegistry, resolveModel } from "./registry";
import { OpenAISseTranslator, toAnthropicResponse, toGatewayError } from "./openai-adapter";
import { buildUpstreamRequest, errorBody, GatewayError } from "./upstream";

/**
 * Anthropic-compatible 多模型网关（本地/自有服务器运行，不部署到 Pages）。
 *
 *   POST /v1/messages  Anthropic Messages 格式请求，按 body.model 路由到 provider。
 *                      anthropic 协议 provider：响应（含 stream:true 的 SSE）原样透传；
 *                      openai 协议 provider：经适配层做 Messages ⇄ chat/completions 转换。
 *   GET  /v1/models    从 registry 生成模型清单。
 *   GET  /healthz      存活检查。
 *
 * key 只存在于本进程环境变量（.env / export），任何响应都不含 key。
 */

const MAX_BODY_BYTES = 20 * 1024 * 1024;
export const DEFAULT_GATEWAY_HOST = "127.0.0.1";

export function resolveGatewayHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.GATEWAY_HOST?.trim() || DEFAULT_GATEWAY_HOST;
}

function configuredAuthToken(env: NodeJS.ProcessEnv): string | null {
  const token = env.GATEWAY_AUTH_TOKEN?.trim();
  return token ? token : null;
}

/**
 * 非回环地址监听且未设置 GATEWAY_AUTH_TOKEN 时拒绝启动的原因；可安全启动返回 null。
 * 不设 token 对外监听等于把全部 provider key 暴露成公开代理，README 的「必须设置」在此强制执行。
 * 只在 CLI 启动路径检查；createGateway 本身不限制（测试等嵌入方自行负责监听地址）。
 */
export function unsafeListenReason(host: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const loopback = host === "localhost" || host === "::1" || host.startsWith("127.");
  if (loopback || configuredAuthToken(env)) return null;
  return (
    `GATEWAY_HOST=${host} 监听非回环地址但未设置 GATEWAY_AUTH_TOKEN：` +
    `任何能访问该地址的人都可以用你配置的 provider key 调用上游，拒绝启动。`
  );
}

function sendError(res: http.ServerResponse, err: GatewayError): void {
  res.writeHead(err.status, { "content-type": "application/json" });
  res.end(errorBody(err));
}

function bearerTokenMatches(header: string | undefined, token: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;
  const supplied = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function requireInboundAuth(
  req: http.IncomingMessage,
  path: string,
  env: NodeJS.ProcessEnv,
): void {
  if (path === "/healthz") return;
  const token = configuredAuthToken(env);
  if (!token) return;
  if (!bearerTokenMatches(req.headers.authorization, token)) {
    throw new GatewayError(401, "authentication_error", "缺少或无效的入站鉴权令牌");
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new GatewayError(413, "request_too_large", "请求体超过 20MB 上限"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleMessages(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  registry: Registry,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new GatewayError(400, "invalid_request_error", "请求体不是合法 JSON");
  }
  const modelId = typeof body.model === "string" ? body.model : "";
  if (!modelId) {
    throw new GatewayError(400, "invalid_request_error", "缺少 model 字段");
  }
  const resolved = resolveModel(modelId, registry);
  if (!resolved) {
    const known = registry.models.map((m) => m.id).join(", ");
    throw new GatewayError(
      404,
      "not_found_error",
      `model "${modelId}" 未在 registry 注册。可用：${known}`,
    );
  }

  // 客户端断开即中止上游请求：LLM 流式输出按 token 计费，不中止上游会继续生成、白白扣费
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  const upstream = buildUpstreamRequest(resolved, body);
  const upstreamRes = await fetch(upstream.url, {
    method: "POST",
    headers: upstream.headers,
    body: upstream.body,
    signal: abort.signal,
  });

  if (resolved.provider.protocol === "openai") {
    await relayOpenAI(res, upstreamRes, modelId, body.stream === true);
    return;
  }

  // anthropic 协议：状态码 + 关键头 + body 原样透传；stream:true 时逐字节 pipe SSE，不缓冲不改写
  const passHeaders: Record<string, string> = {};
  for (const name of ["content-type", "anthropic-request-id", "request-id", "cache-control"]) {
    const v = upstreamRes.headers.get(name);
    if (v) passHeaders[name] = v;
  }
  res.writeHead(upstreamRes.status, passHeaders);
  if (upstreamRes.body) {
    // pipeline 而非 pipe：任一端提前关闭/出错时销毁另一端，abort 引发的流错误也在回调里吞掉
    pipeline(
      Readable.fromWeb(upstreamRes.body as import("node:stream/web").ReadableStream),
      res,
      () => {},
    );
  } else {
    res.end();
  }
}

/** openai 协议：上游 chat/completions 响应转回 Anthropic 格式（含 SSE 事件翻译） */
async function relayOpenAI(
  res: http.ServerResponse,
  upstreamRes: Response,
  gatewayModelId: string,
  wantStream: boolean,
): Promise<void> {
  if (!upstreamRes.ok) {
    throw toGatewayError(upstreamRes.status, await upstreamRes.text());
  }
  const isSse = upstreamRes.headers.get("content-type")?.includes("text/event-stream") ?? false;
  if (wantStream && isSse && upstreamRes.body) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const translator = new OpenAISseTranslator(gatewayModelId);
    const decoder = new TextDecoder();
    for await (const chunk of upstreamRes.body as unknown as AsyncIterable<Uint8Array>) {
      const out = translator.feed(decoder.decode(chunk, { stream: true }));
      if (out) res.write(out);
    }
    const tail = translator.end();
    if (tail) res.write(tail);
    res.end();
    return;
  }
  const json = (await upstreamRes.json()) as Record<string, unknown>;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(toAnthropicResponse(json, gatewayModelId)));
}

function handleModels(res: http.ServerResponse, registry: Registry): void {
  const data = registry.models.map((m) => {
    const provider = registry.providers.find((p) => p.key === m.provider)!;
    return {
      type: "model",
      id: m.id,
      display_name: m.id,
      provider: provider.key,
      provider_label: provider.label,
      upstream_model: m.upstreamModel,
      auth: provider.auth,
      ...(m.notes ? { notes: m.notes } : {}),
    };
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data, has_more: false }));
}

export interface GatewayOptions {
  env?: NodeJS.ProcessEnv;
}

/** registry 参数仅供测试注入 mock 上游；生产路径用 registry.json */
export function createGateway(
  registry: Registry = loadRegistry(),
  options: GatewayOptions = {},
): http.Server {
  const env = options.env ?? process.env;
  return http.createServer((req, res) => {
    const url = req.url ?? "";
    const path = url.split("?", 1)[0];
    void (async () => {
      try {
        requireInboundAuth(req, path, env);
        if (req.method === "POST" && path === "/v1/messages") {
          await handleMessages(req, res, registry);
        } else if (req.method === "GET" && path === "/v1/models") {
          handleModels(res, registry);
        } else if (req.method === "GET" && path === "/healthz") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } else {
          sendError(res, new GatewayError(404, "not_found_error", `未知路由 ${req.method} ${url}`));
        }
      } catch (err) {
        if (res.destroyed) return; // 客户端已断开，无处可发；abort 中止的上游请求也走到这里
        if (res.headersSent) {
          res.end();
          return;
        }
        if (err instanceof GatewayError) {
          sendError(res, err);
        } else {
          sendError(
            res,
            new GatewayError(502, "api_error", `上游请求失败：${(err as Error).message}`),
          );
        }
      }
    })();
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // 没有 .env 也可运行（key 可能已 export 在环境中）
  }
  const port = Number(process.env.GATEWAY_PORT ?? 8788);
  const host = resolveGatewayHost();
  const unsafe = unsafeListenReason(host);
  if (unsafe) {
    console.error(unsafe);
    process.exit(1);
  }
  createGateway().listen(port, host, () => {
    const registry = loadRegistry();
    console.log(`gateway 已启动 http://${host}:${port}`);
    if (configuredAuthToken(process.env)) {
      console.log("  入站鉴权已启用");
    } else {
      console.warn("  未启用入站鉴权，仅建议本地使用");
    }
    console.log(`  POST /v1/messages（Anthropic Messages 格式，按 model 路由）`);
    console.log(`  GET  /v1/models（${registry.models.length} 个模型 / ${registry.providers.length} 个 provider）`);
    for (const p of registry.providers) {
      const has = process.env[p.apiKeyEnv] ? "✓ 已配置" : `✗ 未配置（${p.apiKeyEnv}）`;
      console.log(`  - ${p.label}: ${has}`);
    }
  });
}
