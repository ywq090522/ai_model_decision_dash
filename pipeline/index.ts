/**
 * 数据管线入口：fetch → parse(LLM 仅解析) → verify(数字回查) → merge → validate(Zod) → report。
 *
 * 用法：
 *   npm run pipeline           # 抓取并写入 src/data/models.json + reports/YYYY-MM-DD.md
 *   npm run pipeline:dry       # 只打印报告，不写文件
 *   npm run data:smoke         # 真实环境验收（不写 models.json），见 pipeline/smoke.ts
 *
 * 退出码：0 = 正常；1 = 硬错误（缺解析密钥 / Zod 校验失败等，未写入）；
 *        2 = 有异常，已写入但需人工审（CI 转 PR）；3 = 所有官方源 stale/failed（已写入，CI 不提交）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CuratedDataSchema, ModelDataSchema } from "../src/data/schema";
import type { ModelData } from "../src/types";
import { MANUAL_PROVIDERS, SOURCES } from "./sources";
import { mergeData } from "./merge";
import { buildReport } from "./report";
import { loadDotEnv, redactSecrets, runSource } from "./run-source";
import { DEFAULT_PARSER_MODEL } from "./parse";
import { resolveParserTarget } from "../gateway/parse-client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_PATH = join(ROOT, "src/data/models.json");
const CURATED_PATH = join(ROOT, "src/data/curated.json");
const REPORTS_DIR = join(ROOT, "reports");

/** 官方源需要 LLM 解析：解析模型的密钥缺失时立即失败，绝不静默产出全 stale 数据 */
function assertParserAvailable(): void {
  const modelId = process.env.PARSER_MODEL ?? DEFAULT_PARSER_MODEL;
  try {
    resolveParserTarget(modelId);
  } catch (e) {
    const detail = redactSecrets(e instanceof Error ? e.message : String(e));
    console.error(`管线中止：解析模型 "${modelId}" 不可用 —— ${detail}`);
    console.error(
      "官方定价页需要 LLM 解析。本地：把上面提示的密钥写入 .env 或 export；CI：把对应 Secret 配到 repo Settings → Secrets → Actions（见 README「数据管线」）。",
    );
    process.exit(1);
  }
}

async function main() {
  loadDotEnv();
  const dryRun = process.argv.includes("--dry-run");
  const runDate = new Date().toISOString().slice(0, 10);

  if (SOURCES.some((s) => s.kind === "llm")) assertParserAvailable();

  const curated = CuratedDataSchema.parse(JSON.parse(readFileSync(CURATED_PATH, "utf8")));
  const previous: ModelData | null = existsSync(MODELS_PATH)
    ? ModelDataSchema.parse(JSON.parse(readFileSync(MODELS_PATH, "utf8")))
    : null;

  console.log(`抓取 ${SOURCES.length} 个源…`);
  const results = await Promise.all(SOURCES.map(runSource));
  for (const r of results) {
    if (r.status === "ok") {
      console.log(`  [${r.def.key}] ok，提取 ${r.extracted.length} 条，回查拦截 ${r.flags.length} 处`);
    } else {
      console.error(`  [${r.def.key}] 抓取/解析失败，保留旧值：${r.detail}`);
    }
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

  // 官方源全军覆没 = 本次运行没有产出任何官方核实数据，必须显式失败（CI 不提交）
  const officialSources = results.filter((r) => r.def.verified);
  if (officialSources.length > 0 && officialSources.every((r) => r.status !== "ok")) {
    console.error("\n所有官方源均 stale/failed，本次运行没有产出任何官方核实数据（exit 3）。");
    process.exit(3);
  }
}

main().catch((e) => {
  console.error("管线失败：", redactSecrets(e instanceof Error ? (e.stack ?? e.message) : String(e)));
  process.exit(1);
});
