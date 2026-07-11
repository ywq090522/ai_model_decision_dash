import { describe, expect, it } from "vitest";
import { decodeShareableState, defaultShareableState, encodeShareableState } from "./pageState";

const providers = ["OpenAI", "Google"];
const ids = ["a", "b", "c"];

describe("shareable page state", () => {
  it("omits defaults", () => expect(encodeShareableState(defaultShareableState(ids), ids)).toBe(""));
  it("falls back from invalid values and corrects duplicate models", () => {
    const state = decodeShareableState("?p=bad&scene=bad&sort=bad&a=b&b=b", providers, ids);
    expect(state.filters.provider).toBe("all");
    expect(state.scenario).toBe("coding");
    expect(state.sort.key).toBe("inputPrice");
    expect(state.compare).toEqual(["b", "a"]);
  });
  it("round-trips valid shareable values", () => {
    const state = decodeShareableState("?p=Google&q=gemini&scene=vision&preset=developer&sort=name&dir=desc&a=c&b=a", providers, ids);
    expect(decodeShareableState(encodeShareableState(state, ids), providers, ids)).toEqual(state);
  });
});
