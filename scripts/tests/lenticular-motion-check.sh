#!/usr/bin/env bash
# 光栅卡的物理与进度回归（纯离线，不起浏览器，也不构建）：
#   段 A —— node --experimental-strip-types 直接加载零依赖的 src/lib/lenticular-spring.ts，
#            对纯函数断言。这里验的是 spec §6/§7 那几条「倾斜与切换同源」的数学形式：
#            单调同向、阈值与 smoothstep、回弹真的存在、固定子步的确定性、
#            扫掠方向的 hold 规则、键盘步进、阻尼比没被手滑改掉。
# 浏览器端的真实指针测量不在本脚本（见 spec §11：本仓自动化不驱动浏览器）。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

# ---------- 段 A：弹簧与进度纯函数 ----------
node --experimental-strip-types --no-warnings - <<'EOF' || fail "段 A 纯函数断言失败"
import assert from "node:assert"
import {
  DEFAULT_SPRING,
  MAX_SUBSTEPS,
  SUBSTEP,
  T_FULL,
  T_START,
  advanceAxes,
  ampOf,
  keyTargetFrom,
  progressOf,
  sweepAngleOf,
  targetFromDrag,
  targetFromPointer,
} from "./src/lib/lenticular-spring.ts"

const MAX = 14
const ok = (msg) => console.log(`PASS  ${msg}`)

// ① 输入映射：指针归一化坐标 → 目标角度
assert.deepStrictEqual(targetFromPointer(0.5, 0.5, MAX), { rx: 0, ry: 0 })
assert.deepStrictEqual(targetFromPointer(1, 0, MAX), { rx: MAX, ry: MAX })
assert.deepStrictEqual(targetFromPointer(0, 1, MAX), { rx: -MAX, ry: -MAX })
// reduce 走 maxTilt = 0：不倾斜（内容仍可切换，见 ⑤ 之后的 progressOf）
assert.deepStrictEqual(targetFromPointer(0.9, 0.1, 0), { rx: 0, ry: 0 })
ok("指针坐标映射到目标角度；maxTilt=0 时不倾斜")

// ② 阈值与 smoothstep 端点
assert.strictEqual(progressOf({ rx: T_START * MAX * 0.99, ry: 0 }, MAX), 0)
assert.strictEqual(progressOf({ rx: T_FULL * MAX, ry: 0 }, MAX), 1)
assert.ok(Math.abs(progressOf({ rx: MAX * 0.5, ry: 0 }, MAX) - 0.5) < 1e-9)
ok(`阈值 ${T_START}/${T_FULL} 与 smoothstep 中点 0.5`)

// ③ 单调非降：这就是「倾斜与切换实时联动」的数学形式
let prev = -1
for (let i = 0; i <= 100; i++) {
  const a = (i / 100) * MAX * 1.2
  const t = progressOf({ rx: a, ry: 0 }, MAX)
  assert.ok(t >= prev - 1e-12, `amp 上升时 t 回落了：${prev} -> ${t}`)
  prev = t
}
ok("amp 上升全程 t 单调非降（两动画同源）")

// ④ 回弹真的存在于数学里：从满倾释放，越过零点，再收敛
{
  let s = { cur: { rx: MAX, ry: 0 }, vel: { rx: 0, ry: 0 }, acc: 0 }
  let minRx = MAX
  for (let f = 0; f < 60; f++) {
    s = advanceAxes(s, { rx: 0, ry: 0 }, DEFAULT_SPRING, SUBSTEP)
    minRx = Math.min(minRx, s.cur.rx)
  }
  assert.ok(minRx < -0.5, `应越过零点（min=${minRx}）`)
  assert.ok(Math.abs(s.cur.rx) < 0.05, `1s 内应收住（|rx|=${s.cur.rx}）`)
  ok(`释放回弹：最低点 ${minRx.toFixed(2)}°，1s 后 ${s.cur.rx.toFixed(3)}°`)
}

