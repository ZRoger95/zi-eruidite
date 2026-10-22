/* 光栅卡的物理与进度模型：纯函数，零 import，零 DOM。
   零 import 是有约束的——回归脚本用 `node --experimental-strip-types` 直接加载本文件
   （见 scripts/tests/lenticular-motion-check.sh），一旦这里 import 了别的模块，Node 那边
   就得处理扩展名解析，所以物理留在这一层，DOM 接线留在 lenticular.ts。

   设计要点（spec §6）：切换进度不是第二个弹簧，而是**当前实际角度的纯函数**。
   于是倾斜与画面天生同源：反向移动自动反切，回弹时画面跟着角度一起回。 */

export type Vec2 = { rx: number; ry: number }

export type SpringOpts = { stiffness: number; damping: number; mass: number }

/** 弹簧状态：角度、角速度，以及跨帧的子步余量（acc）。
   余量必须是状态的一部分：没有它就没法在 30Hz 与 120Hz 之间给出同一个结果，
   而「固定子步」的全部意义就在于此。 */
export type SpringState = { cur: Vec2; vel: Vec2; acc: number }

export type LensKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End"
  | "Enter"
  | "Escape"
  | " "

/** ζ = 16 / (2√170) ≈ 0.61：过冲约 8.7%，305ms 达峰、约 500ms 收住 */
export const DEFAULT_SPRING: SpringOpts = {
  stiffness: 170,
  damping: 16,
  mass: 1,
}

/** amp 到 15% 才开始揭示：指针刚贴上就切掉三分之一很难看 */
export const T_START = 0.15
/** amp 到 85% 封顶：留出余量让那 8.7% 的过冲能把切换「撞到位」 */
export const T_FULL = 0.85

/** 积分步长：固定 1/60 秒，一秒 60 步 */
export const SUBSTEP = 1 / 60
/** 单帧最多补几步：掉帧严重时宁可丢时间，也不追帧追到卡死 */
export const MAX_SUBSTEPS = 4

/** amp 低于这个比例时保持上一次扫掠方向（见 sweepAngleOf） */
const HOLD_AMP = 0.01

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/**
 * 指针归一化坐标 → 目标角度。约定与 3D 直觉一致：
 * 指针在上方（ny=0）→ 正 rx（卡面上缘朝你抬起），指针在右（nx=1）→ 正 ry。
 * reduce 场景传 maxTilt = 0，得到的就是 {0, 0}——不需要另一套代码分支。
 */
export function targetFromPointer(
  nx: number,
  ny: number,
  maxTilt: number,
): Vec2 {
  // + 0 是为了把 -0 抹成 0：指针正中心时 -(0.5-0.5)*2*maxTilt 会得到 -0，
  // 写进 CSS 无差，但 `deepStrictEqual` 与一些比较会把 -0 当成另一个值
  return {
    rx: -(ny - 0.5) * 2 * maxTilt + 0,
    ry: (nx - 0.5) * 2 * maxTilt + 0,
  }
}

/** 触屏拖拽位移 → 目标角度。拖出卡面也只会钳在 ±maxTilt，不会放大角度 */
export function targetFromDrag(
  dx: number,
  dy: number,
  halfW: number,
  halfH: number,
  maxTilt: number,
): Vec2 {
  return {
    rx: clamp(-dy / halfH, -1, 1) * maxTilt + 0,
    ry: clamp(dx / halfW, -1, 1) * maxTilt + 0,
  }
}

/** 归一化倾斜幅度（0 = 平放，1 = 满倾）。maxTilt=0 时直接给 0，不除零 */
export function ampOf(cur: Vec2, maxTilt: number): number {
  if (maxTilt <= 0) return 0
  return Math.hypot(cur.rx, cur.ry) / maxTilt
}

/**
 * 切换进度：amp 的 smoothstep。u 先做阈值线性归一，再 u²(3-2u)。
 * 单调非降是「两个动画同步」的数学形式，回归脚本逐点验它。
 */
export function progressOf(cur: Vec2, maxTilt: number): number {
  const u = clamp((ampOf(cur, maxTilt) - T_START) / (T_FULL - T_START), 0, 1)
  return u * u * (3 - 2 * u)
}

