#!/usr/bin/env bash
# hexo 式部署：把 dist/ 全量同步进 .deploy_git/ 并强推到 Pages 仓库。
set -euo pipefail

# 定位项目根（不依赖调用时的 cwd）
cd "$(dirname "$0")/.."

# ---- 一、读取配置（.env 为配置入口；环境变量只做覆盖，不能替代 .env） ----
if [ ! -f .env ]; then
  echo "错误：找不到 .env。请先复制模板并填写：" >&2
  echo "  cp .env.example .env" >&2
  echo "示例（.env）：" >&2
  echo "  DEPLOY_REPO=git@github.com:<user>/<user>.github.io.git" >&2
  echo "  DEPLOY_BRANCH=main" >&2
  exit 1
fi

config="$(node -e '
  // 读取优先级：真实环境变量 > .env（暂存环境变量，先校验 .env 自身值，再应用覆盖）
  const envRepo = process.env.DEPLOY_REPO;
  const envBranch = process.env.DEPLOY_BRANCH;
  delete process.env.DEPLOY_REPO;
  delete process.env.DEPLOY_BRANCH;
  try {
    process.loadEnvFile(".env");
  } catch (e) {
    console.error("错误：.env 解析失败：" + e.message);
    process.exit(1);
  }
  const fileRepo = process.env.DEPLOY_REPO;
  const fileBranch = process.env.DEPLOY_BRANCH;
  const example = () => {
    console.error("示例（.env）：");
    console.error("  DEPLOY_REPO=git@github.com:<user>/<user>.github.io.git");
    console.error("  DEPLOY_BRANCH=main");
  };
  if (typeof fileRepo !== "string" || !fileRepo ||
      typeof fileBranch !== "string" || !fileBranch) {
    console.error("错误：.env 需要非空的 DEPLOY_REPO 与 DEPLOY_BRANCH");
    example();
    process.exit(1);
  }
  if (/[\t\n\r]/.test(fileRepo) || /[\t\n\r]/.test(fileBranch)) {
    console.error("错误：DEPLOY_REPO 与 DEPLOY_BRANCH 不能包含制表符或换行");
    process.exit(1);
  }
  console.log((envRepo ? envRepo : fileRepo) + "\t" + (envBranch ? envBranch : fileBranch));
')" || exit 1
IFS=$'\t' read -r REPO BRANCH <<<"$config"
if [ -z "$REPO" ] || [ -z "$BRANCH" ]; then
  echo "错误：.env 需要非空的 DEPLOY_REPO 与 DEPLOY_BRANCH" >&2
  exit 1
fi

# ---- 二、检查构建产物 ----
if [ ! -f dist/index.html ]; then
  echo "错误：dist/index.html 不存在，请先构建（npm run build）。" >&2
  exit 1
fi

# ---- 三、准备 .deploy_git（缓存克隆）并对齐远端 ----
if [ -e .deploy_git ] && [ ! -d .deploy_git ]; then
  echo "错误：.deploy_git 已存在且不是目录（疑似残留同名文件）。请删除后重跑：rm -rf .deploy_git" >&2
  exit 1
elif [ ! -d .deploy_git ]; then
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
git -C .deploy_git fetch --prune origin
if git -C .deploy_git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null; then
  git -C .deploy_git checkout --force -B "$BRANCH" "origin/$BRANCH"
else
  # 空仓库/新分支：清除同名旧分支引用，把 HEAD 指向干净的未出生分支
  git -C .deploy_git update-ref -d "refs/heads/$BRANCH" 2>/dev/null || true
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
