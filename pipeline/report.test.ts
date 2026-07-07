import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import { mergeData, type SourceResult } from "./merge";
import type { CuratedData, ModelData } from "../src/types";
import type { SourceDef } from "./sources";

const def: SourceDef = {
  key: "openai",
  label: "OpenAI 官方定价页",
  url: "https://example.com",
  kind: "llm",
  providers: ["OpenAI"],
  verified: true,
};

const curated: CuratedData = {
  meta: { defaultCnyPerUsd: 7.2, cnyRateNote: "n", scoreNote: "n", unknownNote: "n" },
  models: [
    {
      id: "gpt-test",
      name: "GPT Test",
      provider: "OpenAI",
      currency: "USD",
      aliases: [],
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
  ],
};

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
      cachedInputPrice: null,
      contextWindow: null,
      maxOutput: null,
      vision: true,
      toolUse: true,
      scores: { coding: 3, longDoc: 3, chat: 3, agent: 3, chinese: 3 },
      tags: [],
      notes: "",
      source: "手工",
      verified: false,
    },
  ],
};

function run(inputPrice: number, outputPrice: number) {
  const results: SourceResult[] = [
    {
      def,
      status: "ok",
      fetchedAt: "2026-07-07T00:00:00Z",
      extracted: [
        { modelId: "gpt-test", inputPrice, outputPrice, cachedInputPrice: null, contextWindow: null, maxOutput: null },
      ],
      flags: [],
    },
  ];
  const merged = mergeData(curated, previous, results, [], "2026-07-07");
  return buildReport(previous, merged, results, "2026-07-07");
}

describe("buildReport", () => {
  it("正常小幅变价：有变更、无异常，报告含变更表", () => {
    const r = run(2.2, 11.0); // +10%
    expect(r.hasChanges).toBe(true);
    expect(r.anomalies).toHaveLength(0);
    expect(r.markdown).toContain("| gpt-test | inputPrice | 2 | 2.2 | +10.0% |");
  });

  it("±50% 以上波动触发异常（CI 转 PR）", () => {
    const r = run(5.0, 10.0); // input +150%
    expect(r.anomalies.length).toBeGreaterThan(0);
    expect(r.anomalies[0]).toContain("gpt-test.inputPrice");
    expect(r.markdown).toContain("异常");
  });

  it("无变更时 hasChanges 为 false", () => {
    const r = run(2.0, 10.0);
    expect(r.hasChanges).toBe(false);
    expect(r.markdown).toContain("无变更");
  });
});
