import type { DataMeta } from "../types";

export const STALE_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

export interface Freshness {
  daysOld: number | null;
  stale: boolean | null;
  label: string;
}

export function dataFreshness(updatedAt: string, now = new Date()): Freshness {
  const parsed = new Date(`${updatedAt}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return { daysOld: null, stale: null, label: "更新时间未知" };
  const daysOld = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / DAY_MS));
  return { daysOld, stale: daysOld > STALE_AFTER_DAYS, label: `${daysOld} 天前` };
}

export function sourceSummary(meta: DataMeta) {
  const sources = meta.pipeline?.sources ?? [];
  const ok = sources.filter((s) => s.status === "ok");
  const stale = sources.filter((s) => s.status === "stale" || s.status === "error");
  return { sources, ok, stale, manual: sources.filter((s) => s.status === "manual") };
}
