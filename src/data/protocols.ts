/**
 * 模型 id → 网关 API 协议 的派生映射，仅供前端展示。
 *
 * 不能在前端直接 import registry.json：它含 apiKeyEnv / baseUrl，
 * deploy.yml 的密钥自检会拦截包含这些字符串的 bundle。
 * 本文件只保留协议一个非敏感字段；与 registry.json 的一致性
 * 由 protocols.test.ts 强制（registry 增删模型时测试会失败提醒同步）。
 */
export const MODEL_PROTOCOLS: Record<string, "anthropic" | "openai"> = {
  "claude-fable-5": "anthropic",
  "claude-opus-4-8": "anthropic",
  "claude-sonnet-5": "anthropic",
  "claude-sonnet-4-6": "anthropic",
  "claude-haiku-4-5": "anthropic",
  "deepseek-v4-pro": "anthropic",
  "deepseek-v4-flash": "anthropic",
  "kimi-k2.6": "anthropic",
  "kimi-k2.5": "anthropic",
  "glm-5.1": "anthropic",
  "glm-4.7": "anthropic",
  "gpt-5.5": "openai",
  "gpt-5.4": "openai",
  "gpt-5.4-mini": "openai",
  "gemini-3.5-flash": "openai",
  "gemini-2.5-pro": "openai",
  "gemini-2.5-flash": "openai",
  "openrouter-llama-3.3-70b-free": "openai",
  "openrouter-nemotron-3-nano-free": "openai",
};
