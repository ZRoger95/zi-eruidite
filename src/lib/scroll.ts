/**
 * 活跃滚动源抽象：容器模式下滚动发生在 `page-scroll` 元素上，其余布局
 * 与断点下滚动窗口。依赖滚动的组件只面向本模块，不关心滚动发生在哪。
 *
 * 实测陷阱：`display: contents` 下 computed `overflowY` 仍为 `auto`
 * （样式规则照常匹配、只是不生成盒子），判定必须同时排除 `contents`。
 */

export type ScrollTarget = Window | HTMLElement

/** 容器模式（`page-scroll` 生成盒子且可滚）→ 该元素；否则窗口。 */
export function activeTarget(): ScrollTarget {
  const el = document.querySelector<HTMLElement>("page-scroll")
  if (!el) return window
  const style = getComputedStyle(el)
  if (style.display === "contents" || style.overflowY !== "auto") return window
  return el
}

/** 活跃源当前滚动位置。 */
export function top(): number {
  const target = activeTarget()
  return target === window ? window.scrollY : target.scrollTop
}

/** 立即（非平滑）滚动活跃源到 `value`。 */
export function setTop(value: number): void {
  const target = activeTarget()
  if (target === window) window.scrollTo({ top: value })
  else target.scrollTo({ top: value })
}

/** 活跃源的视口高度（容器可视高 / 窗口内高）。 */
export function viewportHeight(): number {
  const target = activeTarget()
  return target === window ? window.innerHeight : target.clientHeight
}

/**
 * 活跃源是否已滚到底部（2px 容差）。不可滚动的文档/容器恒为 `false`
 * （`max > 0` 守卫，与页面级滚动旧实现的语义一致）。
 */
export function atBottom(): boolean {
  const target = activeTarget()
  const scrollHeight =
    target === window
      ? document.documentElement.scrollHeight
      : target.scrollHeight
  const max = scrollHeight - viewportHeight()
  return max > 0 && top() >= max - 2
}

/**
 * 监听滚动。实测：窗口滚动只被 window 监听器收到，元素滚动只被
 * document 捕获监听器收到，故双挂。handler 须幂等（各消费者均幂等）；
 * 回调收到原始事件，可按事件源作进一步过滤。
 */
export function onScroll(handler: (event: Event) => void): void {
  window.addEventListener("scroll", handler, { passive: true })
  document.addEventListener("scroll", handler, {
    capture: true,
    passive: true,
  })
}

/** 实测滚动条宽度写入 `--scrollbar-width`（容器非激活态重置为 0）。 */
export function syncScrollbarWidth(): void {
  const el = document.querySelector<HTMLElement>("page-scroll")
  const root = document.documentElement
  if (!el || activeTarget() !== el) {
    root.style.setProperty("--scrollbar-width", "0px")
    return
  }
  root.style.setProperty(
    "--scrollbar-width",
    `${el.offsetWidth - el.clientWidth}px`,
  )
}

let initialized = false

/** 最近一次活跃源滚动位置：模式切换时迁移到新的活跃源。 */
let lastTop = 0

/**
 * 幂等初始化：首测滚动条宽度（顶栏对齐补偿），并在断点变化、视口
 * resize 与布局运行时切换（`data-layout`）时重测；断点/布局切换还
 * 迁移滚动位置——记录 `lastTop`，变化后于下一帧应用到新的活跃源。
 * 断点与 `data-layout` 两种变化源共用一个处理函数，避免重复监听。
 */
export function initScroll(): void {
  if (initialized) return
  initialized = true
  onScroll((event) => {
    // 仅记录来自当前活跃源的滚动：模式切换后旧目标（如窗口 clamp）的
    // 收尾事件会在新目标上读出偏值，照单全收会污染迁移源位置。
    const node = event.target
    const source =
      node === document || node === window ? window : (node as ScrollTarget)
    if (source !== activeTarget()) return
    lastTop = top()
  })
  syncScrollbarWidth()
  const schedule = () => {
    requestAnimationFrame(() => setTop(lastTop))
  }
  const onModeChange = () => {
    syncScrollbarWidth()
    schedule()
  }
  matchMedia("(width >= 64rem)").addEventListener("change", onModeChange)
  window.addEventListener("resize", syncScrollbarWidth)
  new MutationObserver(onModeChange).observe(document.documentElement, {
    attributeFilter: ["data-layout"],
  })
}
