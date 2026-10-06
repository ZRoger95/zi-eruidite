# hexo 式部署实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `zi-eruidite` 增加 `npm run deploy`：本机构建 `dist/`，经 `.deploy_git/` 缓存全量同步并强推到独立的 GitHub Pages 仓库（hexo-deployer-git 同款流程）。

**Architecture:** `npm run deploy` = `astro build && bash scripts/deploy.sh`。脚本读取 `deploy.config.json`（repo/branch），确保 `.deploy_git/` 是目标仓库的缓存克隆且与远端目标分支对齐，清空后全量拷入 `dist/`，以 `Site updated: <时间>` 提交并 `git push --force`。零依赖、无交互、幂等。

**Tech Stack:** Bash（macOS 自带 3.2 即可）、Git、Node ≥ 22.12（仅用于解析 JSON）、Astro 7、GitHub Pages。无新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-06-hexo-style-deploy-design.md`

## Global Constraints

- 默认目标：`git@github.com:zingrigger/zingrigger.github.io.git`，分支 `main`（写入 `deploy.config.json`，可改）。
- 零新增依赖；不用 YAML 或第三方工具；JSON 由 Node 原生解析。
- 平台：macOS/Linux + bash；不做 Windows 兼容。
- 不走 GitHub Actions。
- 配置单一入口 `deploy.config.json`；环境变量 `DEPLOY_REPO` / `DEPLOY_BRANCH` 只做覆盖，**不能**替代配置文件。
- 推送 `--force`；提交信息 `Site updated: <yyyy-MM-dd HH:mm:ss>`；提交身份用本机全局 git 配置。
- 脚本幂等、无交互输入；失败以非 0 退出。
- **安全约定**：除 Task 4 真机验收外，所有验证必须使用 `/tmp` 下的临时 bare 仓库（经 `DEPLOY_REPO` 覆盖），不得接触真实 repo-b。
- `.deploy_git/` 始终保持在 git 忽略中。
- 命令示例用 npm；bun 等价（`bun run ...`，以执行者偏好为准）。
- 格式：Biome（2 空格、80 列、双引号、省略分号）覆盖 JSON/TS；`.sh` 不受 Biome 管理。

## Review Focus

1. 远端在两次部署之间被直接改动（网页/其它工具）→ 下次部署应全量覆盖，远端与本地 `dist/` 完全一致（对齐远端 + `--force`）。测试：Task 1 Step 8。
2. 空仓库/全新分支首次部署 → 应自动创建 `main` 并成功推送。测试：Task 1 Step 6。
3. `dist/` 无变化时重复运行 → 应提示「无变化，跳过提交与推送」、退出码 0、不产生空提交。测试：Task 1 Step 7、Task 4 Step 6。
4. `deploy.config.json` 缺失/字段为空、`dist/` 不存在 → 应明确报错、退出码非 0、绝不误推送。测试：Task 1 Steps 9–10。
5. `.deploy_git/` 被损坏（存在但无 `.git`）→ 应报错并提示 `rm -rf .deploy_git`，不静默重建。测试：Task 1 Step 11。

---

### Task 1: 部署脚本、配置与忽略规则

**Files:**
- Create: `scripts/deploy.sh`
- Create: `deploy.config.json`
- Modify: `.gitignore`（新增 `.deploy_git/`）
- Modify: `package.json`（`scripts` 中新增 `deploy`）
- Test: 无独立测试文件（用 `/tmp` 临时 bare 仓库干跑校验，Steps 6–11）

**Interfaces:**
- Consumes: 无（首个任务）。
- Produces（后续任务/验收依赖的契约）：
  - `npm run deploy`：一条命令完成构建与推送；
  - `deploy.config.json`：`{ "repo": string, "branch": string }`（必需，缺失即报错）；
  - `scripts/deploy.sh`：环境变量 `DEPLOY_REPO` / `DEPLOY_BRANCH` 可覆盖；成功或「无变化」退出码 0，任何失败退出码非 0；
  - 行为：`.deploy_git/` 缓存克隆 → 对齐远端 → 全量覆盖 → `Site updated: <时间>` 提交 → `git push --force -u origin <branch>`。

- [ ] **Step 1: `.gitignore` 新增 `.deploy_git/`**

在 `dist/` 附近新增一行 `.deploy_git/`。

- [ ] **Step 2: 新建 `deploy.config.json`**

```json
{
  "repo": "git@github.com:zingrigger/zingrigger.github.io.git",
  "branch": "main"
}
```

- [ ] **Step 3: `package.json` 的 `scripts` 中新增 deploy 命令**

在 `"preview": "astro preview",` 之后加一行：

```json
"deploy": "astro build && bash scripts/deploy.sh",
```

- [ ] **Step 4: 新建 `scripts/deploy.sh`（按以下内容实现）**

```bash
#!/usr/bin/env bash
# hexo 式部署：把 dist/ 全量同步进 .deploy_git/ 并强推到 Pages 仓库。
set -euo pipefail

