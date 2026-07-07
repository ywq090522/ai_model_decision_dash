import { useState } from "react";
import type { ModelInfo, PresetKey } from "../types";
import { PRESETS, rankByPreset } from "../lib/recommend";

export function Presets({ models, cnyPerUsd }: { models: ModelInfo[]; cnyPerUsd: number }) {
  const [active, setActive] = useState<PresetKey>("student");
  const def = PRESETS.find((p) => p.key === active)!;
  const ranked = rankByPreset(models, active, cnyPerUsd);
  const maxScore = Math.max(...ranked.map((r) => r.score), 0.001);
  const excluded = models.length - ranked.length;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-line bg-surface2 p-4">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              p.key === active
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-ink2 hover:border-muted"
            }`}
            onClick={() => setActive(p.key)}
            aria-pressed={p.key === active}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="border-b border-line bg-accent-wash px-4 py-3 text-xs leading-relaxed text-accent-deep">
        <b>排序策略：</b>
        {def.strategy}
      </div>

      <ol className="space-y-1.5 p-4">
        {ranked.map((r, i) => (
          <li
            key={r.model.id}
            className="grid gap-2 rounded-sm border border-line bg-surface px-3 py-2 md:grid-cols-[34px_220px_140px_1fr] md:items-center"
          >
            <span className={`num inline-flex h-7 w-7 items-center justify-center rounded-sm border text-sm font-bold ${i < 3 ? "border-accent/40 bg-accent-wash text-accent-deep" : "border-line bg-surface2 text-muted"}`}>
              {i + 1}
            </span>
            <span className="min-w-0 truncate text-sm">
              <span className="font-semibold">{r.model.name}</span>
              <span className="ml-1.5 text-[11px] text-muted">{r.model.provider}</span>
            </span>
            <span className="hidden h-3 rounded-sm bg-surface2 md:block">
              <span
                className="block h-3 rounded-r-sm bg-accent/80"
                style={{ width: `${Math.max(2, (r.score / maxScore) * 100)}%` }}
                title={`得分 ${r.score.toFixed(1)}`}
              />
            </span>
            <span className="truncate text-xs text-ink2" title={r.reasons[0]}>
              {r.reasons[0]}
            </span>
          </li>
        ))}
      </ol>

      {excluded > 0 && (
        <p className="border-t border-line px-4 py-3 text-[11px] text-muted">
          有 {excluded} 个模型因关键数据 unknown（如价格）或能力不满足而未参与本模式排名。
        </p>
      )}
    </div>
  );
}
