#!/usr/bin/env bash
# 收藏板布局 dev 端点回归：
#  段 A —— validateLayoutItems 纯逻辑（离线，node --experimental-strip-types）；
#  段 B —— 起真实 astro dev（端口 4398），写入目标经 BOARD_LAYOUT_SOURCE 指向
#          /tmp fixture 副本（绝不触碰真实 src/data/board.ts）。覆盖路由挂载、
#          非法体 400、越界拒绝且不改文件、有效改写落盘、同值幂等不重写。
# 受控 .env（SITE_URL），trap 恢复 .env、终止 dev server、清理 /tmp。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

pass_count=0
pass() { pass_count=$((pass_count + 1)); printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

assert_has() { [ -f "$1" ] || fail "$3（缺 $1）"; grep -qF -- "$2" "$1" || fail "$3（$1 无 $2）"; pass "$3"; }

WORK=/tmp/board-layout-check
FIX="$WORK/board.ts"
BASE=http://127.0.0.1:4398
DEV_PID=""

rm -rf "$WORK"; mkdir -p "$WORK"

ENV_KEEP=/tmp/board-layout-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi

cleanup_all() {
  if [ -n "$DEV_PID" ]; then kill "$DEV_PID" 2>/dev/null || true; wait "$DEV_PID" 2>/dev/null || true; fi
  if [ -f "$ENV_KEEP" ]; then mv -f "$ENV_KEEP" .env; else rm -f .env; fi
}
trap cleanup_all EXIT

wait_dev_ready() {
  i=0
  while [ "$i" -lt 120 ]; do
    i=$((i+1))
    if curl -sf -o /dev/null --max-time 2 "$BASE/"; then return 0; fi
    sleep 0.5
  done
  tail -5 "$WORK/dev.log" >&2 || true
  fail "dev server 未就绪（轮询超时）"
}

# ---------- 段 A：validateLayoutItems 纯逻辑 ----------
# validateLayoutItems 住在零依赖的 board-source-patch.ts（可被 Node strip-types 直接
# 加载；若放进插件文件，其 `import "./board-source-patch"` 无扩展名会让 Node 报错）。
node --experimental-strip-types --no-warnings - <<'EOF' || fail "validateLayoutItems 断言失败"
import assert from "node:assert"
import { validateLayoutItems } from "./src/lib/board-source-patch.ts"
const good = { id: "a", x: 0.5, y: 0.5, rotate: 0, z: 1, scale: 1, flip: false }
assert.ok(validateLayoutItems({ items: [good] }).ok, "合法载荷应通过")
assert.strictEqual(validateLayoutItems({ items: [{ ...good, x: 1.5 }] }).ok, false, "x>1 应拒绝")
assert.strictEqual(validateLayoutItems({ items: [{ ...good, y: -0.1 }] }).ok, false, "y<0 应拒绝")
assert.strictEqual(validateLayoutItems({ items: [{ ...good, x: Number.NaN }] }).ok, false, "x=NaN 应拒绝")
assert.strictEqual(validateLayoutItems({ items: [{ ...good, flip: "yes" }] }).ok, false, "flip 非布尔应拒绝")
assert.strictEqual(validateLayoutItems({ items: [] }).ok, false, "空 items 应拒绝")
assert.strictEqual(validateLayoutItems({}).ok, false, "缺 items 应拒绝")
assert.strictEqual(validateLayoutItems(null).ok, false, "null 应拒绝")
console.log("VALIDATE OK")
EOF
pass "段A：validateLayoutItems 纯逻辑"

# ---------- 段 B：dev 端点（写入 /tmp fixture，绝不碰真实 board.ts） ----------
cp src/data/board.ts "$FIX"
printf 'SITE_URL=https://example.com\n' > .env

if curl -s -o /dev/null --max-time 2 "$BASE/"; then fail "端口 4398 被占用（请先停旧 dev server）"; fi

ASTRO_DEV_BACKGROUND=1 BOARD_LAYOUT_SOURCE="$FIX" \
  ./node_modules/.bin/astro dev --port 4398 --ignore-lock --host 127.0.0.1 \
  > "$WORK/dev.log" 2>&1 &
DEV_PID=$!
wait_dev_ready

post() { # $1=json body → 打印 http_code，body 落 $WORK/body.json
  curl -s -o "$WORK/body.json" -w '%{http_code}' -X POST \
    -H 'content-type: application/json' --data "$1" "$BASE/api/board/layout"
}

# B1：非法体（缺 items）→ 400（证明路由已挂载，非 404）
code=$(post '{}')
[ "$code" = "400" ] || fail "B1：非法体应 400，实得 $code"
pass "B1：路由已挂载（非法体 400）"

# B2：越界 x → 400，且 fixture 不改（与备份 cmp 相同）
cp "$FIX" "$WORK/fix.bak"
code=$(post '{"items":[{"id":"astro","x":1.5,"y":0.2,"rotate":-4,"z":1,"scale":1,"flip":false}]}')
[ "$code" = "400" ] || fail "B2：越界应 400，实得 $code"
cmp -s "$FIX" "$WORK/fix.bak" || fail "B2：非法请求不应改动 fixture"
pass "B2：越界拒绝且不改文件"

# B3：有效改写（astro 坐标 + 新增 scale/flip）→ 200，fixture 落新值
cp "$FIX" "$WORK/fix.bak"
code=$(post '{"items":[{"id":"astro","x":0.87,"y":0.31,"rotate":-4,"z":1,"scale":1.5,"flip":true}]}')
[ "$code" = "200" ] || fail "B3：有效改写应 200，实得 $code（body: $(cat "$WORK/body.json")）"
assert_has "$FIX" 'x: 0.87' "B3：astro.x 落新值"
assert_has "$FIX" 'flip: true' "B3：astro 新增 flip"
assert_has "$FIX" 'scale: 1.5' "B3：astro 新增 scale"
pass "B3：有效改写落盘"

# B4：同值再 POST → 幂等，updated 不触发额外变化（fixture 与 B3 后完全一致）
cp "$FIX" "$WORK/fix.b3"
code=$(post '{"items":[{"id":"astro","x":0.87,"y":0.31,"rotate":-4,"z":1,"scale":1.5,"flip":true}]}')
[ "$code" = "200" ] || fail "B4：同值再存应 200，实得 $code"
cmp -s "$FIX" "$WORK/fix.b3" || fail "B4：同值二次不应改变 fixture（破坏幂等）"
pass "B4：同值幂等不改写"

# B5：dev 页面挂载编辑条（生产侧零痕迹由 board-check.sh 的 assert_lacks 兜住，两侧夹逼 dev-only 契约）
curl -s "$BASE/board" -o "$WORK/page.html"
assert_has "$WORK/page.html" "<board-editor" "B5：dev 渲染编辑条（仅开发模式挂载）"

cleanup_all
trap - EXIT
printf 'ALL OK（%d 断言组）\n' "$pass_count"
