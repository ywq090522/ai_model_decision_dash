import { fetchText, htmlToText, saveSnapshot } from "./fetch";
import { parseOpenRouter, parseWithLLM } from "./parse";
import { verifyExtraction } from "./verify";
import type { SourceDef } from "./sources";
import type { SourceResult } from "./merge";

/**
 * 单个源的完整执行：fetch → (LLM parse → 数字回查 | OpenRouter JSON)。
 * pipeline/index.ts（入库）与 pipeline/smoke.ts（真实环境验收）共用。
 */
export async function runSource(def: SourceDef): Promise<SourceResult> {
  try {
    const raw = await fetchText(def.url);
    const fetchedAt = new Date().toISOString();
    if (def.kind === "openrouter-api") {
      saveSnapshot(def.key, raw);
      return { def, status: "ok", fetchedAt, extracted: parseOpenRouter(raw), flags: [] };
    }
    const text = htmlToText(raw, def.providers);
    saveSnapshot(def.key, text);
    const extracted = await parseWithLLM(text);
    const { models, flags } = verifyExtraction(text, extracted);
    return { def, status: "ok", fetchedAt, extracted: models, flags };
  } catch (e) {
    const detail = redactSecrets(e instanceof Error ? e.message : String(e));
    return { def, status: "error", fetchedAt: null, detail, extracted: [], flags: [] };
  }
}

/** 加载本地 .env（没有也可运行，key 可能已 export 在环境中） */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* noop */
  }
}

/**
 * 把环境中已配置的密钥值从任意输出文本里剥掉 —— 报错信息 / 报告 / 日志的兜底防线，
 * 确保密钥值永远不落盘。
 */
export function redactSecrets(s: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = s;
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 8) continue;
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name)) {
      out = out.split(value).join(`[${name} 已脱敏]`);
    }
  }
  return out;
}
