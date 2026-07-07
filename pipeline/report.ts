import type { ModelData } from "../src/types";
import type { MergeOutput, SourceResult } from "./merge";

export interface ReportResult {
  markdown: string;
  /** 有变更需要提交 */
  hasChanges: boolean;
  /** 异常：价格波动超阈值 / 回查拦截率过高 —— CI 据此转 PR 人工审 */
  anomalies: string[];
}

const PRICE_SWING_THRESHOLD = 0.5; // ±50%
const FLAG_RATE_THRESHOLD = 0.3; // 回查拦截率 30%

interface Change {
  modelId: string;
  field: string;
  from: number | null;
  to: number | null;
  pct: number | null;
}

function diffModels(prev: ModelData | null, next: ModelData): Change[] {
  const changes: Change[] = [];
  const FIELDS = [
    "inputPrice",
    "outputPrice",
    "cachedInputPrice",
    "contextWindow",
    "maxOutput",
  ] as const;
  for (const m of next.models) {
    const old = prev?.models.find((p) => p.id === m.id);
    if (!old) continue;
    for (const f of FIELDS) {
      const a = old[f];
      const b = m[f];
      if (a === b) continue;
      const pct = a !== null && a !== 0 && b !== null ? (b - a) / a : null;
      changes.push({ modelId: m.id, field: f, from: a, to: b, pct });
    }
  }
  return changes;
}

const fmtVal = (v: number | null) => (v === null ? "unknown" : String(v));
const fmtPct = (p: number | null) =>
  p === null ? "—" : `${p > 0 ? "+" : ""}${(p * 100).toFixed(1)}%`;

export function buildReport(
  prev: ModelData | null,
  merged: MergeOutput,
  results: SourceResult[],
  runDate: string,
): ReportResult {
  const changes = diffModels(prev, merged.data);
  const allFlags = results.flatMap((r) => r.flags.map((f) => ({ src: r.def.label, ...f })));
  const totalExtractedNumbers = results.reduce(
    (n, r) =>
      n +
      r.extracted.reduce(
        (k, e) =>
          k +
          [e.inputPrice, e.outputPrice, e.cachedInputPrice, e.contextWindow, e.maxOutput].filter(
            (v) => v !== null,
          ).length,
        0,
      ),
    0,
  );

  const anomalies: string[] = [];
  for (const c of changes) {
    if (
      (c.field === "inputPrice" || c.field === "outputPrice") &&
      c.pct !== null &&
      Math.abs(c.pct) > PRICE_SWING_THRESHOLD
    ) {
      anomalies.push(
        `价格异常波动：${c.modelId}.${c.field} ${fmtVal(c.from)} → ${fmtVal(c.to)}（${fmtPct(c.pct)}，超过 ±50% 阈值）`,
      );
    }
  }
  const denom = totalExtractedNumbers + allFlags.length;
  if (denom > 0 && allFlags.length / denom > FLAG_RATE_THRESHOLD) {
    anomalies.push(
      `数字回查拦截率过高：${allFlags.length}/${denom}（>${FLAG_RATE_THRESHOLD * 100}%），LLM 解析质量可疑`,
    );
  }

  const lines: string[] = [
    `# 数据更新报告 ${runDate}`,
    "",
    `管线运行于 ${new Date().toISOString()}。LLM 仅用于解析官方页面文本；所有数字经过源文本回查，未通过回查或页面未写明的字段一律为 unknown。`,
    "",
    "## 源状态",
    "",
    "| 源 | 状态 | 抓取时间 | 备注 |",
    "|---|---|---|---|",
    ...(merged.data.meta.pipeline?.sources.map(
      (s) => `| ${s.source} | ${s.status} | ${s.fetchedAt ?? "—"} | ${s.detail ?? ""} |`,
    ) ?? []),
    "",
    "## 字段变更",
    "",
  ];

  if (changes.length === 0) {
    lines.push("无变更。");
  } else {
    lines.push(
      "| 模型 | 字段 | 旧值 | 新值 | 变动 |",
      "|---|---|---|---|---|",
      ...changes.map(
        (c) => `| ${c.modelId} | ${c.field} | ${fmtVal(c.from)} | ${fmtVal(c.to)} | ${fmtPct(c.pct)} |`,
      ),
    );
  }

  if (allFlags.length > 0) {
    lines.push(
      "",
      "## 回查拦截（LLM 输出的数字未在源文本中找到，已置 unknown）",
      "",
      "| 源 | 模型 | 字段 | 被拦截值 |",
      "|---|---|---|---|",
      ...allFlags.map((f) => `| ${f.src} | ${f.modelId} | ${f.field} | ${f.value} |`),
    );
  }

  if (merged.candidates.length > 0) {
    lines.push(
      "",
      "## 候选新模型（官方页有、本库未收录；能力评分需人工评定后加入 curated.json）",
      "",
      ...merged.candidates.map((c) => `- \`${c.modelId}\`（来源：${c.source}）`),
    );
  }

  if (anomalies.length > 0) {
    lines.push("", "## ⚠️ 异常（本次更新需人工审核）", "", ...anomalies.map((a) => `- ${a}`));
  }

  return {
    markdown: lines.join("\n") + "\n",
    hasChanges: changes.length > 0,
    anomalies,
  };
}
