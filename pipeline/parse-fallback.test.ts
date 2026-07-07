import { describe, expect, it } from "vitest";
import { extractJson } from "../gateway/parse-client";
import { parseExtractionJson } from "./parse";

/** 非结构化输出 provider 的 JSON 回退路径（parseWithLLM 的第二分支） */

const GOOD_REPLY = `好的，以下是提取结果：
\`\`\`json
{
  "models": [
    {
      "modelId": "demo-model",
      "inputPrice": 0.5,
      "outputPrice": 2,
      "cachedInputPrice": null,
      "contextWindow": 128000,
      "maxOutput": null
    }
  ]
}
\`\`\``;

describe("extractJson", () => {
  it("剥掉围栏和解释文字后取出 JSON 对象", () => {
    const v = extractJson(GOOD_REPLY) as { models: unknown[] };
    expect(v.models).toHaveLength(1);
  });

  it("没有 JSON 对象 → 抛错（绝不猜测补全）", () => {
    expect(() => extractJson("抱歉，页面上没有定价信息。")).toThrow();
  });

  it("JSON 语法错误 → 抛错", () => {
    expect(() => extractJson('{"models": [oops]}')).toThrow();
  });
});

describe("parseExtractionJson", () => {
  it("合法输出通过 Zod 并返回条目", () => {
    const models = parseExtractionJson(GOOD_REPLY);
    expect(models[0].modelId).toBe("demo-model");
    expect(models[0].inputPrice).toBe(0.5);
    expect(models[0].maxOutput).toBeNull();
  });

  it("字段类型不符 schema → 抛错走 stale 路径", () => {
    const bad = '{"models": [{"modelId": 123, "inputPrice": "贵"}]}';
    expect(() => parseExtractionJson(bad)).toThrow(/schema/);
  });
});
