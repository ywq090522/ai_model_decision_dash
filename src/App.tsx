import { useMemo, useState } from "react";
import rawData from "./data/models.json";
import type { ModelData, ModelInfo } from "./types";
import { DEFAULT_FILTERS, FilterBar, type Filters } from "./components/FilterBar";
import { ModelTable } from "./components/ModelTable";
import { CostCalculator } from "./components/CostCalculator";
import { Scenarios } from "./components/Scenarios";
import { Presets } from "./components/Presets";
import { Section } from "./components/ui";

const data = rawData as ModelData;

function applyFilters(models: ModelInfo[], f: Filters): ModelInfo[] {
  const q = f.search.trim().toLowerCase();
  return models.filter((m) => {
    if (f.provider !== "all" && m.provider !== f.provider) return false;
    if (f.visionOnly && m.vision !== true) return false;
    if (f.toolsOnly && m.toolUse !== true) return false;
    if (f.verifiedOnly && !m.verified) return false;
    if (f.freeOnly && !(m.inputPrice === 0 && m.outputPrice === 0)) return false;
    if (q) {
      const hay = `${m.name} ${m.id} ${m.provider} ${m.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [cnyPerUsd, setCnyPerUsd] = useState(data.meta.defaultCnyPerUsd);

  const providers = useMemo(
    () => [...new Set(data.models.map((m) => m.provider))],
    [],
  );
  const filtered = useMemo(() => applyFilters(data.models, filters), [filters]);

  const stats = useMemo(() => {
    const verified = data.models.filter((m) => m.verified).length;
    const free = data.models.filter((m) => m.inputPrice === 0 && m.outputPrice === 0).length;
    const unknownPrice = data.models.filter(
      (m) => m.inputPrice === null || m.outputPrice === null,
    ).length;
    return { verified, free, unknownPrice, providers: providers.length };
  }, [providers.length]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <header className="rounded-md border border-line bg-surface px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              模型决策台
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink2">
              AI Model Decision Dashboard：对比价格、上下文、工具/图片能力和场景推荐，快速缩小候选模型。
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:justify-end">
            <Stat label="模型" value={String(data.models.length)} />
            <Stat label="厂商" value={String(stats.providers)} />
            <Stat label="官方核实价" value={String(stats.verified)} tone="accent" />
            <Stat label="价格 unknown" value={String(stats.unknownPrice)} tone="audit" />
            <Stat label="免费" value={String(stats.free)} />
            <Stat label="更新" value={data.meta.updatedAt} />
          </dl>
        </div>

        <p className="mt-3 rounded-md border border-audit/25 bg-audit-wash px-3 py-2 text-xs leading-5 text-audit-deep">
          数据完整性：unknown 表示未能从官方渠道核实；缺失价格不参与成本计算，排序时置后。
        </p>
      </header>

      <main>
        <Section
          id="table"
          eyebrow="对比"
          title="模型对照表"
          desc="价格单位为每百万 tokens；unknown 字段保留缺口，并在排序中置后。"
        >
          <div className="space-y-3">
            <FilterBar
              filters={filters}
              onChange={setFilters}
              providers={providers}
              matched={filtered.length}
              total={data.models.length}
            />
            <ModelTable models={filtered} cnyPerUsd={cnyPerUsd} />
          </div>
        </Section>

        <Section
          id="cost"
          eyebrow="估算"
          title="成本计算器"
          desc="按筛选后的模型和当前汇率估算请求成本；人民币计价模型先换算为 USD。"
        >
          <CostCalculator
            models={filtered}
            cnyPerUsd={cnyPerUsd}
            onCnyPerUsdChange={(v) => setCnyPerUsd(v > 0 ? v : cnyPerUsd)}
          />
        </Section>

        <Section
          id="presets"
          eyebrow="预设"
          title="预设模式"
          desc="三套权重覆盖预算、编码和长文档分析，每条结果保留入选理由。"
        >
          <Presets models={data.models} cnyPerUsd={cnyPerUsd} />
        </Section>

        <Section
          id="scenarios"
          eyebrow="场景"
          title="按场景推荐"
          desc="按使用场景输出 Top 5 候选和主要依据。"
        >
          <Scenarios models={data.models} cnyPerUsd={cnyPerUsd} />
        </Section>
      </main>

      <footer className="mt-12 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
        <p>{data.meta.unknownNote}</p>
        <p className="mt-1">{data.meta.scoreNote}</p>
        <p className="mt-1">
          {data.meta.cnyRateNote} 数据更新于 {data.meta.updatedAt}，价格随时可能调整，下单前请以各厂商官方定价页为准。
        </p>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "audit";
}) {
  const valueColor =
    tone === "accent" ? "text-accent-deep" : tone === "audit" ? "text-audit-deep" : "text-ink";
  return (
    <div className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`num text-sm font-semibold ${valueColor}`}>
        {value}
      </dd>
    </div>
  );
}
