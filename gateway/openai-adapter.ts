import { GatewayError } from "./upstream";

/**
 * OpenAI 协议适配层（纯函数，便于测试）：
 * Anthropic Messages ⇄ OpenAI chat/completions 的请求体、响应体、SSE 事件三类转换。
 * registry / 鉴权 / key 管理逻辑全部复用 upstream.ts，这里只做格式换算。
 *
 * 边界（v1）：
 * - 请求：支持 system / 文本 / 图片(base64·url) / tool_use / tool_result / tools / tool_choice；
 *   Anthropic 特有参数（thinking、top_k、cache_control）没有对应物，直接丢弃不改写语义。
 * - 流式：支持文本增量；上游流式返回 tool_calls 时发 Anthropic error 事件并终止
 *   （工具调用请用 stream:false，非流式已完整支持）。
 */

type Json = Record<string, unknown>;

/** OpenAI finish_reason → Anthropic stop_reason */
export function mapStopReason(finishReason: string | null | undefined): string {
  switch (finishReason) {
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "content_filter":
      return "refusal";
    default:
      return "end_turn";
  }
}

function invalid(message: string): GatewayError {
  return new GatewayError(400, "invalid_request_error", message);
}

function badUpstream(message: string): GatewayError {
  return new GatewayError(502, "api_error", message);
}

/** Anthropic system 字段（字符串或 text block 数组）→ 单条 system 消息内容 */
function systemToText(system: unknown): string | null {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .map((b) => (b as Json)?.type === "text" ? String((b as Json).text ?? "") : "")
      .filter(Boolean)
      .join("\n\n");
  }
  return null;
}

