import type { ModelInfo } from "../types";

export interface CostInput {
  /** 每次请求的输入 token 数 */
  inputTokens: number;
  /** 每次请求的输出 token 数 */
  outputTokens: number;
  /** 请求次数 */
  requests: number;
  /** 人民币兑美元汇率（1 USD = cnyPerUsd CNY） */
  cnyPerUsd: number;
}

export interface CostResult {
  model: ModelInfo;
  /** 单次请求成本（USD）；null = 价格 unknown，无法计算 */
  perRequestUsd: number | null;
  /** 总成本（USD） */
  totalUsd: number | null;
}

const MILLION = 1_000_000;

/** 把模型价格统一换算为 USD/1M tokens */
export function priceInUsd(
  price: number | null,
  currency: "USD" | "CNY",
  cnyPerUsd: number,
): number | null {
  if (price === null) return null;
  if (currency === "CNY") {
    if (cnyPerUsd <= 0) return null;
    return price / cnyPerUsd;
  }
  return price;
}

/**
 * 成本 = (输入token × 输入单价 + 输出token × 输出单价) / 1,000,000 × 请求次数
 * 任一价格 unknown 时返回 null（不猜测）。
 */
export function estimateCost(model: ModelInfo, input: CostInput): CostResult {
  const inUsd = priceInUsd(model.inputPrice, model.currency, input.cnyPerUsd);
  const outUsd = priceInUsd(model.outputPrice, model.currency, input.cnyPerUsd);

  if (inUsd === null || outUsd === null) {
    return { model, perRequestUsd: null, totalUsd: null };
  }

  const perRequestUsd =
    (input.inputTokens * inUsd + input.outputTokens * outUsd) / MILLION;

  return {
    model,
    perRequestUsd,
    totalUsd: perRequestUsd * input.requests,
  };
}

export function estimateAll(models: ModelInfo[], input: CostInput): CostResult[] {
  const results = models.map((m) => estimateCost(m, input));
  // 可计算的按总价升序，unknown 的排最后
  return results.sort((a, b) => {
    if (a.totalUsd === null && b.totalUsd === null) return 0;
    if (a.totalUsd === null) return 1;
    if (b.totalUsd === null) return -1;
    return a.totalUsd - b.totalUsd;
  });
}

export function formatUsd(v: number | null): string {
  if (v === null) return "unknown";
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(5)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  if (v < 1000) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export function formatPrice(price: number | null, currency: "USD" | "CNY"): string {
  if (price === null) return "unknown";
  const sym = currency === "CNY" ? "¥" : "$";
  return `${sym}${price < 0.01 && price > 0 ? price.toFixed(4) : price.toFixed(2)}`;
}

export function formatTokens(n: number | null): string {
  if (n === null) return "unknown";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
