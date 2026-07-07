import { describe, expect, it } from "vitest";
import modelsJson from "./models.json";
import { ModelDataSchema } from "./schema";

describe("data files schema", () => {
  it("models.json 符合 ModelDataSchema", () => {
    expect(() => ModelDataSchema.parse(modelsJson)).not.toThrow();
  });
});
