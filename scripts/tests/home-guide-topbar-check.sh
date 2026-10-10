#!/usr/bin/env bash
# 首页 topbar 参考线网格回归：临时写受控 .env 后构建，再对 dist/index.html 断言标记元素与内容骨架。
# 自动断言只覆盖「标记前缀 + 文本存在」；像素级对齐/明暗/滚动条由人工视觉核对（见计划 Review Focus）。
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
assert_has() { # $1=文件 $2=片段 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言包含}（缺少 ${1}）"
  grep -qF -- "${2}" "${1}" || fail "${3:-断言包含}（${1} 未找到 ${2}）"
  pass "${3:-${1} 包含 ${2}}"
}

# 受控 .env：备份 → 仅写 SITE_URL → 退出时恢复原文件
ENV_KEEP=/tmp/home-guide-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi
cleanup_restore() {
  if [ -f "$ENV_KEEP" ]; then mv -f "$ENV_KEEP" .env; else rm -f .env; fi
}
trap cleanup_restore EXIT

printf 'SITE_URL=https://example.com\n' > .env
npm run build

# ---------- Task 1：垂直参考线框架 ----------
assert_has dist/index.html '<home-rails' "首页渲染 home-rails 元素"

# ---------- Task 2：全出血水平线与菱形节点 ----------
assert_has dist/index.html '<home-rule' "首页渲染 home-rule 边界线"
assert_has dist/index.html '你好，我是' "hero 文案仍在（内容骨架不变）"
assert_has dist/index.html '最新文章' "最新文章区块仍在"

# ---------- Task 3：hero 文本内联渲染（换皮为呈现层，视觉核对覆盖） ----------
assert_has dist/index.html '你好，我是 astro-erudite' "hero 标题问候 + 站名内联渲染"

# ---------- Task 4：sidebar 默认下内容骨架完整、i18n 未回归 ----------
assert_has dist/index.html 'href="/en/"' "首页语言切换器仍在（未误伤 i18n）"
assert_has dist/index.html 'data-layout="sidebar"' "默认产物为 sidebar 布局（零回归基线）"
