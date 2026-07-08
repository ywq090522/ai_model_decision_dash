import { z } from "zod";

/**
 * 数据 schema —— 前端与数据管线共用的单一事实来源。
 * 管线用它做最终校验；前端类型从这里 z.infer 导出。
 */

export const ModelScoresSchema = z.object({
  coding: z.number().min(0).max(5),
  longDoc: z.number().min(0).max(5),
  chat: z.number().min(0).max(5),
  agent: z.number().min(0).max(5),
  chinese: z.number().min(0).max(5),
});

/** 价格：每百万 tokens，>= 0；null = unknown（未能核实，绝不编造） */
const price = z.number().min(0).nullable();
/** 三态能力位：true/false 已确认，null = unknown */
const tristate = z.boolean().nullable();

export const ModelInfoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    provider: z.string().min(1),
    currency: z.enum(["USD", "CNY"]),
    inputPrice: price,
    outputPrice: price,
    cachedInputPrice: price,
    contextWindow: z.number().int().positive().nullable(),
    maxOutput: z.number().int().positive().nullable(),
    vision: tristate,
    toolUse: tristate,
    scores: ModelScoresSchema,
    tags: z.array(z.string()),
    notes: z.string(),
    source: z.string(),
    /** true 仅当数据由真实管线从官方定价页抓取、LLM 解析并通过数字回查（见 verifiedAt） */
    verified: z.boolean(),
    /** 最近一次官方源核实的时间（ISO）；null = 从未经过真实管线核实（seed/第三方/手工） */
    verifiedAt: z.string().nullable().default(null),
    /** 核实来源（管线官方源 label）；与 verifiedAt 同生同灭 */
    verificationSource: z.string().nullable().default(null),
  })
  .refine((m) => !m.verified || (m.verifiedAt !== null && m.verificationSource !== null), {
    message: "verified=true 必须带 verifiedAt 与 verificationSource（seed/fallback 数据不得伪装官方核实）",
  });

/** 管线每个数据源的运行状态 */
export const SourceStatusSchema = z.object({
  source: z.string(),
  status: z.enum(["ok", "stale", "error", "manual"]),
  fetchedAt: z.string().nullable(),
  detail: z.string().optional(),
  /** 该源负责的 provider 列表（UI 据此给 stale 源覆盖的模型打角标） */
  providers: z.array(z.string()).default([]),
});

export const PipelineMetaSchema = z.object({
  lastRun: z.string(),
  sources: z.array(SourceStatusSchema),
});

export const DataMetaSchema = z.object({
  updatedAt: z.string(),
  priceUnit: z.string(),
  defaultCnyPerUsd: z.number().positive(),
  cnyRateNote: z.string(),
  scoreNote: z.string(),
  unknownNote: z.string(),
  pipeline: PipelineMetaSchema.optional(),
});

export const ModelDataSchema = z.object({
  meta: DataMetaSchema,
  models: z.array(ModelInfoSchema).min(1),
});

/**
 * curated.json：人工维护字段（管线永不覆盖）。
 * aliases 用于把官方页上的模型名/ID 变体匹配到 curated 条目。
 */
export const CuratedModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  currency: z.enum(["USD", "CNY"]),
  aliases: z.array(z.string()),
  vision: tristate,
  toolUse: tristate,
  scores: ModelScoresSchema,
  tags: z.array(z.string()),
  notes: z.string(),
  /**
   * 管线抓不到时的兜底事实字段（也是首次生成 models.json 的初始值）。
   * 注意：兜底数据永远是 verified=false —— 只有真实管线核实过的数据才能 verified。
   */
  fallback: z.object({
    inputPrice: price,
    outputPrice: price,
    cachedInputPrice: price,
    contextWindow: z.number().int().positive().nullable(),
    maxOutput: z.number().int().positive().nullable(),
    source: z.string(),
  }),
});

export const CuratedDataSchema = z.object({
  meta: z.object({
    defaultCnyPerUsd: z.number().positive(),
    cnyRateNote: z.string(),
    scoreNote: z.string(),
    unknownNote: z.string(),
  }),
  models: z.array(CuratedModelSchema).min(1),
});

/**
 * 网关 registry：provider 配置层 + 模型路由表。
 * 前端只读元数据展示；网关/管线据此路由请求。
 * apiKeyEnv 只存环境变量名，key 值永远不进任何 JSON / 前端代码。
 */
export const GatewayProviderSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /**
   * 上游端点协议。anthropic = Messages 格式原样透传（当前唯一实现）；
   * openai = chat/completions（预留：接入 OpenAI / Gemini / OpenRouter 等
   * 仅提供 OpenAI 兼容端点的 provider 时，在 gateway/upstream.ts 实现转换适配层）。
   */
  protocol: z.enum(["anthropic", "openai"]).default("anthropic"),
  /** 兼容端点的根地址（不含 messagesPath），必须 https */
  baseUrl: z.string().regex(/^https:\/\/[^\s]+[^/]$/, "https 且不以 / 结尾"),
  /** Messages 端点路径，通常为 /v1/messages */
  messagesPath: z.string().startsWith("/"),
  /** 鉴权方式：x-api-key 头 或 Authorization: Bearer */
  auth: z.enum(["x-api-key", "bearer"]),
  /** 读取 key 的环境变量名（仅名字） */
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  /** 是否支持 Anthropic 结构化输出（output_config.format）；管线据此选解析路径 */
  structuredOutput: z.boolean(),
  notes: z.string(),
});

export const RegistryModelSchema = z.object({
  /** 网关对外的模型 id；与 models.json 的 id 对齐以便前端 join */
  id: z.string().min(1),
  /** 对应 GatewayProviderSchema.key */
  provider: z.string().min(1),
  /** 转发给上游时替换成的真实模型 id */
  upstreamModel: z.string().min(1),
  notes: z.string().optional(),
});

export const RegistrySchema = z.object({
  providers: z.array(GatewayProviderSchema).min(1),
  models: z.array(RegistryModelSchema).min(1),
});

/** LLM 结构化输出 schema：单个来源页上提取到的模型定价条目 */
export const ExtractedModelSchema = z.object({
  modelId: z
    .string()
    .describe("页面上的模型 ID 或名称，原样照抄，例如 gpt-5.4-mini"),
  inputPrice: z
    .number()
    .nullable()
    .describe("每百万输入 token 价格（数字）。页面未明确写出则为 null"),
  outputPrice: z.number().nullable().describe("每百万输出 token 价格。未写出则为 null"),
  cachedInputPrice: z
    .number()
    .nullable()
    .describe("缓存命中输入价（每百万）。未写出则为 null"),
  contextWindow: z
    .number()
    .nullable()
    .describe("上下文窗口 token 数，如 1000000。页面未写出则为 null"),
  maxOutput: z.number().nullable().describe("最大输出 token 数。未写出则为 null"),
});

export const ExtractedPricingSchema = z.object({
  models: z.array(ExtractedModelSchema),
});
