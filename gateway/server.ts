import http from "node:http";
import { Readable } from "node:stream";
import type { Registry } from "../src/types";
import { loadRegistry, resolveModel } from "./registry";
import { buildUpstreamRequest, errorBody, GatewayError } from "./upstream";

/**
 * Anthropic-compatible 多模型网关（本地/自有服务器运行，不部署到 Pages）。
 *
 *   POST /v1/messages  Anthropic Messages 格式请求，按 body.model 路由到 provider，
 *                      响应（含 stream:true 的 SSE）原样透传 —— 不做协议转换。
 *   GET  /v1/models    从 registry 生成模型清单。
 *   GET  /healthz      存活检查。
 *
 * key 只存在于本进程环境变量（.env / export），任何响应都不含 key。
 */

const MAX_BODY_BYTES = 20 * 1024 * 1024;

function sendError(res: http.ServerResponse, err: GatewayError): void {
  res.writeHead(err.status, { "content-type": "application/json" });
  res.end(errorBody(err));
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

  const upstream = buildUpstreamRequest(resolved, body);
  const upstreamRes = await fetch(upstream.url, {
    method: "POST",
    headers: upstream.headers,
    body: upstream.body,
  });

  // 状态码 + 关键头 + body 原样透传；stream:true 时逐字节 pipe SSE，不缓冲不改写
  const passHeaders: Record<string, string> = {};
  for (const name of ["content-type", "anthropic-request-id", "request-id", "cache-control"]) {
    const v = upstreamRes.headers.get(name);
    if (v) passHeaders[name] = v;
  }
  res.writeHead(upstreamRes.status, passHeaders);
  if (upstreamRes.body) {
    Readable.fromWeb(upstreamRes.body as import("node:stream/web").ReadableStream).pipe(res);
  } else {
    res.end();
  }
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

/** registry 参数仅供测试注入 mock 上游；生产路径用 registry.json */
export function createGateway(registry: Registry = loadRegistry()): http.Server {
  return http.createServer((req, res) => {
    const url = req.url ?? "";
    void (async () => {
      try {
        if (req.method === "POST" && url === "/v1/messages") {
          await handleMessages(req, res, registry);
        } else if (req.method === "GET" && url === "/v1/models") {
          handleModels(res, registry);
        } else if (req.method === "GET" && url === "/healthz") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } else {
          sendError(res, new GatewayError(404, "not_found_error", `未知路由 ${req.method} ${url}`));
        }
      } catch (err) {
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
  createGateway().listen(port, () => {
    const registry = loadRegistry();
    console.log(`gateway 已启动 http://localhost:${port}`);
    console.log(`  POST /v1/messages（Anthropic Messages 格式，按 model 路由）`);
    console.log(`  GET  /v1/models（${registry.models.length} 个模型 / ${registry.providers.length} 个 provider）`);
    for (const p of registry.providers) {
      const has = process.env[p.apiKeyEnv] ? "✓ 已配置" : `✗ 未配置（${p.apiKeyEnv}）`;
      console.log(`  - ${p.label}: ${has}`);
    }
  });
}