// ⑤ 过冲把切换「撞到位」：稳态本该 t<1 的目标，过程中 t 达到 1
{
  let s = { cur: { rx: 0, ry: 0 }, vel: { rx: 0, ry: 0 }, acc: 0 }
  const target = { rx: 0, ry: T_FULL * MAX * 0.95 }
  let maxT = 0
  for (let f = 0; f < 60; f++) {
    s = advanceAxes(s, target, DEFAULT_SPRING, SUBSTEP)
    maxT = Math.max(maxT, progressOf(s.cur, MAX))
  }
  assert.strictEqual(maxT, 1, `过冲应把 t 推到 1（max=${maxT}）`)
  assert.ok(progressOf(s.cur, MAX) < 1, "稳态本身必须还没到位")
  ok("过冲把 t 撞到位，而稳态仍 < 1")
}

// ⑥ 固定子步的确定性：同一总时长（0.5s），30Hz 与 120Hz 给出同一结果
{
  const run = (frameDt, frames) => {
    let s = { cur: { rx: 0, ry: 0 }, vel: { rx: 0, ry: 0 }, acc: 0 }
    for (let f = 0; f < frames; f++) {
      s = advanceAxes(s, { rx: MAX, ry: MAX }, DEFAULT_SPRING, frameDt)
    }
    return s.cur
  }
  const slow = run(1 / 30, 15) // 0.5s
  const fast = run(1 / 120, 60) // 0.5s
  assert.ok(Math.abs(slow.rx - fast.rx) < 1e-3, `rx 漂移 ${slow.rx} vs ${fast.rx}`)
  assert.ok(Math.abs(slow.ry - fast.ry) < 1e-3, `ry 漂移 ${slow.ry} vs ${fast.ry}`)
  ok(`0.5s 总时长在 30Hz/120Hz 下末值一致（Δ=${Math.abs(slow.rx - fast.rx).toExponential(2)}）`)
}

// ⑦ 掉帧时不追帧：单帧最多 MAX_SUBSTEPS 个子步，且不炸
{
  const s = advanceAxes(
    { cur: { rx: 0, ry: 0 }, vel: { rx: 0, ry: 0 }, acc: 0 },
    { rx: MAX, ry: 0 },
    DEFAULT_SPRING,
    10,
  )
  assert.ok(Number.isFinite(s.cur.rx) && Math.abs(s.cur.rx) < MAX, "巨大 dt 也不该炸")
  assert.ok(s.acc <= SUBSTEP, `积压应被丢弃（acc=${s.acc}）`)
  ok(`单帧 dt=10s 仍被钳在 ${MAX_SUBSTEPS} 个子步内并丢弃积压`)
}

// ⑧ 扫掠方向：接近平放时沿用上一次，避免每帧翻面
assert.strictEqual(sweepAngleOf({ rx: 0.05, ry: 0.05 }, MAX, 270), 270)
assert.strictEqual(sweepAngleOf({ rx: 0.05, ry: 0.05 }, MAX, 90), 90)
assert.strictEqual(sweepAngleOf({ rx: 0, ry: 7 }, MAX, 0), 90)
assert.strictEqual(sweepAngleOf({ rx: 0, ry: -7 }, MAX, 0), 270)
assert.strictEqual(sweepAngleOf({ rx: 7, ry: 0 }, MAX, 90), 0)
assert.strictEqual(sweepAngleOf({ rx: -7, ry: 0 }, MAX, 90), 180)
ok("方向取倾斜主轴符号；amp < 1% 时 hold 住上一次的角避免每帧翻面")

