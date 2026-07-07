import type { ReactNode } from "react";

/** 三态布尔：✓ 已确认 / ✗ 不支持 / ? unknown */
export function TriState({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <span className="data-tag border-good/25 bg-good/10 text-good" title="已确认支持">
        支持
      </span>
    );
  if (value === false)
    return (
      <span className="data-tag border-critical/30 bg-critical/10 text-critical" title="不支持">
        不支持
      </span>
    );
  return (
    <span className="audit-tag" title="unknown：未能核实">
      未核实
    </span>
  );
}

export function UnknownMark({ children }: { children?: ReactNode }) {
  return (
    <span className="audit-tag italic" title="unknown：未能从官方渠道核实，绝不编造">
      {children ?? "unknown"}
    </span>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  desc,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-4">
      <div className="mb-3 flex flex-col gap-1 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {desc && <p className="mt-1 max-w-3xl text-sm leading-6 text-ink2">{desc}</p>}
        </div>
        <div className="text-xs font-medium text-muted">
          {eyebrow}
        </div>
      </div>
      {children}
    </section>
  );
}

/** 0-5 评分：数字 + 五格微型条 */
export function ScoreCell({ value }: { value: number }) {
  const width = `${(value / 5) * 100}%`;
  return (
    <span className="inline-flex w-[86px] items-center gap-2">
      <span className="num w-7 text-right text-xs font-semibold text-ink">{value}/5</span>
      <span className="h-1.5 flex-1 rounded-full bg-surface2" aria-hidden>
        <span className="block h-1.5 rounded-full bg-accent" style={{ width }} />
      </span>
    </span>
  );
}
