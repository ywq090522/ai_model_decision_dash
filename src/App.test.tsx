// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "./App";
import data from "./data/models.json";

describe("App SSR smoke", () => {
  it("renders the primary sections without a browser", () => {
    const html = renderToString(<App />);
    expect(html).toContain("AI Model Decision Dashboard");
    expect(html).toContain("模型对照表");
    expect(html).toContain("成本计算器");
  });
});

describe("App interactions", () => {
  it("filters models by search and provider together", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText("筛选厂商"), "DeepSeek");
    await user.type(screen.getByLabelText("搜索模型"), "deepseek");
    const table = screen.getByRole("table", { name: "模型对照表" });
    expect(within(table).getAllByRole("button", { name: /DeepSeek.*详情/ }).length).toBeGreaterThan(0);
    expect(within(table).queryByRole("button", { name: /GPT.*详情/ })).toBeNull();
  });

  it("keeps unknown numeric values after known values in both directions", async () => {
    const user = userEvent.setup();
    render(<App />);
    const table = screen.getByRole("table", { name: "模型对照表" });
    const modelOrder = () => within(table).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? "");
    await user.click(within(table).getByRole("button", { name: "按上下文升序排序" }));
    const knownIndex = () => modelOrder().findIndex((name) => name.includes("DeepSeek R1 (free)详情"));
    const unknownIndex = () => modelOrder().findIndex((name) => name.includes("GPT-5.4 nano详情"));
    expect(knownIndex()).toBeLessThan(unknownIndex());
    await user.click(within(table).getByRole("button", { name: "按上下文降序排序" }));
    expect(knownIndex()).toBeLessThan(unknownIndex());
    expect(within(table).getByRole("columnheader", { name: /上下文/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("updates calculator output when inputs change", async () => {
    const user = userEvent.setup();
    render(<App />);
    const requests = screen.getByLabelText("请求次数");
    const card = requests.closest(".card")!;
    const before = card.textContent;
    await user.clear(requests);
    await user.type(requests, "0");
    expect(card.textContent).not.toBe(before);
    expect(card.textContent).toContain("$0");
  });

  it("prevents duplicate compare selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    const left = screen.getByLabelText("模型 A") as HTMLSelectElement;
    const right = screen.getByLabelText("模型 B") as HTMLSelectElement;
    const originalRight = right.value;
    await user.selectOptions(right, left.value);
    expect(right.value).toBe(originalRight);
    expect(right.value).not.toBe(left.value);
  });

  it("expands details with mouse and native keyboard activation", async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole("button", { name: /展开GPT-5.4 nano详情/ });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("has no baseline axe violations in primary page regions", async () => {
    const { container } = render(<App />);
    const result = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("restores URL state and updates URL with replaceState", async () => {
    window.history.replaceState(null, "", "/?p=OpenAI&q=gpt&sort=outputPrice&dir=desc");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByLabelText("筛选厂商")).toHaveValue("OpenAI");
    expect(screen.getByLabelText("搜索模型")).toHaveValue("gpt");
    await user.clear(screen.getByLabelText("搜索模型"));
    expect(window.location.search).not.toContain("q=");
  });

  it("restores state on popstate", async () => {
    render(<App />);
    window.history.pushState(null, "", "/?p=Google");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByDisplayValue("Google")).toBeInTheDocument();
  });

  it("uses current pipeline status rather than treating verified as fetch success", () => {
    render(<App />);
    const sources = data.meta.pipeline?.sources ?? [];
    expect(screen.getByText(`${sources.filter((s) => s.status === "ok").length}/${sources.length} 正常`)).toBeInTheDocument();
  });
});
