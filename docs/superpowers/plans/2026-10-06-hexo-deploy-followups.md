# hexo 式部署遗留小项修复计划（Follow-ups）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 hexo 式部署首版复查中记录、当时未修（deferred）的 3 条小项：① `eval` 对配置值二次求值；② `.deploy_git` 为普通文件时错误提示误导；③ 测试脚手架加固并入库（trap、失败路径、竞态）。

**Architecture:** 改动限于 `scripts/deploy.sh`（配置读取段与 `.deploy_git` 准备段）与新增归档的干跑测试脚手架 `scripts/tests/deploy-check.sh`；行为语义不变（spec 不改，仅消除隐患、修正错误提示、补测试）。

**Tech Stack:** Bash 3.2（macOS 自带）、Git、Node（仅解析 JSON）；无新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-06-hexo-style-deploy-design.md`（行为基准，本计划不修改它）

**背景与状态：** 首版实现见 `docs/superpowers/plans/2026-10-06-hexo-style-deploy.md`（其脚本块为历史记录，含旧的 `eval` 写法，请勿照抄）。独立复查（2026-10-06，基线 `89de1bc`）结论为 "With fixes"：两项 Important 已修复；本计划处理当时登记的 3 条 deferred minors（原评审编号 #2/#3/#5）：

1. `eval "$config"` 会把配置值当 shell 代码二次求值（基线 `scripts/deploy.sh` 配置读取段，约 15–35 行）；
2. `.deploy_git` 为普通文件时走 clone 分支并误报「克隆失败」（基线约 44–64 行）；
3. 测试脚手架缺 `trap` 恢复、clone/fetch 失败与 push 竞态覆盖；脚手架为流程临时物已被删除，本计划将其重建并入库。

状态：待执行。

## Global Constraints

- macOS `/bin/bash` 3.2：变量名后紧跟多字节字符一律写 `${VAR}`（本仓库已复现的坑）；不用 bash 4 特性；`<<<` 与 `$'\t'` 可用。
- 零新依赖；不改 `deploy.config.json` 字段结构、CLI 与环境变量接口；既有用户可见消息关键词（「无变化，跳过提交与推送」「Site updated:」「rm -rf .deploy_git」）不得变更。
- 所有验证使用 `/tmp` 下临时 bare 仓库（经 `DEPLOY_REPO` 覆盖），不得触碰真实 repo-b；脚手架必须可重复运行、异常退出可恢复（`trap` 兜底）。
- 本仓库无测试框架；验证 = `bash scripts/tests/deploy-check.sh`（本计划交付）+ `npm run format:check` + `npm run build`。

## Review Focus

1. 配置值含 `$`、反引号、分号、制表符或换行 → 必须原样处理或明确报错，**绝不执行**。测试：Task 1 Step 3「注入安全」用例 + Task 2。
2. `.deploy_git` 的三种残留形态（同名普通文件 / 目录但无 `.git` / 正常缓存）→ 各自正确处置，报错指向正确的修复动作。测试：Task 1 Step 3「同名文件」用例 + Task 3。
3. push 前远端被外部推进（竞态）→ `--force` 仍成功、远端最终等于 `dist`。测试：Task 1 Step 3「竞态 force」用例。

---

### Task 1: 重建并加固测试脚手架（入库）

**Files:**
- Create: `scripts/tests/deploy-check.sh`
- Modify: `AGENTS.md`（「测试与验证指南」小节追加一句）
- Test: 即本任务交付物

**Interfaces:**
- Consumes: `scripts/deploy.sh` 与 `npm run deploy`（Task 2/3 将修改前者；脚手架必须先在修改前复现问题）。
- Produces: `bash scripts/tests/deploy-check.sh` —— 正常运行时应输出 17 条 `PASS …` 与末行 `ALL DEPLOY CHECKS PASSED`（以 0 退出）；任一断言失败输出 `FAIL …` 并以非 0 退出；Task 2/3 用它作为 RED→GREEN 测试。

- [ ] **Step 1: 按附录 A 重建基线脚手架**

创建 `scripts/tests/deploy-check.sh`，内容为附录 A 的清单（12 用例；原文件来自已被删除的流程工作区，附录是完整重建），仅将末行输出改为 `ALL DEPLOY CHECKS PASSED`。

- [ ] **Step 2: 应用加固修改**

修改 1 —— 变量区（`NEW=/tmp/deploy-test-b.git` 之后）追加两行：

```bash
RACE=/tmp/deploy-race.git
OTHER2=/tmp/deploy-other2
```

修改 2 —— 「准备」段的清理行追加 `"$RACE" "$OTHER2"`（与 `"$TMP" "$OTHER" "$NEW"` 并列）。

修改 3 —— `pass/fail` 函数定义之后追加 `trap` 兜底：

```bash
cleanup_restore() {
  if [ -f /tmp/deploy.config.json.bak ]; then
    mv -f /tmp/deploy.config.json.bak deploy.config.json
  fi
  if [ -f /tmp/deploy.config.json.keep ]; then
    mv -f /tmp/deploy.config.json.keep deploy.config.json
  fi
  rm -f /tmp/deploy-injection-proof .deploy_git/.git/hooks/pre-push
}
trap cleanup_restore EXIT
```

修改 4 —— 在「换仓库」用例之后、「错误路径：配置缺失」之前，按下列顺序插入 5 个新用例（完整代码见 Step 3）。顺序有讲究：「注入安全」最先（当前代码 RED，Task 2 修复）；「同名文件」次之（Task 3 修复）；其余三项当前行为即通过。

- [ ] **Step 3: 插入的新用例（完整代码）**

```bash
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

