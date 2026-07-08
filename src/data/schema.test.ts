import { describe, expect, it } from "vitest";
import modelsJson from "./models.json";
import curatedJson from "./curated.json";
import { CuratedDataSchema, ModelDataSchema } from "./schema";

describe("data files schema", () => {
  it("models.json 符合 ModelDataSchema", () => {
    expect(() => ModelDataSchema.parse(modelsJson)).not.toThrow();
  });

  it("curated.json 符合 CuratedDataSchema，且 fallback 不含 verified（兜底数据不可伪装核实）", () => {
    expect(() => CuratedDataSchema.parse(curatedJson)).not.toThrow();
    for (const m of curatedJson.models as Array<{ id: string; fallback: Record<string, unknown> }>) {
      expect(m.fallback, `${m.id} 的 fallback 不应带 verified`).not.toHaveProperty("verified");
    }
  });

  it("verified=true 必须带 verifiedAt 与 verificationSource（真实管线核实的证据）", () => {
    const data = ModelDataSchema.parse(modelsJson);
    for (const m of data.models) {
      if (m.verified) {
        expect(m.verifiedAt, `${m.id} verified=true 但缺 verifiedAt`).not.toBeNull();
        expect(m.verificationSource, `${m.id} verified=true 但缺 verificationSource`).not.toBeNull();
      }
    }
  });

  it("verified=true 而无 verifiedAt 的数据被 schema 拒绝", () => {
    const data = ModelDataSchema.parse(modelsJson);
    const forged = {
      ...data,
      models: [{ ...data.models[0], verified: true, verifiedAt: null, verificationSource: null }],
    };
    expect(ModelDataSchema.safeParse(forged).success).toBe(false);
  });
});
