import type { CuratedData, ModelData, ModelInfo, SourceStatus } from "../src/types";
import type { SourceDef } from "./sources";
import type { ExtractedModel, VerifyFlag } from "./verify";

export interface SourceResult {
  def: SourceDef;
  status: "ok" | "error";
  fetchedAt: string | null;
  detail?: string;
  extracted: ExtractedModel[];
  flags: VerifyFlag[];
}

export interface MergeOutput {
  data: ModelData;
  /** 官方页出现但 curated 未收录的模型（候选，需人工加 curated 条目） */
  candidates: { source: string; modelId: string }[];
  /** 每个模型本次更新了哪些字段（供报告） */
  fieldUpdates: Map<string, string[]>;
}

const FACT_FIELDS = [
  "inputPrice",
  "outputPrice",
  "cachedInputPrice",
  "contextWindow",
  "maxOutput",
] as const;

/** 名称归一化：小写、去掉除字母数字和点以外的字符，用于 id/别名匹配 */
export function normalizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9.]/g, "");
}

function matchKeys(m: { id: string; name: string; aliases: string[] }): Set<string> {
  return new Set([normalizeId(m.id), normalizeId(m.name), ...m.aliases.map(normalizeId)]);
}

/**
 * 合并：curated（人工字段，永不覆盖）× 抓取结果（事实字段）× 上一版 models.json（兜底）。
 *
 * 字段级策略：提取值非 null → 采用并更新 source/verified；null → 保留上一版的值
 * （页面没重述 ≠ 数据消失）。整个源抓取失败 → 该源模型全部保留上一版，标 stale。
 */
export function mergeData(
  curated: CuratedData,
  previous: ModelData | null,
  results: SourceResult[],
  manualProviders: string[],
  runDate: string,
): MergeOutput {
  const candidates: MergeOutput["candidates"] = [];
  const fieldUpdates = new Map<string, string[]>();
  const matchedExtractedIds = new Set<string>();

  const providerSource = new Map<string, SourceResult>();
  for (const r of results) {
    for (const p of r.def.providers) {
      if (!providerSource.has(p)) providerSource.set(p, r);
    }
  }

  const models: ModelInfo[] = curated.models.map((c) => {
    const prev = previous?.models.find((m) => m.id === c.id) ?? null;
    const base: ModelInfo = {
      id: c.id,
      name: c.name,
      provider: c.provider,
      currency: c.currency,
      vision: c.vision,
      toolUse: c.toolUse,
      scores: c.scores,
      tags: c.tags,
      notes: c.notes,
      inputPrice: prev?.inputPrice ?? c.fallback.inputPrice,
      outputPrice: prev?.outputPrice ?? c.fallback.outputPrice,
      cachedInputPrice: prev?.cachedInputPrice ?? c.fallback.cachedInputPrice,
      contextWindow: prev?.contextWindow ?? c.fallback.contextWindow,
      maxOutput: prev?.maxOutput ?? c.fallback.maxOutput,
      source: prev?.source ?? c.fallback.source,
      verified: prev?.verified ?? c.fallback.verified,
    };

    const src = providerSource.get(c.provider);
    if (!src || src.status !== "ok") return base;

    const keys = matchKeys(c);
    const hit = src.extracted.find((e) => keys.has(normalizeId(e.modelId)));
    if (!hit) return base;
    matchedExtractedIds.add(`${src.def.key}:${hit.modelId}`);

    const updated: string[] = [];
    let confirmedByCurrentSource = false;
    for (const f of FACT_FIELDS) {
      const v = hit[f];
      if (v !== null) confirmedByCurrentSource = true;
      if (v !== null && v !== base[f]) {
        (base as Record<string, unknown>)[f] = v;
        updated.push(f);
      }
    }
    if (confirmedByCurrentSource) {
      base.source = `${src.def.label}（${runDate} 自动抓取）`;
      base.verified = src.def.verified;
    }
    if (updated.length > 0) fieldUpdates.set(c.id, updated);
    return base;
  });

  // 候选新模型：官方源上有、curated 没有的条目（OpenRouter 全量列表除外——它有几百个模型）
  for (const r of results) {
    if (r.status !== "ok" || r.def.kind !== "llm") continue;
    for (const e of r.extracted) {
      if (!matchedExtractedIds.has(`${r.def.key}:${e.modelId}`)) {
        candidates.push({ source: r.def.label, modelId: e.modelId });
      }
    }
  }

  const sources: SourceStatus[] = [
    ...results.map((r) => ({
      source: r.def.label,
      status: r.status === "ok" ? ("ok" as const) : ("stale" as const),
      fetchedAt: r.fetchedAt,
      ...(r.detail ? { detail: r.detail } : {}),
    })),
    ...manualProviders.map((p) => ({
      source: p,
      status: "manual" as const,
      fetchedAt: null,
      detail: "无自动源（JS 渲染/登录墙），沿用 curated 值",
    })),
  ];

  const data: ModelData = {
    meta: {
      updatedAt: runDate,
      priceUnit: "USD or CNY per 1M tokens (see currency field)",
      defaultCnyPerUsd: curated.meta.defaultCnyPerUsd,
      cnyRateNote: curated.meta.cnyRateNote,
      scoreNote: curated.meta.scoreNote,
      unknownNote: curated.meta.unknownNote,
      pipeline: { lastRun: new Date().toISOString(), sources },
    },
    models,
  };

  return { data, candidates, fieldUpdates };
}