# 定位项目根（不依赖调用时的 cwd）
cd "$(dirname "$0")/.."

# ---- 一、读取配置（环境变量只做覆盖，不能替代配置文件） ----
if [ ! -f deploy.config.json ]; then
  echo "错误：找不到 deploy.config.json。示例：" >&2
  echo '  { "repo": "git@github.com:<user>/<user>.github.io.git", "branch": "main" }' >&2
  exit 1
fi

config="$(node -e '
  const fs = require("fs");
  let c;
  try {
    c = JSON.parse(fs.readFileSync("deploy.config.json", "utf8"));
  } catch (e) {
    console.error("错误：deploy.config.json 不是有效的 JSON：" + e.message);
    process.exit(1);
  }
  if (typeof c.repo !== "string" || !c.repo ||
      typeof c.branch !== "string" || !c.branch) {
    console.error("错误：deploy.config.json 需要非空的 repo 与 branch 字段");
    process.exit(1);
  }
  console.log("REPO=" + JSON.stringify(c.repo));
  console.log("BRANCH=" + JSON.stringify(c.branch));
')" || exit 1
eval "$config"

REPO="${DEPLOY_REPO:-$REPO}"
BRANCH="${DEPLOY_BRANCH:-$BRANCH}"

# ---- 二、检查构建产物 ----
if [ ! -f dist/index.html ]; then
  echo "错误：dist/index.html 不存在，请先构建（npm run build）。" >&2
  exit 1
fi

# ---- 三、准备 .deploy_git（缓存克隆）并对齐远端 ----
if [ ! -d .deploy_git ]; then
  echo "==> 克隆 $REPO 到 .deploy_git"
  if ! git clone "$REPO" .deploy_git; then
    echo "错误：克隆失败。请确认仓库已创建且有访问权限；一次性设置：" >&2
    echo "  1) 在 GitHub 新建空仓库（如 <user>.github.io）" >&2
    echo "  2) Settings → Pages → Deploy from a branch → 目标分支 / (root)" >&2
    exit 1
  fi
elif [ ! -d .deploy_git/.git ]; then
  echo "错误：.deploy_git 已存在但不是 git 仓库。请删除后重跑：rm -rf .deploy_git" >&2
  exit 1
fi

git -C .deploy_git remote set-url origin "$REPO"
echo "==> 对齐远端（${BRANCH}）"
git -C .deploy_git fetch origin
if git -C .deploy_git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null; then
  git -C .deploy_git checkout --force -B "$BRANCH" "origin/$BRANCH"
else
  # 空仓库/新分支：把 HEAD 指向尚未出生的目标分支
  git -C .deploy_git symbolic-ref HEAD "refs/heads/$BRANCH"
fi

# ---- 四、同步：清空（保留 .git）后全量拷入 dist/ ----
echo "==> 同步 dist/ 到 .deploy_git/"
find .deploy_git -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R dist/. .deploy_git/

# ---- 五、提交与推送 ----
git -C .deploy_git add -A
if git -C .deploy_git diff --cached --quiet; then
  echo "==> 无变化，跳过提交与推送"
  exit 0
fi

git -C .deploy_git commit -m "Site updated: $(date '+%Y-%m-%d %H:%M:%S')"
echo "==> 推送（force）到 $REPO 的 $BRANCH"
git -C .deploy_git push --force -u origin "$BRANCH"

repo_name="$(basename "$REPO" .git)"
echo "==> 部署完成：${REPO}（${BRANCH}）"
if [[ "$repo_name" == *.github.io ]]; then
  echo "    https://$repo_name/ （首次生效约需 1 分钟）"
