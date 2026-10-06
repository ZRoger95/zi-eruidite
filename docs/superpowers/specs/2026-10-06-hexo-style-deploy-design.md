# hexo 式部署设计（本机构建 → 推送 Pages 仓库）

日期：2026-10-06
状态：已批准（2026-10-06，用户审阅通过）

## 背景与目标

源码仓库 `zingrigger/zi-eruidite` 是 Astro 站点，发布目标是独立的 GitHub Pages 仓库
`zingrigger.github.io`（根网址 `https://zingrigger.github.io/`）。作者习惯 hexo-deployer-git
的部署方式，不走 GitHub Actions：本机构建，产物经项目根的 `.deploy_git/` 缓存目录推送
到 Pages 仓库。

目标：一条命令完成「构建 → 同步 → 提交 → 推送」，可重复执行、结果幂等；换仓库/分支只改一处配置。

数据流（复刻 hexo-deployer-git）：

```
dist/（astro build 产物） → .deploy_git/（repo-b 的缓存克隆） → git push --force → repo-b
```

## 范围

**覆盖：**

- 新增 `scripts/deploy.sh`：部署脚本。
- 新增 `deploy.config.json`：配置入口（仿 hexo `_config.yml` 的 deploy 段；2026-10-06
  配置已迁移至 `.env`，见「命令与配置」更新注记）。
- 新增 `public/.nojekyll`：空文件，防 Jekyll 忽略 `_astro/`。
- 修改 `package.json`（`deploy` 脚本）、`.gitignore`（`.deploy_git/`）、
  `astro.config.ts`（`site`）、`AGENTS.md`（命令与部署说明）。

**不覆盖：**

- GitHub Actions 构建（作者明确不用）。
- 自定义域名的实际绑定操作（仅在 `AGENTS.md` 记录操作路径，见下）。
- 多仓库/多环境部署；dry-run、交互确认、彩色输出等增强。
- Windows 兼容（脚本面向 macOS/Linux）。

## 设计决策（已逐项确认）

### 命令与配置

- `npm run deploy`（bun 同）= `astro build && bash scripts/deploy.sh`。
- `deploy.config.json`（仓库根目录，纳入 git）为配置入口：

  ```json
  {
    "repo": "git@github.com:zingrigger/zingrigger.github.io.git",
    "branch": "main"
  }
  ```

  - 读取优先级：环境变量 `DEPLOY_REPO` / `DEPLOY_BRANCH` > 配置文件（环境变量用于演练或
    临时切换）。
  - 配置文件缺失、字段缺失或为空 → 报错并打印内容示例，不静默兜底；环境变量只做覆盖，
    不能替代配置文件。
  - 用 JSON 而非 YAML：避免引入 YAML 解析依赖（Node 原生解析）。
  - （2026-10-06 更新：配置入口已迁移到 `.env` 的 `DEPLOY_REPO` / `DEPLOY_BRANCH`
    （模板 `.env.example`），`deploy.config.json` 已删除，部署目标不再随仓库提交；
    读取优先级与严格校验规则不变。）
- 提交信息默认 `Site updated: <yyyy-MM-dd HH:mm:ss>`（hexo 同款）；提交身份用本机全局
  git 配置。
- 推送使用 `--force`（hexo 默认行为）。约定：repo-b 是纯产物仓库，不直接在网页端修改。

### 脚本流程（`scripts/deploy.sh`）

1. 脚本经自身路径定位项目根目录（不依赖调用时的 cwd）。
2. 读取配置：用 Node 解析 `.env` 中的 `DEPLOY_REPO` / `DEPLOY_BRANCH`，环境变量可覆盖。
3. 校验 `dist/index.html` 存在，否则报错并提示先 build。
4. 准备 `.deploy_git/`：
   - 不存在 → `git clone <repo> .deploy_git`；空仓库也能克隆；克隆失败（仓库不存在、
     无权限）→ 报错并给出一次性设置指引（见下）。
   - 存在但没有 `.git` → 报错并提示 `rm -rf .deploy_git` 后重跑。
   - 对齐远端：`git fetch --prune origin`；远端已有目标分支 → 本地分支强制对齐远端；
     远端还没有该分支（空仓库/首次推送）→ 从干净起点创建同名分支。