/**
 * 扫掠方向（度）：跟随倾斜主轴的符号——抬起哪一侧，哪一侧先转出旧画面。
 * amp 接近 0 时两个轴谁大都近乎随机，若照常取主轴会让边界每帧翻面、
 * 高光跟着抖，所以这里沿用上一次的值（回归脚本第 ⑧ 组验它）。
 */
export function sweepAngleOf(cur: Vec2, maxTilt: number, prev: number): number {
  if (ampOf(cur, maxTilt) < HOLD_AMP) return prev
  if (Math.abs(cur.ry) >= Math.abs(cur.rx)) return cur.ry >= 0 ? 90 : 270
  return cur.rx >= 0 ? 0 : 180
}

/**
 * 走一个物理步（半隐式欧拉）。dt 固定传 SUBSTEP，由 advanceAxes 负责配步。
 * target 传引用是为了让 rx / ry 各走各的一维弹簧——两个轴互不耦合，
 * 回弹曲线与单轴一致（spec §6 的参数推导就是按单轴来的）。
 */
function stepAxis(
  cur: Vec2,
  vel: Vec2,
  target: Vec2,
  o: SpringOpts,
  h: number,
): { cur: Vec2; vel: Vec2 } {
  const inv = 1 / o.mass
  const nx: Vec2 = { rx: 0, ry: 0 }
  const nv: Vec2 = { rx: 0, ry: 0 }
  for (const k of ["rx", "ry"] as const) {
    const a =
      (target[k] - cur[k]) * o.stiffness * inv - vel[k] * o.damping * inv
    const v = vel[k] + a * h
    nv[k] = v
    nx[k] = cur[k] + v * h
  }
  return { cur: nx, vel: nv }
}

/**
 * 把一帧的时间 dt 折成固定 1/60 的子步推进：余量留在 state.acc 里跨帧累积，
 * 于是 30Hz 与 120Hz 的驱动给出同一个轨迹。积压超过 MAX_SUBSTEPS 就把多余
 * 时间丢掉（不追帧），否则一次长卡顿会让弹簧永远落在后面。
 */
export function advanceAxes(
  state: SpringState,
  target: Vec2,
  o: SpringOpts,
  dt: number,
): SpringState {
  let { cur, vel } = state
  let acc = state.acc + dt
  let steps = 0
  while (acc >= SUBSTEP && steps < MAX_SUBSTEPS) {
    const s = stepAxis(cur, vel, target, o, SUBSTEP)
    cur = s.cur
    vel = s.vel
    acc -= SUBSTEP
    steps++
  }
  if (acc > SUBSTEP) acc = 0
  return { cur, vel, acc }
}

/**
 * 键盘目标角度：一格 0.25·maxTilt（按 4 下到位），钳在 ±maxTilt。
 * ↑ 是正 rx，与 targetFromPointer 的符号约定同源；Enter 在平放与满倾间往返，
 * Home/Escape 归零，End 推到满右倾。
 */
export function keyTargetFrom(key: LensKey, cur: Vec2, maxTilt: number): Vec2 {
  const step = maxTilt * 0.25
  const clampTilt = (v: number): number => clamp(v, -maxTilt, maxTilt)
  switch (key) {
    case "ArrowUp":
      return { rx: clampTilt(cur.rx + step), ry: cur.ry }
    case "ArrowDown":
      return { rx: clampTilt(cur.rx - step), ry: cur.ry }
    case "ArrowRight":
      return { rx: cur.rx, ry: clampTilt(cur.ry + step) }
    case "ArrowLeft":
      return { rx: cur.rx, ry: clampTilt(cur.ry - step) }
    case "End":
      return { rx: 0, ry: maxTilt }
    case "Home":
    case "Escape":
      return { rx: 0, ry: 0 }
    case "Enter":
    case " ": {
      const flat = cur.rx === 0 && cur.ry === 0
      return flat ? { rx: 0, ry: maxTilt } : { rx: 0, ry: 0 }
    }
  }
}