fi
```

- [ ] **Step 5: 语法与格式检查**

```bash
bash -n scripts/deploy.sh && npm run format:check
```

期望：`bash -n` 静默、退出码 0；格式检查通过（若 JSON 被 Biome 指出格式问题，运行 `npm run format` 后重试）。

- [ ] **Step 6: 干跑 1——空仓库首次部署（含 npm 入口接线）**

```bash
rm -rf /tmp/deploy-test.git
git init --bare /tmp/deploy-test.git
DEPLOY_REPO=/tmp/deploy-test.git npm run deploy
```

期望：构建成功后脚本输出「部署完成」。随后断言：

```bash
git --git-dir=/tmp/deploy-test.git log -1 --format=%s main
# 期望：Site updated: 2026-10-06 HH:MM:SS 形式
(cd dist && find . -type f | sed 's|^\./||' | sort) > /tmp/dist-files.txt
git --git-dir=/tmp/deploy-test.git ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff /tmp/dist-files.txt /tmp/repo-files.txt && echo "文件清单一致"
git --git-dir=/tmp/deploy-test.git show main:index.html | cmp - dist/index.html && echo "内容抽样一致"
```

- [ ] **Step 7: 干跑 2——重复运行（无变化）**

```bash
DEPLOY_REPO=/tmp/deploy-test.git bash scripts/deploy.sh
# 期望输出：==> 无变化，跳过提交与推送
git --git-dir=/tmp/deploy-test.git rev-list --count main
# 期望：1（没有产生空提交）
```

- [ ] **Step 8: 干跑 3——远端被他人改动后覆盖**

```bash
rm -rf /tmp/deploy-other
git clone /tmp/deploy-test.git /tmp/deploy-other
cd /tmp/deploy-other
echo stray > stray-file.txt
git add stray-file.txt && git commit -m "stray" && git push origin main
cd /Users/rogerz/workspace/zi-eruidite
DEPLOY_REPO=/tmp/deploy-test.git bash scripts/deploy.sh
git --git-dir=/tmp/deploy-test.git ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff /tmp/dist-files.txt /tmp/repo-files.txt && echo "覆盖后仍与 dist 一致"
git --git-dir=/tmp/deploy-test.git ls-tree -r --name-only main | grep -q stray-file.txt && echo "失败：stray 还在" || echo "stray 已被清除"
git --git-dir=/tmp/deploy-test.git rev-list --count main
# 期望：3（c1 首次部署 + c2 他人改动 + c3 本次覆盖提交）
```

- [ ] **Step 9: 错误路径——配置文件缺失 / 字段为空**

```bash
mv deploy.config.json /tmp/deploy.config.json.bak
DEPLOY_REPO=/tmp/deploy-test.git bash scripts/deploy.sh; echo "exit=$?"
# 期望：报错信息包含 deploy.config.json；exit 非 0（即使提供了 DEPLOY_REPO）
cp /tmp/deploy.config.json.bak deploy.config.json
printf '{ "repo": "", "branch": "main" }\n' > deploy.config.json
DEPLOY_REPO=/tmp/deploy-test.git bash scripts/deploy.sh; echo "exit=$?"
# 期望：报错「需要非空的 repo 与 branch 字段」；exit 非 0
mv /tmp/deploy.config.json.bak deploy.config.json
```

- [ ] **Step 10: 错误路径——`dist/` 不存在**

```bash
mv dist /tmp/dist-backup
DEPLOY_REPO=/tmp/deploy-test.git bash scripts/deploy.sh; echo "exit=$?"
# 期望：报错信息包含 dist/index.html 与「先构建」；exit 非 0
mv /tmp/dist-backup dist
```

- [ ] **Step 11: 错误路径——`.deploy_git` 损坏**

```bash
rm -rf .deploy_git
mkdir -p .deploy_git && touch .deploy_git/dummy
DEPLOY_REPO=/tmp/deploy-test.git bash scripts/deploy.sh; echo "exit=$?"
# 期望：报错信息包含 rm -rf .deploy_git；exit 非 0
rm -rf .deploy_git
```

- [ ] **Step 12: 清理临时产物并检查工作区**

```bash
rm -rf /tmp/deploy-test.git /tmp/deploy-other /tmp/dist-files.txt /tmp/repo-files.txt /tmp/deploy.config.json.bak
git status --short
# 期望： M .gitignore、 M package.json、?? deploy.config.json、?? scripts/；无 .deploy_git 残留
```

- [ ] **Step 13: 提交**

```bash
git add .gitignore deploy.config.json package.json scripts/deploy.sh
git commit -m "添加 hexo 式部署脚本与配置"
```

---

### Task 2: 站点配套（`site` 与 `.nojekyll`）

**Files:**
- Create: `public/.nojekyll`（空文件）
- Modify: `astro.config.ts`（`site` 行）

**Interfaces:**
- Consumes: 无（与 Task 1 相互独立）。
- Produces: 构建产物含 `dist/.nojekyll`；站点元数据域名为 `https://zingrigger.github.io`（Task 4 验收依赖）。

- [ ] **Step 1: 创建空文件 `public/.nojekyll`**

```bash
touch public/.nojekyll
```

- [ ] **Step 2: 修改 `astro.config.ts` 的 `site`**

`site: "https://astro-erudite.vercel.app",` → `site: "https://zingrigger.github.io",`

- [ ] **Step 3: 构建**

```bash
npm run build
```

期望：构建成功（exit 0）。

- [ ] **Step 4: 验证 `.nojekyll` 随构建产出**

```bash
test -f dist/.nojekyll && echo ".nojekyll 已随构建产出"
```

期望：输出「.nojekyll 已随构建产出」。若缺失（预期不会发生）：按 spec 兜底，在 `scripts/deploy.sh` 同步步骤后追加 `touch .deploy_git/.nojekyll`，并重跑 Task 1 Step 6 的干跑确认。

