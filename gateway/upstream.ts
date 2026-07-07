import type { GatewayProvider } from "../src/types";
import type { ResolvedModel } from "./registry";

/**
 * 路由层核心（纯函数，便于测试）：
 * 把一个 Anthropic Messages 格式的请求体，按 provider 配置
 * 换算成发往上游的 { url, headers, body }。
 *
 * 安全规则：
 * - key 只从 process.env[provider.apiKeyEnv] 读取，绝不落盘/回显；
 * - 入站请求的鉴权头一律丢弃，只发网关自己构造的头；
 * - 缺 key 在调用时报错（Anthropic 风格 error），错误信息只含环境变量名。
 */

export const ANTHROPIC_VERSION = "2023-06-01";

export class GatewayError extends Error {
  constructor(
    public status: number,
    public errorType: string,
    message: string,
  ) {
    super(message);
  }
}

/** Anthropic 风格错误响应体 */
export function errorBody(err: GatewayError): string {
  return JSON.stringify({
    type: "error",
    error: { type: err.errorType, message: err.message },
  });
}

export interface UpstreamRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function apiKeyFor(provider: GatewayProvider, env: NodeJS.ProcessEnv = process.env): string {
  const key = env[provider.apiKeyEnv];
  if (!key) {
    throw new GatewayError(
      401,
      "authentication_error",
      `provider "${provider.key}" 未配置密钥：请设置环境变量 ${provider.apiKeyEnv}（本地可写入 .env）`,
    );
  }
  return key;
}

/** 按 provider 鉴权方式构造上游请求头（x-api-key / bearer） */
export function buildAuthHeaders(
  provider: GatewayProvider,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const key = apiKeyFor(provider, env);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (provider.auth === "x-api-key") {
    headers["x-api-key"] = key;
  } else {
    headers["authorization"] = `Bearer ${key}`;
  }
  return headers;
}

/**
 * 构造完整上游请求：url = baseUrl + messagesPath；
 * body.model 替换为 upstreamModel，其余字段原样保留（Anthropic 格式透传）。
 */
export function buildUpstreamRequest(
  resolved: ResolvedModel,
  requestBody: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): UpstreamRequest {
  const { provider, model } = resolved;
  return {
    url: `${provider.baseUrl}${provider.messagesPath}`,
    headers: buildAuthHeaders(provider, env),
    body: JSON.stringify({ ...requestBody, model: model.upstreamModel }),
  };
}
