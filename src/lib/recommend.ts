import type { ModelInfo, PresetKey, ScenarioKey } from "../types";
import { priceInUsd } from "./cost";

export interface Ranked {
  model: ModelInfo;
  score: number;
  reasons: string[];
}

/**
 * 综合单价：输入价 × 3 + 输出价（近似常见 3:1 输入输出比），单位 USD/1M。
 * 价格 unknown 返回 null。
 */
export function blendedPrice(m: ModelInfo, cnyPerUsd: number): number | null {
  const inp = priceInUsd(m.inputPrice, m.currency, cnyPerUsd);
  const out = priceInUsd(m.outputPrice, m.currency, cnyPerUsd);
  if (inp === null || out === null) return null;
  return (inp * 3 + out) / 4;
}

/** 把综合单价映射为 0-5 的"便宜分"：$0 → 5 分，≥$20/1M → 0 分（对数刻度） */
export function cheapScore(m: ModelInfo, cnyPerUsd: number): number | null {
  const p = blendedPrice(m, cnyPerUsd);
  if (p === null) return null;
  if (p <= 0) return 5;
  // log10(0.05)= -1.3 → ~5分；log10(20)=1.3 → 0分
  const s = 5 * (1 - (Math.log10(p) + 1.3) / 2.6);
  return Math.max(0, Math.min(5, s));
}

/** 上下文窗口映射为 0-5：unknown → null，128K → 2.5，1M → 5 */
export function contextScore(m: ModelInfo): number | null {
  if (m.contextWindow === null) return null;
  const s = (Math.log2(m.contextWindow / 16_000) / Math.log2(64)) * 5;
  return Math.max(0, Math.min(5, s));
}

interface ScenarioDef {
  key: ScenarioKey;
  label: string;
  desc: string;
  score: (m: ModelInfo, cnyPerUsd: number) => number | null;
  reasons: (m: ModelInfo, cnyPerUsd: number) => string[];
}

const fmt = (n: number | null) => (n === null ? "?" : n.toFixed(1));

export const SCENARIOS: ScenarioDef[] = [
  {
    key: "coding",
    label: "代码",
    desc: "写代码、重构、Code Review。权重：代码能力 ×2 + Agent 能力 + 工具调用。",
    score: (m) => m.scores.coding * 2 + m.scores.agent + (m.toolUse ? 1 : 0),
    reasons: (m) => [
      `代码评分 ${m.scores.coding}/5，Agent 评分 ${m.scores.agent}/5`,
      m.toolUse ? "支持工具调用，可接入编码 Agent" : "工具调用支持未确认",
    ],
  },
  {
    key: "longDoc",
    label: "长文档",
    desc: "论文、合同、代码库级别的长文本分析。权重：长文档能力 ×2 + 上下文窗口。",
    score: (m) => {
      const ctx = contextScore(m);
      if (ctx === null) return m.scores.longDoc * 2; // 上下文 unknown 只按能力分
      return m.scores.longDoc * 2 + ctx;
    },
    reasons: (m) => [
      `长文档评分 ${m.scores.longDoc}/5`,
      m.contextWindow !== null
        ? `上下文 ${(m.contextWindow / 1000).toLocaleString()}K tokens`
        : "上下文长度 unknown，排名仅按能力分",
    ],
  },
  {
    key: "lowCost",
    label: "低成本",
    desc: "预算优先。权重：便宜分 ×2 + 日常对话能力（有价格才参与排名）。",
    score: (m, r) => {
      const c = cheapScore(m, r);
      if (c === null) return null;
      return c * 2 + m.scores.chat;
    },
    reasons: (m, r) => {
      const p = blendedPrice(m, r);
      return [
        p === null ? "价格 unknown" : p === 0 ? "免费（注意限速）" : `综合单价约 $${p.toFixed(2)}/1M tokens`,
        `日常对话评分 ${m.scores.chat}/5`,
      ];
    },
  },
  {
    key: "chinese",
    label: "中文",
    desc: "中文理解与生成。权重：中文能力 ×2 + 日常对话能力。",
    score: (m) => m.scores.chinese * 2 + m.scores.chat,
    reasons: (m) => [`中文评分 ${m.scores.chinese}/5`, `对话评分 ${m.scores.chat}/5`],
  },
  {
    key: "vision",
    label: "图片理解",
    desc: "只保留确认支持图片输入的模型，按综合能力排序。",
    score: (m) => {
      if (m.vision !== true) return null; // 未确认支持的不进入推荐
      return m.scores.chat + m.scores.longDoc + m.scores.agent;
    },
    reasons: (m) => [
      "已确认支持图片输入",
      `综合能力分 ${fmt(m.scores.chat + m.scores.longDoc + m.scores.agent)}/15`,
    ],
  },
  {
    key: "agent",
    label: "Agent",
    desc: "多步工具调用、自动化任务。权重：Agent 能力 ×2 + 代码能力 + 工具调用。",
    score: (m) => {
      if (m.toolUse === false) return null;
      return m.scores.agent * 2 + m.scores.coding + (m.toolUse ? 1 : 0);
    },
    reasons: (m) => [
      `Agent 评分 ${m.scores.agent}/5，代码评分 ${m.scores.coding}/5`,
      m.toolUse ? "支持工具调用" : "工具调用支持未确认",
    ],
  },
];

