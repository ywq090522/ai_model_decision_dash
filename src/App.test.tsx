import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App from "./App";
import data from "./data/models.json";

describe("App 渲染冒烟测试", () => {
  const html = renderToString(<App />);

  it("整个组件树渲染无错，且包含关键区块", () => {
    expect(html).toContain("AI Model Decision Dashboard");
    expect(html).toContain("模型对照表");
    expect(html).toContain("成本计算器");
    expect(html).toContain("学生省钱模式");
    expect(html).toContain("代码开发模式");
    expect(html).toContain("长文档分析模式");
  });

  it("所有模型都出现在表格中", () => {
    for (const m of data.models) {
      expect(html).toContain(m.id);
    }
  });

  it("unknown 数据如实展示，不编造", () => {
    // qwen3-coder-plus 价格 unknown，应显示 unknown 标记
    expect(html).toContain("unknown");
  });
});