/** tool_result 的 content（字符串或 block 数组）→ OpenAI tool 消息的纯文本 */
function toolResultToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => ((b as Json)?.type === "text" ? String((b as Json).text ?? "") : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** 单条 Anthropic 消息 → 一组 OpenAI 消息（tool_result 拆成独立 tool 消息） */
function convertMessage(msg: Json): Json[] {
  const role = msg.role === "assistant" ? "assistant" : "user";
  const content = msg.content;
  if (typeof content === "string") return [{ role, content }];
  if (!Array.isArray(content)) {
    throw invalid("message.content 必须是字符串或 content block 数组");
  }

  const toolMessages: Json[] = [];
  const parts: Json[] = [];
  const texts: string[] = [];
  const toolCalls: Json[] = [];

  for (const raw of content) {
    const block = raw as Json;
    switch (block.type) {
      case "text":
        texts.push(String(block.text ?? ""));
        parts.push({ type: "text", text: String(block.text ?? "") });
        break;
      case "image": {
        const source = block.source as Json | undefined;
        if (source?.type === "base64") {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${String(source.media_type)};base64,${String(source.data)}` },
          });
        } else if (source?.type === "url") {
          parts.push({ type: "image_url", image_url: { url: String(source.url) } });
        } else {
          throw invalid(`不支持的 image source 类型：${String(source?.type)}`);
        }
        break;
      }
      case "tool_use":
        toolCalls.push({
          id: String(block.id),
          type: "function",
          function: { name: String(block.name), arguments: JSON.stringify(block.input ?? {}) },
        });
        break;
      case "tool_result":
        toolMessages.push({
          role: "tool",
          tool_call_id: String(block.tool_use_id),
          content: toolResultToText(block.content),
        });
        break;
      case "thinking":
      case "redacted_thinking":
        break; // OpenAI 协议无对应物，丢弃
      default:
        throw invalid(`openai 协议 provider 不支持 content block 类型 "${String(block.type)}"`);
    }
  }

  const out: Json[] = [...toolMessages]; // tool 消息必须紧跟对应 assistant tool_calls 之后
  if (role === "assistant") {
    if (texts.length > 0 || toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: texts.length > 0 ? texts.join("") : null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
  } else if (parts.length > 0) {
    // 纯文本时用字符串形式（兼容面最广），含图片才用多段 content
    const onlyText = parts.every((p) => p.type === "text");
    out.push({ role: "user", content: onlyText ? texts.join("") : parts });
  }
  return out;
}

/** Anthropic tool_choice → OpenAI tool_choice */
function convertToolChoice(tc: unknown): unknown {
  const type = (tc as Json)?.type;
  if (type === "auto") return "auto";
  if (type === "any") return "required";
  if (type === "none") return "none";
  if (type === "tool") return { type: "function", function: { name: String((tc as Json).name) } };
  return undefined;
}

/**
 * Anthropic Messages 请求体 → OpenAI chat/completions 请求体。
 * 白名单式转换：只搬运已知字段，未知/无对应物字段一律不发（避免上游报未知参数）。
 */
export function toOpenAIRequest(body: Json, upstreamModel: string): Json {
  if (!Array.isArray(body.messages)) throw invalid("缺少 messages 数组");

  const messages: Json[] = [];
  const system = systemToText(body.system);
  if (system) messages.push({ role: "system", content: system });
  for (const msg of body.messages) messages.push(...convertMessage(msg as Json));

  const out: Json = { model: upstreamModel, messages };
  // Anthropic 的 max_tokens 必填；OpenAI 新模型系列已弃用 max_tokens，统一发 max_completion_tokens
  if (typeof body.max_tokens === "number") out.max_completion_tokens = body.max_tokens;
  if (typeof body.temperature === "number") out.temperature = body.temperature;
  if (typeof body.top_p === "number") out.top_p = body.top_p;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length > 0) {
    out.stop = body.stop_sequences;
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    out.tools = body.tools.map((t) => {
      const tool = t as Json;
      return {
        type: "function",
        function: {
          name: String(tool.name),
          ...(tool.description ? { description: String(tool.description) } : {}),
          parameters: tool.input_schema ?? { type: "object" },
        },
      };
    });
    const tc = convertToolChoice(body.tool_choice);
    if (tc !== undefined) out.tool_choice = tc;
  }
  if (body.stream === true) {
    out.stream = true;
    out.stream_options = { include_usage: true }; // 最后一个 chunk 带 usage，供 message_delta 使用
  }
  return out;
}

/** OpenAI usage → Anthropic usage */
function convertUsage(usage: Json | undefined): Json {
  return {
    input_tokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    output_tokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}

/** OpenAI chat/completions 响应体 → Anthropic Messages 响应体（model 用网关对外 id） */
export function toAnthropicResponse(json: Json, gatewayModelId: string): Json {
  const choice = (json.choices as Json[] | undefined)?.[0];
  const message = choice?.message as Json | undefined;
  if (!message) throw badUpstream("上游响应缺少 choices[0].message");

  const content: Json[] = [];
  if (typeof message.content === "string" && message.content !== "") {
    content.push({ type: "text", text: message.content });
  }
  for (const raw of (message.tool_calls as Json[] | undefined) ?? []) {
    const fn = raw.function as Json | undefined;
    let input: unknown;
    try {
      input = JSON.parse(String(fn?.arguments || "{}"));
    } catch {
      throw badUpstream(`上游 tool_calls.arguments 不是合法 JSON（tool: ${String(fn?.name)}）`);
    }
    content.push({ type: "tool_use", id: String(raw.id), name: String(fn?.name), input });
  }

  return {
    id: typeof json.id === "string" ? json.id : "msg_gateway",
    type: "message",
    role: "assistant",
    model: gatewayModelId,
    content,
    stop_reason: mapStopReason(choice?.finish_reason as string | null),
    stop_sequence: null,
    usage: convertUsage(json.usage as Json | undefined),
  };
}

/** 上游 OpenAI 风格错误 → Anthropic 风格 GatewayError（状态码映射错误类型） */
export function toGatewayError(status: number, bodyText: string): GatewayError {
  let message = bodyText.slice(0, 500);
  try {
    const parsed = JSON.parse(bodyText) as Json;
    const err = parsed.error as Json | undefined;
    if (typeof err?.message === "string") message = err.message;
  } catch {
    // 非 JSON 错误体，原样截断透出
  }
  const type =
    status === 401 ? "authentication_error"
    : status === 403 ? "permission_error"
    : status === 404 ? "not_found_error"
    : status === 429 ? "rate_limit_error"
    : status >= 500 ? "api_error"
    : "invalid_request_error";
  return new GatewayError(status, type, `上游返回 ${status}：${message}`);
}

function sseEvent(event: string, data: Json): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * OpenAI SSE chunk 流 → Anthropic SSE 事件流的增量翻译器（有状态）。
 * feed() 喂入上游原始文本片段，返回应写给客户端的 Anthropic 事件文本；
 * end() 在上游流结束时调用，补齐收尾事件（正常流在 [DONE] 时已收尾，此时返回空串）。
 */
export class OpenAISseTranslator {
  private buffer = "";
  private started = false;
  private blockOpen = false;
  private closed = false;
  private finishReason: string | null = null;
  private usage: Json | undefined;

  constructor(private gatewayModelId: string) {}

  feed(text: string): string {
    if (this.closed) return "";
    this.buffer += text;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? ""; // 末行可能不完整，留到下次
    let out = "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        out += this.finish();
        break;
      }
      let chunk: Json;
      try {
        chunk = JSON.parse(payload) as Json;
      } catch {
        continue; // 半包/心跳等非 JSON 行，跳过
      }
      out += this.consumeChunk(chunk);
      if (this.closed) break;
    }
    return out;
  }

  /** 上游流结束（未见 [DONE] 的异常收尾也能给客户端完整事件序列） */
  end(): string {
    return this.closed ? "" : this.finish();
  }

  private consumeChunk(chunk: Json): string {
    let out = "";
    if (!this.started) {
      this.started = true;
      out += sseEvent("message_start", {
        type: "message_start",
        message: {
          id: typeof chunk.id === "string" ? chunk.id : "msg_gateway",
          type: "message",
          role: "assistant",
          model: this.gatewayModelId,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          // OpenAI 的 usage 在最后一个 chunk 才给，这里先置 0，完整值在 message_delta 补出
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
    }
    if (chunk.usage) this.usage = chunk.usage as Json;

    const choice = (chunk.choices as Json[] | undefined)?.[0];
    if (!choice) return out;
    if (typeof choice.finish_reason === "string") this.finishReason = choice.finish_reason;

    const delta = choice.delta as Json | undefined;
    if (delta?.tool_calls) {
      // v1 边界：流式 tool_use 需要增量拼装 input_json_delta，暂不支持 —— 明确报错而不是静默丢失
      this.closed = true;
      return (
        out +
        sseEvent("error", {
          type: "error",
          error: {
            type: "api_error",
            message: "网关 openai 协议适配层暂不支持流式 tool_use，请改用 stream:false 发起工具调用",
          },
        })
      );
    }
    if (typeof delta?.content === "string" && delta.content !== "") {
      if (!this.blockOpen) {
        this.blockOpen = true;
        out += sseEvent("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        });
      }
      out += sseEvent("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: delta.content },
      });
    }
    return out;
  }

  private finish(): string {
    this.closed = true;
    let out = "";
    if (this.blockOpen) {
      out += sseEvent("content_block_stop", { type: "content_block_stop", index: 0 });
    }
    out += sseEvent("message_delta", {
      type: "message_delta",
      delta: { stop_reason: mapStopReason(this.finishReason), stop_sequence: null },
      usage: convertUsage(this.usage),
    });
    out += sseEvent("message_stop", { type: "message_stop" });
    return out;
  }
}
