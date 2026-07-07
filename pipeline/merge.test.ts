import { describe, expect, it } from "vitest";
import { mergeData, normalizeId, type SourceResult } from "./merge";
import type { CuratedData, ModelData } from "../src/types";
import type { SourceDef } from "./sources";

const curated: CuratedData = {
  meta: {
    defaultCnyPerUsd: 7.2,
    cnyRateNote: "n",
    scoreNote: "n",
    unknownNote: "n",
  },
  models: [
    {
      id: "gpt-test",
      name: "GPT Test",
      provider: "OpenAI",
      currency: "USD",
      aliases: ["gpt-test-latest"],
      vision: true,
      toolUse: true,
      scores: { coding: 3, longDoc: 3, chat: 3, agent: 3, chinese: 3 },
      tags: [],
      notes: "",
      fallback: {
        inputPrice: 2.0,
        outputPrice: 10.0,
        cachedInputPrice: null,
        contextWindow: null,
        maxOutput: null,
        source: "手工",
        verified: false,
      },
    },
    {
      id: "doubao-test",
      name: "豆包 Test",
      provider: "豆包 (火山引擎)",
      currency: "CNY",
      aliases: [],
      vision: null,
      toolUse: null,
      scores: { coding: 3, longDoc: 3, chat: 3, agent: 3, chinese: 5 },
      tags: [],
      notes: "",
      fallback: {
        inputPrice: 6.0,
        outputPrice: 30.0,
        cachedInputPrice: null,
        contextWindow: null,
        maxOutput: null,
        source: "手工",
        verified: false,
      },
    },
  ],
};

const openaiDef: SourceDef = {
  key: "openai",
  label: "OpenAI 官方定价页",
  url: "https://example.com",
  kind: "llm",
  providers: ["OpenAI"],
  verified: true,
};

function okResult(extracted: SourceResult["extracted"]): SourceResult {
  return { def: openaiDef, status: "ok", fetchedAt: "2026-07-07T00:00:00Z", extracted, flags: [] };
}

describe("normalizeId", () => {
  it("大小写/连字符/斜杠归一", () => {
    expect(normalizeId("GPT Test")).toBe(normalizeId("gpt-test"));
    expect(normalizeId("moonshotai/kimi-k2.5")).toBe("moonshotaikimik2.5");
  });
});

describe("mergeData", () => {
  it("提取值覆盖事实字段，人工字段（scores/notes）不动，来源与 verified 更新", () => {
    const out = mergeData(
      curated,
      null,
      [
        okResult([
          {
            modelId: "gpt-test",
            inputPrice: 2.5,
            outputPrice: 15.0,
            cachedInputPrice: null,
            contextWindow: 400_000,
            maxOutput: null,
          },
        ]),
      ],
      ["豆包 (火山引擎)"],
      "2026-07-07",
    );
    const m = out.data.models.find((x) => x.id === "gpt-test")!;
    expect(m.inputPrice).toBe(2.5);
    expect(m.outputPrice).toBe(15.0);
    expect(m.contextWindow).toBe(400_000);
    expect(m.verified).toBe(true);
    expect(m.source).toContain("OpenAI 官方定价页");
    expect(m.scores.coding).toBe(3); // 人工字段不被覆盖
    expect(out.fieldUpdates.get("gpt-test")).toEqual([
      "inputPrice",
      "outputPrice",
      "contextWindow",
    ]);
  });

  it("提取为 null 的字段保留上一版值（页面没重述 ≠ 数据消失）", () => {
    const previous: ModelData = {
      meta: {
        updatedAt: "2026-06-01",
        priceUnit: "u",
        defaultCnyPerUsd: 7.2,
        cnyRateNote: "n",
        scoreNote: "n",
        unknownNote: "n",
      },
      models: [
        {
          id: "gpt-test",
          name: "GPT Test",
          provider: "OpenAI",
          currency: "USD",
          inputPrice: 2.0,
          outputPrice: 10.0,
          cachedInputPrice: 0.2,
          contextWindow: 400_000,
          maxOutput: 128_000,
          vision: true,
          toolUse: true,
          scores: { coding: 3, longDoc: 3, chat: 3, agent: 3, chinese: 3 },
          tags: [],
          notes: "",
          source: "旧源",
          verified: true,
        },
      ],
    };
    const out = mergeData(
      curated,
      previous,
      [
        okResult([
          {
            modelId: "gpt-test-latest", // 通过 alias 匹配
            inputPrice: 2.5,
            outputPrice: null, // 页面这次没写 → 保留旧值
            cachedInputPrice: null,
            contextWindow: null,
            maxOutput: null,
          },
        ]),
      ],
      [],
      "2026-07-07",
    );
    const m = out.data.models.find((x) => x.id === "gpt-test")!;
    expect(m.inputPrice).toBe(2.5);
    expect(m.outputPrice).toBe(10.0);
    expect(m.contextWindow).toBe(400_000);
  });

  it("源失败 → 保留旧值并标 stale；manual provider 标 manual", () => {
    const failed: SourceResult = {
      def: openaiDef,
      status: "error",
      fetchedAt: null,
      detail: "HTTP 500",
      extracted: [],
      flags: [],
    };
    const out = mergeData(curated, null, [failed], ["豆包 (火山引擎)"], "2026-07-07");
    const m = out.data.models.find((x) => x.id === "gpt-test")!;
    expect(m.inputPrice).toBe(2.0); // fallback 值
    expect(m.source).toBe("手工");
    const statuses = out.data.meta.pipeline!.sources;
    expect(statuses.find((s) => s.source.includes("OpenAI"))!.status).toBe("stale");
    expect(statuses.find((s) => s.source.includes("豆包"))!.status).toBe("manual");
  });

  it("官方页出现但 curated 未收录的模型进候选清单，不自动入库", () => {
    const out = mergeData(
      curated,
      null,
      [
        okResult([
          {
            modelId: "gpt-brand-new",
            inputPrice: 1.0,
            outputPrice: 5.0,
            cachedInputPrice: null,
            contextWindow: null,
            maxOutput: null,
          },
        ]),
      ],
      [],
      "2026-07-07",
    );
    expect(out.candidates).toEqual([
      { source: "OpenAI 官方定价页", modelId: "gpt-brand-new" },
    ]);
    expect(out.data.models.find((m) => m.id === "gpt-brand-new")).toBeUndefined();
  });
});
