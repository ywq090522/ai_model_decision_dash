import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Registry } from "../src/types";
import {
  mapStopReason,
  OpenAISseTranslator,
  toAnthropicResponse,
  toGatewayError,
  toOpenAIRequest,
} from "./openai-adapter";
import { createGateway } from "./server";
import { GatewayError } from "./upstream";

describe("toOpenAIRequest", () => {
  it("system + 文本消息 + 采样参数：字段逐一映射，max_tokens → max_completion_tokens", () => {
    const out = toOpenAIRequest(
      {
        model: "front",
        system: "你是助手",
        max_tokens: 100,
        temperature: 0.5,
        top_p: 0.9,
        stop_sequences: ["END"],
        messages: [
          { role: "user", content: "你好" },
          { role: "assistant", content: [{ type: "text", text: "在" }] },
        ],
      },
      "up-model",
    );
    expect(out.model).toBe("up-model");
    expect(out.max_completion_tokens).toBe(100);
    expect(out.temperature).toBe(0.5);
    expect(out.top_p).toBe(0.9);
    expect(out.stop).toEqual(["END"]);
    expect(out.messages).toEqual([
      { role: "system", content: "你是助手" },
      { role: "user", content: "你好" },
      { role: "assistant", content: "在" },
    ]);
    expect("max_tokens" in out).toBe(false);
  });

  it("白名单转换：thinking / metadata / top_k 等无对应物字段不发给上游", () => {
    const out = toOpenAIRequest(
      {
        model: "front",
        max_tokens: 10,
        thinking: { type: "enabled", budget_tokens: 1024 },
        top_k: 40,
        metadata: { user_id: "u1" },
        messages: [{ role: "user", content: "hi" }],
      },
      "up-model",
    );
    expect("thinking" in out).toBe(false);
    expect("top_k" in out).toBe(false);
    expect("metadata" in out).toBe(false);
  });

  it("tool_use / tool_result 往返：assistant 带 tool_calls，tool_result 拆成 tool 消息", () => {
    const out = toOpenAIRequest(
      {
        model: "front",
        max_tokens: 10,
        messages: [
          { role: "user", content: "北京天气" },
          {
            role: "assistant",
            content: [
              { type: "text", text: "查一下" },
              { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "北京" } },
            ],
          },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "晴，32°C" }],
          },
        ],
        tools: [
          {
            name: "get_weather",
            description: "查天气",
            input_schema: { type: "object", properties: { city: { type: "string" } } },
          },
        ],
        tool_choice: { type: "any" },
      },
      "up-model",
    );
    expect(out.messages).toEqual([
      { role: "user", content: "北京天气" },
      {
        role: "assistant",
        content: "查一下",
        tool_calls: [
          {
            id: "toolu_1",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"北京"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "toolu_1", content: "晴，32°C" },
    ]);
    expect(out.tools).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "查天气",
          parameters: { type: "object", properties: { city: { type: "string" } } },
        },
      },
    ]);
    expect(out.tool_choice).toBe("required");
  });

  it("base64 图片 → image_url data URI，混合内容用多段 content", () => {
    const out = toOpenAIRequest(
      {
        model: "front",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "图里是什么" },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: "AAAA" },
              },
            ],
          },
        ],
      },
      "up-model",
    );
    expect(out.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "图里是什么" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
      },
    ]);
  });

  it("stream:true 时附带 stream_options.include_usage", () => {
    const out = toOpenAIRequest(
      { model: "front", max_tokens: 10, stream: true, messages: [{ role: "user", content: "hi" }] },
      "up-model",
    );
    expect(out.stream).toBe(true);
    expect(out.stream_options).toEqual({ include_usage: true });
  });
});

