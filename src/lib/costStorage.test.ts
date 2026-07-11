import { describe, expect, it } from "vitest";
import { COST_STORAGE_KEY, loadCostInputs, saveCostInputs, type CostInputs } from "./costStorage";

const defaults: CostInputs = { cnyPerUsd: 7.2, inputTokens: 4000, outputTokens: 1000, requests: 1000 };

describe("cost input storage", () => {
  it("falls back for broken JSON, old versions and invalid numbers", () => {
    for (const raw of ["{", JSON.stringify({ version: 0 }), JSON.stringify({ version: 1, cnyPerUsd: 0, inputTokens: -1, outputTokens: 1, requests: 1 })]) {
      expect(loadCostInputs({ getItem: () => raw }, defaults)).toEqual(defaults);
    }
  });
  it("does not throw when storage is disabled", () => {
    expect(() => loadCostInputs({ getItem: () => { throw new Error("disabled"); } }, defaults)).not.toThrow();
    expect(() => saveCostInputs({ setItem: () => { throw new Error("disabled"); } }, defaults)).not.toThrow();
  });
  it("stores a versioned payload", () => {
    let saved = "";
    saveCostInputs({ setItem: (key, value) => { expect(key).toBe(COST_STORAGE_KEY); saved = value; } }, defaults);
    expect(loadCostInputs({ getItem: () => saved }, { ...defaults, requests: 2 })).toEqual(defaults);
  });
});
