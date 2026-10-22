#!/usr/bin/env bash
# 数字光栅卡回归校验：临时写入受控 .env（仅 SITE_URL）后构建，再对 dist 输出逐条断言。
# 本脚本先建静态卡基线（SSR 出宿主、双语词条、两张图不依赖 JS），后续 Task 追加
# CSS 渲染契约与元素注册脚本的断言。
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

assert_dir_has() { # $1=目录 $2=片段 [$3=说明]
  grep -rqF -- "${2}" "${1}" || fail "${3:-断言目录包含}（${1} 未找到 ${2}）"
  pass "${3:-${1} 包含 ${2}}"
}

# dist/_astro 里的 CSS 已被压缩，带空格的写法永远抓不到，故目录级一律用正则
assert_dir_match() { # $1=目录 $2=正则 $3=说明
  grep -qrE -- "${2}" "${1}" || fail "${3}（${1} 里无 ${2}）"
  pass "${3}"
}

assert_match() { # $1=文件 $2=正则 $3=说明
  [ -f "${1}" ] || fail "${3}（缺少 ${1}）"
  grep -qE -- "${2}" "${1}" || fail "${3}（${1} 里无 ${2}）"
  pass "${3}"
}

# 跨行规则（如 @media 块内部的嵌套选择器）用得上：把文件压成一行再匹
assert_flat_match() { # $1=文件 $2=正则 $3=说明
  [ -f "${1}" ] || fail "${3}（缺少 ${1}）"
  tr -d '\n' < "${1}" | grep -qE -- "${2}" || fail "${3}（${1} 里无 ${2}）"
  pass "${3}"
}

assert_count_ge() { # $1=文件 $2=片段 $3=最小次数 $4=说明
  local n
  n=$(grep -oF -- "${2}" "${1}" | wc -l | tr -d ' ')
  [ "${n}" -ge "${3}" ] || fail "${4}（${1} 里 ${2} 出现 ${n} 次 < ${3}）"
  pass "${4}"
}

# 卡自己的 markup 块（宿主标签之内）。页面上另有 EyeTracker 的 aria-live，
# 所以「不养 live 区域」这条只能对卡内断言，不能对整页断言。
# 锚点换成带后跟字符的匹配，而不是子串匹配：dev 页面会把内联 CSS 一起输出来，
# 而本文件顶部的注释里就写着“<lenticular-card>”（实测这样会从注释一直截到
# 真正结束标签，中间吞下 <main tabindex="-1"> 导致误报）
card_chunk() { # $1=文件
  awk '/<lenticular-card[ 	>]/{f=1} f{print} /<\/lenticular-card>/{f=0}' "${1}"
}

assert_card_lacks() { # $1=文件 $2=片段 $3=说明
  if card_chunk "${1}" | grep -qF -- "${2}"; then
    fail "${3}（卡的 markup 里出现 ${2}）"
  fi
  pass "${3}"
}

# ---------- 受控 .env（备份/恢复；脚本中途失败也还原） ----------
ENV_KEEP=/tmp/lenticular-check.env.keep
ENV_HAD=1
if [ -f .env ]; then
  cp -f .env "${ENV_KEEP}"
else
  ENV_HAD=0
fi
restore_env() {
  if [ "${ENV_HAD}" -eq 1 ] && [ -f "${ENV_KEEP}" ]; then
    cp -f "${ENV_KEEP}" .env
    rm -f "${ENV_KEEP}"
  else
    rm -f .env "${ENV_KEEP}"
  fi
}
trap restore_env EXIT
printf 'SITE_URL=https://example.com\n' >.env

# ---------- 构建 ----------
npm run build

ZH=dist/board/index.html
EN=dist/en/board/index.html
CSS=dist/_astro

assert_file "${ZH}" "中文收藏板页产出"
assert_file "${EN}" "英文收藏板页产出"