- [ ] **Step 5: 验证域名生效**

```bash
grep -o "https://zingrigger.github.io" dist/sitemap-0.xml | head -1
# 期望：有输出
grep -rl "astro-erudite.vercel.app" dist || echo "旧域名已清除"
# 期望：输出「旧域名已清除」
```

- [ ] **Step 6: 格式检查**

```bash
npm run format:check
```

- [ ] **Step 7: 提交**

```bash
git add public/.nojekyll astro.config.ts
git commit -m "配置 Pages 部署：site 改为实际域名并添加 .nojekyll"
```

---

### Task 3: `AGENTS.md` 部署文档

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1/2 的最终行为（文档必须与之完全一致）。
- Produces: 使用说明（首次设置、重置、自定义域名路径）；Task 4 按此操作。

- [ ] **Step 1: 命令列表新增 deploy**

在「构建、测试与本地开发命令」的 Bun 与 npm 两个列表中各加一行，例如：

- `npm run deploy`：hexo 式部署——构建并把 `dist/` 强推到 `deploy.config.json` 指定的 Pages 仓库。

- [ ] **Step 2: 新增「## 部署（hexo 式）」小节**

放在「## 测试与验证指南」之后，必须包含：

- 机制：`npm run deploy` = `astro build` + `scripts/deploy.sh`；`.deploy_git/` 是目标仓库的缓存克隆；每次清空后全量覆盖并以 `git push --force` 推送；提交信息 `Site updated: <时间>`。
- 配置：`deploy.config.json`（`repo` / `branch`）；环境变量 `DEPLOY_REPO` / `DEPLOY_BRANCH` 可临时覆盖；约定 repo-b 为纯产物仓库，不在网页端直接修改。
- 重置：`rm -rf .deploy_git`，下次部署自动重新克隆。
- 首次一次性设置：GitHub 新建空仓库（如 `zingrigger.github.io`）→ 首次部署后到 Settings → Pages → Deploy from a branch → `main` / `(root)` → 启用 HTTPS。
- 后续绑定自定义域名：`public/CNAME` 写入域名并部署；`astro.config.ts` 的 `site` 改为新域名并部署；Cloudflare 添加 `xxx.blog → zingrigger.github.io` 的 CNAME 记录（证书签发期间建议「仅 DNS」）；说明原因（全量覆盖会清掉远端手工修改，CNAME 必须随源码走）。

- [ ] **Step 3: 验证**

通读新增内容（无占位符、与 spec 一致）；`npm run format:check` 通过。

- [ ] **Step 4: 提交**

```bash
git add AGENTS.md
git commit -m "在 AGENTS.md 记录 hexo 式部署流程"
```

---

### Task 4: 真机首次部署与验收（唯一接触真实 repo-b 的任务）

**Files:** 无代码改动（发现问题则修复相应文件并单独提交）。

**Interfaces:**
- Consumes: Task 1–3 的全部产物。
- Produces: 线上站点 `https://zingrigger.github.io/`（无仓库内产物）。

前置条件（由用户在 GitHub 完成）：repo-b `zingrigger.github.io` 已创建（空仓库即可）。

- [ ] **Step 1: 确认访问**

```bash
git ls-remote git@github.com:zingrigger/zingrigger.github.io.git; echo "exit=$?"
# 期望：exit=0（空仓库无输出属正常）
```

若失败：请用户创建空仓库 / 检查 SSH 权限后重试。

- [ ] **Step 2: 首次真实部署**

```bash
npm run deploy
git --git-dir=.deploy_git/.git log -1 --format=%s
# 期望：成功输出；提交信息为 Site updated: ... 形式
```

- [ ] **Step 3: 用户在 GitHub 设置 Pages**

repo-b → Settings → Pages → Deploy from a branch → `main` / `(root)` → Save。

- [ ] **Step 4: 等待生效并检查首页**

等待 1–2 分钟后：

```bash
curl -sI https://zingrigger.github.io/ | head -1
# 期望：HTTP/2 200（未生效则稍候重试；404 超时先检查 Pages 设置）
```

- [ ] **Step 5: 检查静态资源（验证 `.nojekyll` 生效）**

```bash
curl -s https://zingrigger.github.io/ | grep -o '_astro/[^"]*' | head -1
# 取到一条资源路径（如 _astro/xxx.css）后：
curl -sI "https://zingrigger.github.io/<资源路径>" | head -1
# 期望：HTTP/2 200
```

- [ ] **Step 6: 幂等复跑**

```bash
npm run deploy
# 期望：==> 无变化，跳过提交与推送
```

- [ ] **Step 7: （可选）浏览器打开 `https://zingrigger.github.io/`**

检查样式与明暗主题正常。本任务无提交；若期间产生修复，单独提交。
