import { useEffect, useMemo, useState } from "react";
import rawData from "./data/models.json";
import type { ModelData, ModelInfo } from "./types";
import { FilterBar, type Filters } from "./components/FilterBar";
import { ModelTable } from "./components/ModelTable";
import { CompareModels } from "./components/CompareModels";
import { CostCalculator } from "./components/CostCalculator";
import { Scenarios } from "./components/Scenarios";
import { Presets } from "./components/Presets";
import { Section } from "./components/ui";
import { decodeShareableState, encodeShareableState, type ShareableState } from "./lib/pageState";
import { availableStorage, loadCostInputs, saveCostInputs, type CostInputs } from "./lib/costStorage";
import { dataFreshness, sourceSummary } from "./lib/freshness";

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
  const providers = useMemo(
    () => [...new Set(data.models.map((m) => m.provider))],
    [],
  );
  const modelIds = useMemo(() => data.models.map((m) => m.id), []);
  const readPageState = () => decodeShareableState(typeof window === "undefined" ? "" : window.location.search, providers, modelIds);
  const [pageState, setPageState] = useState<ShareableState>(readPageState);
  const { filters } = pageState;
  const defaultCosts: CostInputs = { cnyPerUsd: data.meta.defaultCnyPerUsd, inputTokens: 4000, outputTokens: 1000, requests: 1000 };
  const [costInputs, setCostInputs] = useState<CostInputs>(() => loadCostInputs(availableStorage(typeof window === "undefined" ? null : window), defaultCosts));
  const cnyPerUsd = costInputs.cnyPerUsd;
  const filtered = useMemo(() => applyFilters(data.models, filters), [filters]);

  useEffect(() => {
    const query = encodeShareableState(pageState, modelIds);
    const next = `${window.location.pathname}${query}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [pageState, modelIds]);

  useEffect(() => {
    const restore = () => setPageState(readPageState());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [providers, modelIds]);

  useEffect(() => saveCostInputs(availableStorage(window), costInputs), [costInputs]);

  const stats = useMemo(() => {
    const verified = data.models.filter((m) => m.verified).length;
    const free = data.models.filter((m) => m.inputPrice === 0 && m.outputPrice === 0).length;
    const unknownPrice = data.models.filter(
      (m) => m.inputPrice === null || m.outputPrice === null,
    ).length;
    return { verified, free, unknownPrice };
  }, []);

  // 数据源新鲜度（来自管线写入的 meta.pipeline，不硬编码）
  const sourceStats = useMemo(() => {
    const { sources, ok, stale, manual } = sourceSummary(data.meta);
    const staleProviders = new Set(stale.flatMap((s) => s.providers ?? []));
    return { total: sources.length, ok: ok.length, stale, manual, staleProviders };
  }, []);
  const freshness = dataFreshness(data.meta.updatedAt);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8">
      {/* 页头 */}
      <header className="border-b-2 border-ink pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Model Spec Sheet · 选型决策台
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              AI Model Decision Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink2">
              主流大模型价格 / 上下文 / 能力对照表，配成本计算器与场景推荐。
              查不到的数据一律标 <i className="text-muted">unknown</i>，绝不编造。
            </p>
            {sourceStats.stale.length > 0 && (
              <p className="mt-1.5 max-w-2xl text-xs text-warn">
                ⚠ {sourceStats.stale.length} 个数据源 stale（
                {sourceStats.stale.map((s) => s.source).join("、")}
                ），相关模型显示的是历史 / 兜底数据。
              </p>
            )}
            {sourceStats.manual.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {sourceStats.manual.length} 个数据源为人工维护；其状态不代表本次自动抓取成功。
              </p>
            )}
          </div>
          <dl className="flex gap-6 text-right">
            <Stat label="收录模型" value={String(data.models.length)} />
            <Stat label="官方核实价" value={String(stats.verified)} />
            {sourceStats.total > 0 && (
              <Stat
                label="数据源"
                value={`${sourceStats.ok}/${sourceStats.total} 正常`}
                small
                warn={sourceStats.stale.length > 0}
                title={
                  sourceStats.stale.length > 0
                    ? `stale：${sourceStats.stale.map((s) => s.source).join("、")}`
                    : "全部数据源本次抓取正常"
                }
              />
            )}
            <Stat
              label="数据更新"
              value={freshness.daysOld === null ? "未知" : `${data.meta.updatedAt} · ${freshness.label}`}
              small
              warn={freshness.stale === true}
              title={freshness.stale === true ? "数据已超过新鲜度阈值" : undefined}
            />
          </dl>
        </div>
      </header>

      {/* 模型对照表 */}
      <Section
        id="table"
        eyebrow="01 · Compare"
        title="模型对照表"
        desc="点击表头排序（unknown 永远排最后），使用模型名称按钮展开备注与数据来源。价格单位：每百万 tokens。"
      >
        <div className="space-y-3">
          <FilterBar
            filters={filters}
            onChange={(filters) => setPageState((s) => ({ ...s, filters }))}
            providers={providers}
            matched={filtered.length}
            total={data.models.length}
          />
          <ModelTable
            models={filtered}
            cnyPerUsd={cnyPerUsd}
            staleProviders={sourceStats.staleProviders}
            sort={pageState.sort}
            onSortChange={(sort) => setPageState((s) => ({ ...s, sort }))}
          />
        </div>
      </Section>

      {/* 双模型对比 */}
      <Section
        id="versus"
        eyebrow="02 · Versus"
        title="双模型对比"
        desc="任选两个模型逐字段对比。查不到的字段如实标 unknown / Not available。"
      >
        <CompareModels models={data.models} updatedAt={data.meta.updatedAt} value={pageState.compare} onChange={(compare) => setPageState((s) => ({ ...s, compare }))} />
      </Section>

      {/* 成本计算器 */}
      <Section
        id="cost"
        eyebrow="03 · Estimate"
        title="成本计算器"
        desc="输入你的用量，估算各模型总花费（受上方筛选影响；人民币计价模型按可调汇率换算）。"
      >
        <CostCalculator
          models={filtered}
          cnyPerUsd={cnyPerUsd}
          onCnyPerUsdChange={(v) => setCostInputs((s) => ({ ...s, cnyPerUsd: v > 0 ? v : s.cnyPerUsd }))}
          inputs={costInputs}
          onInputsChange={(inputs) => setCostInputs((s) => ({ ...s, ...inputs }))}
        />
      </Section>

      {/* 预设模式 */}
      <Section
        id="presets"
        eyebrow="04 · Presets"
        title="预设模式"
        desc="三套现成的排序策略，每个模型都附带入选理由。"
      >
        <Presets models={data.models} cnyPerUsd={cnyPerUsd} active={pageState.preset} onChange={(preset) => setPageState((s) => ({ ...s, preset }))} />
      </Section>

      {/* 场景推荐 */}
      <Section
        id="scenarios"
        eyebrow="05 · Recommend"
        title="按场景推荐"
        desc="选择你的使用场景，查看 Top 5 推荐与理由。"
      >
        <Scenarios models={data.models} cnyPerUsd={cnyPerUsd} active={pageState.scenario} onChange={(scenario) => setPageState((s) => ({ ...s, scenario }))} />
      </Section>

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
  small,
  warn,
  title,
}: {
  label: string;
  value: string;
  small?: boolean;
  warn?: boolean;
  title?: string;
}) {
  return (
    <div title={title}>
      <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`num font-semibold ${small ? "text-sm" : "text-2xl"} ${warn ? "text-warn" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
