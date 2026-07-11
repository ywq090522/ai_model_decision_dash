import type { ReactNode } from "react";
import type { ModelInfo } from "../types";
import { MODEL_PROTOCOLS } from "../data/protocols";
import { formatPrice, formatTokens } from "../lib/cost";
import { TriState, UnknownMark } from "./ui";

/** 模型 id → 网关 API 协议；未接入网关返回 null（不能 import registry.json，见 protocols.ts） */
function apiProtocol(modelId: string): string | null {
  return MODEL_PROTOCOLS[modelId] ?? null;
}

function PriceValue({ price, currency }: { price: number | null; currency: "USD" | "CNY" }) {
  if (price === null) return <UnknownMark>unknown</UnknownMark>;
  return (
    <>
      <span className="num">{formatPrice(price, currency)}</span>/1M
      {currency === "CNY" && (
        <span className="ml-1 text-[10px] text-muted" title="人民币计价">
          CNY
        </span>
      )}
    </>
  );
}

interface RowSpec {
  label: string;
  render: (m: ModelInfo) => ReactNode;
}

function buildRows(updatedAt: string): RowSpec[] {
  return [
    { label: "厂商", render: (m) => m.provider },
    {
      label: "模型",
      render: (m) => (
        <>
          <span className="font-semibold">{m.name}</span>
          <span className="num ml-2 text-[11px] text-muted">{m.id}</span>
        </>
      ),
    },
    {
      label: "上下文窗口",
      render: (m) =>
        m.contextWindow === null ? (
          <UnknownMark>unknown</UnknownMark>
        ) : (
          <span className="num">{formatTokens(m.contextWindow)}</span>
        ),
    },
    { label: "输入价", render: (m) => <PriceValue price={m.inputPrice} currency={m.currency} /> },
    { label: "输出价", render: (m) => <PriceValue price={m.outputPrice} currency={m.currency} /> },
    {
      label: "多模态（图片理解）",
      render: (m) => <TriState value={m.vision} />,
    },
    {
      label: "API 协议",
      render: (m) => {
        const protocol = apiProtocol(m.id);
        return protocol === null ? (
          <UnknownMark>Not available</UnknownMark>
        ) : (
          <span className="num">{protocol}</span>
        );
      },
    },
    {
      label: "推荐用途",
      render: (m) =>
        m.tags.length === 0 ? <UnknownMark>Not available</UnknownMark> : m.tags.join(" / "),
    },
    {
      label: "数据更新",
      render: () => <span className="num">{updatedAt}</span>,
    },
  ];
}

function ModelSelect({
  label,
  models,
  value,
  exclude,
  onChange,
}: {
  label: string;
  models: ModelInfo[];
  value: string;
  exclude: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink2">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        name={label}
        className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id} disabled={m.id === exclude}>
            {m.provider} · {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CompareModels({ models, updatedAt, value, onChange }: { models: ModelInfo[]; updatedAt: string; value: [string, string]; onChange: (value: [string, string]) => void }) {
  const [leftId, rightId] = value;

  if (models.length < 2) {
    return <div className="card p-4 text-sm text-muted">至少需要两个模型才能对比。</div>;
  }

  const left = models.find((m) => m.id === leftId) ?? models[0];
  const right = models.find((m) => m.id === rightId) ?? models[1];
  const rows = buildRows(updatedAt);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <ModelSelect
          label="模型 A"
          models={models}
          value={left.id}
          exclude={right.id}
          onChange={(id) => onChange([id, right.id])}
        />
        <span className="text-xs font-semibold text-muted" aria-hidden>
          vs
        </span>
        <ModelSelect
          label="模型 B"
          models={models}
          value={right.id}
          exclude={left.id}
          onChange={(id) => onChange([left.id, id])}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="w-40 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                字段
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                {left.name}
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                {right.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-line/60">
                <td className="px-3 py-2.5 text-xs font-semibold text-ink2">{row.label}</td>
                <td className="px-3 py-2.5">{row.render(left)}</td>
                <td className="px-3 py-2.5">{row.render(right)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
