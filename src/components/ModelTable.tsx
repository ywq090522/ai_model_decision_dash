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
  staleProviders,
}: {
  models: ModelInfo[];
  cnyPerUsd: number;
  /** 本次管线运行中数据源 stale 的 provider（来自 meta.pipeline） */
  staleProviders?: Set<string>;
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
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2.5">
                <button className="th-btn" onClick={() => toggleSort(c.key)}>
                  {c.label}
                  <span className="text-[9px]">
                    {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "△"}
                  </span>
                </button>
              </th>
            ))}
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              图片
            </th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              工具
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <ModelRow
              key={m.id}
              m={m}
              stale={staleProviders?.has(m.provider) ?? false}
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
  );
}

function ModelRow({
  m,
  stale,
  expanded,
  onToggle,
}: {
  m: ModelInfo;
  stale: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-line/60 transition-colors hover:bg-accent-wash/40"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{m.name}</span>
            {!m.verified && (
              <span
                className="rounded bg-paper px-1 py-0.5 text-[10px] text-muted"
                title="价格未经数据管线从官方定价页核实"
              >
                未核实
              </span>
            )}
            {stale && (
              <span
                className="rounded bg-paper px-1 py-0.5 text-[10px] text-warn"
                title="该厂商的数据源本次抓取失败（stale），显示的是历史 / 兜底数据"
              >
                源 stale
              </span>
            )}
          </div>
          <div className="num text-[11px] text-muted">
            {m.provider} · {m.id}
          </div>
        </td>
        <PriceCell price={m.inputPrice} currency={m.currency} />
        <PriceCell price={m.outputPrice} currency={m.currency} />
        <td className="num px-3 py-2.5">
          {m.contextWindow === null ? <UnknownMark>?</UnknownMark> : formatTokens(m.contextWindow)}
        </td>
        <td className="px-3 py-2.5"><ScoreCell value={m.scores.coding} /></td>
        <td className="px-3 py-2.5"><ScoreCell value={m.scores.longDoc} /></td>
        <td className="px-3 py-2.5"><ScoreCell value={m.scores.chinese} /></td>
        <td className="px-3 py-2.5"><ScoreCell value={m.scores.agent} /></td>
        <td className="px-3 py-2.5"><TriState value={m.vision} /></td>
        <td className="px-3 py-2.5"><TriState value={m.toolUse} /></td>
      </tr>
      {expanded && (
        <tr className="border-b border-line/60 bg-paper/60">
          <td colSpan={10} className="px-4 py-3 text-xs text-ink2">
            <div className="flex flex-wrap gap-x-8 gap-y-1.5">
              <span>
                <b className="text-ink">说明：</b>
                {m.notes}
              </span>
              <span>
                <b className="text-ink">来源：</b>
                {m.source}
              </span>
              {m.verifiedAt && m.verificationSource && (
                <span>
                  <b className="text-ink">官方核实：</b>
                  <span className="num">{m.verifiedAt.slice(0, 10)}</span>（{m.verificationSource}）
                </span>
              )}
              {m.cachedInputPrice !== null && (
                <span>
                  <b className="text-ink">缓存输入价：</b>
                  <span className="num">{formatPrice(m.cachedInputPrice, m.currency)}</span>/1M
                </span>
              )}
              {m.maxOutput !== null && (
                <span>
                  <b className="text-ink">最大输出：</b>
                  <span className="num">{formatTokens(m.maxOutput)}</span>
                </span>
              )}
              <span>
                <b className="text-ink">标签：</b>
                {m.tags.join(" / ")}
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
    <td className="num px-3 py-2.5">
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
