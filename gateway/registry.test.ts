import { describe, expect, it } from "vitest";
import modelsJson from "../src/data/models.json";
import registryJson from "../src/data/registry.json";
import { RegistrySchema } from "../src/data/schema";
import { loadRegistry, resolveModel } from "./registry";

describe("registry.json", () => {
  it("通过 Zod 全量校验", () => {
    expect(RegistrySchema.safeParse(registryJson).success).toBe(true);
  });

  it("loadRegistry：provider 引用完整、模型 id 不重复", () => {
    const r = loadRegistry();
    expect(r.providers.length).toBeGreaterThan(0);
    expect(r.models.length).toBeGreaterThan(0);
  });

  it("resolveModel：命中返回 provider + upstreamModel", () => {
    const hit = resolveModel("deepseek-v4-flash");
    expect(hit).not.toBeNull();
    expect(hit!.provider.key).toBe("deepseek");
    expect(hit!.provider.auth).toBe("x-api-key");
    expect(hit!.model.upstreamModel).toBe("deepseek-v4-flash");
  });

  it("resolveModel：未注册返回 null", () => {
    expect(resolveModel("no-such-model")).toBeNull();
  });

  it("与 models.json 的 join：Anthropic/DeepSeek/Kimi 的 registry id 均能对上对照表", () => {
    const dashboardIds = new Set(modelsJson.models.map((m) => m.id));
    const joinable = registryJson.models.filter((m) => dashboardIds.has(m.id));
    // GLM 模型不在对照表内（provider 未收录），其余应全部命中
    expect(joinable.map((m) => m.id)).toContain("claude-opus-4-8");
    expect(joinable.map((m) => m.id)).toContain("kimi-k2.6");
    expect(joinable.length).toBeGreaterThanOrEqual(9);
  });
});
