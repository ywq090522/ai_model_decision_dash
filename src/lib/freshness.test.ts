import { describe, expect, it } from "vitest";
import { dataFreshness, sourceSummary, STALE_AFTER_DAYS } from "./freshness";

describe("data freshness", () => {
  const now = new Date("2026-07-11T12:00:00Z");
  it("reports fresh, threshold and stale dates", () => {
    expect(dataFreshness("2026-07-11", now).stale).toBe(false);
    expect(dataFreshness("2026-07-04", now).daysOld).toBe(STALE_AFTER_DAYS);
    expect(dataFreshness("2026-07-04", now).stale).toBe(false);
    expect(dataFreshness("2026-07-03", now).stale).toBe(true);
  });
  it("handles invalid dates", () => expect(dataFreshness("not-a-date", now)).toEqual({ daysOld: null, stale: null, label: "更新时间未知" }));
  it("keeps successful, failed and manual source states distinct", () => {
    const result = sourceSummary({
      updatedAt: "2026-07-11", priceUnit: "u", defaultCnyPerUsd: 7.2,
      cnyRateNote: "n", scoreNote: "n", unknownNote: "n",
      pipeline: { lastRun: "2026-07-11", sources: [
        { source: "ok", status: "ok", fetchedAt: "2026-07-11", providers: [] },
        { source: "old", status: "stale", fetchedAt: null, providers: ["X"] },
        { source: "manual", status: "manual", fetchedAt: null, providers: ["Y"] },
      ] },
    });
    expect(result.ok).toHaveLength(1);
    expect(result.stale).toHaveLength(1);
    expect(result.manual).toHaveLength(1);
  });
});
