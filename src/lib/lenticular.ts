/* 光栅卡的客户端接线：把输入变成目标角度，把弹簧的当前值写成 4 个 CSS 变量。
   本文件**不碰画面**——长相全在 src/styles/lenticular.css 里读那几个变量
   （渲染契约见 spec §5：每帧只写 --rx / --ry / --t，离散量 --ma 只在变化时写）。

   几何从 `lenticular-card`（宿主，自身不受 3D 变换影响）的 rect 加上
   `lens-stage` 的 layout offset 算出；不能直接用 `stage.getBoundingClientRect()`
   ——那会拿到变换后的包络盒，倾角一变映射就跟着漂，形成自反馈抖动。 */

import { onScroll } from "@/lib/scroll"
import {
  DEFAULT_SPRING,
  advanceAxes,
  keyTargetFrom,
  progressOf,
  sweepAngleOf,
  targetFromDrag,
  targetFromPointer,
  type LensKey,
  type SpringOpts,
  type SpringState,
  type Vec2,
} from "@/lib/lenticular-spring"

export type LenticularHandle = { destroy(): void }

/** 宿主 data-* 缺失时的兜底，与组件默认值一致 */
const FALLBACK_MAX_TILT = 14

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** 归一化坐标钳进 [0,1]：指针贴着卡边甚至压到描边上也不该越过满倾 */
function unit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** 键盘接管的方向键：不拦就变成滚页面 */
const KEYS: readonly string[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Enter",
  "Escape",
  // 空格：浏览器里它是「按下聚焦元素」的激活键，不拦就会又切面又滚页
  " ",
]

