import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedPricingSchema } from "../src/data/schema";
import type { ExtractedModel } from "./verify";

/**
 * LLM 解析层：Claude 只负责把"页面文本"转成结构化 JSON。
 * 事实约束由三层保证：下面的 system prompt（只许抄页面）、
 * verify.ts 的数字回查（编造即拦截置 null）、schema.ts 的 Zod 校验。
 */

const PARSER_SYSTEM = `你是一个严格的定价页解析器。规则（不可违反）：
1. 只从用户提供的页面文本中提取信息。禁止使用你自己的任何知识补全、修正或推断数字。
2. 页面文本中没有明确写出的字段，一律输出 null。宁可 null，不可猜测。
3. 价格统一换算为"每 1M (百万) tokens"的数值：页面若按每 1K tokens 标价则乘以 1000。
4. contextWindow / maxOutput 用 token 数表示：200K → 200000，1M → 1000000。页面没写就是 null。
5. modelId 原样照抄页面上的模型标识（如 gpt-5.4-mini、claude-opus-4-8）。
6. 只提取文本对话模型的 token 定价，跳过图像生成、语音、embedding、按分钟计费的条目。
7. 同一模型有分级价（按上下文长度分档）时，取最低档，并照抄该档数值。`;

export async function parseWithClaude(pageText: string): Promise<ExtractedModel[]> {
  const client = new Anthropic(); // CI 读 ANTHROPIC_API_KEY；本地可走 ant auth profile
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    system: PARSER_SYSTEM,
    messages: [
      {
        role: "user",
        content: `请从以下定价页文本中提取所有文本模型的定价条目：\n\n<page>\n${pageText}\n</page>`,
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedPricingSchema) },
  });
  if (!response.parsed_output) {
    throw new Error("LLM 结构化输出解析失败（parsed_output 为空）");
  }
  return response.parsed_output.models;
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
