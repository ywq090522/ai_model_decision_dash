import { describe, expect, it } from "vitest";
import type { GatewayProvider } from "../src/types";
import { buildAuthHeaders, buildUpstreamRequest, GatewayError } from "./upstream";

const xApiKeyProvider: GatewayProvider = {
  key: "p1",
  label: "P1",
  baseUrl: "https://api.p1.example",
  messagesPath: "/v1/messages",
  auth: "x-api-key",
  apiKeyEnv: "P1_API_KEY",
  structuredOutput: false,
  notes: "",
};

const bearerProvider: GatewayProvider = {
  ...xApiKeyProvider,
  key: "p2",
  baseUrl: "https://api.p2.example/anthropic",
  auth: "bearer",
  apiKeyEnv: "P2_API_KEY",
};

describe("buildAuthHeaders", () => {
  it("x-api-key：注入 x-api-key + anthropic-version", () => {
    const h = buildAuthHeaders(xApiKeyProvider, { P1_API_KEY: "sk-test-1" });
    expect(h["x-api-key"]).toBe("sk-test-1");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(h["authorization"]).toBeUndefined();
  });

  it("bearer：注入 Authorization: Bearer", () => {
    const h = buildAuthHeaders(bearerProvider, { P2_API_KEY: "sk-test-2" });
    expect(h["authorization"]).toBe("Bearer sk-test-2");
    expect(h["x-api-key"]).toBeUndefined();
  });

  it("缺 key：抛 401 GatewayError，信息只含环境变量名不含 key", () => {
    try {
      buildAuthHeaders(xApiKeyProvider, {});
      expect.unreachable();
    } catch (e) {
      const err = e as GatewayError;
      expect(err).toBeInstanceOf(GatewayError);
      expect(err.status).toBe(401);
      expect(err.errorType).toBe("authentication_error");
      expect(err.message).toContain("P1_API_KEY");
    }
  });
});

describe("buildUpstreamRequest", () => {
  const resolved = {
    provider: bearerProvider,
    model: { id: "front-id", provider: "p2", upstreamModel: "real-upstream-id" },
  };

  it("url = baseUrl + messagesPath；model 替换为 upstreamModel，其余字段保留", () => {
    const req = buildUpstreamRequest(
      resolved,
      { model: "front-id", max_tokens: 10, stream: true, messages: [] },
      { P2_API_KEY: "k" },
    );
    expect(req.url).toBe("https://api.p2.example/anthropic/v1/messages");
    const body = JSON.parse(req.body) as Record<string, unknown>;
    expect(body.model).toBe("real-upstream-id");
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(10);
  });

  it("上游头只含网关自己构造的字段（入站鉴权头不会被转发）", () => {
    const req = buildUpstreamRequest(resolved, { model: "front-id" }, { P2_API_KEY: "k" });
    expect(Object.keys(req.headers).sort()).toEqual([
      "anthropic-version",
      "authorization",
      "content-type",
    ]);
  });
});
