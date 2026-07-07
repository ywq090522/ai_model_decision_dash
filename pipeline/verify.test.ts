import { describe, expect, it } from "vitest";
import { extractNumbers, verifyExtraction, verifyPrice, verifyTokenCount } from "./verify";

const PAGE = `
Model pricing (per 1M tokens):
gpt-test  Input $2.50  Cached $0.25  Output $15.00
Context window: 200K tokens, max output 128,000 tokens.
mini-test  Input $0.75 / 1K tokens: $0.00075
`;

describe("extractNumbers", () => {
  it("提取带千分位/小数的数值", () => {
    const nums = extractNumbers("costs $1,234.5 and 0.003625 per 1M");
    expect(nums).toContain(1234.5);
    expect(nums).toContain(0.003625);
    expect(nums).toContain(1);
  });
});

describe("verifyPrice / verifyTokenCount", () => {
  const nums = extractNumbers(PAGE);
  it("页面上写了的价格通过", () => {
    expect(verifyPrice(nums, 2.5)).toBe(true);
    expect(verifyPrice(nums, 15.0)).toBe(true);
  });
  it("每 1K 标价 ×1000 换算后的价格通过（0.00075 → 0.75）", () => {
    expect(verifyPrice(extractNumbers("price: $0.00075 per 1K"), 0.75)).toBe(true);
  });
  it("页面上没有的价格不通过", () => {
    expect(verifyPrice(nums, 3.99)).toBe(false);
  });
  it("token 数支持 200K / 128,000 / 1M 形式", () => {
    expect(verifyTokenCount(nums, 200_000)).toBe(true); // "200K"
    expect(verifyTokenCount(nums, 128_000)).toBe(true); // "128,000"
    expect(verifyTokenCount(extractNumbers("1M context"), 1_000_000)).toBe(true);
    expect(verifyTokenCount(extractNumbers("131072 = 128K binary"), 131_072)).toBe(true);
  });
});

describe("verifyExtraction — LLM 不能作为事实来源的强制层", () => {
  it("LLM 编造的数字被拦截置 null 并记录 flag", () => {
    const { models, flags } = verifyExtraction(PAGE, [
      {
        modelId: "gpt-test",
        inputPrice: 2.5, // 页面有 → 保留
        outputPrice: 30.0, // 页面没有（编造）→ 拦截
        cachedInputPrice: 0.25,
        contextWindow: 200_000,
        maxOutput: 999_999, // 编造 → 拦截
      },
    ]);
    expect(models[0].inputPrice).toBe(2.5);
    expect(models[0].outputPrice).toBeNull();
    expect(models[0].cachedInputPrice).toBe(0.25);
    expect(models[0].contextWindow).toBe(200_000);
    expect(models[0].maxOutput).toBeNull();
    expect(flags).toHaveLength(2);
    expect(flags.map((f) => f.field).sort()).toEqual(["maxOutput", "outputPrice"]);
  });

  it("本来就是 null 的字段不产生 flag", () => {
    const { models, flags } = verifyExtraction(PAGE, [
      {
        modelId: "x",
        inputPrice: null,
        outputPrice: null,
        cachedInputPrice: null,
        contextWindow: null,
        maxOutput: null,
      },
    ]);
    expect(flags).toHaveLength(0);
    expect(models[0].inputPrice).toBeNull();
  });
});