# ---------- 静态卡：SSR 出宿主与两面图（无 JS 也能读全内容） ----------
assert_has "${ZH}" '<lenticular-card' "卡宿主 SSR 出"
# slider 语义**不能**住在 SSR 里：role=slider 的 children 是 presentational 的，
# 静态并列态下它会直接吞掉两张图的 alt（无 JS 也一样被吞），而 spec §8 要求的
# 正是「无 JS 时两张图都是可读内容」——所以语义由 JS 挂载时补上
assert_card_lacks "${ZH}" 'role="slider"' "静态态不挂 slider 语义（不吞 alt）"
assert_card_lacks "${ZH}" 'aria-valuenow' "静态态不带 slider 属性"
assert_card_lacks "${ZH}" 'tabindex' "静态态不可聚焦（不承诺不存在的交互）"
# 静态并列态的两张图必须带着真实 alt（slider 不在场，没人替它们说话）
assert_card_lacks "${ZH}" 'alt=""' "静态 markup 里没有空 alt"
CARD_IMG_ALTS=$(card_chunk "${ZH}" | grep -oE 'alt="[^"]{12,}"' | wc -l | tr -d ' ')
[ "${CARD_IMG_ALTS}" -ge 2 ] || fail "卡里带长 alt 的图不足两张（实得 ${CARD_IMG_ALTS}）"
pass "静态卡的两张图各自带完整 alt"
assert_has "${ZH}" 'data-blend="sweep"' "默认 blend=sweep"
assert_has "${ZH}" 'data-max-tilt="14"' "默认 maxTilt=14"
assert_has "${ZH}" 'data-stiffness="170"' "默认 stiffness=170"
assert_has "${ZH}" 'data-damping="16"' "默认 damping=16"
assert_has "${ZH}" '<lens-stage' "交互舞台 lens-stage 由 SSR 出"
assert_has "${ZH}" 'lens-face' "两层画面由 SSR 出"
assert_has "${ZH}" '光栅卡' "中文卡题"
assert_has "${ZH}" '倾斜看另一面' "中文 hover 提示"
assert_has "${ZH}" '拖动看另一面' "中文触屏提示"

# ---------- 双语 ----------
assert_has "${EN}" 'Lenticular Card' "英文卡题"
assert_has "${EN}" 'Tilt to see the other side' "英文 hover 提示"
assert_has "${EN}" 'Drag to see the other side' "英文触屏提示"

# ---------- 无障碍：语义由宿主一处收口，不另养 live 区域 ----------
# 初始进度与播报文案由 JS 接管；静态态只保留可见内容与 alt（见上方两条 card_lacks）
assert_card_lacks "${ZH}" 'aria-valuemax' "值域由挂载后的 slider 提供"
assert_card_lacks "${ZH}" 'aria-live' "卡内不含 aria-live（valuetext 已足够）"

# ---------- 图 2 不依赖 JS 也必须被请求到：卡 + 原邮票各一份 ----------
assert_count_ge "${ZH}" 'DONGLONGDONG-2' 2 "云海图在卡与邮票里各一份"
assert_count_ge "${ZH}" 'DONGLONGDONG-3' 2 "星夜图在卡与邮票里各一份"

