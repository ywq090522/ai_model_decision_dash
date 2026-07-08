# AI Model Decision Dashboard

大模型选型决策台：对比主流模型的价格 / 上下文 / 能力，估算使用成本，并按场景给出推荐。

**Demo**：<https://ywq090522.github.io/ai_model_decision_dash/>（GitHub Pages，首次启用 Pages 并 push main 后生效，见 `DEPLOY.md`）

架构：**静态前端 + 自动数据更新管线 + Anthropic-compatible 多模型网关**。前端是纯静态站（Vite + React + TypeScript + Tailwind CSS），只消费 `src/data/models.json`，不展示网关配置，**不含任何 API Key**；数据由 GitHub Actions 每周抓取官方定价页自动更新（Zod 校验 + 变更报告），push 到 main 后自动部署 GitHub Pages；网关（`npm run gateway`）在本地/自有服务器运行，用同一份 Anthropic Messages 请求格式按 `model` 路由到各家的 Anthropic 兼容端点。

## 本地运行

```bash
npm install
npm run dev        # 开发模式，默认 http://localhost:5173
```

其他命令：

```bash
npm run build         # 类型检查 + 生产构建（输出到 dist/）
npm run preview       # 预览生产构建
npm test              # 全部单元测试（成本公式 / 渲染冒烟 / 管线回查·merge·报告）
npm run typecheck     # 前端 + 管线双 tsconfig 类型检查
npm run pipeline:dry  # 本地试跑数据管线（打印变更报告，不写文件；需要解析模型密钥，缺密钥立即报错）
npm run pipeline      # 真跑管线：更新 models.json + 生成 reports/YYYY-MM-DD.md
npm run data:smoke    # 真实环境验收：真抓官方页 → LLM 解析 → 数字回查，逐源判定 fresh/stale/failed，
                      # 写 reports/smoke-YYYY-MM-DD.md，不改 models.json；官方源全挂或缺密钥则非零退出
npm run gateway       # 启动多模型网关（默认 http://127.0.0.1:8788，key 读 .env）
```

## 功能

| 区块 | 说明 |
|---|---|
| **模型对照表** | 收录 OpenAI / Anthropic / Google / DeepSeek / Qwen / Kimi / 豆包 / OpenRouter 共 26 个模型。可搜索、按厂商筛选、按能力筛选（图片 / 工具调用 / 免费 / 仅官方核实价），点表头排序，点行展开备注与数据来源 |
| **双模型对比** | 任选两个模型逐字段并排对比（价格 / 上下文 / 能力 / 评分），查不到的字段如实标 unknown |
| **成本计算器** | 输入「每次请求输入 tokens、输出 tokens、请求次数」，按公式 `(输入×单价 + 输出×单价) ÷ 1M × 次数` 估算总花费，横条图对比。人民币计价模型按可调汇率换算 |
| **预设模式** | 学生省钱 / 代码开发 / 长文档分析，三套排序策略，每个模型附入选理由 |
| **场景推荐** | 代码 / 长文档 / 低成本 / 中文 / 图片理解 / Agent 六个场景的 Top 5 推荐 |
| **多模型网关** | 前端不展示网关配置；本地/自有服务器使用方式见下文和 `DEPLOY.md` |

## 数据诚实性原则

- **查不到就标 unknown**：`models.json` 中价格、上下文、能力字段为 `null` 表示未能核实，UI 显示为 *unknown*，成本计算器直接跳过（列在"无法计算"里），排序时永远排最后。**绝不编造数据。**
- **`verified` 字段**：`true` 仅当该条数据由数据管线真实抓取官方定价页、LLM 解析并通过数字回查——此时必带 `verifiedAt`（核实时间）与 `verificationSource`（核实来源），schema 强制这一不变量。seed / curated 兜底 / 第三方汇总（Qwen / Kimi / 豆包 / OpenRouter）一律 `false`，表格中带"未核实"标记，每条数据的 `source` 字段记录出处。数据源本次抓取失败时，`meta.pipeline` 标 `stale`，页头与相关模型行会显示 stale 状态。
- **能力评分（scores）是编辑主观判断**（0–5），基于公开基准与社区口碑，不是官方数据 —— 这是推荐功能的输入，欢迎按你的实测修改。
- 人民币计价模型（豆包）保留原币价格，换算汇率默认 7.2，可在计算器中调整。

