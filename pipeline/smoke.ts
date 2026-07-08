/**
 * 真实数据管线验收（npm run data:smoke）：
 * 真实抓取全部数据源 → LLM 解析（走当前 parser）→ 数字回查 → 与 curated 收录模型比对 →
 * 输出验收报告 reports/smoke-YYYY-MM-DD.md 并打印到控制台。
 *
 * 只验收，不入库：不写 models.json（入库请用 npm run pipeline）。
 *
 * 判定（逐源）：
 *   fresh  = 抓取成功、解析出条目、且至少命中一个 curated 收录的模型
 *   stale  = 抓取成功但解析结果为空 / 一条都匹配不上 curated（页面可能改版）
 *   failed = 抓取或解析抛错
 *
 * 退出码：0 = 至少一个官方源 fresh；1 = 缺解析密钥，或所有官方源 stale/failed。
 * 密钥安全：报告与日志经 redactSecrets 脱敏，密钥值绝不落盘。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CuratedDataSchema } from "../src/data/schema";
import type { CuratedModel } from "../src/types";
import { MANUAL_PROVIDERS, SOURCES } from "./sources";
import { matchKeys, normalizeId, publicDetail, type SourceResult } from "./merge";
import { loadDotEnv, redactSecrets, runSource } from "./run-source";
import { DEFAULT_PARSER_MODEL } from "./parse";
import { resolveParserTarget } from "../gateway/parse-client";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CURATED_PATH = join(ROOT, "src/data/curated.json");
const REPORTS_DIR = join(ROOT, "reports");

type Judgement = "fresh" | "stale" | "failed";

interface SourceJudgement {
  result: SourceResult;
  judgement: Judgement;
  matchedCurated: number;
  totalCurated: number;
  reason: string;
}

function judge(result: SourceResult, curatedModels: CuratedModel[]): SourceJudgement {
  const covered = curatedModels.filter((c) => result.def.providers.includes(c.provider));
  const matched = covered.filter((c) => {
    const keys = matchKeys(c);
    return result.extracted.some((e) => keys.has(normalizeId(e.modelId)));
  }).length;

  if (result.status !== "ok") {
    return {
      result,
      judgement: "failed",
      matchedCurated: 0,
      totalCurated: covered.length,
      reason: publicDetail(result.detail ?? "抓取/解析抛错"),
    };
  }
  if (result.extracted.length === 0) {
    return {
      result,
      judgement: "stale",
      matchedCurated: 0,
      totalCurated: covered.length,
      reason: "抓取成功但解析结果为空",
    };
  }
  if (covered.length > 0 && matched === 0) {
    return {
      result,
      judgement: "stale",
      matchedCurated: 0,
      totalCurated: covered.length,
      reason: `解析出 ${result.extracted.length} 条，但没有一条能匹配 curated 收录的模型（页面可能改版）`,
    };
  }
  return {
    result,
    judgement: "fresh",
    matchedCurated: matched,
    totalCurated: covered.length,
    reason: `提取 ${result.extracted.length} 条，命中 curated ${matched}/${covered.length}，回查拦截 ${result.flags.length} 处`,
  };
}

function buildSmokeReport(judgements: SourceJudgement[], parserModel: string, runDate: string): string {
  const lines: string[] = [
    `# 真实数据管线验收报告 ${runDate}`,
    "",
    `运行于 ${new Date().toISOString()}，解析模型：${parserModel}。`,
    "真实抓取官方页面 → LLM 解析 → 数字回查。本报告不修改 models.json。",
    "",
    "| 源 | 判定 | 抓取时间 | 提取条数 | 命中 curated | 回查拦截 | 原因/说明 |",
    "|---|---|---|---|---|---|---|",
    ...judgements.map((j) =>
      [
        "",
        j.result.def.label,
        j.judgement,
        j.result.fetchedAt ?? "—",
        j.result.extracted.length,
        `${j.matchedCurated}/${j.totalCurated}`,
        j.result.flags.length,
        j.reason,
        "",
      ].join(" | "),
    ),
    ...MANUAL_PROVIDERS.map((p) => `|  ${p} | manual | — | — | — | — | 无自动源，沿用 curated 值 |`),
  ];

  const allFlags = judgements.flatMap((j) =>
    j.result.flags.map((f) => ({ src: j.result.def.label, ...f })),
  );
  if (allFlags.length > 0) {
    lines.push(
      "",
      "## 回查拦截（LLM 输出的数字未在源文本中找到，已置 unknown）",
      "",
      "| 源 | 模型 | 字段 | 被拦截值 |",
      "|---|---|---|---|",
      ...allFlags.map((f) => `| ${f.src} | ${f.modelId} | ${f.field} | ${f.value} |`),
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  loadDotEnv();
  const runDate = new Date().toISOString().slice(0, 10);
  const parserModel = process.env.PARSER_MODEL ?? DEFAULT_PARSER_MODEL;

  // 前置检查：缺解析密钥时明确报错，绝不静默
  try {
    resolveParserTarget(parserModel);
  } catch (e) {
    const detail = redactSecrets(e instanceof Error ? e.message : String(e));
    console.error(`验收中止：解析模型 "${parserModel}" 不可用 —— ${detail}`);
    console.error("本地运行：把上面提示的密钥写入项目根目录 .env（或 export）后重试 npm run data:smoke。");
    process.exit(1);
  }

  const curated = CuratedDataSchema.parse(JSON.parse(readFileSync(CURATED_PATH, "utf8")));

  console.log(`真实抓取 ${SOURCES.length} 个源（解析模型：${parserModel}）…`);
  const results = await Promise.all(SOURCES.map(runSource));
  const judgements = results.map((r) => judge(r, curated.models));

  const markdown = redactSecrets(buildSmokeReport(judgements, parserModel, runDate));
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `smoke-${runDate}.md`);
  writeFileSync(reportPath, markdown);

  console.log("\n" + markdown);
  console.log(`验收报告已写入 ${reportPath}`);

  const official = judgements.filter((j) => j.result.def.verified);
  const freshOfficial = official.filter((j) => j.judgement === "fresh");
  if (official.length > 0 && freshOfficial.length === 0) {
    console.error(`\n验收失败：${official.length} 个官方源全部 stale/failed，没有拿到任何官方核实数据（exit 1）。`);
    process.exit(1);
  }
  const notFresh = official.length - freshOfficial.length;
  console.log(
    `\n验收通过：官方源 ${freshOfficial.length}/${official.length} fresh${notFresh > 0 ? `（${notFresh} 个 stale/failed，详见上表）` : ""}。`,
  );
}

main().catch((e) => {
  console.error("验收失败：", redactSecrets(e instanceof Error ? (e.stack ?? e.message) : String(e)));
  process.exit(1);
});
