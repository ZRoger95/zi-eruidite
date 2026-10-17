// live.ts — the page's own machine. It runs the same model the drawing was built
// from: the arm's turn is the screw's pitch, the ram's depth is what closes the gap,
// one strike embosses a whole family at once, and swapping a head changes nothing
// else on the press. Actions queue; the tour runs the same queue the reader does.
//
// Ported from the draft live.js as an ES module: it imports the real kit functions
// instead of relying on inlined globals, and every DOM query is scoped to its host
// element so two figures on one page cannot talk to each other's machine.
import { geo } from "./geo"
import * as k from "../iso-kit"
import { armAngleOf } from "./model"

type MarkSet = { kind: number; at: number }
type Action = "strike" | "index" | "renew" | "swap"
type Act = Action | null
type Stage = "down" | "dwell" | "up" | "move" | "raise" | "lower" | null

type FigureState = {
  loaded: number
  sets: MarkSet[]
  fresh: MarkSet | null
  advance: number
  depth: number
  angle: number
  lift: number
  action: Act
  stage: Stage
  t: number
  from: number
  to: number
  applied: boolean
  queue: Action[]
}

export function mountFamilyPress(host: HTMLElement): { destroy(): void } {
  const DATA = JSON.parse(host.dataset.state!)
  const M = DATA.M
  const P = DATA.P
  const GL = {
    glyph: (kind: number, index: number) => DATA.GLYPHS[kind][index],
    dies: DATA.DIES,
    witness: (kind: number) => DATA.WITNESS[kind],
  }
  const $ = geo(M, GL, P)
  const FAMILIES = DATA.FAMILIES
  const TAU = Math.PI * 2

  const stage = host.querySelector(".iso-stage") as HTMLElement
  const svgEl = stage.querySelector("svg") as Element
  const readout = host.querySelector("[data-readout]") as HTMLElement
  const announce = host.querySelector("[data-live]") as HTMLElement
  const still = matchMedia("(prefers-reduced-motion: reduce)")
  const find = (name: string) =>
    svgEl.querySelector('[data-part="' + name + '"]') as Element
  const el = {
    head: find("head"),
    headFace: find("headFace"),
    carriage: find("carriage"),
    band: find("bandFace"),
    ram: find("ramMove"),
    springBack: find("springBack"),
    springFront: find("springFront"),
    seats: find("springSeats"),
    arm: find("arm"),
    pointer: find("pointer"),
    rack: [0, 1, 2].map((i) => find("rack" + i)),
  }
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v))
  const ease = (t: number) => t * t * (3 - 2 * t)

  const s: FigureState = {
    loaded: DATA.INITIAL.loaded,
    sets: DATA.INITIAL.sets.map((x: MarkSet) => ({ ...x })),
    fresh: null,
    advance: DATA.INITIAL.advance,
    depth: 0,
    angle: 0,
    lift: 0,
    action: null,
    stage: null,
    t: 0,
    from: 0,
    to: DATA.INITIAL.loaded,
    applied: false,
    queue: [],
  }

  // the machine's times, in seconds: a stroke is down, dwell, back
  const TIME: Record<string, number> = {
    down: 0.46,
    dwell: 0.16,
    up: 0.38,
    move: 0.58,
    raise: 0.26,
    lower: 0.26,
  }

  function rebuildHeadFace() {
    el.headFace.innerHTML =
      $.headFace(
        M.RAM_X,
        (x: number, v: number) => $.iso([x, $.HEAD_FACE_Y, $.HEAD_MID_Z + v]),
        s.loaded,
      ) +
      k.dotsSvg(
        GL.witness(s.loaded).map(([u, v]: [number, number]) =>
          $.iso([M.RAM_X + u * 1.3, $.HEAD_FACE_Y, $.Z_HEAD0 + 1.6 + v * 0.5]),
        ),
        { size: 0.6, tone: "hi" },
      )
  }
  function rebuildBand() {
    el.band.innerHTML = $.bandFace(s.sets, s.fresh)
  }
  function showRack() {
    for (let i = 0; i < 3; i++) {
      if (!el.rack[i]) continue
      if (i === s.loaded) el.rack[i].setAttribute("display", "none")
      else el.rack[i].removeAttribute("display")
    }
  }

  // a strike makes the whole family at once; the band carries it away
  function strike() {
    if (s.fresh) return
    // a place already struck is struck again by the same head: the mark deepens, it
    // does not double, so the set at this advance is replaced, not added
    const at = Math.round(s.advance)
    s.fresh = { kind: s.loaded, at }
    s.sets = [...s.sets.filter((x) => x.at !== at), s.fresh]
    rebuildBand()
  }

  function begin(action: Action) {
    s.action = action
    s.t = 0
    s.applied = false
    if (action === "strike") s.stage = "down"
    else if (action === "index") {
      s.from = s.advance
      s.to = clamp(s.advance + M.INDEX, 0, M.ADVANCE_MAX)
      s.stage = "move"
    } else if (action === "renew") {
      s.from = s.advance
      s.to = 0
      s.sets = []
      s.fresh = null
      rebuildBand()
      s.stage = "move"
    } else if (action === "swap") s.stage = "raise"
    run()
  }

  function finish() {
    s.action = null
    s.stage = null
    s.lift = 0
    s.fresh = null
    rebuildBand()
    if (wantSwap !== null && wantSwap !== s.loaded) {
      const next = wantSwap
      wantSwap = null
      s.to = next
      begin("swap")
    }
  }

  function advanceStage() {
    const action = s.action
    if (action === "strike") {
      if (s.stage === "down") s.stage = "dwell"
      else if (s.stage === "dwell") s.stage = "up"
      else finish()
    } else if (action === "index" || action === "renew") finish()
    else {
      if (s.stage === "raise") s.stage = "lower"
      else finish()
    }
    s.t = 0
    s.applied = false
  }

  function stepAction(dt: number): boolean {
    const calm = still.matches
    if (!s.action) return false
    s.t += dt / TIME[s.stage as string]
    const t = clamp(calm ? 1 : s.t, 0, 1)
    const e = ease(t)
    if (s.action === "strike") {
      if (s.stage === "down") {
        s.depth = M.STROKE * e
        if (s.depth >= M.GAP) strike()
      } else if (s.stage === "dwell") s.depth = M.STROKE
      else s.depth = M.STROKE * (1 - e)
    } else if (s.action === "index" || s.action === "renew") {
      s.advance = s.from + (s.to - s.from) * e
    } else if (s.action === "swap") {
      if (s.stage === "raise") s.lift = 26 * e
      else {
        s.lift = 26 * (1 - e)
        if (!s.applied && (s.stage === "lower" || t >= 1)) {
          s.applied = true
          s.loaded = s.to
          rebuildHeadFace()
          showRack()
          announce.textContent = "装好" + FAMILIES[s.loaded].zh
        }
      }
    }
    if (s.t >= 1 || calm) advanceStage()
    return true
  }

  // ── the queue: the reader's hands and the idle tour both push onto it ─────────
  let wantSwap: number | null = null
  function push(action: Action) {
    if (action === "swap") {
      if (wantSwap === null && s.loaded === s.to && !s.action) return
      wantSwap = null
    }
    s.queue.push(action)
    run()
  }
  function serve() {
    if (s.action || !s.queue.length) return
    const action = s.queue.shift() as Action
    if (action === "swap") {
      const next = (s.loaded + 1) % 3
      s.to = next
      begin("swap")
    } else begin(action)
  }

  // ── draw the machine from its numbers ────────────────────────────────────────
  function place() {
    s.angle = armAngleOf(s.depth)
    // the return spring squeezes between the bushing and the retainer as the ram closes
    const coil = $.vcoil(
      M.RAM_X,
      M.RAM_Y,
      $.Z_BUSH1,
      $.RETAIN.z0 - s.depth,
      $.SPR_R,
      4,
    )
    el.springBack.setAttribute("d", coil.back)
    el.springFront.setAttribute("d", coil.front)
    el.seats.setAttribute(
      "d",
      k.ring(M.RAM_X, M.RAM_Y, $.SPR_R, $.Z_BUSH1, P, 26) +
        k.ring(M.RAM_X, M.RAM_Y, $.SPR_R, $.RETAIN.z0 - s.depth, P, 26),
    )
    el.head.setAttribute(
      "transform",
      k.translateAlong(P, [0, 0, s.lift - s.depth]),
    )
    el.ram.setAttribute("transform", k.translateAlong(P, [0, 0, -s.depth]))
    el.carriage.setAttribute(
      "transform",
      k.translateAlong(P, [s.advance, 0, 0]),
    )
    const shift = $.armShift(s.angle)
    el.arm.setAttribute(
      "transform",
      `translate(${shift[0].toFixed(2)} ${shift[1].toFixed(2)})`,
    )
    el.pointer.setAttribute("d", $.pointerD(s.angle))
  }

  const WORD: Record<string, string> = {
    down: "压印",
    dwell: "压印",
    up: "回程",
    move: "送料",
    raise: "换头",
    lower: "换头",
  }
  function say() {
    const phase = s.action ? WORD[s.stage as string] || "压印" : "待机"
    const text =
      s.action === "swap"
        ? "换头 · " + FAMILIES[s.to].zh
        : phase +
          " · 行程 " +
          s.depth.toFixed(2) +
          " · 压入 " +
          Math.max(0, s.depth - M.GAP).toFixed(2) +
          " · " +
          FAMILIES[s.loaded].zh
    if (readout.textContent !== text) readout.textContent = text
  }

  // ── the loop ────────────────────────────────────────────────────────────────
  const TOUR: Action[] = [
    "strike",
    "index",
    "swap",
    "strike",
    "index",
    "swap",
    "strike",
    "renew",
    "swap",
  ]
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
      if (tourClock > 0.9) {
        tourClock = 0
        s.queue.push(TOUR[tourAt % TOUR.length])
        tourAt += 1
      }
    }
    const busy = stepAction(dt)
    serve()
    place()
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
    // whatever the tour had queued but not started is dropped: the reader's hands
    // take the machine from where they see it, not from the tour's plan
    s.queue = []
    wantSwap = null
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      touring = !still.matches
      tourClock = 0
      run()
    }, 4600)
  }

  // ── the reader's hands ───────────────────────────────────────────────────────
  // the rack across the plate: a pointer over it asks for the nearest head, and
  // nowhere else moves the machine
  const RACK = DATA.RACK
  const VB = DATA.VB
  const slotAt = (event: PointerEvent) => {
    const box = svgEl.getBoundingClientRect()
    const vx = ((event.clientX - box.left) / box.width) * VB[0]
    const vy = ((event.clientY - box.top) / box.height) * VB[1]
    if (
      vx < RACK.x0 - 8 ||
      vx > RACK.x1 + 8 ||
      vy < RACK.y0 - 8 ||
      vy > RACK.y1 + 8
    )
      return -1
    let best = -1
    let near = Infinity
    RACK.slots.forEach((sx: number, i: number) => {
      const d = Math.abs(sx - vx)
      if (d < near) {
        near = d
        best = i
      }
    })
    return best
  }
  function askHead(kind: number) {
    if (kind < 0 || kind === s.loaded || kind === s.to) return
    takeOver()
    if (!s.action && !s.queue.length) {
      s.to = kind
      begin("swap")
    } else wantSwap = kind
  }
  stage.addEventListener(
    "pointermove",
    (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      askHead(slotAt(event))
    },
    { signal: ac.signal },
  )
  stage.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      takeOver()
      if (event.pointerType === "mouse") push("strike")
      else {
        askHead(slotAt(event))
        if (!s.action) push("strike")
      }
    },
    { signal: ac.signal },
  )
  stage.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      const key = event.key
      takeOver()
      if (key === "ArrowRight") askHead((s.loaded + 1) % 3)
      else if (key === "ArrowLeft") askHead((s.loaded + 2) % 3)
      else if (key === " " || key === "Enter") push("strike")
      else if (key === "Backspace" || key === "Delete")
        push(s.advance >= M.ADVANCE_MAX ? "renew" : "index")
      else return
      event.preventDefault()
    },
    { signal: ac.signal },
  )
  stage.addEventListener(
    "focus",
    () => {
      announce.textContent = FAMILIES[s.loaded].zh + " 在机上"
    },
    { signal: ac.signal },
  )

  showRack()
  say()
  if (import.meta.env.DEV)
    (window as unknown as { __press: FigureState }).__press = s // the checks read the machine through this one hook

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
