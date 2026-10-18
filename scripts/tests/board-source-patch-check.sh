#!/usr/bin/env bash
# patchBoardSource 离线回归：纯字符串断言，不触碰真实 src/data/board.ts，
# 不起 dev server。用 Node 的 --experimental-strip-types 直接读取 TS 源。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

node --experimental-strip-types --no-warnings - <<'EOF' || fail "patchBoardSource 断言未通过"
import assert from "node:assert"
import { patchBoardSource } from "./src/lib/board-source-patch.ts"

const SRC = `export const BOARD_ITEMS = [
  {
    id: "a",
    kind: "badge",
    image: astroLogo,
    x: 0.15,
    y: 0.2,
    rotate: -4,
    z: 1,
    href: "https://e.com",
    title: { zh: "A" }, // 行内注释须保留
  },
  {
    id: "b",
    kind: "stamp",
    x: 0.5,
    y: 0.5,
    // 占位来源，后续替换
    href: "https://f.com",
  },
]
`

const res = patchBoardSource(SRC, [
  { id: "a", x: 0.3, y: 0.4, rotate: 2, z: 7, scale: 1.5, flip: true },
  { id: "b", x: 0.1, y: 0.9, rotate: 0, z: 0, scale: 1, flip: false },
])
const out = res.source

// 0：命中两条 → updated=2；无未知 id → skipped 空
assert.strictEqual(res.updated, 2, `updated 应为 2，实得 ${res.updated}`)
assert.deepStrictEqual(res.skipped, [], "skipped 应为空")

// 1：a 的 x/y/rotate/z 行被精确替换（4 空格缩进、无多余小数）
assert.match(out, /\n {4}x: 0\.3,\n/, "a.x 未替换")
assert.match(out, /\n {4}y: 0\.4,\n/, "a.y 未替换")
assert.match(out, /\n {4}rotate: 2,\n/, "a.rotate 未替换")
assert.match(out, /\n {4}z: 7,\n/, "a.z 未替换")
// 2：a 新增 scale/flip（原本无）
assert.match(out, /\n {4}scale: 1\.5,\n/, "a.scale 未新增")
assert.match(out, /\n {4}flip: true,\n/, "a.flip 未新增")
// 3：非几何字段与注释逐字保留
assert.ok(out.includes('href: "https://e.com",'), "a.href 丢失")
assert.ok(out.includes('image: astroLogo,'), "a.image 丢失")
assert.ok(out.includes('title: { zh: "A" }, // 行内注释须保留'), "行内注释丢失")
assert.ok(out.includes("// 占位来源，后续替换"), "b 整块注释丢失")
// 4：b 仅改坐标，未凭空补 rotate/z/scale/flip（均默认值）
assert.match(out, /\n {4}x: 0\.1,\n {4}y: 0\.9,\n/, "b 坐标未改")
const bStart = out.indexOf('id: "b"')
assert.ok(bStart >= 0, "b 块定位失败")
const bBlock = out.slice(bStart)
assert.ok(!/rotate:/.test(bBlock), "b 不应新增 rotate（值 0 默认）")
assert.ok(!/z: 0,/.test(bBlock), "b 不应新增 z（值 0 默认）")
assert.ok(!/scale:/.test(bBlock), "b 不应新增 scale（值 1 默认）")
assert.ok(!/flip:/.test(bBlock), "b 不应新增 flip（值 false 默认）")
// 5：未知 id → skipped 记录、source 原样、updated 0
const untouched = patchBoardSource(SRC, [
  { id: "zzz", x: 0, y: 0, rotate: 0, z: 0, scale: 1, flip: false },
])
assert.strictEqual(untouched.source, SRC, "未知 id 不应改动源")
assert.strictEqual(untouched.updated, 0, "未知 id updated 应为 0")
assert.deepStrictEqual(untouched.skipped, ["zzz"], "未知 id 应记入 skipped")
// 6：幂等——对已 patch 结果再 patch 同值 → updated 0、source 不变
const again = patchBoardSource(out, [
  { id: "a", x: 0.3, y: 0.4, rotate: 2, z: 7, scale: 1.5, flip: true },
])
assert.strictEqual(again.source, out, "非幂等：二次同值改写改变了源")
assert.strictEqual(again.updated, 0, "同值二次应 updated 0")
// 7：默认值回写删除既有字段行（rotate 归 0、flip 归 false、scale 归 1）
const cleared = patchBoardSource(out, [
  { id: "a", x: 0.3, y: 0.4, rotate: 0, z: 7, scale: 1, flip: false },
])
assert.ok(!/rotate:/.test(cleared.source), "rotate 归 0 应删除该行")
assert.ok(!/scale:/.test(cleared.source), "scale 归 1 应删除该行")
assert.ok(!/flip:/.test(cleared.source), "flip 归 false 应删除该行")
assert.match(cleared.source, /\n {4}z: 7,\n/, "z 非默认应保留")

// 8：几何行带行尾注释（如 z: 1, // 层叠）——必须就地改值并保留注释，不得新插重复键
const SRC_C = `export const BOARD_ITEMS = [
  {
    id: "c",
    kind: "badge",
    x: 0.5,
    y: 0.5,
    z: 1, // 层叠顺序
    href: "h",
  },
]
`
const outC = patchBoardSource(SRC_C, [
  { id: "c", x: 0.5, y: 0.5, rotate: 0, z: 9, scale: 1, flip: false },
]).source
const zCount = (outC.match(/^\s*z:/gm) || []).length
assert.strictEqual(zCount, 1, `z 不应重复（实得 ${zCount} 行）`)
assert.ok(outC.includes("z: 9, // 层叠顺序"), "z 值应替换且保留行尾注释")
assert.ok(!/z: 1,/.test(outC), "旧 z 值应消失")

// 9：round4 非有限兜底（Infinity → 0，不泄入源码）
const inf = patchBoardSource(SRC, [
  { id: "b", x: 0.5, y: 0.5, rotate: Infinity, z: 0, scale: 1, flip: false },
]).source
assert.ok(!/Infinity/.test(inf), "Infinity 不应写入源码")

console.log("ALL PASS")
EOF
pass "patchBoardSource 全部离线断言"
