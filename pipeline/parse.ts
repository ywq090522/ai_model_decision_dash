import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedPricingSchema } from "../src/data/schema";
import { extractJson, resolveParserTarget } from "../gateway/parse-client";
import type { ExtractedModel } from "./verify";

/**
 * LLM 解析层：LLM 只负责把"页面文本"转成结构化 JSON。
 * 解析模型经网关路由层（gateway/registry + parse-client）解析，
 * PARSER_MODEL 可切换到任意 registry 内的 Anthropic 兼容 provider。
 * 事实约束由三层保证：下面的 system prompt（只许抄页面）、
 * verify.ts 的数字回查（编造即拦截置 null）、schema.ts 的 Zod 校验。
 */

export const DEFAULT_PARSER_MODEL = "claude-opus-4-8";

const PARSER_SYSTEM = `你是一个严格的定价页解析器。规则（不可违反）：
1. 只从用户提供的页面文本中提取信息。禁止使用你自己的任何知识补全、修正或推断数字。
2. 页面文本中没有明确写出的字段，一律输出 null。宁可 null，不可猜测。
3. 价格统一换算为"每 1M (百万) tokens"的数值：页面若按每 1K tokens 标价则乘以 1000。
4. contextWindow / maxOutput 用 token 数表示：200K → 200000，1M → 1000000。页面没写就是 null。
5. modelId 原样照抄页面上的模型标识（如 gpt-5.4-mini、claude-opus-4-8）。
6. 只提取文本对话模型的 token 定价，跳过图像生成、语音、embedding、按分钟计费的条目。
7. 同一模型有分级价（按上下文长度分档）时，取最低档，并照抄该档数值。`;

export async function parseWithLLM(pageText: string): Promise<ExtractedModel[]> {
  const modelId = process.env.PARSER_MODEL ?? DEFAULT_PARSER_MODEL;
  const { provider, upstreamModel, client } = resolveParserTarget(modelId);
  const userContent = `请从以下定价页文本中提取所有文本模型的定价条目：\n\n<page>\n${pageText}\n</page>`;

  if (provider.structuredOutput) {
    // Anthropic 官方：结构化输出，schema 由 API 强制
    const response = await client.messages.parse({
      model: upstreamModel,
      max_tokens: 16000,
      system: PARSER_SYSTEM,
      messages: [{ role: "user", content: userContent }],
      output_config: { format: zodOutputFormat(ExtractedPricingSchema) },
    });
    if (!response.parsed_output) {
      throw new Error("LLM 结构化输出解析失败（parsed_output 为空）");
    }
    return response.parsed_output.models;
  }

  // 其它 Anthropic 兼容 provider：JSON 指令 + 本地 Zod 校验（失败即抛错走 stale）
  const response = await client.messages.create({
    model: upstreamModel,
    max_tokens: 16000,
    system: `${PARSER_SYSTEM}\n8. 只输出一个 JSON 对象（不加任何解释文字），形如 {"models":[{"modelId":...,"inputPrice":...,"outputPrice":...,"cachedInputPrice":...,"contextWindow":...,"maxOutput":...}]}，未知字段用 null。`,
    messages: [{ role: "user", content: userContent }],
  });
  const text = response.content
    .filter((b): b is { type: "text"; text: string } & (typeof response.content)[number] => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseExtractionJson(text);
}

/** 非结构化输出路径：提取 JSON 并过 Zod（导出以便单测） */
export function parseExtractionJson(text: string): ExtractedModel[] {
  const parsed = ExtractedPricingSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(`LLM JSON 输出未通过 schema 校验：${parsed.error.message}`);
  }
  return parsed.data.models;
}

// ---------- OpenRouter：纯 JSON API，不经 LLM ----------

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string };
}

/**
 * OpenRouter /api/v1/models 返回 USD/每 token 的字符串价格，换算为每 1M。
 * 只保留 curated aliases 会用到的条目由 merge 阶段过滤，这里全量返回。
 */
export function parseOpenRouter(json: string): ExtractedModel[] {
  const data = JSON.parse(json) as { data?: OpenRouterModel[] };
  if (!Array.isArray(data.data)) throw new Error("OpenRouter API 返回格式异常");
  return data.data.map((m) => {
    const perTok = (s: string | undefined): number | null => {
      if (s === undefined) return null;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? round6(n * 1_000_000) : null;
    };
    return {
      modelId: m.id,
      inputPrice: perTok(m.pricing?.prompt),
      outputPrice: perTok(m.pricing?.completion),
      cachedInputPrice: null,
      contextWindow:
        typeof m.context_length === "number" && m.context_length > 0 ? m.context_length : null,
      maxOutput: null,
    };
  });
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
