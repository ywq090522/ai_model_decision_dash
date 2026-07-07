import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Registry } from "../src/types";
import { createGateway, resolveGatewayHost } from "./server";

/** mock 上游：记录收到的请求，按 body.stream 返回 JSON 或 SSE 分块 */
let upstreamSeen: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];

function createMockUpstream(): http.Server {
  return http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      upstreamSeen.push({ headers: req.headers, body });
      if (body.stream === true) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
        setTimeout(() => {
          res.write('event: content_block_delta\ndata: {"type":"content_block_delta"}\n\n');
          setTimeout(() => {
            res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
            res.end();
          }, 10);
        }, 10);
      } else {
        res.writeHead(200, {
          "content-type": "application/json",
          "request-id": "req_mock_123",
        });
        res.end(JSON.stringify({ type: "message", model: body.model, content: [] }));
      }
    });
  });
}

let upstream: http.Server;
let gateway: http.Server;
let registry: Registry;
let gwBase = "";

beforeAll(async () => {
  upstream = createMockUpstream();
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const upPort = (upstream.address() as AddressInfo).port;

  registry = {
    providers: [
      {
        key: "mock-x",
        label: "Mock x-api-key",
        protocol: "anthropic",
        baseUrl: `http://127.0.0.1:${upPort}`,
        messagesPath: "/v1/messages",
        auth: "x-api-key",
        apiKeyEnv: "MOCK_X_KEY",
        structuredOutput: false,
        notes: "",
      },
      {
        key: "mock-bearer",
        label: "Mock bearer",
        protocol: "anthropic",
        baseUrl: `http://127.0.0.1:${upPort}/anthropic`,
        messagesPath: "/v1/messages",
        auth: "bearer",
        apiKeyEnv: "MOCK_BEARER_KEY",
        structuredOutput: false,
        notes: "",
      },
      {
        key: "mock-nokey",
        label: "Mock 未配置 key",
        protocol: "anthropic",
        baseUrl: `http://127.0.0.1:${upPort}`,
        messagesPath: "/v1/messages",
        auth: "x-api-key",
        apiKeyEnv: "MOCK_MISSING_KEY",
        structuredOutput: false,
        notes: "",
      },
    ],
    models: [
      { id: "front-x", provider: "mock-x", upstreamModel: "upstream-x" },
      { id: "front-bearer", provider: "mock-bearer", upstreamModel: "upstream-bearer" },
      { id: "front-nokey", provider: "mock-nokey", upstreamModel: "upstream-nokey" },
    ],
  };
  process.env.MOCK_X_KEY = "sk-mock-x-value";
  process.env.MOCK_BEARER_KEY = "sk-mock-bearer-value";
  delete process.env.MOCK_MISSING_KEY;

  gateway = createGateway(registry);
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", r));
  gwBase = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => gateway.close(r));
  await new Promise((r) => upstream.close(r));
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${gwBase}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function withGateway(
  options: Parameters<typeof createGateway>[1],
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createGateway(registry, options);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("gateway server", () => {
  it("默认监听 host 为 127.0.0.1，且可用 GATEWAY_HOST 覆盖", () => {
    expect(resolveGatewayHost({} as NodeJS.ProcessEnv)).toBe("127.0.0.1");
    expect(resolveGatewayHost({ GATEWAY_HOST: "0.0.0.0" } as NodeJS.ProcessEnv)).toBe(
      "0.0.0.0",
    );
    expect(resolveGatewayHost({ GATEWAY_HOST: "" } as NodeJS.ProcessEnv)).toBe("127.0.0.1");
  });

  it("GATEWAY_AUTH_TOKEN：/healthz 放行，其他路由缺 token 返回 Anthropic 风格 401", async () => {
    await withGateway(
      { env: { GATEWAY_AUTH_TOKEN: "inbound-secret" } as NodeJS.ProcessEnv },
      async (base) => {
        const health = await fetch(`${base}/healthz`);
        expect(health.status).toBe(200);

        const res = await fetch(`${base}/v1/models`);
        expect(res.status).toBe(401);
        const text = await res.text();
        const json = JSON.parse(text) as {
          type: string;
          error: { type: string; message: string };
        };
        expect(json.type).toBe("error");
        expect(json.error.type).toBe("authentication_error");
        expect(text).not.toContain("inbound-secret");
      },
    );
  });

  it("GATEWAY_AUTH_TOKEN：正确 Bearer token 放行，错误 token 拒绝且不泄漏 token", async () => {
    await withGateway(
      { env: { GATEWAY_AUTH_TOKEN: "inbound-secret" } as NodeJS.ProcessEnv },
      async (base) => {
        const ok = await fetch(`${base}/v1/models`, {
          headers: { authorization: "Bearer inbound-secret" },
        });
        expect(ok.status).toBe(200);

        const bad = await fetch(`${base}/v1/models`, {
          headers: { authorization: "Bearer wrong-secret" },
        });
        expect(bad.status).toBe(401);
        const text = await bad.text();
        expect(text).toContain("authentication_error");
        expect(text).not.toContain("inbound-secret");
        expect(text).not.toContain("wrong-secret");
      },
    );
  });

  it("未知 model → 404 Anthropic 风格错误", async () => {
    const res = await post({ model: "no-such", messages: [] });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { type: string; error: { type: string; message: string } };
    expect(json.type).toBe("error");
    expect(json.error.type).toBe("not_found_error");
    expect(json.error.message).toContain("no-such");
  });

  it("非法 JSON → 400", async () => {
    const res = await fetch(`${gwBase}/v1/messages`, { method: "POST", body: "{oops" });
    expect(res.status).toBe(400);
  });

  it("x-api-key 转发：状态/头/体透传，model 替换，入站鉴权头被剥离", async () => {
    upstreamSeen = [];
    const res = await post(
      { model: "front-x", max_tokens: 5, messages: [] },
      { authorization: "Bearer client-should-not-leak", "x-api-key": "client-key" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("request-id")).toBe("req_mock_123");
    const json = (await res.json()) as { model: string };
    expect(json.model).toBe("upstream-x");

    const seen = upstreamSeen[0];
    expect(seen.body.model).toBe("upstream-x");
    expect(seen.headers["x-api-key"]).toBe("sk-mock-x-value");
    expect(seen.headers["anthropic-version"]).toBe("2023-06-01");
    expect(seen.headers["authorization"]).toBeUndefined();
  });

  it("bearer 转发：Authorization: Bearer <key>", async () => {
    upstreamSeen = [];
    await post({ model: "front-bearer", messages: [] });
    const seen = upstreamSeen[0];
    expect(seen.headers["authorization"]).toBe("Bearer sk-mock-bearer-value");
    expect(seen.headers["x-api-key"]).toBeUndefined();
  });

  it("stream:true → SSE 分块按序透传", async () => {
    const res = await post({ model: "front-x", stream: true, messages: [] });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    const order = ["message_start", "content_block_delta", "message_stop"].map((s) =>
      text.indexOf(s),
    );
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[1]).toBeGreaterThan(order[0]);
    expect(order[2]).toBeGreaterThan(order[1]);
  });

  it("缺 key → 401，错误信息只含环境变量名，响应不含任何 key 值", async () => {
    const res = await post({ model: "front-nokey", messages: [] });
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain("MOCK_MISSING_KEY");
    expect(text).not.toContain("sk-mock");
  });

  it("GET /v1/models：registry 生成清单", async () => {
    const res = await fetch(`${gwBase}/v1/models`);
    const json = (await res.json()) as { data: { id: string; provider: string; auth: string }[] };
    expect(json.data.map((m) => m.id)).toEqual(["front-x", "front-bearer", "front-nokey"]);
    expect(json.data[1].auth).toBe("bearer");
    expect(JSON.stringify(json)).not.toContain("sk-mock");
  });
});
