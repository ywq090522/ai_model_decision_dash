#!/usr/bin/env node
/**
 * 泄漏自检（npm run check:leaks）：扫描会公开的产物 —— dist/（若已构建）、
 * src/data/models.json、src/data/curated.json、reports/*.md —— 防止密钥进入仓库或部署。
 *
 * 三类检查：
 *   1. 常见密钥值格式（sk-ant- / sk- / ghp_ / github_pat_ / AKIA / xox?- / AIza…）
 *   2. 当前环境（process.env + .env）中真实的 secret 值（名称含 KEY/TOKEN/SECRET/PASSWORD、长度 ≥ 8）
 *   3. 未脱敏的密钥环境变量名（*_API_KEY / *_TOKEN / *_SECRET）——
 *      管线产物应经 publicDetail 脱敏，出现说明有 detail 泄漏回归
 *
 * 只扫描数据产物，不扫描 README/docs/workflow，"需要配置某某 Secret"之类说明文字不受影响。
 * 输出只报文件与原因，绝不回显匹配到的内容（避免自检本身把值打进日志）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");

const VALUE_PATTERNS = [
  ["Anthropic key (sk-ant-…)", /sk-ant-[A-Za-z0-9_-]{8,}/],
  ["generic key (sk-…)", /\bsk-[A-Za-z0-9]{24,}/],
  ["GitHub token (ghp_…)", /\bghp_[A-Za-z0-9]{20,}/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ["AWS access key (AKIA…)", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token (xox?-…)", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Google key (AIza…)", /\bAIza[0-9A-Za-z_-]{30,}/],
];
const ENV_NAME_PATTERN = /\b[A-Z][A-Z0-9_]*_(?:API_KEY|TOKEN|SECRET)\b/;

function collectTargets() {
  const targets = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else targets.push(p);
    }
  };
  if (existsSync(join(ROOT, "dist"))) walk(join(ROOT, "dist"));
  for (const f of ["src/data/models.json", "src/data/curated.json"]) {
    if (existsSync(join(ROOT, f))) targets.push(join(ROOT, f));
  }
  const reportsDir = join(ROOT, "reports");
  if (existsSync(reportsDir)) {
    for (const f of readdirSync(reportsDir)) {
      if (f.endsWith(".md")) targets.push(join(reportsDir, f));
    }
  }
  return targets;
}

function collectSecretValues() {
  try {
    process.loadEnvFile(join(ROOT, ".env")); // 不覆盖已有环境变量；文件不存在时抛错被忽略
  } catch {}
  const values = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/.test(name) && value && value.trim().length >= 8) {
      values.push(value.trim());
    }
  }
  return values;
}

const targets = collectTargets();
const secretValues = collectSecretValues();
const failures = [];

for (const file of targets) {
  const content = readFileSync(file, "utf8");
  const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
  for (const [label, pattern] of VALUE_PATTERNS) {
    if (pattern.test(content)) failures.push(`${rel}: 疑似密钥值（${label}）`);
  }
  for (const v of secretValues) {
    if (content.includes(v)) {
      failures.push(`${rel}: 包含当前环境中的真实 secret 值（值已隐去）`);
      break;
    }
  }
  const nameHit = content.match(ENV_NAME_PATTERN);
  if (nameHit) failures.push(`${rel}: 未脱敏的密钥环境变量名 ${nameHit[0]}（detail 应经 publicDetail 脱敏）`);
}

if (failures.length > 0) {
  console.error("泄漏自检失败：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `泄漏自检通过：${targets.length} 个文件（dist=${existsSync(join(ROOT, "dist"))}），` +
    `${VALUE_PATTERNS.length} 类密钥格式 + ${secretValues.length} 个环境 secret 值 + 环境变量名检查均未命中。`,
);