## 文件结构

```
ai_model_decision_dash/
├── index.html
├── package.json
├── vite.config.ts / tsconfig.json / tsconfig.pipeline.json
├── tailwind.config.js / postcss.config.js
├── .github/workflows/
│   ├── ci.yml                   # PR / 非 main 分支：安装 + 测试 + 构建（覆盖数据异常 PR）
│   ├── update-data.yml          # 每周数据管线（异常自动转 PR）
│   └── deploy.yml               # GitHub Pages 部署 + 密钥泄漏自检（push main 时跑测试+构建）
├── .env.example                 # 网关/管线用的 key 环境变量名清单（复制为 .env）
├── gateway/                     # ★ 多模型网关（不进前端 bundle）
│   ├── registry.ts              # registry 加载 + 模型→provider 路由解析
│   ├── upstream.ts              # 鉴权头构造（x-api-key / bearer）+ 上游请求组装（按 protocol 分发）
│   ├── openai-adapter.ts        # OpenAI 协议适配层：Messages ⇄ chat/completions 请求/响应/SSE 转换
│   ├── server.ts                # node:http 服务：/v1/messages 透传或经适配层转换（含 SSE）+ /v1/models
│   ├── parse-client.ts          # 管线用库级路由客户端（Anthropic SDK 换 baseURL/鉴权）
│   └── *.test.ts                # 网关单元/集成测试（mock 上游，不打真实 API）
├── pipeline/                    # 数据管线（不进前端 bundle）
│   ├── index.ts                 # 编排入口（--dry-run 支持）
│   ├── sources.ts               # 数据源清单
│   ├── fetch.ts                 # 抓取 + HTML→文本 + 快照
│   ├── parse.ts                 # LLM 结构化解析（经网关路由层，PARSER_MODEL 可配）+ OpenRouter API
│   ├── verify.ts                # ★ 数字回查（LLM 编造即拦截）
│   ├── merge.ts                 # curated × 抓取结果 × 上一版 合并
│   ├── report.ts                # 变更报告 + 异常检测
│   └── *.test.ts                # 管线单元测试（fixture，不打 API）
├── reports/                     # 每次运行的变更报告（入库）
├── src/
│   ├── main.tsx                 # 入口
│   ├── App.tsx                  # 页面布局 + 筛选状态
│   ├── App.test.tsx             # 渲染冒烟测试
│   ├── index.css                # Tailwind + 设计 token
│   ├── types.ts                 # 类型（从 Zod schema z.infer 推导）
│   ├── data/
│   │   ├── schema.ts            # ★ Zod schema（前端/管线/网关共用的单一事实来源）
│   │   ├── curated.json         # ★ 人工维护：评分/标签/备注/别名/兜底价
│   │   ├── registry.json        # ★ 网关 provider 配置 + 模型路由表（只含环境变量名）
│   │   └── models.json          # 管线产物：事实字段 + 源状态
│   ├── lib/
│   │   ├── cost.ts              # 成本计算（含 CNY→USD 换算）
│   │   ├── cost.test.ts         # 成本公式单元测试（可手算验证）
│   │   └── recommend.ts         # 场景评分 + 三个预设模式
│   └── components/
│       ├── ModelTable.tsx       # 可排序表格
│       ├── FilterBar.tsx        # 搜索与筛选
│       ├── CompareModels.tsx    # 双模型对比
│       ├── CostCalculator.tsx   # 成本计算器
│       ├── Presets.tsx          # 预设模式
│       ├── Scenarios.tsx        # 场景推荐
│       └── ui.tsx               # 通用小组件
├── docs/
│   └── project-review.md        # 项目回顾：目标 / 功能 / 数据流程 / 问题 / 后续计划
└── README.md
```

