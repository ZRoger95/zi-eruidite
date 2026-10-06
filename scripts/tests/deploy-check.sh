#!/usr/bin/env bash
# 部署脚本干跑校验（端到端）：不触碰真实仓库，全部在 /tmp 临时 bare 仓库上进行。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
TMP=/tmp/deploy-test.git
OTHER=/tmp/deploy-other
NEW=/tmp/deploy-test-b.git
RACE=/tmp/deploy-race.git
OTHER2=/tmp/deploy-other2

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

cleanup_restore() {
  if [ -f /tmp/deploy.config.json.bak ]; then
    mv -f /tmp/deploy.config.json.bak deploy.config.json
  fi
  if [ -f /tmp/deploy.config.json.keep ]; then
    mv -f /tmp/deploy.config.json.keep deploy.config.json
  fi
  rm -f /tmp/deploy-injection-proof /tmp/deploy-race-hook-proof .deploy_git/.git/hooks/post-commit
}
trap cleanup_restore EXIT

# ---------- 准备 ----------
rm -rf "$TMP" "$OTHER" "$NEW" "$RACE" "$OTHER2" .deploy_git /tmp/dist-files.txt /tmp/repo-files.txt /tmp/err.log
git init -q --bare "$TMP"
pass "临时 bare 仓库已创建"

# ---------- 空仓库首次部署（npm 入口接线） ----------
DEPLOY_REPO="$TMP" npm run deploy
git --git-dir="$TMP" log -1 --format=%s main \
  | grep -Eq '^Site updated: [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' \
  || fail "提交信息格式不符"
pass "首次部署提交信息格式正确"

(cd dist && find . -type f | sed 's|^\./||' | sort) > /tmp/dist-files.txt
[ -f dist/.nojekyll ] || fail "dist 缺少 .nojekyll（Astro 未复制 public/ 隐藏文件；Pages 将忽略 _astro/ 导致站点失样式）"
git --git-dir="$TMP" ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff -u /tmp/dist-files.txt /tmp/repo-files.txt || fail "远端文件清单与 dist 不一致"
pass "远端文件清单与 dist 一致"

git --git-dir="$TMP" show main:index.html | cmp - dist/index.html \
  || fail "index.html 内容不一致"
pass "内容抽样一致"

# ---------- 重复运行：无变化 ----------
out="$(DEPLOY_REPO="$TMP" bash scripts/deploy.sh)"
printf '%s' "$out" | grep -q "无变化，跳过提交与推送" || fail "缺少「无变化」提示"
[ "$(git --git-dir="$TMP" rev-list --count main)" = "1" ] || fail "无变化时不应产生新提交"
pass "重复运行提示无变化且未新增提交"

# ---------- 远端被他人改动后覆盖 ----------
git clone -q --branch main "$TMP" "$OTHER"
(
  cd "$OTHER"
  printf 'stray\n' > stray-file.txt
  git add stray-file.txt
  git commit -qm stray
  git push -q origin main
)
DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/dev/null
git --git-dir="$TMP" ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff -u /tmp/dist-files.txt /tmp/repo-files.txt || fail "覆盖后与 dist 不一致"
git --git-dir="$TMP" ls-tree -r --name-only main | grep -q stray-file.txt \
  && fail "stray 未被清除" || true
[ "$(git --git-dir="$TMP" rev-list --count main)" = "3" ] || fail "覆盖后提交计数不为 3"
pass "远端改动被全量覆盖（stray 已清除，树与 dist 一致）"

# ---------- 换仓库：切换到新的空 bare 仓库，须从干净起点开始 ----------
git init -q --bare "$NEW"
DEPLOY_REPO="$NEW" bash scripts/deploy.sh >/dev/null
[ "$(git --git-dir="$NEW" rev-list --count main)" = "1" ] \
  || fail "换仓库后历史未从干净起点开始（应为 1 个根提交）"
git --git-dir="$NEW" ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff -u /tmp/dist-files.txt /tmp/repo-files.txt || fail "换仓库后内容不一致"
pass "换仓库后从干净起点部署（单根提交、树与 dist 一致）"

# ---------- 安全：配置值不得被当作命令执行 ----------
cp deploy.config.json /tmp/deploy.config.json.keep
printf '{ "repo": "$(touch /tmp/deploy-injection-proof)", "branch": "main" }\n' > deploy.config.json
DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1 || true
mv -f /tmp/deploy.config.json.keep deploy.config.json
if [ -e /tmp/deploy-injection-proof ]; then
  rm -f /tmp/deploy-injection-proof
  fail "配置值被当作命令执行（eval 注入）"
fi
pass "配置值不会被求值为命令（无 eval 注入）"

# ---------- 错误路径：.deploy_git 为普通文件 ----------
rm -rf .deploy_git
touch .deploy_git
if DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  rm -f .deploy_git
  fail ".deploy_git 为普通文件时应报错"
fi
rm -f .deploy_git
grep -q "rm -rf .deploy_git" /tmp/err.log || fail "同名文件时未给出删除指引"
if grep -q "克隆失败" /tmp/err.log; then
  fail "同名文件被误报为克隆失败"