# ---------- 竞态：push 前远端被外部推进，--force 仍须成功 ----------
rm -rf "$RACE" "$OTHER2"
git init -q --bare "$RACE"
git clone -q "$RACE" "$OTHER2"
(
  cd "$OTHER2"
  git symbolic-ref HEAD refs/heads/main
  printf 'race-seed\n' > race-seed.txt
  git add race-seed.txt && git commit -qm "race seed" && git push -q -u origin main
  printf 'race\n' > race.txt
  git add race.txt && git commit -qm "race head" # 不推送：留给 pre-push 钩子推送
)
cat > .deploy_git/.git/hooks/pre-push <<HOOK
#!/usr/bin/env bash
git -C "$OTHER2" push -q origin main || true
HOOK
chmod +x .deploy_git/.git/hooks/pre-push
DEPLOY_REPO="$RACE" bash scripts/deploy.sh >/dev/null
rm -f .deploy_git/.git/hooks/pre-push
git --git-dir="$RACE" ls-tree -r --name-only main | sort > /tmp/repo-files.txt
diff -u /tmp/dist-files.txt /tmp/repo-files.txt || fail "竞态覆盖后与 dist 不一致"
git --git-dir="$RACE" ls-tree -r --name-only main | grep -q race.txt \
  && fail "竞态提交未被 --force 覆盖" || true
pass "竞态下 --force 仍成功且远端等于 dist"
```

注意：竞态用例依赖 `.deploy_git` 已存在（前序用例已创建）；它会经 `DEPLOY_REPO` 覆盖切到 `$RACE`，不触碰其他临时仓库。

- [ ] **Step 4: 观察 RED（分阶段推进）**

```bash
bash scripts/tests/deploy-check.sh
```

期望：运行至「注入安全」用例 FAIL（RED，Task 2 的目标问题）后退出。Task 2 修复后重跑，失败点推进到「同名文件」（RED，Task 3 的目标问题）；Task 3 修复后全绿——这是本计划三条任务的 RED→GREEN 链条，不要跳步。

- [ ] **Step 5: 语法与格式检查**

```bash
bash -n scripts/tests/deploy-check.sh && npm run format:check
```

- [ ] **Step 6: 更新 `AGENTS.md`**

在「测试与验证指南」小节末尾追加一句（说明存在干跑校验及其边界）：

> 部署脚本另有干跑校验：`bash scripts/tests/deploy-check.sh` —— 在 `/tmp` 临时 bare 仓库上覆盖全流程与错误路径（不触碰真实 Pages 仓库），运行前需已安装依赖。

- [ ] **Step 7: 提交**

```bash
git add scripts/tests/deploy-check.sh AGENTS.md
git commit -m "恢复并加固部署测试脚手架（入库）"
```

---

### Task 2: 去除 `eval` 二次求值（安全读取配置）

**Files:**
- Modify: `scripts/deploy.sh`（配置读取段）
- Test: `scripts/tests/deploy-check.sh`「注入安全」用例

**Interfaces:**
- Consumes: Task 1 的脚手架。
- Produces: 配置读取不再使用 `eval`；`REPO`/`BRANCH` 由 Node 以制表符分隔输出、bash 侧 `IFS=$'\t' read` 读取；文件缺失/非法 JSON/空字段的报错与退出码保持不变（仍含配置示例）。

- [ ] **Step 1: 确认 RED**

```bash
bash scripts/tests/deploy-check.sh
```

期望：FAIL 于「配置值被当作命令执行（eval 注入）」。

- [ ] **Step 2: 修改 `scripts/deploy.sh` 的配置读取段**

将 `config="$(node -e '…')" || exit 1` 与 `eval "$config"` 一段替换为（Node 校验保留原文案并在末尾追加制表符/换行校验；bash 侧不再 eval）：

```bash
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
    console.error("示例：{ \"repo\": \"git@github.com:<user>/<user>.github.io.git\", \"branch\": \"main\" }");
    process.exit(1);
  }
  if (/[\t\n\r]/.test(c.repo) || /[\t\n\r]/.test(c.branch)) {
    console.error("错误：repo 与 branch 不能包含制表符或换行");
    process.exit(1);
  }
  console.log(c.repo + "\t" + c.branch);
