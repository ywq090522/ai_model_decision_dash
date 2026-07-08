import { describe, expect, it } from "vitest";
import registry from "./registry.json";
import { MODEL_PROTOCOLS } from "./protocols";

// 测试代码不进前端 bundle，可以安全 import registry.json 做同步校验
describe("protocols.ts 与 registry.json 保持同步", () => {
  const providerProtocol = new Map(registry.providers.map((p) => [p.key, p.protocol]));
  const expected = Object.fromEntries(
    registry.models.map((m) => [m.id, providerProtocol.get(m.provider)]),
  );

  it("映射内容与 registry 派生结果完全一致（增删模型需同步 protocols.ts）", () => {
    expect(MODEL_PROTOCOLS).toEqual(expected);
  });
});
