import type { z } from "zod";
import type { ExtractedModelSchema } from "../src/data/schema";

export type ExtractedModel = z.infer<typeof ExtractedModelSchema>;

export interface VerifyFlag {
  modelId: string;
  field: string;
  value: number;
  reason: string;
}

/**
 * 数字回查 —— "LLM 只能解析，不能作为事实来源"的强制层。
 *
 * LLM 输出的每个数字必须能在源页面文本中找到对应数值，否则该字段置 null 并记录 flag。
 * 允许的对应关系：
 *  - 价格：原数值，或 ÷1000（页面按每千 tokens 标价时的换算）
 *  - token 数：原数值，或 ÷1000（"200K"）、÷1,000,000（"1M"）、÷1024（二进制 K，如 131072 → "128K"）
 */

/** 从页面文本提取所有数值（去千分位逗号） */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function closeTo(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / scale < 1e-6;
}

function numberInText(nums: number[], candidates: number[]): boolean {
  return candidates.some((c) => nums.some((n) => closeTo(n, c)));
}

export function verifyPrice(nums: number[], value: number): boolean {
  return numberInText(nums, [value, value / 1000]);
}

export function verifyTokenCount(nums: number[], value: number): boolean {
  return numberInText(nums, [value, value / 1000, value / 1_000_000, value / 1024]);
}

const PRICE_FIELDS = ["inputPrice", "outputPrice", "cachedInputPrice"] as const;
const TOKEN_FIELDS = ["contextWindow", "maxOutput"] as const;

/**
 * 校验一个来源页的全部提取结果：回查不通过的字段置 null。
 * 返回净化后的条目与被拦截的 flags。
 */
export function verifyExtraction(
  sourceText: string,
  extracted: ExtractedModel[],
): { models: ExtractedModel[]; flags: VerifyFlag[] } {
  const nums = extractNumbers(sourceText);
  const flags: VerifyFlag[] = [];

  const models = extracted.map((m) => {
    const clean: ExtractedModel = { ...m };
    for (const f of PRICE_FIELDS) {
      const v = clean[f];
      if (v !== null && !verifyPrice(nums, v)) {
        flags.push({ modelId: m.modelId, field: f, value: v, reason: "数值未在源文本中出现" });
        clean[f] = null;
      }
    }
    for (const f of TOKEN_FIELDS) {
      const v = clean[f];
      if (v !== null && !verifyTokenCount(nums, v)) {
        flags.push({ modelId: m.modelId, field: f, value: v, reason: "数值未在源文本中出现" });
        clean[f] = null;
      }
    }
    return clean;
  });

  return { models, flags };
}