# ---------- 渲染契约的 CSS 消费层（Task 2） ----------
# 同样要钉到具体文件：全局样式会进 Layout.*.css，而 isolation:isolate 等写法
# 在 Board 自己的 CSS 里也有——整目录 grep 会被它们先满足
LENS_CSS=$(ls dist/_astro/Layout.*.css 2>/dev/null | head -1)
[ -n "${LENS_CSS}" ] || fail "找不到 Layout 的全局 CSS 产物"
pass "lenticular.css 已随 Layout 打进全局样式"
assert_has "${LENS_CSS}" 'lenticular-card' "卡的选择器入产物"
# dist 里的 CSS 已被压缩，带空格的写法永远抓不到，故一律用正则
assert_match "${LENS_CSS}" '@property\s+--t' "注册 --t 使其可 transition"
assert_match "${LENS_CSS}" '@property\s+--rx' "注册 --rx"
assert_match "${LENS_CSS}" 'lenticular-card\s*\{[^}]*--rx:\s*0' "宿主兜底声明与 @property 共存（默认值不依赖 initial-value）"
assert_match "${LENS_CSS}" 'calc\(var\(--t\)\s*\*\s*\(100%' "mask 边界公式含 100%+2f 外推"
assert_match "${LENS_CSS}" '\-webkit-mask-image' "Safari 前缀同写"
assert_match "${LENS_CSS}" 'rotateX\(calc\(var\(--rx\)\s*\*\s*1deg\)' "倾角以无单位数字存、CSS 补 deg"
assert_match "${LENS_CSS}" 'data-blend=.?fade.?' "fade 逃生门存在"
assert_match "${LENS_CSS}" 'hover:\s*hover' "hover 能力决定提示文案"
assert_match "${LENS_CSS}" 'prefers-reduced-motion' "reduced-motion 分支"
# 「不做倾斜/不做高光」这一层完全由 CSS 媒体查询承担（JS 侧无法翻转它，
# 浏览器重挂载验不到），所以必须在产物里钉住 reduce 块里确实有这两条
assert_flat_match "${LENS_CSS}" 'prefers-reduced-motion[^{]*\{[^@]*lens-stage\s*\{\s*transform:\s*none' "reduce 下不做倾斜（transform:none）"
assert_flat_match "${LENS_CSS}" 'prefers-reduced-motion[^{]*\{[^@]*lens-sheen\s*\{\s*display:\s*none' "reduce 下不做高光"
# 视差平移也得归零：基础规则带 [data-a]/[data-b]，特异度比裸 lens-face 高，
# 只写 lens-face{translate:none} 抢不过（实测 reduce 下两层仍互相滑过）
assert_flat_match "${LENS_CSS}" 'prefers-reduced-motion[^{]*\{[^@]*lens-face\[data-a\][^}]*translate:\s*none' "reduce 下两层都不平移"
assert_match "${LENS_CSS}" 'transition:[^;}]*--t' "reduce 下 --t 走 CSS transition"
assert_match "${LENS_CSS}" 'isolation:\s*isolate' "sheen 的混合不污染板面"
assert_match "${LENS_CSS}" 'mix-blend-mode:\s*soft-light' "sheen 用 soft-light"
# 轮廓必须是画在画面之上的覆盖层：inset box-shadow 会被不透明图层盖住（实测失效）
assert_match "${LENS_CSS}" 'lens-stage::?after' "描边走 ::after 覆盖层（不是 inset shadow）"
# 卡与板面不能零间距：实测满倾时 3D 包络上移 15.2px，上边距必须 ≥16px（--space-s）
# 才不会咬进网格底边
assert_flat_match "${LENS_CSS}" 'lenticular-card[^}]*margin[^;}]{0,48}space-s\)' "卡与网格之间的上边距 ≥ 16px"

# 源码级不变量：3D 节点上不得出现 filter 声明（会压平并改 containing block）。
# 只认处于声明位置的 filter:（行首缩进后紧跟属性名）——上一版的裸 grep 会把
# “绝对不要用 filter”这句注释本身当成违规
if grep -qE '^[[:space:]]*([-a-z]+-)?filter:' src/styles/lenticular.css; then
  fail "lenticular.css 里出现 filter 声明"
fi
pass "lenticular.css 不用 filter 声明（不压平 3D）"