fi
pass ".deploy_git 为普通文件时错误提示正确"

# ---------- 错误路径：仓库不可访问（clone 失败） ----------
rm -rf .deploy_git
if DEPLOY_REPO="/nonexistent/deploy-repo.git" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  fail "clone 失败时应报错"
fi
grep -q "克隆失败" /tmp/err.log || fail "clone 失败提示缺失"
pass "clone 失败错误路径正确"

# ---------- 错误路径：配置不是有效 JSON ----------
cp deploy.config.json /tmp/deploy.config.json.keep
printf '{ not json' > deploy.config.json
if DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  mv -f /tmp/deploy.config.json.keep deploy.config.json
  fail "非法 JSON 应报错"
fi
mv -f /tmp/deploy.config.json.keep deploy.config.json
grep -q "JSON" /tmp/err.log || fail "非法 JSON 提示缺失"
pass "非法 JSON 错误路径正确"

# ---------- 竞态：外部推进落在 fetch 之后、push 之前 → 非 fast-forward 的强制推送仍须成功 ----------
rm -rf "$RACE" "$OTHER2"
git init -q --bare "$RACE"
git clone -q "$RACE" "$OTHER2"
(
  cd "$OTHER2"
  git symbolic-ref HEAD refs/heads/main
  printf 'race-seed\n' > race-seed.txt
  git add race-seed.txt && git commit -qm "race seed" && git push -q -u origin main
  printf 'race\n' > race.txt
  git add race.txt && git commit -qm "race head" # 不推送：由 post-commit 钩子（deploy fetch 之后、push 之前）推送
)
# 自包含准备：前序用例已删除 .deploy_git，这里从 $RACE 重新克隆（main=race-seed）
rm -rf .deploy_git
git clone -q --branch main "$RACE" .deploy_git
rm -f /tmp/deploy-race-hook-proof
cat > .deploy_git/.git/hooks/post-commit <<HOOK
#!/usr/bin/env bash
git -C "$OTHER2" push -q origin main && touch /tmp/deploy-race-hook-proof
HOOK
chmod +x .deploy_git/.git/hooks/post-commit
DEPLOY_REPO="$RACE" bash scripts/deploy.sh >/dev/null
[ -e /tmp/deploy-race-hook-proof ] || fail "竞态外部推进未发生（post-commit 钩子未触发或推送失败——用例静默退化）"
rm -f .deploy_git/.git/hooks/post-commit
git --git-dir="$RACE" ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff -u /tmp/dist-files.txt /tmp/repo-files.txt || fail "竞态覆盖后与 dist 不一致"
git --git-dir="$RACE" ls-tree -r --name-only main | grep -q race.txt \
  && fail "竞态提交未被 --force 覆盖" || true
pass "竞态下 --force 仍成功且远端等于 dist"

# ---------- 错误路径：配置缺失 ----------
rm -f /tmp/deploy.config.json.bak
mv deploy.config.json /tmp/deploy.config.json.bak
if DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  mv -f /tmp/deploy.config.json.bak deploy.config.json
  fail "配置缺失时应报错"
fi
cp /tmp/deploy.config.json.bak deploy.config.json
grep -q "deploy.config.json" /tmp/err.log || fail "错误信息未提及配置文件"
pass "配置缺失错误路径正确"

# ---------- 错误路径：字段为空 ----------
printf '{ "repo": "", "branch": "main" }\n' > deploy.config.json
if DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  mv -f /tmp/deploy.config.json.bak deploy.config.json
  fail "字段为空时应报错"
fi
mv -f /tmp/deploy.config.json.bak deploy.config.json
grep -q "非空" /tmp/err.log || fail "错误信息未说明字段要求"
grep -q "示例" /tmp/err.log || fail "字段错误信息未附配置示例"
pass "字段为空错误路径正确（含示例）"

# ---------- 错误路径：dist 缺失 ----------
rm -rf /tmp/dist-backup
mv dist /tmp/dist-backup
if DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  mv /tmp/dist-backup dist
  fail "dist 缺失时应报错"
fi
mv /tmp/dist-backup dist
grep -q "dist/index.html" /tmp/err.log || fail "错误信息未提及 dist/index.html"
pass "dist 缺失错误路径正确"

# ---------- 错误路径：.deploy_git 损坏 ----------
rm -rf .deploy_git
mkdir -p .deploy_git
touch .deploy_git/dummy
if DEPLOY_REPO="$TMP" bash scripts/deploy.sh >/tmp/err.log 2>&1; then
  rm -rf .deploy_git
  fail ".deploy_git 损坏时应报错"
fi
rm -rf .deploy_git
grep -q "rm -rf .deploy_git" /tmp/err.log || fail "错误信息未给出重置提示"
pass ".deploy_git 损坏错误路径正确"

# ---------- 清理 ----------
rm -rf "$TMP" "$OTHER" "$NEW" "$RACE" "$OTHER2" .deploy_git /tmp/dist-files.txt /tmp/repo-files.txt \
  /tmp/err.log /tmp/deploy.config.json.bak /tmp/dist-backup
pass "临时产物已清理"
echo "ALL DEPLOY CHECKS PASSED"
