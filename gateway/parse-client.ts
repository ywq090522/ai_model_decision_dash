import Anthropic from "@anthropic-ai/sdk";
import type { GatewayProvider } from "../src/types";
import { resolveModel } from "./registry";
import { apiKeyFor, GatewayError } from "./upstream";

/**
 * 管线用的库级路由客户端（不经 HTTP 网关服务，直接 import 同一 registry）。
 * Anthropic SDK 本身就是 Anthropic Messages 协议客户端 —— 换 baseURL + 鉴权
 * 即可指向任意 Anthropic 兼容 provider，请求格式保持不变，不做协议转换。
 */

export interface ParserTarget {
  provider: GatewayProvider;
  upstreamModel: string;
  client: Anthropic;
}

const SDK_PATH_SUFFIX = "/v1/messages";

/** 按 registry 把网关模型 id 解析成可直接调用的 SDK 客户端 */
export function resolveParserTarget(modelId: string): ParserTarget {
  const resolved = resolveModel(modelId);
  if (!resolved) {
    throw new GatewayError(404, "not_found_error", `PARSER_MODEL "${modelId}" 未在 registry 注册`);
  }
  const { provider, model } = resolved;
  // SDK 固定请求 {baseURL}/v1/messages，把 provider 的 messagesPath 前缀并入 baseURL
  if (!provider.messagesPath.endsWith(SDK_PATH_SUFFIX)) {
    throw new GatewayError(
      400,
      "invalid_request_error",
      `provider "${provider.key}" 的 messagesPath（${provider.messagesPath}）与 Anthropic SDK 不兼容`,
    );
  }
  const pathPrefix = provider.messagesPath.slice(0, -SDK_PATH_SUFFIX.length);
  const baseURL = `${provider.baseUrl}${pathPrefix}`;
  const key = apiKeyFor(provider);
  const client =
    provider.auth === "x-api-key"
      ? new Anthropic({ baseURL, apiKey: key })
      : new Anthropic({ baseURL, apiKey: null, authToken: key });
  return { provider, upstreamModel: model.upstreamModel, client };
}

/**
 * 从非结构化输出 provider 的文本回复中提取 JSON：
 * 去掉 markdown 代码围栏后取首个 { 到末个 } 的片段解析。
 * 解析失败抛错（调用方走 stale 路径，绝不猜测补全）。
 */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("LLM 回复中未找到 JSON 对象");
  }
  return JSON.parse(stripped.slice(start, end + 1)) as unknown;
}