## 成本计算逻辑（可验证）

```
单次成本(USD) = (输入tokens × 输入单价 + 输出tokens × 输出单价) ÷ 1,000,000
总成本       = 单次成本 × 请求次数
人民币模型   : 单价先除以汇率（默认 7.2，可调）
价格 unknown : 返回 null，不参与计算
```

手算示例（见 `src/lib/cost.test.ts`）：Claude Sonnet 5（$3 / $15），每次 10K 输入 + 2K 输出，共 100 次：
`(10000×3 + 2000×15) ÷ 1e6 = $0.06/次 → ×100 = $6.00` ✓

未计入：提示词缓存折扣、批量 API 折扣（−50%）、分级计价加价（如 Gemini >200K），实际账单可能不同。

## 推荐规则

所有规则在 `src/lib/recommend.ts`，纯函数，改完即生效：

- **综合单价** = (输入价×3 + 输出价) ÷ 4（近似 3:1 输入输出比）
- **便宜分** = 综合单价的对数映射到 0–5（$0 → 5 分，≥$20/1M → 0 分）
- **上下文分** = 窗口大小的对数映射到 0–5（16K → 0，1M → 5）

| 模式 | 公式 | 排除规则 |
|---|---|---|
| 学生省钱 | 便宜分×3 + 对话 + 中文 | 价格 unknown 不参与（无法保证省钱） |
| 代码开发 | 代码×3 + Agent×2 + 工具调用加分 − 价格惩罚 | 明确不支持工具调用的不参与 |
| 长文档分析 | 长文档×2.5 + 上下文分×1.5 − 输入价惩罚 | 上下文 unknown 的降权不排除 |
| 图片理解（场景） | 仅保留 `vision === true` 的模型 | vision unknown 的不推荐 |

## 多模型网关（Anthropic-compatible）

对外统一 Anthropic Messages 格式，按 provider 的 `protocol` 分两条路：DeepSeek、Moonshot Kimi、智谱 GLM 提供**原生 Anthropic 兼容端点**（`protocol: "anthropic"`），请求/响应原样透传不做转换；OpenAI、Gemini、OpenRouter 只有 OpenAI 协议端点（`protocol: "openai"`），经网关适配层（`gateway/openai-adapter.ts`）做 Messages ⇄ chat/completions 双向转换。

```
                   ┌── GET /v1/models ──── registry 生成模型清单
调用方（curl/SDK）──┤
 Anthropic 格式    └── POST /v1/messages ─ 按 body.model 查 src/data/registry.json
                                            → provider(baseUrl + messagesPath + 鉴权方式 + protocol)
                                            → 替换为 upstreamModel，注入 x-api-key 或 Bearer
                                            → anthropic 协议：响应原样透传（stream:true 时 SSE 逐字节 pipe）
                                            → openai 协议：请求/响应/SSE 事件经适配层双向转换
```

### 用法

```bash
cp .env.example .env   # 填入你要用的 provider 的 key（.env 已 gitignore）
npm run gateway        # 默认只监听 http://127.0.0.1:8788

curl 127.0.0.1:8788/v1/messages \
  -H "content-type: application/json" \
  -d '{"model": "deepseek-v4-flash", "max_tokens": 256,
       "messages": [{"role": "user", "content": "你好"}]}'
```

默认监听地址是 `127.0.0.1`，可用 `GATEWAY_HOST` 覆盖。未设置 `GATEWAY_AUTH_TOKEN` 时仅适合本地开发（网关会强制这一点：监听非回环地址且未设置 token 时直接拒绝启动）；如果部署到 VPS 或任何公网可达环境，必须设置 `GATEWAY_AUTH_TOKEN`，调用时带 `Authorization: Bearer <token>`。公网部署建议放在反向代理后面，并启用 HTTPS。

