import { describe, expect, it } from "vitest";
import modelsJson from "./models.json";
import registryJson from "./registry.json";
import { ModelDataSchema, RegistrySchema } from "./schema";

describe("data files schema", () => {
  it("models.json 符合 ModelDataSchema", () => {
    expect(() => ModelDataSchema.parse(modelsJson)).not.toThrow();
  });

  it("registry.json 符合 RegistrySchema", () => {
    expect(() => RegistrySchema.parse(registryJson)).not.toThrow();
  });

  it("registry.models 引用的 provider 都存在", () => {
    const registry = RegistrySchema.parse(registryJson);
    const providers = new Set(registry.providers.map((p) => p.key));
    for (const model of registry.models) {
      expect(providers.has(model.provider)).toBe(true);
    }
  });

  it("registry.models 的 id 不能重复", () => {
    const registry = RegistrySchema.parse(registryJson);
    const ids = registry.models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
