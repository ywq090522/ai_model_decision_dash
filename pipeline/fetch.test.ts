import { describe, expect, it, vi } from "vitest";
import { cleanHtmlText, extractRelevantText, htmlToText } from "./fetch";

describe("pricing content extraction", () => {
  it("extracts a pricing table after character 80,000", () => {
    const text = `${"introductory material ".repeat(5000)}\nGPT-5 pricing input $1.25 per 1M tokens output $10 per 1M tokens cached input $0.125`;
    const result = extractRelevantText(text, ["GPT-5"]);
    expect(result).toContain("GPT-5 pricing");
    expect(result).toContain("$10 per 1M tokens");
  });

  it("does not stop at an unrelated pricing navigation label", () => {
    const text = `Home Pricing Docs${" generic content ".repeat(6000)}Claude Sonnet pricing input $3 per million tokens output $15 per million tokens`;
    const result = extractRelevantText(text, ["Claude Sonnet"]);
    expect(result).toContain("Claude Sonnet pricing");
  });

  it("merges multiple relevant blocks in page order", () => {
    const text = `${"x ".repeat(45000)}MODEL-A pricing input $1 per 1M tokens${"y ".repeat(12000)}MODEL-B pricing output $8 per 1M tokens`;
    const result = extractRelevantText(text, ["MODEL-A", "MODEL-B"]);
    expect(result.indexOf("MODEL-A")).toBeLessThan(result.indexOf("MODEL-B"));
  });

  it("uses an explicit bounded fallback and warns when no relevant section exists", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const text = "plain documentation ".repeat(6000);
    const result = extractRelevantText(text);
    expect(result).toBe(text.slice(0, 80_000));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("keeps normal short fixtures unchanged after HTML cleaning", () => {
    const html = "<style>hidden</style><h1>Pricing</h1><p>Input $2 per 1M tokens &amp; output $8</p>";
    expect(htmlToText(html)).toBe(cleanHtmlText(html));
  });
});
