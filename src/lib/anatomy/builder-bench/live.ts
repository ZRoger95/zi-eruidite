// live.ts — the bench's own machine. It runs the same model the drawing was built
// from: the carriage walks the ordered stations one by one (the Director, never
// changed), each station lets its part down onto the growing stack, and sliding in
// another builder cassette restacks the whole product from the same walk. Actions
// queue; the idle tour runs the very same queue the reader's hands push onto.
//
// The client bundle carries only this, geo, model and iso-kit — never figure/lathe.
import { geo } from "./geo"
import * as k from "../iso-kit"
import { M, carriageAt, stackTop } from "./model"

type Action = "step" | "renew" | "swap"
type Stage = "travel" | "lower" | "seat" | "clear" | null

type BenchState = {
  bi: number // which builder cassette is loaded
  active: number // parts seated so far, and the index of the next one to place
  at: number // the station the carriage currently stands at
  fly: number // how high the held part rides above its seat (world mm)
  fresh: boolean // the just-seated part is lit
  action: Action | null
  stage: Stage
  t: number
  fromAt: number
  toAt: number
  queue: Action[]
}

export function mountBuilderBench(host: HTMLElement): { destroy(): void } {
  const DATA = JSON.parse(host.dataset.state!)
  const M2: typeof M = DATA.M
  const P = DATA.P
  const $ = geo(P)
  const NAMES = DATA.BUILDERS as { zh: string }[]

  const stage = host.querySelector(".iso-stage") as HTMLElement
  const svgEl = stage.querySelector("svg") as Element
  const readout = host.querySelector("[data-readout]") as HTMLElement
  const announce = host.querySelector("[data-live]") as HTMLElement
  const still = matchMedia("(prefers-reduced-motion: reduce)")
  const find = (name: string) =>
    svgEl.querySelector('[data-part="' + name + '"]') as Element

  const el = {
    carriage: find("carriage"),
    held: find("held"),
    gauge: find("gauge"),
    led: [0, 1, 2, 3].map((i) => find("led" + i)),
    mag: [0, 1, 2].map((i) => find("mag" + i)),
  }
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v))
  const ease = (t: number) => t * t * (3 - 2 * t)

  const s: BenchState = {
    bi: DATA.INITIAL.bi,
    active: DATA.INITIAL.active,
    at: DATA.INITIAL.active,
    fly: $.hold(DATA.INITIAL.bi, DATA.INITIAL.active),
    fresh: false,
    action: null,
    stage: null,
    t: 0,
    fromAt: DATA.INITIAL.active,
    toAt: DATA.INITIAL.active,
    queue: [],
  }

  const TIME: Record<string, number> = {
    travel: 0.5,
    lower: 0.44,
    seat: 0.16,
    clear: 0.3,
  }
  const LAST = M2.STATIONS.length - 1

  // ── draw the machine from its numbers ───────────────────────────────────────
  function rebuildStack() {
    // the stack lives inside the carriage group; re-lay it for the current builder
    const g = el.carriage.querySelector('[data-part="stack"]') as Element
    if (g) g.innerHTML = $.stack(s.bi, s.active, s.fresh)
  }
  function renderCarriage() {
    const dx = carriageAt(s.at)
    el.carriage.setAttribute("transform", k.translateAlong(P, [dx, 0, 0]))
  }
  function renderHeld() {
    if (s.active > LAST) {
      el.held.setAttribute("display", "none")
      return
    }
    el.held.removeAttribute("display")
    el.held.innerHTML = $.heldPart(s.bi, s.active)
    el.held.setAttribute("transform", $.lift(s.fly))
  }
  function renderLeds() {
    const on = s.active > LAST ? -1 : s.active
    for (let i = 0; i < 4; i++) {
      if (!el.led[i]) continue
      if (i === on) el.led[i].removeAttribute("display")
      else el.led[i].setAttribute("display", "none")
    }
  }
  function renderGauge() {
    if (!el.gauge) return
    const h = stackTop(s.bi, Math.min(s.active, LAST + 1)) - M2.Z_PLATEN
    el.gauge.setAttribute("transform", k.translateAlong(P, [0, 0, h]))
  }
  function renderMag() {
    for (let i = 0; i < 3; i++) {
      if (!el.mag[i]) continue
      if (i === s.bi) el.mag[i].setAttribute("display", "none")
      else el.mag[i].removeAttribute("display")
    }
  }
  function place() {
    renderCarriage()
    rebuildStack()
    renderHeld()
    renderLeds()
    renderGauge()
  }

  function begin(action: Action) {
    s.action = action
    s.t = 0
    if (action === "step") {
      if (s.active > LAST) {
        s.action = null
        return
      }
      s.fromAt = s.at
      s.toAt = s.active
      s.fresh = false
      s.stage = s.fromAt === s.toAt ? "lower" : "travel"
      if (s.stage === "lower") s.fly = $.hold(s.bi, s.active)
    } else if (action === "renew") {
      s.stage = "clear"
    } else if (action === "swap") {
      s.action = null
      s.stage = null
      rebuildStack()
      renderHeld()
      renderLeds()
      renderMag()
      announce.textContent = "装好" + NAMES[s.bi].zh
      say()
      return
    }
    run()
  }

  function seatOne() {
    // the part has reached its seat: fold it into the stack and advance the Director
    s.active += 1
    s.at = s.toAt
    s.fresh = s.active <= LAST + 1
    if (s.active <= LAST) s.fly = $.hold(s.bi, s.active)
    else s.fly = 0
  }

  function advanceStage() {
    const a = s.action
    if (a === "step") {
      if (s.stage === "travel") {
        s.stage = "lower"
        s.at = s.toAt
        s.fly = $.hold(s.bi, s.active)
      } else if (s.stage === "lower") {
        s.stage = "seat"
      } else {
        seatOne()
        s.action = null
        s.stage = null
        place()
        return
      }
    } else if (a === "renew") {
      // empty the stack, wind the Director back to the first station
      s.active = 0
      s.fresh = false
      s.fly = $.hold(s.bi, 0)
      s.at = 0
      s.action = null
      s.stage = null
      place()
      renderLeds()
      return
    }
    s.t = 0
  }

  function stepFrame(dt: number): boolean {
    const calm = still.matches
    if (!s.action) return false
    s.t += dt / TIME[s.stage as string]
    const t = clamp(calm ? 1 : s.t, 0, 1)
    const e = ease(t)
    if (s.stage === "travel") s.at = s.fromAt + (s.toAt - s.fromAt) * e
    else if (s.stage === "lower") {
      const top = $.hold(s.bi, s.active)
      s.fly = top * (1 - e)
    }
    if (s.t >= 1 || calm) advanceStage()
    place()
    return true
  }

  // ── the queue: the reader's hands and the idle tour both push onto it ─────────
  let wantBi: number | null = null
  function push(action: Action) {
    if (action === "step" && s.active > LAST) action = "renew"
    s.queue.push(action)
    run()
  }
  function serve() {
    if (s.action || !s.queue.length) return
    const action = s.queue.shift() as Action
    if (action === "swap") {
      s.bi = wantBi !== null ? wantBi : (s.bi + 1) % 3
      wantBi = null
    }
    begin(action)
  }

  // ── the readout: the same numbers the machine shows ──────────────────────────
  function say() {
    const phase =
      s.action === null
        ? s.active > LAST
          ? "完工"
          : "待机"
        : s.stage === "travel"
          ? "移位"
          : s.stage === "lower"
            ? "落件"
            : s.stage === "clear"
              ? "清空"
              : "就位"
    const grown = stackTop(s.bi, Math.min(s.active, LAST + 1)) - M2.Z_PLATEN
    const text =
      NAMES[s.bi].zh +
      " · 工序 " +
      Math.min(s.active, LAST + 1) +
      "/" +
      (LAST + 1) +
      " · 已叠 " +
      grown.toFixed(1)
    if (readout.textContent !== text) readout.textContent = text
  }

  // ── the loop ────────────────────────────────────────────────────────────────
  const TOUR: Action[] = ["step", "step", "step", "step", "renew", "swap"]
  let tourAt = 0
  let frame = 0
  let last = 0
  let visible = false
  let touring = !still.matches
  let tourClock = 0
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  function tick(now: number) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60
    last = now
    if (touring && !s.action && !s.queue.length) {
      tourClock += dt
      if (tourClock > 0.8) {
        tourClock = 0
        s.queue.push(TOUR[tourAt % TOUR.length])
        tourAt += 1
      }
    }
    const busy = stepFrame(dt)
    serve()
    say()
    frame =
      visible && (busy || touring || s.queue.length || s.action)
        ? requestAnimationFrame(tick)
        : 0
  }
  function run() {
    if (!frame && visible) {
      last = 0
      frame = requestAnimationFrame(tick)
    }
  }

  const ac = new AbortController()
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1].isIntersecting
      if (visible) run()
    },
    { rootMargin: "120px 0px" },
  )
  io.observe(stage)

  function takeOver() {
    touring = false
    s.queue = []
    wantBi = null
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      touring = !still.matches
      tourClock = 0
      run()
    }, 4600)
  }

  // ── the reader's hands ───────────────────────────────────────────────────────
  const MAG = DATA.MAG
  const VB = DATA.VB
  const slotAt = (event: PointerEvent) => {
    const box = svgEl.getBoundingClientRect()
    const vx = ((event.clientX - box.left) / box.width) * VB[0]
    const vy = ((event.clientY - box.top) / box.height) * VB[1]
    if (
      vx < MAG.x0 - 8 ||
      vx > MAG.x1 + 8 ||
      vy < MAG.y0 - 8 ||
      vy > MAG.y1 + 8
    )
      return -1
    let best = -1
    let near = Infinity
    MAG.slots.forEach((sx: number, i: number) => {
      const d = Math.abs(sx - vx)
      if (d < near) {
        near = d
        best = i
      }
    })
    return best
  }
  function askBuilder(bi: number) {
    if (bi < 0 || bi === s.bi) return
    takeOver()
    if (!s.action && !s.queue.length) {
      s.bi = bi
      begin("swap")
    } else {
      wantBi = bi
      s.queue.push("swap")
    }
  }
  stage.addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      askBuilder(slotAt(event))
    },
    { signal: ac.signal },
  )
  stage.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      takeOver()
      const slot = slotAt(event)
      if (slot >= 0 && slot !== s.bi) askBuilder(slot)
      else push(s.active > LAST ? "renew" : "step")
    },
    { signal: ac.signal },
  )
  stage.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      const key = event.key
      takeOver()
      if (key === "ArrowRight") push("step")
      else if (key === "ArrowLeft") push("renew")
      else if (key === " " || key === "Enter")
        push(s.active > LAST ? "renew" : "step")
      else if (key === "Backspace" || key === "Delete") push("renew")
      else return
      event.preventDefault()
    },
    { signal: ac.signal },
  )
  stage.addEventListener(
    "focus",
    () => {
      announce.textContent = NAMES[s.bi].zh + " 已装机"
    },
    { signal: ac.signal },
  )

  // seat the drawing where it started, then let the machine run
  place()
  renderMag()
  say()
  if (import.meta.env.DEV)
    (window as unknown as { __bench: BenchState }).__bench = s

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      clearTimeout(idleTimer)
      io.disconnect()
      ac.abort()
    },
  }
}
