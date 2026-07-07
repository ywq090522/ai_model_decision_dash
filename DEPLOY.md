# 部署说明

本项目是 Vite + React 静态站，已经配置好 GitHub Pages 自动部署工作流：

- 本地开发：`npm run dev`
- 生产构建：`npm run build`
- 自动部署：push 到 `main` 后由 `.github/workflows/deploy.yml` 发布到 GitHub Pages
- 自动数据更新：由 `.github/workflows/update-data.yml` 每周运行，需要配置 `ANTHROPIC_API_KEY`
- 多模型网关：`npm run gateway` **只在本地/自有服务器运行**，不随 Pages 部署（Pages 只有静态文件）；线上页面不展示网关配置，网关用法见 README/DEPLOY

## 1. 创建 GitHub 仓库

在 GitHub 新建一个空仓库。

建议：

- 仓库名可以用：`ai_model_decision_dash`
- 不要勾选 `Add a README file`
- 不要勾选 `.gitignore`
- 不要添加 license

本地已经完成初始提交：

```bash
git log --oneline -1
```

当前提交：

```text
77ae5a5 Initial commit
```

## 2. 绑定远端仓库

把下面命令里的 `你的用户名` 和 `你的仓库名` 换成实际值：

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

如果你使用 SSH：

```bash
git remote add origin git@github.com:你的用户名/你的仓库名.git
git push -u origin main
```

检查远端是否设置成功：

```bash
git remote -v
```

## 3. 启用 GitHub Pages

进入 GitHub 仓库页面：

```text
Settings -> Pages -> Build and deployment -> Source
```

选择：

```text
GitHub Actions
```

之后每次 push 到 `main`，GitHub Actions 会自动：

1. 安装依赖
2. 运行测试
3. 构建静态文件
4. 检查构建产物中没有 API Key 值（`sk-` 形态的长串）
5. 发布到 GitHub Pages

部署完成后，访问地址通常是：

```text
https://你的用户名.github.io/你的仓库名/
```

## 4. 配置自动数据更新

如果只想部署网页，这一步可以先跳过。

如果要启用每周自动更新模型数据，需要添加 GitHub Actions Secret：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

添加：

```text
Name: ANTHROPIC_API_KEY
Value: 你的 Anthropic API Key
```

这个 Key 只会在数据更新 workflow 中使用，不会进入前端 bundle。

可选：如果想把管线的解析模型换成其它 provider（在 workflow env 中设置 `PARSER_MODEL` 为 registry 里的模型 id，如 `deepseek-v4-pro`），需要再添加对应 provider 的 Secret（`DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `ZHIPU_API_KEY`），并在 `update-data.yml` 的 env 里传入。默认无需任何额外配置。

## 5. 手动触发部署或更新

### 手动部署

进入：

```text
Actions -> Deploy to GitHub Pages -> Run workflow
```

选择 `main` 分支运行。

### 手动更新模型数据

进入：

```text
Actions -> Update model data -> Run workflow
```

如果更新正常，workflow 会直接提交更新到 `main`。

如果检测到异常价格波动或回查失败率过高，workflow 会创建 PR 让你人工审核。

## 6. 本地常用命令

安装依赖：

```bash
npm install
```

开发运行：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

生产构建：

```bash
npm run build
```

预览生产构建：

```bash
npm run preview
```

本地试跑数据管线：

```bash
npm run pipeline:dry
```

真实更新数据：

```bash
npm run pipeline
```

启动多模型网关（key 先复制 `.env.example` 为 `.env` 并填入，`.env` 已 gitignore）：

```bash
cp .env.example .env
npm run gateway     # http://localhost:8788
```

## 7. 常见问题

### 页面打开后样式或 JS 加载失败

确认 GitHub Pages 部署 workflow 中设置了：

```yaml
BASE_PATH: /${{ github.event.repository.name }}/
```

项目的 `vite.config.ts` 已经支持这个配置。

### Actions 部署失败

先在本地运行：

```bash
npm test
npm run build
```

如果本地也失败，先修复测试或构建错误后再 push。

### 数据更新失败

检查是否已经配置：

```text
ANTHROPIC_API_KEY
```

并确认 Key 有效。

### 不想启用自动数据更新

可以不配置 `ANTHROPIC_API_KEY`。

网页部署不依赖这个 Key，只有 `Update model data` workflow 需要它。

### 线上页面为什么没有多模型网关配置

网关是本地 Node 服务，GitHub Pages 不能运行它。线上页面不展示 provider 端点、鉴权方式、环境变量名或 curl 示例；要真正调用，需在自己的机器上 `npm run gateway`（key 写本地 `.env`，永远不要提交或放进前端）。
