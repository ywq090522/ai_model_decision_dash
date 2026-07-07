import { describe, expect, it } from "vitest";
import { estimateCost, priceInUsd } from "./cost";
import type { ModelInfo } from "../types";

const base: ModelInfo = {
  id: "test",
  name: "Test",
  provider: "Test",
  currency: "USD",
  inputPrice: 3,
  outputPrice: 15,
  cachedInputPrice: null,
  contextWindow: 200000,
  maxOutput: null,
  vision: true,
  toolUse: true,
  scores: { coding: 3, longDoc: 3, chat: 3, agent: 3, chinese: 3 },
  tags: [],
  notes: "",
  source: "",
  verified: true,
};

const input = { inputTokens: 10_000, outputTokens: 2_000, requests: 100, cnyPerUsd: 7.2 };

describe("estimateCost", () => {
  it("按公式计算：(in×单价 + out×单价)/1M × 次数", () => {
    // 手算：(10000×3 + 2000×15)/1e6 = 0.06 USD/次；×100 = 6 USD
    const r = estimateCost(base, input);
    expect(r.perRequestUsd).toBeCloseTo(0.06, 10);
    expect(r.totalUsd).toBeCloseTo(6, 10);
  });

  it("价格 unknown 时返回 null，不猜测", () => {
    const r = estimateCost({ ...base, outputPrice: null }, input);
    expect(r.perRequestUsd).toBeNull();
    expect(r.totalUsd).toBeNull();
  });

  it("人民币按汇率换算", () => {
    // ¥6/¥30 @ 7.2 → $0.8333/$4.1667 每 1M
    const cny = { ...base, currency: "CNY" as const, inputPrice: 6, outputPrice: 30 };
    const r = estimateCost(cny, { ...input, requests: 1 });
    // (10000×0.83333 + 2000×4.16667)/1e6 = 0.016667
    expect(r.perRequestUsd).toBeCloseTo(0.0166667, 5);
  });

  it("免费模型成本为 0", () => {
    const free = { ...base, inputPrice: 0, outputPrice: 0 };
    expect(estimateCost(free, input).totalUsd).toBe(0);
  });
});

describe("priceInUsd", () => {
  it("USD 原样返回", () => {
    expect(priceInUsd(5, "USD", 7.2)).toBe(5);
  });
  it("CNY 除以汇率", () => {
    expect(priceInUsd(7.2, "CNY", 7.2)).toBeCloseTo(1);
  });
  it("null 传播", () => {
    expect(priceInUsd(null, "USD", 7.2)).toBeNull();
  });
});
