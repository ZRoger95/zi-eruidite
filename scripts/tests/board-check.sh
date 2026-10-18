#!/usr/bin/env bash
# 收藏板 /board 回归校验：临时写入受控 .env（仅 SITE_URL）后构建，再对 dist 输出断言。
# 本脚本先建导航基线，后续 Task 追加板渲染、拖拽脚本、英文路由等断言。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

assert_file() { # $1=路径 [$2=说明]
  [ -f "${1}" ] || fail "${2:-断言文件存在}（缺少 ${1}）"
  pass "${2:-${1}}"
}

assert_has() { # $1=文件 $2=片段 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言包含}（缺少 ${1}）"
  grep -qF -- "${2}" "${1}" || fail "${3:-断言包含}（${1} 未找到 ${2}）"
  pass "${3:-${1} 包含 ${2}}"
}

assert_lacks() { # $1=文件 $2=片段 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言不包含}（缺少 ${1}）"
  if grep -qF -- "${2}" "${1}"; then
    fail "${3:-断言不包含}（${1} 出现 ${2}）"
  fi
  pass "${3:-${1} 不含 ${2}}"
}

assert_match() { # $1=文件 $2=正则 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言匹配}（缺少 ${1}）"
  grep -qE -- "${2}" "${1}" || fail "${3:-断言匹配}（${1} 未匹配 ${2}）"
  pass "${3:-${1} 匹配 ${2}}"
}

# 受控 .env：备份 → 仅写 SITE_URL → 退出时恢复原文件
ENV_KEEP=/tmp/board-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi
cleanup_restore() {
  if [ -f "$ENV_KEEP" ]; then
    mv -f "$ENV_KEEP" .env
  else
    rm -f .env
  fi
}
trap cleanup_restore EXIT

printf 'SITE_URL=https://example.com\n' > .env
npm run build

# ---------- 导航入口双语就位 ----------
assert_has dist/index.html 'href="/board"' "中文导航含 /board 入口"
assert_has dist/index.html '收藏板' "中文导航收藏板标签"
assert_has dist/en/index.html 'href="/en/board"' "英文导航含 /en/board 入口"

# ---------- 板 SSR 静态渲染 ----------
assert_file dist/board/index.html "中文收藏板路由存在"
assert_has dist/board/index.html "<stamp-board" "板容器渲染"
assert_match dist/board/index.html 'board-piece[^>]*--x:' "piece 带 SSR 默认 --x"
assert_has dist/board/index.html 'data-kind="stamp"' "stamp 类渲染"
assert_has dist/board/index.html 'data-kind="badge"' "badge 类渲染"
assert_has dist/board/index.html 'aria-label="DeepSeek"' "DeepSeek 徽章入板"
assert_has dist/board/index.html 'aria-label="人写的代码"' "humancoded 字标徽章入板"
assert_has dist/board/index.html "--badge-h:40px" "横版字标按 size 压小高度"
assert_has dist/en/board/index.html 'aria-label="Human Coded"' "英文页字标徽章取 en 标题"
assert_lacks dist/board/index.html 'astro.en' "中文板不泄漏 .en id"

# ---------- 拖拽客户端激活脚本入产物 ----------
# Astro 7 把组件 <script> 提成独立 chunk（不再内联回 HTML），断言得指向产物 JS
board_js="$(find dist/_astro -name 'Board.astro_astro_type_script_index_*.js' 2>/dev/null | head -1)"
[ -n "${board_js}" ] || fail "找不到 Board 客户端脚本 chunk（组件脚本未入产物？）"
assert_has "${board_js}" "customElements.define" "板激活脚本入产物"
assert_has "${board_js}" "setPointerCapture" "拖拽用 Pointer Capture"

# ---------- 英文路由与未翻译回退 ----------
assert_file dist/en/board/index.html "英文收藏板路由存在"
assert_has dist/en/board/index.html "Astro (EN)" "已翻译物件显示英文标题"
assert_has dist/en/board/index.html "登月邮票" "未翻译物件回落中文标题（非空）"
assert_lacks dist/en/board/index.html 'aria-label="undefined"' "英文板无 undefined 泄漏"
assert_has dist/en/board/index.html 'hreflang="zh-CN"' "英文板输出 zh alternate"

