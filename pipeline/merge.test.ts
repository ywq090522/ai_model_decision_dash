import { describe, expect, it } from "vitest";
import { mergeData, normalizeId, publicDetail, type SourceResult } from "./merge";
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

describe("publicDetail", () => {
  it("剥掉密钥环境变量名（models.json 进前端 bundle，deploy 泄漏自检会拦）", () => {
    expect(publicDetail("请设置环境变量 ANTHROPIC_API_KEY（本地可写入 .env）")).not.toContain(
      "ANTHROPIC_API_KEY",
    );
    expect(publicDetail("缺 GATEWAY_AUTH_TOKEN")).not.toContain("GATEWAY_AUTH_TOKEN");
    expect(publicDetail("HTTP 500")).toBe("HTTP 500");
  });

  it("mergeData 写入的源状态 detail 已净化", () => {
    const failed: SourceResult = {
      def: openaiDef,
      status: "error",
      fetchedAt: null,
      detail: 'provider "anthropic" 未配置密钥：请设置环境变量 ANTHROPIC_API_KEY',
      extracted: [],
      flags: [],
    };
    const out = mergeData(curated, null, [failed], [], "2026-07-07");
    const s = out.data.meta.pipeline!.sources.find((x) => x.source.includes("OpenAI"))!;
    expect(s.detail).not.toContain("ANTHROPIC_API_KEY");
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
    expect(m.verifiedAt).toBe("2026-07-07T00:00:00Z"); // 官方源抓取时间
    expect(m.verificationSource).toBe("OpenAI 官方定价页");
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
          verifiedAt: "2026-06-01T00:00:00Z",
          verificationSource: "OpenAI 官方定价页",
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
    expect(m.source).toContain("OpenAI 官方定价页");
    expect(m.verified).toBe(true);
    expect(m.verifiedAt).toBe("2026-07-07T00:00:00Z"); // 本次核实时间刷新
  });

  it("命中模型但所有事实字段都是 null 时，不更新 source/verified", () => {
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
          verified: false,
          verifiedAt: null,
          verificationSource: null,
        },
      ],
    };
    const out = mergeData(
      curated,
      previous,
      [
        okResult([
          {
            modelId: "gpt-test",
            inputPrice: null,
            outputPrice: null,
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
    expect(m.inputPrice).toBe(2.0);
    expect(m.outputPrice).toBe(10.0);
    expect(m.source).toBe("旧源");
    expect(m.verified).toBe(false);
    expect(out.fieldUpdates.has("gpt-test")).toBe(false);
  });

  it("部分字段非 null 时，只更新对应字段，并更新 source/verified", () => {
    const out = mergeData(
      curated,
      null,
      [
        okResult([
          {
            modelId: "gpt-test",
            inputPrice: null,
            outputPrice: 12.0,
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
    expect(m.inputPrice).toBe(2.0);
    expect(m.outputPrice).toBe(12.0);
    expect(m.source).toContain("OpenAI 官方定价页");
    expect(m.verified).toBe(true);
    expect(m.verifiedAt).not.toBeNull();
    expect(out.fieldUpdates.get("gpt-test")).toEqual(["outputPrice"]);
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
    expect(m.verified).toBe(false); // 兜底数据绝不 verified
    expect(m.verifiedAt).toBeNull();
    const statuses = out.data.meta.pipeline!.sources;
    const openaiStatus = statuses.find((s) => s.source.includes("OpenAI"))!;
    expect(openaiStatus.status).toBe("stale");
    expect(openaiStatus.providers).toEqual(["OpenAI"]); // UI 据此给模型打 stale 角标
    expect(statuses.find((s) => s.source.includes("豆包"))!.status).toBe("manual");
  });

  it("seed/fallback 数据不能伪装 verified：首次生成（无 previous）且源失败时全部 verified=false", () => {
    const failed: SourceResult = {
      def: openaiDef,
      status: "error",
      fetchedAt: null,
      detail: "HTTP 500",
      extracted: [],
      flags: [],
    };
    const out = mergeData(curated, null, [failed], ["豆包 (火山引擎)"], "2026-07-07");
    for (const m of out.data.models) {
      expect(m.verified).toBe(false);
      expect(m.verifiedAt).toBeNull();
      expect(m.verificationSource).toBeNull();
    }
  });

  it("旧版数据 verified=true 但无 verifiedAt（seed 伪装）→ 迁移时归零", () => {
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
          source: "Anthropic 官方定价（2026-06 缓存）",
          verified: true, // 旧格式 seed 伪装
          verifiedAt: null,
          verificationSource: null,
        },
      ],
    };
    const failed: SourceResult = {
      def: openaiDef,
      status: "error",
      fetchedAt: null,
      detail: "HTTP 500",
      extracted: [],
      flags: [],
    };
    const out = mergeData(curated, previous, [failed], [], "2026-07-07");
    const m = out.data.models.find((x) => x.id === "gpt-test")!;
    expect(m.inputPrice).toBe(2.0); // 事实字段保留
    expect(m.verified).toBe(false); // 但 verified 伪装被剥掉
    expect(m.verifiedAt).toBeNull();
  });

  it("第三方源（def.verified=false）确认的数据不算官方核实", () => {
    const thirdPartyDef: SourceDef = { ...openaiDef, verified: false };
    const out = mergeData(
      curated,
      null,
      [
        {
          def: thirdPartyDef,
          status: "ok",
          fetchedAt: "2026-07-07T00:00:00Z",
          extracted: [
            {
              modelId: "gpt-test",
              inputPrice: 2.5,
              outputPrice: 15.0,
              cachedInputPrice: null,
              contextWindow: null,
              maxOutput: null,
            },
          ],
          flags: [],
        },
      ],
      [],
      "2026-07-07",
    );
    const m = out.data.models.find((x) => x.id === "gpt-test")!;
    expect(m.inputPrice).toBe(2.5); // 事实字段更新
    expect(m.verified).toBe(false); // 但不算官方核实
    expect(m.verifiedAt).toBeNull();
    expect(m.verificationSource).toBeNull();
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
