import { useState } from "react";
import type { ModelInfo, ScenarioKey } from "../types";
import { rankByScenario, SCENARIOS } from "../lib/recommend";

export function Scenarios({ models, cnyPerUsd }: { models: ModelInfo[]; cnyPerUsd: number }) {
  const [active, setActive] = useState<ScenarioKey>("coding");
  const def = SCENARIOS.find((s) => s.key === active)!;
  const ranked = rankByScenario(models, active, cnyPerUsd, 5);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-line bg-surface2 p-4">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`chip ${s.key === active ? "chip-active" : "hover:border-muted"}`}
            onClick={() => setActive(s.key)}
            aria-pressed={s.key === active}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="border-b border-line bg-surface px-4 py-3 text-xs leading-5 text-ink2">
        {def.desc}
      </p>

      <ol className="space-y-2 p-4">
        {ranked.map((r, i) => (
          <li
            key={r.model.id}
            className="grid gap-2 rounded-sm border border-line bg-surface px-3 py-2 md:grid-cols-[34px_1fr_96px_2fr] md:items-center"
          >
            <span className="num inline-flex h-7 w-7 items-center justify-center rounded-sm border border-accent/40 bg-accent-wash text-sm font-bold text-accent-deep">
              {i + 1}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold">{r.model.name}</span>
            <span className="w-fit text-[11px] text-muted">{r.model.provider}</span>
            <span className="text-xs leading-5 text-ink2">{r.reasons.join("；")}</span>
          </li>
        ))}
      </ol>
      {ranked.length === 0 && (
        <p className="px-4 pb-4 text-sm text-muted">当前筛选下没有可推荐的模型。</p>
      )}
    </div>
  );
}
