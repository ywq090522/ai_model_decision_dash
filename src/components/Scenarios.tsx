import { useState } from "react";
import type { ModelInfo, ScenarioKey } from "../types";
import { rankByScenario, SCENARIOS } from "../lib/recommend";

export function Scenarios({ models, cnyPerUsd }: { models: ModelInfo[]; cnyPerUsd: number }) {
  const [active, setActive] = useState<ScenarioKey>("coding");
  const def = SCENARIOS.find((s) => s.key === active)!;
  const ranked = rankByScenario(models, active, cnyPerUsd, 5);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            className={`chip ${s.key === active ? "chip-active" : "hover:border-muted"}`}
            onClick={() => setActive(s.key)}
            aria-pressed={s.key === active}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink2">{def.desc}</p>

      <ol className="mt-4 space-y-2">
        {ranked.map((r, i) => (
          <li
            key={r.model.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-line/70 bg-paper/50 px-3 py-2"
          >
            <span className="num w-5 text-sm font-bold text-accent">{i + 1}</span>
            <span className="text-sm font-semibold">{r.model.name}</span>
            <span className="text-[11px] text-muted">{r.model.provider}</span>
            <span className="ml-auto text-xs text-ink2">{r.reasons.join("；")}</span>
          </li>
        ))}
      </ol>
      {ranked.length === 0 && (
        <p className="mt-4 text-sm text-muted">当前筛选下没有可推荐的模型。</p>
      )}
    </div>
  );
}