任何 Anthropic SDK 也可直接指向网关：未启用入站鉴权时可用 `new Anthropic({ baseURL: "http://127.0.0.1:8788", apiKey: "unused" })`。设置 `GATEWAY_AUTH_TOKEN` 后，用 `new Anthropic({ baseURL: "http://127.0.0.1:8788", apiKey: null, authToken: process.env.GATEWAY_AUTH_TOKEN })` 发送 `Authorization: Bearer <token>`；网关会校验入站 `Authorization`，随后剥离入站鉴权头，只向上游发送自己构造的 provider 鉴权头。

### 内置 provider（均已对照官方文档核实，2026-07）

| provider | 协议 | 端点 | 鉴权 | 环境变量 |
|---|---|---|---|---|
| Anthropic 官方 | anthropic | `api.anthropic.com/v1/messages` | `x-api-key` | `ANTHROPIC_API_KEY` |
| DeepSeek | anthropic | `api.deepseek.com/anthropic/v1/messages` | `x-api-key` | `DEEPSEEK_API_KEY` |
| Moonshot Kimi | anthropic | `api.moonshot.cn/anthropic/v1/messages` | `Bearer` | `MOONSHOT_API_KEY` |
| 智谱 GLM | anthropic | `open.bigmodel.cn/api/anthropic/v1/messages` | `Bearer` | `ZHIPU_API_KEY` |
| OpenAI 官方 | openai | `api.openai.com/v1/chat/completions` | `Bearer` | `OPENAI_API_KEY` |
| Google Gemini | openai | `generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `Bearer` | `GEMINI_API_KEY` |
| OpenRouter | openai | `openrouter.ai/api/v1/chat/completions` | `Bearer` | `OPENROUTER_API_KEY` |

### 新增 provider / 模型

改 `src/data/registry.json` 即可（Zod schema 在 `src/data/schema.ts`，网关启动即校验）：

1. `providers` 加一条：`key / label / protocol（anthropic 或 openai）/ baseUrl / messagesPath / auth（x-api-key 或 bearer）/ apiKeyEnv / structuredOutput / notes`。端点信息必须先对照官方文档核实。
2. `models` 加一条：`id`（网关对外 id，尽量与 `models.json` 对齐以获得对照表联动）→ `provider` + `upstreamModel`（发给上游的真实 id）。
3. 在 `.env.example` 补上新变量名，跑 `npm test`。

原生 Anthropic 兼容端点选 `protocol: "anthropic"`（零转换透传，首选）；只有 OpenAI 协议端点的厂商选 `protocol: "openai"`，自动走适配层。

### OpenAI 协议适配层（gateway/openai-adapter.ts）

`protocol: "openai"` 的 provider 经适配层做三类转换：请求体（system / 文本 / 图片 / tool_use / tool_result / tools / tool_choice → chat/completions 格式，`max_tokens` → `max_completion_tokens`）、响应体（`tool_calls` → `tool_use`、finish_reason → stop_reason、usage 字段映射）、SSE 事件流（chunk delta → Anthropic 事件序列）。转换是白名单式的：Anthropic 特有参数（`thinking`、`top_k`、`cache_control`）在 OpenAI 协议上没有对应物，直接丢弃不改写语义。

流式 tool_use 也已支持：上游 `tool_calls` 的 arguments 片段原样转成 `input_json_delta`（每个 tool_call index 对应一个 `tool_use` content block，前块 stop 后块 start），网关不缓冲不校验 JSON，由客户端照 Anthropic 语义拼装。管线的解析模型（`PARSER_MODEL`）仍仅限 anthropic 协议 provider（`gateway/parse-client.ts` 基于 Anthropic SDK）。

### 边界与后续

- **anthropic 协议的 streaming 是 SSE 原样透传**（不解析、不缓冲、不改写事件）；openai 协议经适配层做事件翻译（含流式 tool_use，见上节）。
- 网关**不部署到 GitHub Pages**（Pages 只有静态文件），前端 GitHub Pages 不会调用 gateway，也不展示 registry/provider 配置；网关用法见本节和 `DEPLOY.md`。
- 各家兼容端点对 Anthropic 参数的支持程度不一（如 DeepSeek 忽略 `budget_tokens`，Gemini 的 OpenAI 兼容层会静默忽略部分参数），以各厂商文档为准；除协议转换必需的映射外，网关不做参数改写。

## 自动数据管线

```
GitHub Actions 每周一 02:00 UTC（或手动 workflow_dispatch）
  1. fetch    抓官方定价页原文（快照存 Actions artifact 供审计）
  2. parse    LLM 把页面文本转结构化 JSON —— 只做解析；解析模型经网关路由层可配
              （PARSER_MODEL，默认 claude-opus-4-8；非 Anthropic provider 走 JSON 指令 + Zod 校验）
  3. verify   数字回查：LLM 输出的每个数字必须在源文本中找到，否则置 unknown 并记录
  4. merge    curated.json（人工字段）× 抓取结果（事实字段）→ src/data/models.json
  5. validate Zod 全量校验（src/data/schema.ts），不合法绝不写盘
  6. report   与旧数据 diff → reports/YYYY-MM-DD.md
  7. commit   正常 → 直接 push main；异常（价格波动 >±50% / 回查拦截率 >30%）→ 开 PR 人工审