5. 同步：清空 `.deploy_git/` 中除 `.git` 外的全部内容；将 `dist/` 内容整体拷入
   （`cp -R dist/. .deploy_git/`，包含隐藏文件如 `.nojekyll`）。
6. 提交：`git add -A`；无变化 → 打印提示并以 0 退出；有变化 → 以默认信息提交。
7. 推送：`git push --force -u origin <branch>`；成功后打印部署地址与「首次生效约 1 分钟」提示。
- 全程 `set -euo pipefail`，失败即停；脚本幂等、无需交互输入，可随时重跑。

### 源码仓库侧配套改动

- `public/.nojekyll`：Pages 从分支发布时会跑 Jekyll 预处理，以下划线开头的 `_astro/`
  会被忽略、导致样式丢失；空文件 `.nojekyll` 可关闭该处理。
- `astro.config.ts`：`site` 由模板默认值 `https://astro-erudite.vercel.app` 改为
  `https://zingrigger.github.io`（RSS/sitemap/canonical 正确；以后换域名改 `.env`）。
  （2026-10-06 更新：`site` 现从 `.env` 的 `SITE_URL` 读取，见 `.env.example`。）
- `.gitignore`：新增 `.deploy_git/`。
- `package.json`：新增 `"deploy": "astro build && bash scripts/deploy.sh"`。
- `AGENTS.md`：命令表新增 `deploy`；新增「部署」小节（流程简述、`rm -rf .deploy_git`
  重置法、首次一次性设置、自定义域名操作路径）。

### 首次一次性设置（写入 `AGENTS.md`）

1. repo-b 未创建时：在 GitHub 新建空仓库 `zingrigger.github.io`。
2. repo-b Settings → Pages → Deploy from a branch → 分支 `main`、目录 `/ (root)`。
3. 首次部署成功后按需启用 Enforce HTTPS。

### 后续绑定自定义域名（操作路径，不在本次实现）

1. `public/CNAME` 写入域名（如 `xxx.blog`）→ `npm run deploy`。
2. `.env` 的 `SITE_URL` 改为新域名 → `npm run deploy`。
3. Cloudflare 添加 `xxx.blog → zingrigger.github.io` 的 CNAME 记录（证书签发期间建议先
   「仅 DNS」）；repo-b Settings 填写 Custom domain 并启用 HTTPS。
- 原因：部署为全量覆盖，CNAME 必须随源码走；否则 GitHub 设置生成的 `CNAME` 文件会被
  下次部署清掉（hexo 文档有同款说明）。

## 测试与验证

- `bash -n scripts/deploy.sh` 语法检查。
- **干跑**：`git init --bare /tmp/deploy-test.git` 建临时仓库，以
  `DEPLOY_REPO=/tmp/deploy-test.git` 跑完整流程，比对推送内容与 `dist/` 完全一致
  （文件清单 + 抽样比对内容）。
- 构建后确认 `dist/.nojekyll` 存在；若 Astro 未复制 `public/` 下隐藏文件（验证点），
  兜底：在脚本同步后 `touch .deploy_git/.nojekyll`。
- `npm run format:check`、`npm run build` 通过。
- **真机验收**：真实执行 `npm run deploy`；`curl -I` 检查 `https://zingrigger.github.io/`
  与一个 `_astro/` 资源返回 200、页面样式正常；再次执行显示「无变化」。

## 不做的事（YAGNI）

- 不做 GitHub Actions；不做多仓库/多环境；不做 dry-run、交互确认、彩色输出；
  不改用 `gh-pages` 分支（用户站点用 `main`）；不做 Windows 兼容。