// ⑨ 键盘步进：0.25·maxTilt 一格，钳在满倾，Enter 往返。
// 符号约定与指针映射同源：↑ = 上倾 = rx 正（targetFromPointer 里 ny=0 就给正 rx）
{
  const step = MAX * 0.25
  assert.deepStrictEqual(keyTargetFrom("ArrowUp", { rx: 0, ry: 0 }, MAX), {
    rx: step,
    ry: 0,
  })
  assert.deepStrictEqual(keyTargetFrom("ArrowDown", { rx: 0, ry: 0 }, MAX), {
    rx: -step,
    ry: 0,
  })
  assert.deepStrictEqual(keyTargetFrom("ArrowRight", { rx: 0, ry: 0 }, MAX), {
    rx: 0,
    ry: step,
  })
  assert.deepStrictEqual(keyTargetFrom("ArrowLeft", { rx: 0, ry: 0 }, MAX), {
    rx: 0,
    ry: -step,
  })
  assert.deepStrictEqual(keyTargetFrom("ArrowUp", { rx: MAX, ry: 0 }, MAX), {
    rx: MAX,
    ry: 0,
  }, "已在满倾再按不得越过")
  let cur = { rx: 0, ry: 0 }
  for (let i = 0; i < 6; i++) cur = keyTargetFrom("ArrowRight", cur, MAX)
  assert.strictEqual(cur.ry, MAX, "连按 4 次到位，再多按也不越过满倾")
  assert.deepStrictEqual(keyTargetFrom("Home", cur, MAX), { rx: 0, ry: 0 })
  assert.deepStrictEqual(keyTargetFrom("Escape", cur, MAX), { rx: 0, ry: 0 })
  assert.deepStrictEqual(keyTargetFrom("End", { rx: 0, ry: 0 }, MAX), {
    rx: 0,
    ry: MAX,
  })
  assert.deepStrictEqual(keyTargetFrom("Enter", { rx: 0, ry: 0 }, MAX), {
    rx: 0,
    ry: MAX,
  })
  assert.deepStrictEqual(keyTargetFrom("Enter", { rx: 0, ry: MAX }, MAX), {
    rx: 0,
    ry: 0,
  })
  // 文档与 spec §8 都写了 Enter/Space 切面，实现不能只认 Enter
  assert.deepStrictEqual(keyTargetFrom(" ", { rx: 0, ry: 0 }, MAX), {
    rx: 0,
    ry: MAX,
  })
  assert.deepStrictEqual(keyTargetFrom(" ", { rx: 0, ry: MAX }, MAX), {
    rx: 0,
    ry: 0,
  })
  ok("四向步进 0.25·maxTilt 并钳位；Home/End/Escape/Enter/Space 语义正确")
}

// ⑩ 拖拽：拖出卡外不放大角度
assert.deepStrictEqual(targetFromDrag(9999, 0, 256, 146, MAX), { rx: 0, ry: MAX })
assert.deepStrictEqual(targetFromDrag(-256, 0, 256, 146, MAX), { rx: 0, ry: -MAX })
ok("拖出卡外被钳在 ±maxTilt")

// ⑪ 阻尼比与过冲率没被手滑改掉（ζ≈0.61 / 8.7%，spec §6 的核心手感）
{
  const { stiffness, damping, mass } = DEFAULT_SPRING
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const mp = Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta))
  assert.ok(zeta > 0.6 && zeta < 0.63, `ζ 应在 0.61 附近（实得 ${zeta}）`)
  assert.ok(mp > 0.08 && mp < 0.09, `过冲率应约 8.7%（实得 ${mp}）`)
  assert.strictEqual(SUBSTEP, 1 / 60)
  assert.strictEqual(MAX_SUBSTEPS, 4)
  ok(`ζ=${zeta.toFixed(3)}、过冲 ${(mp * 100).toFixed(1)}%、子步 ${SUBSTEP.toFixed(4)}s`)
}

// ⑬ ampOf：归一化幅度（maxTilt=0 不得除零）
assert.strictEqual(ampOf({ rx: 7, ry: 0 }, MAX), 0.5)
assert.strictEqual(ampOf({ rx: 9, ry: 12 }, 0), 0)
ok("ampOf 归一化正确且 maxTilt=0 时不除零")

// ⑭ reduced-motion 的映射锁：不走弹簧时，进度直接取「目标角度」的同一条公式
//（reduced 下 mount 不启 rAF，把 target 当 cur 交给 progressOf）
assert.strictEqual(progressOf(targetFromPointer(0.5, 0.5, MAX), MAX), 0)
assert.strictEqual(progressOf(targetFromPointer(1, 0.5, MAX), MAX), 1)
{
  let vec = { rx: 0, ry: 0 }
  let maxT = 0
  for (let i = 0; i < 4; i++) {
    vec = keyTargetFrom("ArrowRight", vec, MAX)
    maxT = Math.max(maxT, progressOf(vec, MAX))
  }
  assert.strictEqual(maxT, 1, "reduce 下按 4 下方向键也应把进度推到 1")
}
ok("reduce 复用同一条 progressOf：指针位置与键盘步进都能推到 0→1")
EOF

printf '\n== lenticular motion check OK ==\n'
