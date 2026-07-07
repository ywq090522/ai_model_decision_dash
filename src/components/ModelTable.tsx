import { useMemo, useState } from "react";
import type { ModelInfo } from "../types";
import { formatPrice, formatTokens, priceInUsd } from "../lib/cost";
import { ScoreCell, TriState, UnknownMark } from "./ui";

type SortKey =
  | "name"
  | "provider"
  | "inputPrice"
  | "outputPrice"
  | "contextWindow"
  | "coding"
  | "longDoc"
  | "chinese"
  | "agent";

interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

function sortValue(m: ModelInfo, key: SortKey, cnyPerUsd: number): number | string | null {
  switch (key) {
    case "name":
      return m.name.toLowerCase();
    case "provider":
      return m.provider.toLowerCase();
    case "inputPrice":
      return priceInUsd(m.inputPrice, m.currency, cnyPerUsd);
    case "outputPrice":
      return priceInUsd(m.outputPrice, m.currency, cnyPerUsd);
    case "contextWindow":
      return m.contextWindow;
    default:
      return m.scores[key];
  }
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "模型" },
  { key: "inputPrice", label: "输入 /1M", numeric: true },
  { key: "outputPrice", label: "输出 /1M", numeric: true },
  { key: "contextWindow", label: "上下文", numeric: true },
  { key: "coding", label: "代码", numeric: true },
  { key: "longDoc", label: "长文档", numeric: true },
  { key: "chinese", label: "中文", numeric: true },
  { key: "agent", label: "Agent", numeric: true },
];

export function ModelTable({
  models,
  cnyPerUsd,
}: {
  models: ModelInfo[];
  cnyPerUsd: number;
}) {
  const [sort, setSort] = useState<SortState>({ key: "inputPrice", dir: 1 });
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...models];
    arr.sort((a, b) => {
      const va = sortValue(a, sort.key, cnyPerUsd);
      const vb = sortValue(b, sort.key, cnyPerUsd);
      // unknown（null）永远排最后，与方向无关
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string")
        return va.localeCompare(vb) * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
    return arr;
  }, [models, sort, cnyPerUsd]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface2 px-3 py-2 text-xs text-muted">
        <span>状态说明：</span>
        <span className="data-tag border-good/25 bg-good/10 text-good">支持</span>
        <span className="data-tag border-critical/30 bg-critical/10 text-critical">不支持</span>
        <span className="audit-tag">未核实 / unknown</span>
        <span>价格 unknown 不参与成本计算，排序时置后。</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[280px]" />
          <col className="w-[116px]" />
          <col className="w-[116px]" />
          <col className="w-[96px]" />
          <col className="w-[104px]" />
          <col className="w-[104px]" />
          <col className="w-[104px]" />
          <col className="w-[104px]" />
          <col className="w-[76px]" />
          <col className="w-[76px]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface2 shadow-[0_1px_0_#dce2e7]">
          <tr className="border-b border-line">
            {COLUMNS.map((c) => (
              <th key={c.key} className={`px-3 py-2.5 ${c.numeric ? "text-right" : "text-left"}`}>
                <button className="th-btn" onClick={() => toggleSort(c.key)}>
                  {c.label}
                  <span className="num text-[10px]">
                    {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "△"}
                  </span>
                </button>
              </th>
            ))}
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted">
              图片
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted">
              工具
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <ModelRow
              key={m.id}
              m={m}
              expanded={expanded === m.id}
              onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
            />
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-muted">
                没有匹配的模型 — 调整上面的筛选条件试试
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ModelRow({
  m,
  expanded,
  onToggle,
}: {
  m: ModelInfo;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="group cursor-pointer border-b border-line transition-colors hover:bg-accent-wash/55"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold tracking-tight text-ink">{m.name}</span>
            {!m.verified && (
              <span
                className="audit-tag shrink-0 not-italic"
                title="价格未从官方定价页核实"
              >
                未核实
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[11px] text-muted">
            <span>{m.provider}</span>
            <span className="num ml-1.5">{m.id}</span>
          </div>
        </td>
        <PriceCell price={m.inputPrice} currency={m.currency} />
        <PriceCell price={m.outputPrice} currency={m.currency} />
        <td className="num px-3 py-2.5 text-right align-middle">
          {m.contextWindow === null ? <UnknownMark>?</UnknownMark> : formatTokens(m.contextWindow)}
        </td>
        <td className="px-3 py-2.5 text-right align-middle"><ScoreCell value={m.scores.coding} /></td>
        <td className="px-3 py-2.5 text-right align-middle"><ScoreCell value={m.scores.longDoc} /></td>
        <td className="px-3 py-2.5 text-right align-middle"><ScoreCell value={m.scores.chinese} /></td>
        <td className="px-3 py-2.5 text-right align-middle"><ScoreCell value={m.scores.agent} /></td>
        <td className="px-3 py-2.5 text-center align-middle"><TriState value={m.vision} /></td>
        <td className="px-3 py-2.5 text-center align-middle"><TriState value={m.toolUse} /></td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface2/60">
          <td colSpan={10} className="px-4 py-3 text-xs text-ink2">
            <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              <span className="leading-5">
                <b className="font-semibold text-ink">说明：</b>
                <span className="ml-2">{m.notes}</span>
              </span>
              <span className="leading-5">
                <b className="font-semibold text-ink">来源：</b>
                <span className="ml-2">{m.source}</span>
              </span>
              {m.cachedInputPrice !== null && (
                <span className="leading-5">
                  <b className="font-semibold text-ink">缓存输入价：</b>
                  <span className="num ml-2">{formatPrice(m.cachedInputPrice, m.currency)}</span>/1M
                </span>
              )}
              {m.maxOutput !== null && (
                <span className="leading-5">
                  <b className="font-semibold text-ink">最大输出：</b>
                  <span className="num ml-2">{formatTokens(m.maxOutput)}</span>
                </span>
              )}
              <span className="leading-5 md:col-span-2">
                <b className="font-semibold text-ink">标签：</b>
                <span className="ml-2">{m.tags.join(" / ")}</span>
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PriceCell({ price, currency }: { price: number | null; currency: "USD" | "CNY" }) {
  return (
    <td className="num whitespace-nowrap px-3 py-2.5 text-right align-middle">
      {price === null ? (
        <UnknownMark>unknown</UnknownMark>
      ) : (
        <>
          {formatPrice(price, currency)}
          {currency === "CNY" && (
            <span className="ml-1 text-[10px] text-muted" title="人民币计价，成本计算时按汇率换算">
              CNY
            </span>
          )}
        </>
      )}
    </td>
  );
}