# ---------- 终审修复：无障碍 role + Firefox 原生拖拽 ----------
assert_match dist/board/index.html 'board-piece[^>]*role="group"' "piece 带 role=group（aria-label 生效）"
assert_has dist/board/index.html 'draggable="false"' "徽章链接禁原生拖拽（Firefox）"
assert_has "${board_js}" "dragstart" "板上拦截原生拖拽（图片默认可拖会抢走 pointer）"

# ---------- 右侧分类标签（全部/邮票/徽章） ----------
assert_has dist/board/index.html "<board-tabs" "标签栏渲染"
assert_match dist/board/index.html 'stamp-board[^>]*data-view="all"' "默认视图=全部"
assert_has dist/board/index.html 'data-view="stamp"' "邮票标签存在"
assert_has dist/board/index.html 'data-view="badge"' "徽章标签存在"

# ---------- 板下方无工具条：拿起物件全靠板内交互 ----------
assert_lacks dist/board/index.html "<board-tools" "底部工具条已撤"
assert_match dist/board/index.html 'stamp-board[^>]*data-tool="drag"' "SSR 默认工具态=拖拽"
assert_has dist/board/index.html 'data-op="zoom-in"' "放大按钮存在"
assert_has dist/board/index.html 'data-op="zoom-out"' "缩小按钮存在"
assert_has dist/board/index.html 'data-op="rotate-cw"' "顺时针旋转按钮存在"
assert_has dist/board/index.html 'data-op="rotate-ccw"' "逆时针旋转按钮存在"
assert_has dist/board/index.html 'data-op="mirror"' "镜像按钮存在"
assert_has dist/board/index.html 'data-op="front"' "置顶按钮存在"
assert_has dist/board/index.html 'data-op="back"' "置底按钮存在"

# ---------- 物件外上角的径向操作浮层 + 板下提示行 ----------
assert_has dist/board/index.html "<board-menu" "浮层容器渲染"
assert_match dist/board/index.html 'board-menu[^>]*hidden' "浮层 SSR 默认隐藏（无 JS 不出现）"
assert_has dist/board/index.html "物件操作" "中文浮层 aria-label"
assert_has dist/board/index.html "<board-hint" "板下提示行渲染"
assert_has dist/board/index.html "右键、长按或 Tab" "中文提示行界面词"
assert_has dist/en/board/index.html "Piece actions" "英文浮层 aria-label"
assert_has dist/en/board/index.html "Send to back" "英文操作按钮界面词"
assert_has dist/en/board/index.html "Right-click, long-press" "英文提示行界面词"

# ---------- 拿起物件的三条入口与浮层几何（均入产物 JS） ----------
assert_has "${board_js}" "contextmenu" "鼠标右键拿起"
assert_has "${board_js}" "pointerType" "按 pointer 类型分流鼠标/触屏长按"
assert_has "${board_js}" "setTimeout" "触屏长按计时器"
assert_has "${board_js}" "ContextMenu" "键盘菜单键入口"
assert_has "${board_js}" "ArrowRight" "浮层内方向键走位"
assert_has "${board_js}" "Escape" "Esc 放下物件"
assert_has "${board_js}" "menu-btn" "浮层按钮选择器"
assert_has "${board_js}" "--menu-r" "浮层半径参与 JS 翻转判定"
assert_has "${board_js}" "interactive" "客户端激活标记点亮提示行"

# ---------- 层叠上下文回归：置底负 z 不得沉到板面背景之下 ----------
# 产物 CSS 是压缩过的，匹配无空格形式；只看 Board 自己的样式文件，避免被全站样式误命中
if grep -qE "isolation:[[:space:]]*isolate" dist/_astro/Board.*.css; then
  pass "board-grid 独立层叠上下文（isolation: isolate）"
else
  fail "board-grid 缺 isolation: isolate（置底负 z 物件会消失在板面下）"
fi
