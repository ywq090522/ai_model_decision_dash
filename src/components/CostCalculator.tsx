import { useMemo, useState } from "react";
import type { ModelInfo } from "../types";
import { estimateAll, formatUsd } from "../lib/cost";

function NumField({
  label,
  value,
  onChange,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-ink2">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="field num w-full"
      />
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function CostCalculator({
  models,
  cnyPerUsd,
  onCnyPerUsdChange,
}: {
  models: ModelInfo[];
  cnyPerUsd: number;
  onCnyPerUsdChange: (v: number) => void;
}) {
  const [inputTokens, setInputTokens] = useState(4000);
  const [outputTokens, setOutputTokens] = useState(1000);
  const [requests, setRequests] = useState(1000);

  const results = useMemo(
    () => estimateAll(models, { inputTokens, outputTokens, requests, cnyPerUsd }),
    [models, inputTokens, outputTokens, requests, cnyPerUsd],
  );

  const known = results.filter((r) => r.totalUsd !== null);
  const unknown = results.filter((r) => r.totalUsd === null);
  const maxTotal = Math.max(...known.map((r) => r.totalUsd!), 0.000001);

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-4 border-b border-line bg-surface2 p-4 xl:grid-cols-[1fr_auto] xl:items-end">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="输入 tokens / 次" value={inputTokens} onChange={setInputTokens} step={500} hint="中文约 1 字 ≈ 1~2 tokens" />
          <NumField label="输出 tokens / 次" value={outputTokens} onChange={setOutputTokens} step={500} />
          <NumField label="请求次数" value={requests} onChange={setRequests} step={100} />
          <NumField label="汇率 CNY/USD" value={cnyPerUsd} onChange={onCnyPerUsdChange} step={0.1} hint="用于换算人民币计价模型" />
        </div>
        <div className="border-t border-line pt-3 xl:border-l xl:border-t-0 xl:py-2 xl:pl-5 xl:text-right">
          <div className="text-xs font-medium text-muted">
            计算公式
          </div>
          <div className="num mt-1 text-xs text-ink2">
            (输入×单价 + 输出×单价) ÷ 1M × 次数
          </div>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {known.map((r) => {
          const w = Math.max(0.4, (r.totalUsd! / maxTotal) * 100);
          return (
            <div
              key={r.model.id}
              className="group grid gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-accent/50 lg:grid-cols-[220px_1fr_190px] lg:items-center"
            >
              <div className="min-w-0 truncate">
                <span className="font-medium">{r.model.name}</span>
                {r.model.currency === "CNY" && (
                  <span className="data-tag ml-1 normal-case tracking-normal">CNY→USD</span>
                )}
              </div>
              <div className="h-4 w-full rounded-sm bg-surface2">
                <div
                  className="h-4 rounded-r-sm bg-accent transition-[width] duration-300 group-hover:bg-accent-deep"
                  style={{ width: `${w}%` }}
                  title={`单次 ${formatUsd(r.perRequestUsd)} × ${requests.toLocaleString()} 次`}
                />
              </div>
              <div className="num text-xs lg:text-right">
                <span className="font-semibold text-ink">{formatUsd(r.totalUsd)}</span>
                <span className="ml-2 text-muted">单次 {formatUsd(r.perRequestUsd)}</span>
              </div>
            </div>
          );
        })}

        {unknown.length > 0 && (
          <div className="border border-audit/30 bg-audit-wash px-3 py-2 text-xs leading-5 text-audit-deep">
            <b>无法计算（价格 unknown，不猜测）：</b>
            {unknown.map((r) => r.model.name).join("、")}
          </div>
        )}

        <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          注：未计入提示词缓存折扣（多数厂商缓存命中输入价约为原价 10%~25%）、批量 API 折扣（通常 −50%）、
          分级计价加价（如 Gemini &gt;200K 上下文），实际账单可能更低或更高。
        </p>
      </div>
    </div>
  );
}
