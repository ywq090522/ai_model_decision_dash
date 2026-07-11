import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), ".snapshots");
/** 控制送入 LLM 的文本量，同时避免页面结构变化导致上下文无限增长。 */
const MAX_CHARS = 80_000;
const CHUNK_CHARS = 16_000;
const CHUNK_OVERLAP = 2_000;
const MAX_SELECTED_CHUNKS = 5;

export async function fetchText(url: string, timeoutMs = 30_000, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "user-agent":
            "ai-model-decision-dashboard/1.0 (+data pipeline; github actions)",
          accept: "text/html,text/markdown,application/json;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** HTML 粗略转纯文本：去 script/style，标签换空格，压缩空白 */
export function cleanHtmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ScoredChunk { start: number; text: string; score: number; signals: number }

function scoreChunk(text: string, modelHints: string[]): Pick<ScoredChunk, "score" | "signals"> {
  const lower = text.toLowerCase();
  const weighted: [RegExp, number][] = [
    [/\b(pricing|price|cost)\b/g, 3], [/\b(input|output)\b/g, 2],
    [/\b(cache|cached|batch)\b/g, 2], [/\btokens?\b/g, 2],
    [/(?:\$|usd\s*)\d+(?:\.\d+)?/g, 4], [/\d+(?:\.\d+)?\s*(?:\/|per)\s*(?:1m|million)\b/g, 4],
  ];
  let score = 0;
  let signals = 0;
  for (const [pattern, weight] of weighted) {
    const count = Math.min(lower.match(pattern)?.length ?? 0, 8);
    if (count > 0) signals++;
    score += count * weight;
  }
  for (const hint of modelHints) {
    const normalized = hint.trim().toLowerCase();
    if (normalized.length >= 3 && lower.includes(normalized)) { score += 5; signals++; }
  }
  return { score, signals };
}

export function extractRelevantText(text: string, modelHints: string[] = []): string {
  if (text.length <= MAX_CHARS) return text;
  const chunks: ScoredChunk[] = [];
  for (let start = 0; start < text.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
    const chunk = text.slice(start, start + CHUNK_CHARS);
    const scored = scoreChunk(chunk, modelHints);
    chunks.push({ start, text: chunk, ...scored });
  }
  const relevant = chunks
    .filter((chunk) => chunk.signals >= 2 && chunk.score >= 7)
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, MAX_SELECTED_CHUNKS)
    .sort((a, b) => a.start - b.start);
  if (relevant.length === 0) {
    console.warn("定价相关区段未命中，回退到页面前部的有界文本；本次解析结果仍需数字回查");
    return text.slice(0, MAX_CHARS);
  }
  return relevant.map((chunk) => chunk.text).join("\n\n").slice(0, MAX_CHARS);
}

export function htmlToText(html: string, modelHints: string[] = []): string {
  return extractRelevantText(cleanHtmlText(html), modelHints);
}

/** 保存原文快照（gitignore；CI 上传为 artifact 供审计） */
export function saveSnapshot(key: string, content: string): void {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeFileSync(join(SNAPSHOT_DIR, `${key}.txt`), content);
}
