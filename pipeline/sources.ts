/**
 * 数据源清单。
 * kind = "llm"            : 抓取页面文本后用 Claude 解析（LLM 只做解析，输出经数字回查）
 * kind = "openrouter-api" : 纯 JSON API，直接程序化解析，不经 LLM
 *
 * providers: 该源负责更新哪些 provider 的模型（对应 curated.json 的 provider 字段）。
 * verified : 该源是否算"官方核实"（OpenRouter 是第三方转发价 → false）。
 */
export interface SourceDef {
  key: string;
  label: string;
  url: string;
  kind: "llm" | "openrouter-api";
  providers: string[];
  verified: boolean;
}

export const SOURCES: SourceDef[] = [
  {
    key: "openai",
    label: "OpenAI 官方定价页",
    url: "https://developers.openai.com/api/docs/pricing",
    kind: "llm",
    providers: ["OpenAI"],
    verified: true,
  },
  {
    key: "anthropic",
    label: "Anthropic 官方定价页",
    url: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    kind: "llm",
    providers: ["Anthropic"],
    verified: true,
  },
  {
    key: "google",
    label: "Google Gemini 官方定价页",
    url: "https://ai.google.dev/gemini-api/docs/pricing",
    kind: "llm",
    providers: ["Google"],
    verified: true,
  },
  {
    key: "deepseek",
    label: "DeepSeek 官方定价页",
    url: "https://api-docs.deepseek.com/quick_start/pricing",
    kind: "llm",
    providers: ["DeepSeek"],
    verified: true,
  },
  {
    key: "openrouter",
    label: "OpenRouter Models API（第三方转发价）",
    url: "https://openrouter.ai/api/v1/models",
    kind: "openrouter-api",
    providers: ["OpenRouter", "Moonshot (Kimi)", "Qwen (阿里云)"],
    verified: false,
  },
];

/** 没有任何自动源覆盖的 provider（JS 渲染/登录墙），保留 curated 值，报告标 manual */
export const MANUAL_PROVIDERS = ["豆包 (火山引擎)"];
