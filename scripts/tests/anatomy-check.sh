#!/usr/bin/env bash
# Anatomy 等距插图集成回归校验：临时写入受控 .env（仅 SITE_URL）后构建，
# 再对 dist 输出逐条断言：/figures 路由、SSR 完整 SVG（无 JS 也能看全机器）、
# 主题令牌映射生效且无硬编码 light 块残留、客户端 import 图不触及 lathe/figure。
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

assert_dir_has() { # $1=目录 $2=片段 [$3=说明]
  grep -rqF -- "${2}" "${1}" || fail "${3:-断言目录包含}（${1} 未找到 ${2}）"
  pass "${3:-${1} 包含 ${2}}"
}

assert_dir_lacks() { # $1=目录 $2=片段 [$3=说明]
  if grep -rqF -- "${2}" "${1}"; then
    fail "${3:-断言目录不包含}（${1} 出现 ${2}）"
  fi
  pass "${3:-${1} 不含 ${2}}"
}

# ---------- 受控 .env（备份/恢复；脚本中途失败也还原） ----------
ENV_KEEP=/tmp/anatomy-check.env.keep
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

# ---------- 构建 + 保真 ----------
npm run build
node scripts/tests/anatomy-fidelity.mjs || fail "SVG 保真失败"

# ---------- /figures 路由存在 ----------
assert_file dist/figures/index.html "画廊首页"
assert_file dist/figures/family-press/index.html "family-press 详情页"

# ---------- SSR 出完整机器（自定义元素宿主 + 关键零件，无 JS 亦可见） ----------
DETAIL=dist/figures/family-press/index.html
assert_has "${DETAIL}" '<anatomy-figure data-slug="family-press"' "自定义元素宿主带 slug"
assert_has "${DETAIL}" 'data-state=' "宿主序列化 machine state 供客户端接管"
assert_has "${DETAIL}" 'class="iso-stage"' "交互舞台 .iso-stage 由 SSR 出"
assert_has "${DETAIL}" 'data-part="head"' "SSR SVG 含头（head）"
assert_has "${DETAIL}" 'data-part="bandFace"' "SSR SVG 含铅带印面（bandFace）"
assert_has "${DETAIL}" 'data-part="arm"' "SSR SVG 含指臂（arm）"
assert_has "${DETAIL}" 'data-readout' "卡片四角含读数（readout）"

# ---------- SSR↔客户端契约：live 用 find("X") 取的每个零件都由 SSR 出了 data-part="X" ----------
# 防止 live.ts 里的 find 名与 figure.ts 发出的 data-part 漂移（这类错不编译错、不在 SVG 保真范围内）
for part in $(grep -oE 'find\("[a-zA-Z]+"\)' src/lib/anatomy/family-press/live.ts | sed -E 's/find\("([a-zA-Z]+)"\)/\1/'); do
  assert_has "${DETAIL}" "data-part=\"${part}\"" "SSR 出 live 所需零件（${part}）"
done
for i in 0 1 2; do
  assert_has "${DETAIL}" "data-part=\"rack${i}\"" "SSR 出机架格（rack${i}）"
done

# ---------- 主题令牌映射生效 + 无硬编码 light 块 ----------
assert_dir_has dist/_astro '--anatomy-paper:var(--background' "anatomy 令牌映射到站点色板"
assert_dir_has dist/_astro '--anatomy-shade-0:color-mix' "shade 令牌用 color-mix 相对底色加深"
assert_dir_lacks dist/_astro '.iso[data-theme' "无 .iso[data-theme] 硬编码明暗块残留"

# ---------- 客户端传递 import 图不触及 lathe / figure（spec 3.2 不变量） ----------
# 覆盖客户端入口的完整传递闭包：registry-client -> live -> {geo, model, iso-kit}
CLIENT_GRAPH="src/lib/anatomy/registry-client.ts src/lib/anatomy/family-press/live.ts src/lib/anatomy/family-press/geo.ts src/lib/anatomy/family-press/model.ts src/lib/anatomy/iso-kit.ts"
if grep -qE 'from "[^"]*(lathe|family-press/figure)[^"]*"' ${CLIENT_GRAPH}; then
  fail "客户端传递 import 图引向了 figure/lathe（会进客户端 bundle）"
fi
pass "客户端传递 import 图（registry-client -> live/geo/model/iso-kit）不含 figure/lathe"

printf '\n== anatomy check OK ==\n'
