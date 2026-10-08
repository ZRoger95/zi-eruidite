#!/usr/bin/env bash
# 布局切换回归校验：默认构建断言统一骨架（page-shell/site-bar）与根元素模式属性、
# 旧选择器名清除；再翻转 SITE.layout 默认值验证构建期无分支（仅属性跟随）。
# 本脚本先于实现建立基线（实现前 FAIL），后续任务在同一文件追加切换按钮/防闪烁断言。
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

assert_match() { # $1=文件 $2=正则 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言匹配}（缺少 ${1}）"
  grep -qE -- "${2}" "${1}" || fail "${3:-断言匹配}（${1} 未匹配 ${2}）"
  pass "${3:-${1} 匹配 ${2}}"
}

assert_dir_lacks() { # $1=目录 $2=片段 [$3=说明]
  if grep -rqF -- "${2}" "${1}"; then
    fail "${3:-断言目录不包含}（${1} 出现 ${2}）"
  fi
  pass "${3:-${1} 不含 ${2}}"
}

assert_tag_cleared() { # $1=目录 $2=元素名 [$3=说明]
  # 元素名不得以渲染标记或打包资源形式残留；
  # introducing-v2 正文示例代码本身含旧版标记文本（历史文章，不随实现更名），排除该页。
  local hits
  hits=$(
    grep -rlE --include='*.html' -- "<${2}[ />]|</${2}[ >]" "${1}" |
      grep -v 'introducing-v2/index.html' || true
  )
  if [ -n "${hits}" ]; then
    fail "${3:-旧名已清除（${2}）}（${hits} 标记中出现 <${2}>）"
  fi
  if grep -rqF -- "${2}" "${1}/_astro"; then
    fail "${3:-旧名已清除（${2}）}（${1} 打包资源中出现 ${2}）"
  fi
  pass "${3:-${1} 不含 ${2}}"
}

default=$(grep -oE 'layout: "[a-z]+"' src/consts.ts | head -1 | sed -E 's/.*"(.*)"/\1/')
[ -n "${default}" ] || fail "无法从 src/consts.ts 解析 layout 默认值"

# 备份 consts.ts（trap 恢复；脚本中途失败也不留改动）
CONSTS_KEEP=/tmp/layout-check.consts.keep
cp src/consts.ts "${CONSTS_KEEP}"
restore_consts() {
  if [ -f "${CONSTS_KEEP}" ]; then
    cp -f "${CONSTS_KEEP}" src/consts.ts
    rm -f "${CONSTS_KEEP}"
  fi
}
trap restore_consts EXIT

npm run build

# ---------- 默认构建：根元素模式属性 + 统一骨架 ----------
assert_match dist/index.html "<html[^>]*data-layout=\"${default}\"" "根元素输出默认布局属性"
assert_has  dist/index.html '<page-shell' "统一骨架 page-shell"
assert_has  dist/index.html '<site-bar'   "统一骨架 site-bar"
assert_has  dist/index.html '<page-scroll' "统一骨架 page-scroll"
assert_match dist/index.html '<main[^>]*id="main-content"[^>]*tabindex="-1"' "main 可聚焦（skip-link 目标）"
# 旧名清除：page-grid / page-header / page-content 在 introducing-v2 正文示例代码中出现文本，
# 故对这三个词做标记/打包资源层面的结构性断言；其余旧名全 dist 不得出现。
for old in page-grid page-header page-content; do
  assert_tag_cleared dist "${old}" "旧名已清除（${old}）"
done
for old in page-content-topbar topbar-article topbar-inner topbar-brand topbar-actions sidebar-inner sidebar-toggle data-topbar; do
  assert_dir_lacks dist "${old}" "旧名已清除（${old}）"
done
# PostChain 单 DOM：文章元素带中性 data-article，旧构建期标记清除
assert_has dist/blog/welcome/index.html 'data-article' "文章元素带中性 data-article"
assert_match dist/blog/welcome/index.html '<article[^>]*data-article' "文章元素带中性 data-article（靶向）"
assert_has dist/en/blog/v1-posts/index.html 'untranslated-section' "未翻译占位标记存在"
assert_dir_lacks dist 'data-article-topbar' "旧属性名已清除（data-article-topbar）"
# 运行时机制：防闪烁脚本 + 切换按钮 + 双语文案
# 防闪烁断言用头部内联完整语句（is:inline 保留空格）；点击脚本为压缩形态
# （localStorage.layout=t），不会误命中。
assert_has dist/index.html 'const layout = localStorage.layout' "防闪烁脚本存在（头部内联语句）"
assert_has dist/index.html 'id="layout-toggle"' "切换按钮存在"
assert_has dist/index.html 'aria-label="切换布局"' "中文按钮文案"
assert_has dist/en/index.html 'aria-label="Toggle layout"' "英文按钮文案"
# 顶栏隐藏面包屑：非分区回退项（404）带 data-crumb 标记 + 作用域隐藏规则存在
# 规则前缀须锁 :root[data-layout=topbar]，防止误改全局导致侧栏面包屑一并消失。
assert_has dist/404.html 'data-crumb' "404 面包屑带 data-crumb 标记"
if grep -rqE -- ':root\[data-layout=topbar\][^{}]*\[data-crumb\][^{}]*\{display:none' dist/_astro; then
  pass "顶栏作用域 [data-crumb] 隐藏规则存在"
else
  fail "顶栏作用域 [data-crumb] 隐藏规则缺失（须以 :root[data-layout=topbar] 作用域化）"
fi
# 容器模式 CSS 产物（topbar ≥64rem 内容区独立滚动）：
# page-scroll 默认 contents + 容器激活（grid 滚动规则）+ 短页不拉伸 + gutter 迁移
if grep -rqE -- 'page-scroll[^{}]*\{[^{}]*display:contents' dist/_astro/*.css &&
   grep -rqE -- 'page-scroll[^{}]*\{[^{}]*overflow-y:auto' dist/_astro/*.css &&
   grep -rqF -- 'align-content:start' dist/_astro/*.css &&
   grep -rqF -- 'scrollbar-gutter:stable' dist/_astro/*.css &&
   grep -rqF -- 'scrollbar-gutter:auto' dist/_astro/*.css; then
  pass "容器模式 CSS 产物齐备"
else
  fail "容器模式 CSS 产物缺失（page-scroll contents/滚动/短页不拉伸 或 gutter 迁移）"
fi
# 对齐校准（--scrollbar-width）：CSS 补偿引用 + JS 写入（Layout 首帧测量/scroll.ts）
grep -rqF -- '--scrollbar-width' dist/_astro/*.css || fail "CSS 缺少 --scrollbar-width 补偿引用"
grep -rqF -- '--scrollbar-width' dist/_astro/*.js  || fail "JS 缺少 --scrollbar-width 写入"
pass "--scrollbar-width 校准机制存在"

# ---------- 翻转默认值：同一骨架，仅属性跟随（构建期无分支） ----------
other=$([ "${default}" = sidebar ] && echo topbar || echo sidebar)
sed -i.bak "s/layout: \"${default}\"/layout: \"${other}\"/" src/consts.ts && rm -f src/consts.ts.bak
npm run build
assert_match dist/index.html "<html[^>]*data-layout=\"${other}\"" "翻转默认值后属性跟随"
assert_has  dist/index.html '<page-shell' "翻转默认值后同骨架（仅属性不同）"

# ---------- 恢复默认并最终构建，保持 dist 与工作区一致 ----------
restore_consts
npm run build
assert_match dist/index.html "<html[^>]*data-layout=\"${default}\"" "恢复默认后最终构建一致"