export function mountLenticular(host: HTMLElement): LenticularHandle {
  const stage = host.querySelector<HTMLElement>("lens-stage")
  if (!stage) return { destroy: () => {} }

  const maxTilt = num(host.dataset.maxTilt, FALLBACK_MAX_TILT)
  const spring: SpringOpts = {
    stiffness: num(host.dataset.stiffness, DEFAULT_SPRING.stiffness),
    damping: num(host.dataset.damping, DEFAULT_SPRING.damping),
    mass: DEFAULT_SPRING.mass,
  }

  /* 激活标记与 slider 语义一起上：CSS 于是把「两张并列的内容」切成「一面卡」。
     role=slider 只能在这里挂——它的子树是 presentational 的，若在 SSR 里就带着它，
     静态并列态的两张 alt 会被一并抹掉，而那一态负责的正是「无 JS 也是完整内容」。
     卡上不再叠面名文字，于是当前面改由各层的 alt 转成 aria-valuetext 播报：先把两层
     的 alt 取下来存好（DOM 顺序即 A 层在前、B 层在后），再清空 img 的 alt——留着会让
     读屏把同一句话在图与 slider 上各念一遍 */
  const faceImgs = [...host.querySelectorAll<HTMLImageElement>("lens-face img")]
  const titleA = faceImgs[0]?.alt ?? ""
  const titleB = faceImgs[1]?.alt ?? ""
  host.dataset.ready = ""
  host.setAttribute("role", "slider")
  host.setAttribute("tabindex", "0")
  host.setAttribute("aria-label", host.dataset.label ?? "")
  host.setAttribute("aria-valuemin", "0")
  host.setAttribute("aria-valuemax", "100")
  host.setAttribute("aria-valuenow", "0")
  host.setAttribute("aria-valuetext", titleA)
  for (const img of faceImgs) {
    img.alt = ""
  }

  /** 宿主（未变换）的视口矩形；null 表示需要重算 */
  let rect: DOMRect | null = null
  /** 拖拽起点（触屏捻卡，或鼠标按住不放拖） */
  let drag: { id: number; x: number; y: number } | null = null
  let target: Vec2 = { rx: 0, ry: 0 }
  let state: SpringState = {
    cur: { rx: 0, ry: 0 },
    vel: { rx: 0, ry: 0 },
    acc: 0,
  }
  let ma = 90
  let raf = 0
  let prevTime = 0
  const written = new Map<string, string>()

  const setVar = (name: string, value: string): void => {
    if (written.get(name) === value) return
    written.set(name, value)
    host.style.setProperty(name, value)
  }

  const syncAria = (t: number): void => {
    const now = String(Math.round(t * 100))
    if (host.getAttribute("aria-valuenow") !== now) {
      host.setAttribute("aria-valuenow", now)
    }
    const text = t < 0.5 ? titleA : titleB
    if (host.getAttribute("aria-valuetext") !== text) {
      host.setAttribute("aria-valuetext", text)
    }
  }

  const writeAll = (): void => {
    const t = progressOf(state.cur, maxTilt)
    setVar("--rx", state.cur.rx.toFixed(3))
    setVar("--ry", state.cur.ry.toFixed(3))
    setVar("--t", t.toFixed(4))
    ma = sweepAngleOf(state.cur, maxTilt, ma)
    setVar("--ma", `${ma}deg`)
    syncAria(t)
  }

  /** 平放且静止：写出精确零值并停掉循环，绝不留一个常驻 rAF */
  const atRest = (): boolean => {
    if (target.rx !== 0 || target.ry !== 0) return false
    const e = 0.01
    return (
      Math.abs(state.cur.rx) < e &&
      Math.abs(state.cur.ry) < e &&
      Math.abs(state.vel.rx) < e &&
      Math.abs(state.vel.ry) < e
    )
  }

  const tick = (time: number): void => {
    const dt = prevTime ? Math.min((time - prevTime) / 1000, 0.25) : 0
    prevTime = time
    state = advanceAxes(state, target, spring, dt)
    if (atRest()) {
      state = { cur: { rx: 0, ry: 0 }, vel: { rx: 0, ry: 0 }, acc: 0 }
      writeAll()
      stop()
      return
    }
    writeAll()
    raf = requestAnimationFrame(tick)
  }

  const start = (): void => {
    if (raf) return
    prevTime = 0
    stage.style.setProperty("will-change", "transform")
    raf = requestAnimationFrame(tick)
  }

  const stop = (): void => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    stage.style.removeProperty("will-change")
  }

  /* reduced-motion：不启 rAF、不做倾斜、不做高光；直接把目标当当前值写出去，
     平滑交给 CSS（靠 @property 注册的 --t 才能被 transition）。进度用的是
     **同一条 progressOf**，只是取的是目标角而不是弹簧当前角——因为根本没有弹簧。
     画面依然能切换：reduced-motion 不得夺走内容 */
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)")

  const applyImmediate = (): void => {
    state = {
      cur: { rx: target.rx, ry: target.ry },
      vel: { rx: 0, ry: 0 },
      acc: 0,
    }
    writeAll()
  }

  /** 每个输入事件都走这里：要么把循环起来，要么当场算一步 */
  const pulse = (): void => {
    if (reduceMotion.matches) applyImmediate()
    else start()
  }

  /* 指针位置映射：宿主矩形（不含变换）+ stage 的 layout 偏移，
     于是倾斜本身不会改变映射坐标系 */
  const applyPointer = (e: PointerEvent): void => {
    if (!rect) rect = host.getBoundingClientRect()
    const x = e.clientX - rect.left - stage.offsetLeft
    const y = e.clientY - rect.top - stage.offsetTop
    target = targetFromPointer(
      unit(x / stage.offsetWidth),
      unit(y / stage.offsetHeight),
      maxTilt,
    )
  }

  /* 触屏（或鼠标按住）：位移映射成角度，拖出卡面也只是钳在满倾 */
  const applyDrag = (e: PointerEvent): void => {
    if (!drag) return
    target = targetFromDrag(
      e.clientX - drag.x,
      e.clientY - drag.y,
      stage.offsetWidth / 2,
      stage.offsetHeight / 2,
      maxTilt,
    )
  }

  const onEnter = (): void => {
    rect = host.getBoundingClientRect()
    pulse()
  }

  const onMove = (e: PointerEvent): void => {
    if (drag) applyDrag(e)
    else applyPointer(e)
    /* 每个输入事件都得保证有人接着算：循环会在静止后自己停下，而
       pointerenter 不一定会再来——指针本来就搭在卡面上时（首次挂载、
       或 destroy 后重新接回）根本没有 enter；拖拽中停顿超过一帧也会被
       自己停掉。实测过：少了这一句，同一次拖拽的 ry/t 全程为 0 */
    pulse()
  }

  const hasCapture = (id: number): boolean => {
    try {
      return stage.hasPointerCapture(id)
    } catch {
      return false
    }
  }

  const onDown = (e: PointerEvent): void => {
    // 顺序是加固出来的：先把状态摆好、把循环起起来，再试探 pointer capture。
    // capture 对不可信 pointerId 会抛 NotFoundError（实测：合成触屏事件），
    // 把它放在前面会让本 handler 就地中断——drag 留在原地无人清，
    // 之后 pointerleave 也复位不了，卡死在一个半倾角度上
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    target = { rx: 0, ry: 0 }
    rect = host.getBoundingClientRect()
    pulse()
    try {
      stage.setPointerCapture(e.pointerId)
    } catch {
      /* 不可信 pointer：没有 capture 也照旧能跑，只是拖出卡面后靠不到 move */
    }
  }

  const endDrag = (e: PointerEvent): void => {
    if (drag?.id === e.pointerId) {
      try {
        if (hasCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
      } catch {
        /* 同上：释放失败也不能挡住下面的归零 */
      }
    }
    drag = null
    target = { rx: 0, ry: 0 }
    /* 必须 pulse：常规模式下弹簧循环接手把画面弹回去；reduced 模式下根本没有
     循环，不当场写出去就会卡在拖到的一半（实测 t=0.4332 停住，下次按键还倒退跳变） */
    pulse()
  }

  /* 离开：目标归零，剩下的交给弹簧（回弹是它自己的事，不另写归零动画）。
     正在拖且捕获在手时不接管（等 pointerup/cancel 收尾）；捕获没拿到
     （不可信 pointer）就别让 drag 挂着——否则离开卡面后角度复位不了 */
  const onLeave = (e: PointerEvent): void => {
    if (drag?.id === e.pointerId && !hasCapture(e.pointerId)) {
      drag = null
    }
    if (drag) return
    target = { rx: 0, ry: 0 }
    /* 同上：reduced 模式没有循环，离开时必须当场写回平放态 */
    pulse()
  }

  /* 键盘：与鼠标同一套目标角语义（一格 0.25·maxTilt、Enter 往返、Home/Escape 归零），
     写进度与 aria 的路径也复用 writeAll——不另外开一条只有键盘能走的通路。
     reduce 下 pulse() 会当场写出，于是方向键只改画面不倾斜 */
  const onKey = (e: KeyboardEvent): void => {
    if (!KEYS.includes(e.key)) return
    e.preventDefault()
    target = keyTargetFrom(e.key as LensKey, target, maxTilt)
    if (!reduceMotion.matches) rect = host.getBoundingClientRect()
    pulse()
  }

  /* 运行中切换偏好：当场把弹簧抹平并写出零值，否则旧的循环会继续抽倾斜 */
  const onReduceChange = (): void => {
    stop()
    target = { rx: 0, ry: 0 }
    state = { cur: { rx: 0, ry: 0 }, vel: { rx: 0, ry: 0 }, acc: 0 }
    writeAll()
  }

  /* rect 是视口坐标，滚动与尺寸变化都会让它过期 */
  const invalidate = (): void => {
    rect = null
  }
  const observer = new ResizeObserver(invalidate)
  observer.observe(host)
  const offScroll = onScroll(invalidate)

  stage.addEventListener("pointerenter", onEnter)
  stage.addEventListener("pointermove", onMove)
  stage.addEventListener("pointerdown", onDown)
  stage.addEventListener("pointerup", endDrag)
  stage.addEventListener("pointercancel", endDrag)
  stage.addEventListener("pointerleave", onLeave)
  host.addEventListener("keydown", onKey)
  reduceMotion.addEventListener("change", onReduceChange)

  return {
    destroy: () => {
      stop()
      stage.removeEventListener("pointerenter", onEnter)
      stage.removeEventListener("pointermove", onMove)
      stage.removeEventListener("pointerdown", onDown)
      stage.removeEventListener("pointerup", endDrag)
      stage.removeEventListener("pointercancel", endDrag)
      stage.removeEventListener("pointerleave", onLeave)
      host.removeEventListener("keydown", onKey)
      reduceMotion.removeEventListener("change", onReduceChange)
      observer.disconnect()
      offScroll()
    },
  }
}
