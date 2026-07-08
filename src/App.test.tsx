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

  it("双模型对比区块默认渲染前两个模型", () => {
    expect(html).toContain("双模型对比");
    expect(html).toContain("模型 A");
    expect(html).toContain("模型 B");
    // 默认选中前两个模型，字段名应出现在对比表中
    expect(html).toContain("上下文窗口");
    expect(html).toContain("推荐用途");
    expect(html).toContain("API 协议");
  });

  it("unknown 数据如实展示，不编造", () => {
    // qwen3-coder-plus 价格 unknown，应显示 unknown 标记
    expect(html).toContain("unknown");
  });

  it("页头展示数据源新鲜度（来自 meta.pipeline，不硬编码）", () => {
    const sources = data.meta.pipeline?.sources ?? [];
    expect(sources.length).toBeGreaterThan(0);
    const ok = sources.filter((s) => s.status === "ok").length;
    expect(html).toContain("数据源");
    expect(html).toContain(`${ok}/${sources.length} 正常`);
  });

  it("存在 stale 源时给出提示与角标", () => {
    const staleSources = (data.meta.pipeline?.sources ?? []).filter((s) => s.status === "stale");
    if (staleSources.length === 0) return; // 全绿时无角标，跳过
    // SSR 会在文本节点间插入 <!-- -->，先去掉再断言
    const text = html.replace(/<!-- -->/g, "");
    expect(text).toContain(`${staleSources.length} 个数据源 stale`);
    expect(text).toContain("源 stale");
  });
});
