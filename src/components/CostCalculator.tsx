import { useMemo } from "react";
import type { ModelInfo } from "../types";
import { estimateAll, formatUsd } from "../lib/cost";
import type { CostInputs } from "../lib/costStorage";

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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink2">{label}</span>
      <input
        type="number"
        name={label}
        min={0}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="num w-36 rounded-md border border-line bg-paper px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      />
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function CostCalculator({
  models,
  cnyPerUsd,
  onCnyPerUsdChange,
  inputs,
  onInputsChange,
}: {
  models: ModelInfo[];
  cnyPerUsd: number;
  onCnyPerUsdChange: (v: number) => void;
  inputs: Omit<CostInputs, "cnyPerUsd">;
  onInputsChange: (inputs: Omit<CostInputs, "cnyPerUsd">) => void;
}) {
  const { inputTokens, outputTokens, requests } = inputs;

  const results = useMemo(
    () => estimateAll(models, { inputTokens, outputTokens, requests, cnyPerUsd }),
    [models, inputTokens, outputTokens, requests, cnyPerUsd],
  );

  const known = results.filter((r) => r.totalUsd !== null);
  const unknown = results.filter((r) => r.totalUsd === null);
  const maxTotal = Math.max(...known.map((r) => r.totalUsd!), 0.000001);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-end gap-5">
        <NumField label="输入 tokens / 次" value={inputTokens} onChange={(v) => onInputsChange({ ...inputs, inputTokens: v })} step={500} hint="中文约 1 字 ≈ 1~2 tokens" />
        <NumField label="输出 tokens / 次" value={outputTokens} onChange={(v) => onInputsChange({ ...inputs, outputTokens: v })} step={500} />
        <NumField label="请求次数" value={requests} onChange={(v) => onInputsChange({ ...inputs, requests: v })} step={100} />
        <NumField label="汇率 (CNY/USD)" value={cnyPerUsd} onChange={onCnyPerUsdChange} step={0.1} hint="用于换算人民币计价模型" />
        <div className="ml-auto text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted">计算公式</div>
          <div className="num text-xs text-ink2">
            (输入×单价 + 输出×单价) ÷ 1M × 次数
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-1">
        {known.map((r) => {
          const w = Math.max(0.4, (r.totalUsd! / maxTotal) * 100);
          return (
            <div key={r.model.id} className="group grid grid-cols-[200px_1fr_170px] items-center gap-3 text-sm">
              <div className="truncate">
                <span className="font-medium">{r.model.name}</span>
                {r.model.currency === "CNY" && (
                  <span className="ml-1 text-[10px] text-muted">CNY→USD</span>
                )}
              </div>
              <div className="h-4 w-full">
                <div
                  className="h-3.5 rounded-r bg-accent transition-[width] duration-300 group-hover:bg-accent-deep"
                  style={{ width: `${w}%` }}
                  title={`单次 ${formatUsd(r.perRequestUsd)} × ${requests.toLocaleString()} 次`}
                />
              </div>
              <div className="num text-right text-xs">
                <span className="font-semibold text-ink">{formatUsd(r.totalUsd)}</span>
                <span className="ml-2 text-muted">单次 {formatUsd(r.perRequestUsd)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {unknown.length > 0 && (
        <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
          <b>无法计算（价格 unknown，不猜测）：</b>
          {unknown.map((r) => r.model.name).join("、")}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        注：未计入提示词缓存折扣（多数厂商缓存命中输入价约为原价 10%~25%）、批量 API 折扣（通常 −50%）、
        分级计价加价（如 Gemini &gt;200K 上下文），实际账单可能更低或更高。
      </p>
    </div>
  );
}
