/**
 * 数据管线入口：fetch → parse(LLM 仅解析) → verify(数字回查) → merge → validate(Zod) → report。
 *
 * 用法：
 *   npm run pipeline           # 抓取并写入 src/data/models.json + reports/YYYY-MM-DD.md
 *   npm run pipeline:dry       # 只打印报告，不写文件
 *
 * 退出码：0 = 正常；1 = 硬错误（Zod 校验失败等，未写入）；2 = 有异常，已写入但需人工审（CI 转 PR）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CuratedDataSchema, ModelDataSchema } from "../src/data/schema";
import type { ModelData } from "../src/types";
import { fetchText, htmlToText, saveSnapshot } from "./fetch";
import { MANUAL_PROVIDERS, SOURCES } from "./sources";
import { parseOpenRouter, parseWithLLM } from "./parse";
import { verifyExtraction } from "./verify";
import { mergeData, type SourceResult } from "./merge";
import { buildReport } from "./report";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_PATH = join(ROOT, "src/data/models.json");
const CURATED_PATH = join(ROOT, "src/data/curated.json");
const REPORTS_DIR = join(ROOT, "reports");

async function runSource(def: (typeof SOURCES)[number]): Promise<SourceResult> {
  try {
    const raw = await fetchText(def.url);
    const fetchedAt = new Date().toISOString();
    if (def.kind === "openrouter-api") {
      saveSnapshot(def.key, raw);
      return { def, status: "ok", fetchedAt, extracted: parseOpenRouter(raw), flags: [] };
    }
    const text = htmlToText(raw);
    saveSnapshot(def.key, text);
    const extracted = await parseWithLLM(text);
    const { models, flags } = verifyExtraction(text, extracted);
    return { def, status: "ok", fetchedAt, extracted: models, flags };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[${def.key}] 抓取/解析失败，保留旧值：${detail}`);
    return { def, status: "error", fetchedAt: null, detail, extracted: [], flags: [] };
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const runDate = new Date().toISOString().slice(0, 10);

  const curated = CuratedDataSchema.parse(JSON.parse(readFileSync(CURATED_PATH, "utf8")));
  const previous: ModelData | null = existsSync(MODELS_PATH)
    ? ModelDataSchema.parse(JSON.parse(readFileSync(MODELS_PATH, "utf8")))
    : null;

  console.log(`抓取 ${SOURCES.length} 个源…`);
  const results = await Promise.all(SOURCES.map(runSource));
  for (const r of results) {
    console.log(
      `  [${r.def.key}] ${r.status}${r.status === "ok" ? `，提取 ${r.extracted.length} 条，回查拦截 ${r.flags.length} 处` : ""}`,
    );
  }

  const merged = mergeData(curated, previous, results, MANUAL_PROVIDERS, runDate);

  // Zod 终检：产物不合法就绝不写盘
  const parsed = ModelDataSchema.safeParse(merged.data);
  if (!parsed.success) {
    console.error("Zod 校验失败，中止写入：");
    console.error(parsed.error.toString());
    process.exit(1);
  }

  const report = buildReport(previous, merged, results, runDate);
  console.log("\n" + report.markdown);

  if (dryRun) {
    console.log("--dry-run：未写入任何文件。");
  } else {
    writeFileSync(MODELS_PATH, JSON.stringify(parsed.data, null, 2) + "\n");
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, `${runDate}.md`), report.markdown);
    console.log(`已写入 ${MODELS_PATH} 与 reports/${runDate}.md`);
  }

  if (report.anomalies.length > 0) {
    console.error(`\n检测到 ${report.anomalies.length} 项异常，本次更新需人工审核（exit 2）。`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("管线失败：", e);
  process.exit(1);
});
