import type { ReactNode } from "react";

/** 三态布尔：✓ 已确认 / ✗ 不支持 / ? unknown */
export function TriState({ value }: { value: boolean | null }) {
  if (value === true) return <span className="text-good" title="已确认支持">✓</span>;
  if (value === false) return <span className="text-critical" title="不支持">✗</span>;
  return (
    <span className="text-muted" title="unknown：未能核实">
      ?
    </span>
  );
}

export function UnknownMark({ children }: { children?: ReactNode }) {
  return (
    <span className="text-muted italic" title="unknown：未能从官方渠道核实，绝不编造">
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
    <section id={id} className="mt-10">
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </div>
        <h2 className="mt-0.5 text-lg font-bold">{title}</h2>
        {desc && <p className="mt-1 max-w-3xl text-sm text-ink2">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/** 0-5 评分：数字 + 五格微型条 */
export function ScoreCell({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="num text-xs">{value}</span>
      <span className="flex gap-px" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-2.5 w-1 rounded-[1px] ${i <= value ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </span>
    </span>
  );
}