push main → deploy.yml → 构建 + 密钥泄漏自检 → GitHub Pages
```

### LLM 不是事实来源 —— 四层防线

1. **Prompt 限定**（`pipeline/parse.ts`）：只许照抄页面数值，页面没写一律 null，禁止用模型自身知识。
2. **数字逐字回查**（`pipeline/verify.ts`）：提取的每个数字必须能在源页面文本中找到（支持每 1K→1M 换算、200K/1M/二进制 K 等形式），查不到即置 unknown 并写进报告的"回查拦截"表。
3. **Zod schema 校验**（`src/data/schema.ts`）：产物不合法直接中止（exit 1），不写盘。
4. **异常阈值转人工**：价格波动超 ±50% 或拦截率超 30% 时 exit 2，CI 不再直接 push，改开带完整变更报告的 PR。

OpenRouter 走它的公开 JSON API（`/api/v1/models`），完全不经过 LLM。Qwen/豆包官方页有登录墙/JS 渲染，不自动抓，沿用人工值并在报告标 `manual`。

### API Key 安全

- CI 解析密钥**只**存 GitHub repo Settings → Secrets and variables → Actions，仅 `update-data.yml` 的管线步骤可见；本地 key 存 `.env`（已 gitignore）。默认解析模型为 `deepseek-v4-flash`（需 Secret `DEEPSEEK_API_KEY`）；要换模型，设 repo **Variable** `PARSER_MODEL` 并配置对应 provider 的 Secret（如 `ANTHROPIC_API_KEY`）。缺 Secret 时管线 exit 1 明确失败，不会静默产出 stale 数据。
- 管线与网关代码在 `pipeline/`、`gateway/`，不被前端入口引用，不进 Vite bundle；前端只 import 静态 `models.json`，不 import 或展示 `registry.json`。
- 网关剥离入站鉴权头、响应与错误信息永不包含 key 值（缺 key 时只提示变量名）。
- 泄漏自检 `npm run check:leaks`（`scripts/check-leaks.mjs`）扫描 `dist/`、`models.json`、`curated.json`、`reports/*.md`：常见密钥值格式、当前环境真实 secret 值、未脱敏的密钥环境变量名。CI / deploy / 数据更新 commit 前都会跑；deploy 另保留 grep 兜底。
- 本地跑管线：把解析模型对应的 key 写入 `.env`（如 `DEEPSEEK_API_KEY=...` 配 `PARSER_MODEL=deepseek-v4-flash`，或 `ANTHROPIC_API_KEY=...`）。

### 首次启用（仓库设置）

1. 在 repo Settings → Secrets and variables → Actions 添加 Secret `DEEPSEEK_API_KEY`（CI 默认解析模型 `deepseek-v4-flash`）。要改用其他解析模型：加 Variable `PARSER_MODEL`（registry 内任意 anthropic 协议模型），并添加对应 provider 的 Secret（`ANTHROPIC_API_KEY` / `MOONSHOT_API_KEY` / `ZHIPU_API_KEY`）。
2. Settings → Pages → Source 选 "GitHub Actions"。
3. Actions 页手动触发一次 "Update model data" 验证管线，再看 Pages 部署结果。

## 如何维护数据

数据分两层，**人工只维护 `curated.json`，`models.json` 是管线产物**：

| 文件 | 谁维护 | 内容 |
|---|---|---|
| `src/data/curated.json` | 人工 | id / 名称 / 厂商 / 币种 / **能力评分** / 标签 / 备注 / vision·toolUse 能力位 / `aliases`（官方页名称变体，供匹配）/ `fallback`（抓不到时的兜底价） |
| `src/data/models.json` | 管线 | 事实字段（价格 / 上下文 / maxOutput / 缓存价 / source / verified）+ `meta.pipeline` 源状态 |

- **加新模型**：管线报告的"候选新模型"列出官方页有但本库没有的条目 → 在 `curated.json` 加一条（评分需人工评定，这是编辑判断，管线永不代劳），下次运行自动填充价格。
- **改评分/备注**：直接改 `curated.json`，下次管线运行生效；急的话本地跑 `npm run pipeline`。
- **豆包/Qwen 价格变了**：改 `curated.json` 对应条目的 `fallback`（这两家无自动源）。
- 改完跑 `npm test`。
- **发现模型数据错误？** 欢迎提 issue 反馈：用 [📊 Data correction 模板](../../issues/new?template=data_correction.yml) 填写厂商、模型名、当前显示数据、正确数据和来源链接（优先官方定价页）；功能问题用 [🐛 Bug report 模板](../../issues/new?template=bug_report.yml)。
- 官方定价页速查：
   - OpenAI: <https://developers.openai.com/api/docs/pricing>
   - Anthropic: <https://platform.claude.com/docs/en/about-claude/pricing>
   - Google: <https://ai.google.dev/gemini-api/docs/pricing>
   - DeepSeek: <https://api-docs.deepseek.com/quick_start/pricing>
   - 阿里云百炼: <https://www.alibabacloud.com/help/en/model-studio/model-pricing>
   - Moonshot: <https://platform.moonshot.ai>
   - 火山引擎: <https://www.volcengine.com/docs/82379/1544106>
   - OpenRouter: <https://openrouter.ai/models>

## 未来扩展建议

- **候选模型半自动入库**：管线报告里的候选新模型，可再加一步 LLM 生成 curated 条目草稿（评分留空）供人工补全。
- **Qwen/豆包自动化**：用 Playwright 无头浏览器抓 JS 渲染的控制台页，或接阿里云/火山的计费 API。
- **缓存/批量成本模型**：计算器加"缓存命中率"滑块与"批量 API"开关，利用 `cachedInputPrice` 字段。
- **用量导入**：支持粘贴各平台账单 CSV，反推 token 用量再估算迁移成本。
- **分级计价**：为 Gemini / Qwen 这类按输入长度分档的模型建 `priceTiers` 数组，按输入 token 自动选档。
- **自定义权重**：把预设模式的权重做成滑块，导出/分享自己的选型策略。
- **暗色模式**：设计 token 已集中在 `tailwind.config.js`，加一套暗色变量即可。

## 数据快照

- 数据更新：**2026-07-08**（真实管线全量运行，全部自动源 ok，详见 `reports/2026-07-08.md`）
- 价格官方核实：OpenAI、Anthropic、Google、DeepSeek（共 17 个模型 `verified: true`，带 `verifiedAt` / `verificationSource`）
- 第三方来源（标"未核实"）：Qwen、Kimi、豆包、OpenRouter
- 价格随时可能调整，下单前请以各厂商官方定价页为准