# ---------- 元素注册与客户端激活（Task 4） ----------
# 必须按文件名钉到组件自己的脚本上！整目录 grep 会被收藏板本身蒙过去：
# 实测 setPointerCapture / cancelAnimationFrame / preventDefault / prefers-reduced-motion
# 在 Board 的产物里同样存在，不收窄的话这几条断言永远为真、什么都不证明
LENS_JS=$(ls dist/_astro/LenticularCard.astro_astro_type_script_index_0_lang.*.js 2>/dev/null | head -1)
[ -n "${LENS_JS}" ] || fail "找不到 LenticularCard 的脚本产物"
pass "LenticularCard 脚本产物存在"
assert_has "${LENS_JS}" 'customElements.define' "元素注册入产物"
assert_has "${LENS_JS}" 'lenticular-card' "注册名正确"
assert_has "${LENS_JS}" 'customElements.get' "已注册守卫（View Transitions 重跑脚本）"
assert_has "${LENS_JS}" 'setPointerCapture' "触屏走 Pointer Capture"
assert_has "${LENS_JS}" 'cancelAnimationFrame' "destroy 撤掉 rAF"
assert_has "${LENS_JS}" 'ResizeObserver' "rect 随尺寸失效"
assert_has "${LENS_JS}" 'will-change' "will-change 由 JS 开关"
assert_has "${LENS_JS}" 'releasePointerCapture' "拖拽结束后释放捕获"
# pointer capture 对不可信 pointerId 会抛 NotFoundError（实测），抛在 start()
# 之前会留下挂着的 drag 状态让卡定在半倾；这里钉住“捕获是试探性的”
assert_has "${LENS_JS}" 'hasPointerCapture' "捕获状态先查再操作（不抛在关键路径上）"
# slider 语义由挂载补上（role=slider 的 presentational children 会吞 alt，
# 所以只能在「已经叠成一张卡」的那个时刻才挂）
assert_match "${LENS_JS}" 'setAttribute\(.role' "挂载时补 role=slider"
assert_match "${LENS_JS}" 'setAttribute\(.tabindex' "挂载时补 tabindex"
assert_match "${LENS_JS}" 'aria-valuenow' "挂载时维护进度值"

# 不能只有 pointerenter 会启动计算：静止后循环会自停，而 enter 不一定会再来
#（指针本就搭在卡面上时、或 destroy 后重新接回）。
# 按 handler 逐个查，不数总数：总数版会被一句注释撑满（实测 grep 'pulse()' 命中 7 处
# 里有一处是注释正文），真删掉一个调用点仍能全绿
for h in onEnter onMove onDown endDrag onLeave onKey; do
  if ! awk -v start="const ${h} =" 'index($0, start){f=1} f{print} f&&/^  \}$/{exit}' \
      src/lib/lenticular.ts | grep -q 'pulse()'; then
    fail "${h} 里没有 pulse()（reduced 下没人当场写出，角度会卡在拖到一半）"
  fi
done
pass "六个 handler 各自都驱动计算（逐个查，不是数总数）"

# 几个「缺了就整层静默失效」的 CSS 依赖：没断言就会在改名/清理时悄悄死掉
assert_match "${LENS_CSS}" '\-\-feather:\s*[0-9]' "羽化带有定义（var 无回落，缺它 mask 整体失效、图二常驻）"
assert_match "${LENS_CSS}" 'lenticular-card\s*\{[^}]*position:\s*relative' "宿主是定位锚点（映射靠 stage 的 layout 偏移）"
assert_flat_match "${LENS_CSS}" 'hover:\s*none[^@]*lens-hint\[data-hint=.?touch' "触屏提示真会被显示"

# ---------- reduced-motion 与键盘路径（Task 5） ----------
assert_has "${LENS_JS}" 'prefers-reduced-motion: reduce' "组件脚本自己读 reduced-motion"
assert_has "${LENS_JS}" 'addEventListener' "监听器挂载"
assert_has "${LENS_JS}" 'keydown' "键盘驱动路径"
assert_has "${LENS_JS}" 'preventDefault' "方向键不滚页"
assert_has "${LENS_JS}" 'removeEventListener' "destroy 摘监听器"

printf '\n== lenticular check OK ==\n'