')" || exit 1
IFS=$'\t' read -r REPO BRANCH <<<"$config"
if [ -z "$REPO" ] || [ -z "$BRANCH" ]; then
  echo "错误：deploy.config.json 需要非空的 repo 与 branch 字段" >&2
  exit 1
fi
```

- [ ] **Step 3: GREEN 与推进**

```bash
bash -n scripts/deploy.sh && bash scripts/tests/deploy-check.sh
```

期望：「注入安全」PASS；失败点推进到「同名文件」（RED，属 Task 3）。

- [ ] **Step 4: 提交**

```bash
git add scripts/deploy.sh
git commit -m "部署脚本：去除 eval 二次求值（安全读取配置）"
```

---

### Task 3: `.deploy_git` 为普通文件时给出正确报错

**Files:**
- Modify: `scripts/deploy.sh`（`.deploy_git` 准备段）
- Test: `scripts/tests/deploy-check.sh`「同名文件」用例

**Interfaces:**
- Consumes: Task 1 的脚手架。
- Produces: `.deploy_git` 为普通文件时，报错包含 `rm -rf .deploy_git` 且不再出现「克隆失败」；目录无 `.git` 的既有报错不变。

- [ ] **Step 1: 确认 RED**

```bash
bash scripts/tests/deploy-check.sh
```

期望：FAIL 于「.deploy_git 为普通文件时错误提示正确」。

- [ ] **Step 2: 修改准备段**

在 `if [ ! -d .deploy_git ]; then …` 之前插入同名文件分支（其余分支与文案保持原样）：

```bash
if [ -e .deploy_git ] && [ ! -d .deploy_git ]; then
  echo "错误：.deploy_git 已存在且不是目录（疑似残留同名文件）。请删除后重跑：rm -rf .deploy_git" >&2
  exit 1
elif [ ! -d .deploy_git ]; then
  # …原有 clone 分支…
elif [ ! -d .deploy_git/.git ]; then
  # …原有「存在但不是 git 仓库」分支…
fi
```

- [ ] **Step 3: 全量 GREEN**

```bash
bash scripts/tests/deploy-check.sh && npm run format:check && npm run build >/dev/null
```

期望：17 条 PASS 与末行 `ALL DEPLOY CHECKS PASSED`。

- [ ] **Step 4: 提交**

```bash
git add scripts/deploy.sh
git commit -m "部署脚本：.deploy_git 为普通文件时给出正确报错"
```

---

## 附录 A：脚手架基线（Task 1 Step 1 重建用；仅将末行输出改为 `ALL DEPLOY CHECKS PASSED`）

```bash
#!/usr/bin/env bash
# 部署脚本干跑校验（端到端）：不触碰真实仓库，全部在 /tmp 临时 bare 仓库上进行。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
TMP=/tmp/deploy-test.git
OTHER=/tmp/deploy-other
NEW=/tmp/deploy-test-b.git

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

# ---------- 准备 ----------
rm -rf "$TMP" "$OTHER" "$NEW" .deploy_git /tmp/dist-files.txt /tmp/repo-files.txt /tmp/err.log
git init -q --bare "$TMP"
pass "临时 bare 仓库已创建"

# ---------- 空仓库首次部署（npm 入口接线） ----------
DEPLOY_REPO="$TMP" npm run deploy
git --git-dir="$TMP" log -1 --format=%s main \
  | grep -Eq '^Site updated: [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' \
  || fail "提交信息格式不符"
pass "首次部署提交信息格式正确"

(cd dist && find . -type f | sed 's|^\./||' | sort) > /tmp/dist-files.txt
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
rm -rf "$TMP" "$OTHER" "$NEW" .deploy_git /tmp/dist-files.txt /tmp/repo-files.txt \
  /tmp/err.log /tmp/deploy.config.json.bak /tmp/dist-backup
pass "临时产物已清理"
echo "ALL DEPLOY CHECKS PASSED"
```
