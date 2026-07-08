# 项目回顾（v1 发布收尾）

> 写于 2026-07-08。本文档记录项目目标、已完成功能、数据更新流程、开发中遇到的问题与后续计划，供发布后回看与接手者参考。日常使用与维护说明见 `README.md`，部署步骤见 `DEPLOY.md`。

## 1. 项目目标

做一个**大模型选型决策台**：把主流模型的价格 / 上下文 / 能力放在一张可排序、可筛选的对照表里，配成本计算器和场景推荐，帮助用户回答"我这个用量、这个场景，该用哪个模型、花多少钱"。

核心原则（贯穿全部设计决策）：

- **数据诚实**：查不到的字段一律 `unknown`，绝不编造；每条数据带 `source` 出处和 `verified` 核实标记。
- **前端零密钥**：GitHub Pages 上是纯静态站，不含任何 API Key，不展示网关/provider 配置。
- **LLM 不是事实来源**：数据管线用 LLM 只做页面文本解析，所有数字经源文本逐字回查，回查不过即置 unknown。

## 2. 已完成功能（v1 范围）

| 功能 | 位置 | 说明 |
|---|---|---|
| 模型对照表 | `src/components/ModelTable.tsx` | 26 个模型，搜索 / 厂商筛选 / 能力筛选 / 表头排序（unknown 永远排最后）/ 行展开看备注与来源 |
| 双模型对比 | `src/components/CompareModels.tsx` | 任选两个模型逐字段并排对比 |
| 成本计算器 | `src/components/CostCalculator.tsx` + `src/lib/cost.ts` | 按用量估算总花费，CNY 模型按可调汇率换算，价格 unknown 的列入"无法计算" |
| 预设模式 / 场景推荐 | `src/components/Presets.tsx` / `Scenarios.tsx` + `src/lib/recommend.ts` | 三套排序策略 + 六个场景 Top 5，规则是纯函数，附入选理由 |
| 自动数据管线 | `pipeline/` | 每周抓官方定价页 → LLM 解析 → 数字回查 → merge → Zod 校验 → 变更报告 → 提交（异常转 PR） |
| 多模型网关 | `gateway/` | Anthropic Messages 格式统一入口，anthropic 协议透传 / openai 协议经适配层双向转换（含流式 tool_use）；仅本地/自有服务器运行 |
| CI / 部署 | `.github/workflows/` | PR 跑测试+构建；push main 构建 + 密钥泄漏自检 + GitHub Pages 部署 |

v1 明确**不包含**：缓存/批量折扣成本模型、分级计价、暗色模式、Qwen/豆包自动抓取（见后续计划）。

## 3. 数据更新流程

数据分两层：**人工只维护 `src/data/curated.json`**（评分 / 标签 / 备注 / 别名 / 兜底价），`src/data/models.json` 是管线产物，不要手改。

自动流程（`update-data.yml`，每周一 02:00 UTC 或手动触发）：

```
fetch 官方定价页（快照存 artifact）
→ parse   LLM 结构化解析（PARSER_MODEL 可配，默认 claude-opus-4-8）
→ verify  每个数字回查源文本，查不到置 unknown
→ merge   curated × 抓取结果 × 上一版（源失败则沿用旧值、标 stale）
→ validate Zod 全量校验，不合法不写盘
→ report  diff 报告写入 reports/YYYY-MM-DD.md
→ commit  正常直接 push main；价格波动 >±50% 或拦截率 >30% 转 PR 人工审
→ push main 触发 deploy.yml → Pages
```

特殊源：OpenRouter 走公开 JSON API 不经 LLM；Qwen / 豆包官方页有登录墙 / JS 渲染，不自动抓，沿用 curated 值并在报告标 `manual`。

## 4. 遇到的问题与处理

按时间顺序，均可在 git 历史中对应到提交：

1. **UI 重构翻车后回滚**（`71e9201` → revert `c8224f5`）：一次"提升信息密度"的大改破坏了既有布局，整体回滚。由此确立"不重做 UI、只做最小修改"的收尾原则。
2. **网关鉴权与数据溯源缺陷**（`a3bb001`）：修复入站鉴权头未剥离、merge 时 source/verified 覆盖逻辑不严谨的问题。
3. **前端泄露网关配置**（`5973ad5`、`b1fa74c`）：早期前端展示了网关/provider 信息，且 `registry.json` 被打进前端 bundle。先隐藏展示，后彻底把 registry 移出打包依赖；部署 workflow 另有 grep key 形态的泄漏自检兜底。
4. **管线提交后 Pages 不自动部署**（`36fc0e1`）：Actions bot 的 push 不触发下游 workflow，改为数据管线提交后显式 dispatch deploy workflow。
5. **【未决】管线运行缺 `ANTHROPIC_API_KEY`**：2026-07-07 与 07-08 两次运行中，LLM 解析的四个官方源（OpenAI / Anthropic / Google / DeepSeek）均因无密钥标 `stale`，靠 merge 兜底沿用旧值（见 `reports/2026-07-07.md`、`2026-07-08.md`）。**发布前需在 repo Secrets 配置 `ANTHROPIC_API_KEY` 并手动触发一次 "Update model data" 验证全绿。**
6. **Qwen / 豆包无法自动抓取**：登录墙 / JS 渲染，接受为已知限制，数据走人工 fallback 并在 UI 标"未核实"。

## 5. 后续计划（v1 之后，按优先级）

1. **修复管线密钥问题**（上面第 5 条，发布阻塞项）。
2. **候选模型半自动入库**：管线报告的候选新模型自动生成 curated 草稿（评分留空供人工评定）。
3. **缓存 / 批量成本模型**：计算器加缓存命中率滑块与批量 API 开关，利用已有 `cachedInputPrice` 字段。
4. **Qwen / 豆包自动化**：Playwright 无头抓取或对接厂商计费 API。
5. **分级计价**：为 Gemini / Qwen 等按输入长度分档的模型建 `priceTiers`。
6. 自定义权重滑块、用量 CSV 导入、暗色模式（设计 token 已就绪）。

## 6. 发布 checklist

- [x] README 覆盖：项目定位、架构、本地运行、功能、数据诚实性原则、维护指南、网关用法
- [x] `docs/project-review.md`（本文档）
- [x] 页面页头显示"数据更新"日期（`src/App.tsx` 头部 Stat）
- [x] 页面页脚含 unknown 说明、评分主观性声明、汇率说明、更新日期与"以官方定价页为准"免责声明
- [x] 表格行展开显示每条数据的 `source` 来源
- [x] 前端 bundle 不含 API Key / registry（deploy workflow 有泄漏自检）
- [x] 测试全绿（`npm test`）、类型检查通过（`npm run typecheck`）
- [ ] repo Secrets 配置 `ANTHROPIC_API_KEY`，手动触发 "Update model data" 确认官方源全部 `ok`
- [ ] Settings → Pages → Source 确认为 "GitHub Actions"，线上页面可访问且数据日期正确
