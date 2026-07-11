import type { ModelInfo, PresetKey } from "../types";
import { PRESETS, rankByPreset } from "../lib/recommend";

export function Presets({ models, cnyPerUsd, active, onChange }: { models: ModelInfo[]; cnyPerUsd: number; active: PresetKey; onChange: (key: PresetKey) => void }) {
  const def = PRESETS.find((p) => p.key === active)!;
  const ranked = rankByPreset(models, active, cnyPerUsd);
  const maxScore = Math.max(...ranked.map((r) => r.score), 0.001);
  const excluded = models.length - ranked.length;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
              p.key === active
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-ink2 hover:border-muted"
            }`}
            onClick={() => onChange(p.key)}
            aria-pressed={p.key === active}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-md bg-accent-wash px-3 py-2 text-xs leading-relaxed text-accent-deep">
        <b>排序策略：</b>
        {def.strategy}
      </div>

      <ol className="mt-4 space-y-1.5">
        {ranked.map((r, i) => (
          <li key={r.model.id} className="grid grid-cols-[24px_180px_1fr] items-center gap-2 md:grid-cols-[24px_200px_120px_1fr]">
            <span className={`num text-sm font-bold ${i < 3 ? "text-accent" : "text-muted"}`}>
              {i + 1}
            </span>
            <span className="truncate text-sm">
              <span className="font-semibold">{r.model.name}</span>
              <span className="ml-1.5 text-[10px] text-muted">{r.model.provider}</span>
            </span>
            <span className="hidden h-3 md:block">
              <span
                className="block h-2.5 rounded-r bg-accent/80"
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
        <p className="mt-3 text-[11px] text-muted">
          有 {excluded} 个模型因关键数据 unknown（如价格）或能力不满足而未参与本模式排名。
        </p>
      )}
    </div>
  );
}