export function rankByScenario(
  models: ModelInfo[],
  key: ScenarioKey,
  cnyPerUsd: number,
  topN = 5,
): Ranked[] {
  const def = SCENARIOS.find((s) => s.key === key)!;
  return models
    .map((m) => ({ model: m, score: def.score(m, cnyPerUsd), reasons: def.reasons(m, cnyPerUsd) }))
    .filter((r): r is Ranked => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ---------- 预设模式 ----------

export interface PresetDef {
  key: PresetKey;
  label: string;
  strategy: string;
  /** 返回 null 表示该模型不参与此模式排名 */
  score: (m: ModelInfo, cnyPerUsd: number) => number | null;
  explain: (m: ModelInfo, cnyPerUsd: number) => string;
}

export const PRESETS: PresetDef[] = [
  {
    key: "student",
    label: "学生省钱模式",
    strategy:
      "便宜是硬道理：便宜分 ×3 + 日常对话 + 中文能力。价格 unknown 的模型不参与排名（无法保证省钱）。免费模型排最前，但注意限速。",
    score: (m, r) => {
      const c = cheapScore(m, r);
      if (c === null) return null;
      return c * 3 + m.scores.chat + m.scores.chinese;
    },
    explain: (m, r) => {
      const p = blendedPrice(m, r);
      if (p === 0) return "完全免费（有请求限速），学生党零成本起步";
      return `综合单价约 $${p!.toFixed(2)}/1M tokens，对话 ${m.scores.chat}/5、中文 ${m.scores.chinese}/5`;
    },
  },
  {
    key: "developer",
    label: "代码开发模式",
    strategy:
      "能力优先、成本兜底：代码 ×3 + Agent ×2 + 工具调用加分 − 价格惩罚。适合日常写代码、接入 Cursor/Claude Code 类工具。",
    score: (m, r) => {
      if (m.toolUse === false) return null;
      const p = blendedPrice(m, r);
      const pricePenalty = p === null ? 1 : Math.min(2, p / 10); // 价格 unknown 记 1 分惩罚
      return m.scores.coding * 3 + m.scores.agent * 2 + (m.toolUse ? 1 : 0) - pricePenalty;
    },
    explain: (m, r) => {
      const p = blendedPrice(m, r);
      const priceStr = p === null ? "价格 unknown" : `综合单价 $${p.toFixed(2)}/1M`;
      return `代码 ${m.scores.coding}/5、Agent ${m.scores.agent}/5，${
        m.toolUse ? "支持工具调用" : "工具调用未确认"
      }；${priceStr}`;
    },
  },
  {
    key: "longdoc",
    label: "长文档分析模式",
    strategy:
      "窗口和读长文的本事都要：长文档 ×2.5 + 上下文窗口分 ×1.5 − 输入价惩罚（长文档烧的主要是输入 token）。上下文 unknown 的模型降权。",
    score: (m, r) => {
      const ctx = contextScore(m);
      const inUsd = priceInUsd(m.inputPrice, m.currency, r);
      const inputPenalty = inUsd === null ? 0.5 : Math.min(2.5, inUsd / 4);
      const ctxPart = ctx === null ? 1 : ctx * 1.5; // unknown 上下文给保守的 1 分
      return m.scores.longDoc * 2.5 + ctxPart - inputPenalty;
    },
    explain: (m, r) => {
      const inUsd = priceInUsd(m.inputPrice, m.currency, r);
      const ctxStr =
        m.contextWindow === null
          ? "上下文 unknown（已降权）"
          : `上下文 ${(m.contextWindow / 1000).toLocaleString()}K`;
      const inStr = inUsd === null ? "输入价 unknown" : `输入 $${inUsd.toFixed(2)}/1M`;
      return `长文档 ${m.scores.longDoc}/5，${ctxStr}，${inStr}`;
    },
  },
];

export function rankByPreset(
  models: ModelInfo[],
  key: PresetKey,
  cnyPerUsd: number,
): Ranked[] {
  const def = PRESETS.find((p) => p.key === key)!;
  return models
    .map((m) => {
      const s = def.score(m, cnyPerUsd);
      return s === null ? null : { model: m, score: s, reasons: [def.explain(m, cnyPerUsd)] };
    })
    .filter((r): r is Ranked => r !== null)
    .sort((a, b) => b.score - a.score);
}
