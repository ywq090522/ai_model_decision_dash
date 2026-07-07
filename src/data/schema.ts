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

export const ModelInfoSchema = z.object({
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
  verified: z.boolean(),
});

/** 管线每个数据源的运行状态 */
export const SourceStatusSchema = z.object({
  source: z.string(),
  status: z.enum(["ok", "stale", "error", "manual"]),
  fetchedAt: z.string().nullable(),
  detail: z.string().optional(),
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
  /** 管线抓不到时的兜底事实字段（也是首次生成 models.json 的初始值） */
  fallback: z.object({
    inputPrice: price,
    outputPrice: price,
    cachedInputPrice: price,
    contextWindow: z.number().int().positive().nullable(),
    maxOutput: z.number().int().positive().nullable(),
    source: z.string(),
    verified: z.boolean(),
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