describe("toAnthropicResponse", () => {
  it("文本响应：content/stop_reason/usage 映射，model 用网关对外 id", () => {
    const out = toAnthropicResponse(
      {
        id: "chatcmpl-1",
        model: "up-model",
        choices: [{ message: { role: "assistant", content: "你好" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      },
      "front-id",
    );
    expect(out).toEqual({
      id: "chatcmpl-1",
      type: "message",
      role: "assistant",
      model: "front-id",
      content: [{ type: "text", text: "你好" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  });

  it("tool_calls → tool_use block，finish_reason=tool_calls → stop_reason=tool_use", () => {
    const out = toAnthropicResponse(
      {
        id: "chatcmpl-2",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "get_weather", arguments: '{"city":"北京"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      "front-id",
    );
    expect(out.content).toEqual([
      { type: "tool_use", id: "call_1", name: "get_weather", input: { city: "北京" } },
    ]);
    expect(out.stop_reason).toBe("tool_use");
  });

  it("tool_calls.arguments 不是合法 JSON → 502，绝不猜测补全", () => {
    expect(() =>
      toAnthropicResponse(
        {
          choices: [
            {
              message: {
                tool_calls: [{ id: "c", function: { name: "f", arguments: "{oops" } }],
              },
            },
          ],
        },
        "front-id",
      ),
    ).toThrowError(/tool_calls.arguments/);
  });

  it("finish_reason 映射齐全", () => {
    expect(mapStopReason("stop")).toBe("end_turn");
    expect(mapStopReason("length")).toBe("max_tokens");
    expect(mapStopReason("tool_calls")).toBe("tool_use");
    expect(mapStopReason("content_filter")).toBe("refusal");
    expect(mapStopReason(null)).toBe("end_turn");
  });
});

describe("toGatewayError", () => {
  it("上游 OpenAI 风格错误 → Anthropic 错误类型映射，保留上游 message", () => {
    const err = toGatewayError(429, JSON.stringify({ error: { message: "Rate limit reached" } }));
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.status).toBe(429);
    expect(err.errorType).toBe("rate_limit_error");
    expect(err.message).toContain("Rate limit reached");
  });

  it("非 JSON 错误体：截断透出，5xx → api_error", () => {
    const err = toGatewayError(503, "<html>bad gateway</html>");
    expect(err.errorType).toBe("api_error");
    expect(err.message).toContain("bad gateway");
  });
});

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("OpenAISseTranslator", () => {
  it("文本流：message_start → content_block_* → message_delta(usage) → message_stop", () => {
    const t = new OpenAISseTranslator("front-id");
    let out = t.feed(
      sseChunk({ id: "chatcmpl-3", choices: [{ delta: { role: "assistant", content: "" } }] }),
    );
    out += t.feed(sseChunk({ choices: [{ delta: { content: "你" } }] }));
    // 半包：一个 chunk 拆两次喂入
    const second = sseChunk({ choices: [{ delta: { content: "好" }, finish_reason: null }] });
    out += t.feed(second.slice(0, 20));
    out += t.feed(second.slice(20));
    out += t.feed(sseChunk({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    out += t.feed(
      sseChunk({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    );
    out += t.feed("data: [DONE]\n\n");

    const order = [
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ].map((e) => out.indexOf(`event: ${e}`));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1], `事件顺序 ${i}`).toBeGreaterThanOrEqual(0);
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
    expect(out).toContain('"text":"你"');
    expect(out).toContain('"text":"好"');
    expect(out).toContain('"stop_reason":"end_turn"');
    expect(out).toContain('"output_tokens":2');
    // [DONE] 之后 end() 不再重复收尾
    expect(t.end()).toBe("");
  });

  it("上游异常断流（无 [DONE]）：end() 补齐收尾事件", () => {
    const t = new OpenAISseTranslator("front-id");
    t.feed(sseChunk({ id: "x", choices: [{ delta: { content: "部分" } }] }));
    const tail = t.end();
    expect(tail).toContain("content_block_stop");
    expect(tail).toContain("message_stop");
  });

  it("流式 tool_calls：发 Anthropic error 事件并终止，不静默丢失", () => {
    const t = new OpenAISseTranslator("front-id");
    const out = t.feed(
      sseChunk({
        id: "x",
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { name: "f", arguments: "" } }] } },
        ],
      }),
    );
    expect(out).toContain("event: error");
    expect(out).toContain("stream:false");
    expect(t.feed(sseChunk({ choices: [{ delta: { content: "后续" } }] }))).toBe("");
  });
});

describe("gateway openai 协议集成（mock 上游）", () => {
  let upstream: http.Server;
  let gateway: http.Server;
  let gwBase = "";
  let upstreamSeen: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
        upstreamSeen.push({ headers: req.headers, body });
        if (body.model === "up-fail") {
          res.writeHead(429, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "quota exceeded", type: "rate_limit" } }));
          return;
        }
        if (body.stream === true) {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write(sseChunk({ id: "chatcmpl-s", choices: [{ delta: { content: "流式" } }] }));
          res.write(sseChunk({ choices: [{ delta: {}, finish_reason: "stop" }] }));
          res.write(sseChunk({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
          res.end("data: [DONE]\n\n");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-ok",
            model: body.model,
            choices: [{ message: { role: "assistant", content: "回复" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 7, completion_tokens: 2 },
          }),
        );
      });
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const upBase = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const registry: Registry = {
      providers: [
        {
          key: "mock-openai",
          label: "Mock OpenAI",
          protocol: "openai",
          baseUrl: upBase,
          messagesPath: "/v1/chat/completions",
          auth: "bearer",
          apiKeyEnv: "MOCK_OPENAI_KEY",
          structuredOutput: false,
          notes: "",
        },
      ],
      models: [
        { id: "front-oa", provider: "mock-openai", upstreamModel: "up-model" },
        { id: "front-oa-fail", provider: "mock-openai", upstreamModel: "up-fail" },
      ],
    };
    process.env.MOCK_OPENAI_KEY = "sk-mock-openai-value";
    gateway = createGateway(registry);
    await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", r));
    gwBase = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => gateway.close(r));
    await new Promise((r) => upstream.close(r));
  });

  function post(body: unknown) {
    return fetch(`${gwBase}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("非流式：Anthropic 请求进、Anthropic 响应出，上游收到 chat/completions 格式", async () => {
    upstreamSeen = [];
    const res = await post({
      model: "front-oa",
      max_tokens: 32,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.type).toBe("message");
    expect(json.model).toBe("front-oa");
    expect(json.content).toEqual([{ type: "text", text: "回复" }]);
    expect(json.usage).toEqual({ input_tokens: 7, output_tokens: 2 });

    const seen = upstreamSeen[0];
    expect(seen.body.model).toBe("up-model");
    expect(seen.body.max_completion_tokens).toBe(32);
    expect(seen.headers["authorization"]).toBe("Bearer sk-mock-openai-value");
    expect(seen.headers["anthropic-version"]).toBeUndefined();
  });

  it("流式：SSE 翻译为 Anthropic 事件序列", async () => {
    const res = await post({
      model: "front-oa",
      max_tokens: 32,
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    const order = ["message_start", "content_block_delta", "message_delta", "message_stop"].map(
      (e) => text.indexOf(`event: ${e}`),
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]).toBeGreaterThanOrEqual(0);
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
    expect(text).toContain('"text":"流式"');
    expect(text).toContain('"output_tokens":1');
  });

  it("上游错误：转成 Anthropic 风格错误体，状态码与类型映射", async () => {
    const res = await post({
      model: "front-oa-fail",
      max_tokens: 32,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(429);
    const json = (await res.json()) as { type: string; error: { type: string; message: string } };
    expect(json.type).toBe("error");
    expect(json.error.type).toBe("rate_limit_error");
    expect(json.error.message).toContain("quota exceeded");
  });
});
