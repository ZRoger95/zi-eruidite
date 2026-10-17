// Builds the bench: an indexing assembly machine that makes "builder" one object.
// A carriage carries the product-to-be; a gantry overhead holds four ordered
// stations, and the carriage walks them one by one — that walk is the Director, and
// it never changes. Each station lets one part down onto the growing stack. A slide
// in a builder cassette decides what those four parts look like, so the same walk
// assembles a different product while the bench, the rails and the order stay put.
//
//   the drawing is static; the page (live.ts) moves the carriage, drops the parts
//   and swaps the cassette, reading the very same model.ts numbers.
import * as k from "../iso-kit"
import * as G from "../lathe"
import {
  BUILDERS,
  M,
  STEPS,
  seatZ,
  stackTop,
  carriageAt,
  totalH,
  witnessOf,
} from "./model"
import { geo } from "./geo"

export type Chrome = {
  fig: string
  title: string
  hint: string
  readout: string
  aria: string
  keys: k.LegendKey[]
  caption: string
}
export type FigureData = {
  M: typeof M
  P: k.Projection
  VB: [number, number]
  INITIAL: { bi: number; active: number; fresh: boolean }
  BUILDERS: { id: string; zh: string; en: string }[]
  STEPS: { zh: string }[]
  TOTALS: number[]
  MAG: { x0: number; x1: number; y0: number; y1: number; slots: number[] }
}
export type FigureResult = { svg: string; data: FigureData; chrome: Chrome }

// ── the bench, in world millimetres ───────────────────────────────────────────
const BASE = { x: 6, y: -46, w: 252, d: 72, r: 7 }
const BASE_H = 10
const FOOT_H = 8
const RAILS = [M.CY - 16, M.CY + 16] // the two ways the carriage rides
const RAIL_R = 2.6
const RAIL_Z = 17.4
const RAIL_X0 = 66
const RAIL_X1 = 250
const BEAM_Z = 88 // the gantry beam's underside
const GY = M.CY - 30 // the beam and the two posts stand on this back line
const POST_X = [64, 252]
const MOUTH_R = 5.2 // the funnel a part is let down through
const MINI_SCALE = 0.46 // a cassette previews its product at half size

export function buildFigure(): FigureResult {
  const WIDTH = 660
  const HEIGHT = 452

  // ── camera: fit the whole bench, beam to feet, all four stations ─────────────
  const P = k.fitProjection(
    [
      ...k.boxCorners(BASE, -BASE_H - FOOT_H, 0),
      ...k.boxCorners(
        { x: 60, y: GY - 4, w: 200, d: 12, r: 2 },
        BEAM_Z,
        BEAM_Z + 10,
      ),
      ...k.boxCorners(
        { x: RAIL_X0, y: RAILS[0]! - 3, w: RAIL_X1 - RAIL_X0, d: 6, r: 1 },
        RAIL_Z - 3,
        RAIL_Z + 3,
      ),
      [M.STATIONS[0]! - 24, M.CY - 22, 56],
      [M.STATIONS[3]! + 24, M.CY + 22, 56],
      [M.STATIONS[3]!, M.CY, M.CHUTE_Z + MOUTH_R],
      [16, M.CY + 2, 22], // the magazine's tallest mini product
      [M.STATIONS[0], M.CY + 27, 12], // the index fin reaching the front ruler
    ],
    WIDTH,
    HEIGHT,
    { pad: 24, azimuth: 46, elevation: 35 },
  )

  const $ = geo(P)
  const at = (point: k.Point3) => k.iso(point, P)
  const S = (paths: k.SolidPaths, style?: Parameters<typeof k.solidSvg>[1]) =>
    k.solidSvg(paths, style)
  const L = (d: string, style?: Parameters<typeof k.lineSvg>[1]) =>
    k.lineSvg(d, style)
  const D = (
    points: Parameters<typeof k.dotsSvg>[0],
    style?: Parameters<typeof k.dotsSvg>[1],
  ) => k.dotsSvg(points, style)
  const depth = (point: k.Point3) => k.depthOf(point, P)
  const byDepth = (points: k.Plane[]) =>
    [...points].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]))
  const mid = (plan: k.Plan, z: number): k.Point3 => [
    plan.x + plan.w / 2,
    plan.y + plan.d / 2,
    z,
  ]

  const ITEMS: { key: number; svg: string }[] = []
  let LAYER = 0
  const put = (anchor: k.Point3, svg: string, bias = 0) =>
    ITEMS.push({ key: depth(anchor) + bias + LAYER, svg })

  const cornerScrews = (
    plan: k.Plan,
    z: number,
    inset: number,
    r = 2.2,
    steps = 12,
  ) =>
    L(
      k
        .corners(plan, inset)
        .map(([x, y]) => k.ring(x, y, r, z, P, steps))
        .join(""),
      { tone: "lo" },
    ) +
    D(
      k.corners(plan, inset).map(([x, y]) => at([x, y, z + 0.1])),
      { size: 0.48 },
    )

  // ── the base: plate on feet, a chip gutter, a maker's plate ─────────────────
  function base() {
    LAYER = -9000
    put(
      mid(BASE, -BASE_H - 4),
      `<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`,
      -9999,
    )
    for (const [x, y] of byDepth(k.corners(BASE, 18))) {
      put(
        [x, y, -BASE_H - FOOT_H / 2],
        S(k.cylinder(x, y, 9, -BASE_H - FOOT_H, 2.4, P, 24), { tone: "lo" }),
      )
      put(
        [x, y, -FOOT_H / 2],
        S(k.cylinder(x, y, 6.2, -BASE_H - FOOT_H + 2.4, FOOT_H - 2.4, P, 24), {
          tone: "mid",
        }),
      )
    }
    put(
      mid(BASE, -BASE_H / 2),
      S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.4), { tone: "mid" }),
    )
    put(
      mid(BASE, 0),
      L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }),
      0.4,
    )
    put(mid(BASE, 0), cornerScrews(BASE, 0, 11, 2.4), 0.5)
    // a chip gutter along the front, and a small maker's plate at the near left
    const gutter = { x: 60, y: BASE.y + BASE.d - 12, w: 182, d: 6, r: 2 }
    put(
      mid(gutter, -0.7),
      S(k.slabOf(gutter, 0, -1.4, P, 3), { tone: "lo", crease: "none" }),
      0.7,
    )
    put(
      mid(gutter, 0),
      L(k.planOutline(gutter, 0, P, 3), { tone: "faint" }),
      0.8,
    )
    const plate = { x: 12, y: BASE.y + BASE.d - 30, w: 34, d: 16, r: 1.8 }
    put(
      mid(plate, 0.6),
      S(k.slabOf(plate, 0, 1.3, P, 3), { tone: "lo", crease: "none" }),
      0.5,
    )
    put(
      mid(plate, 1.3),
      L(k.planOutline(k.insetPlan(plate, 2.2), 1.3, P, 3), { tone: "faint" }),
      0.6,
    )
    for (const [i, len] of [0.74, 0.5, 0.62].entries()) {
      const y = plate.y + 3.8 + i * 3.8
      put(
        [plate.x + plate.w / 2, y, 1.4],
        L(
          k.lineOnTop(
            [plate.x + 4, y],
            [plate.x + 4 + (plate.w - 8) * len, y],
            1.4,
            P,
          ),
          {
            tone: "lo",
            free: true,
          },
        ),
        0.7,
      )
    }
    LAYER = 0
  }

  // ── the step ruler: four ordered detents on the bench's front face ──────────
  function ruler() {
    // the Director's sequence, shown as four raised detent blocks along the bench's
    // front edge — a solid stop per station, the near one keyed as the zero where a
    // build begins. The carriage's index fin points at the one it stands on.
    const face = BASE.y + BASE.d // the front face, in y
    for (const [i, x] of M.STATIONS.entries()) {
      const det = { x: x - 4.5, y: face - 4.5, w: 9, d: 5, r: 1.2 }
      put(
        mid(det, 12),
        S(k.slabOf(det, 9, 6, P, 2, 0.4), { tone: "mid", crease: "lo" }),
        0.3,
      )
      put(
        mid(det, 15),
        L(k.planOutline(k.insetPlan(det, 1.6), 15, P, 2), { tone: "faint" }),
        0.4,
      )
      put(
        [x, face - 2, 15.2],
        D([at([x, face - 2, 15.2])], {
          size: 0.5,
          tone: i === 0 ? "hi" : "mid",
        }),
        0.5,
      )
    }
  }

  // ── the two ways the carriage rides, with collars and oil holes ─────────────
  function rails() {
    for (const y of RAILS) {
      const F = G.frameAlong([RAIL_X0, y, RAIL_Z], [1, 0, 0])
      put(
        [(RAIL_X0 + RAIL_X1) / 2, y, RAIL_Z],
        S(G.disc(0, RAIL_X1 - RAIL_X0, RAIL_R, F, P, {}), {
          tone: "hi",
          crease: "lo",
        }),
      )
      for (const x of [RAIL_X0, RAIL_X1 - 3.4]) {
        const CF = G.frameAlong([x, y, RAIL_Z], [1, 0, 0])
        put(
          [x + 1.7, y, RAIL_Z],
          S(G.disc(0, 3.4, 3.6, CF, P, { bevel: 0.3 }), { tone: "mid" }),
          0.2,
        )
        put(
          [x + 1.7, y, RAIL_Z + 2],
          L(G.circleOf(CF, 1.7, 1.6, P, 12), { tone: "faint" }),
          0.4,
        )
      }
    }
  }

  // ── the gantry: two posts, the beam, and the four ordered stations ──────────
  function gantry(active: number) {
    for (const x of POST_X) {
      const post = { x: x - 6, y: GY - 6, w: 12, d: 12, r: 2 }
      put(
        mid(post, BEAM_Z / 2),
        S(k.slabOf(post, 0, BEAM_Z, P, 3, 0.8), {
          tone: "mid",
          inner: L(k.sideSeam(post, BEAM_Z - 2, P, 3), { tone: "faint" }),
        }),
        -60,
      )
      for (const dy of [-3, 1.5]) {
        const rib = {
          x: post.x + 2,
          y: post.y + post.d + dy,
          w: post.w - 4,
          d: 3,
          r: 1,
        }
        put(
          [rib.x + rib.w / 2, rib.y + 1.5, 10],
          S(k.slabOf(rib, 0, 22, P, 2, 0.4), { tone: "lo" }),
          -60.2,
        )
      }
      put(
        [x, GY, 2],
        S(k.cylinder(x, GY, 11, 0, 4, P, 22, 0.6), { tone: "mid" }),
        -58,
      )
      put(
        [x, GY, 4.2],
        cornerScrews(
          { x: x - 8, y: GY - 8, w: 16, d: 16, r: 2 },
          4,
          3,
          1.8,
          10,
        ),
        -57,
      )
    }
    const beam = {
      x: POST_X[0]! - 6,
      y: GY - 5,
      w: POST_X[1]! - POST_X[0]! + 12,
      d: 10,
      r: 2,
    }
    put(
      mid(beam, BEAM_Z + 5),
      S(k.slabOf(beam, BEAM_Z, 10, P, 4, 1), {
        tone: "mid",
        inner: L(k.sideSeam(beam, BEAM_Z + 2, P, 4), { tone: "faint" }),
      }),
      -40,
    )
    put(
      mid(beam, BEAM_Z + 10),
      L(k.planOutline(k.insetPlan(beam, 4), BEAM_Z + 10, P, 4), { tone: "lo" }),
      -39,
    )
    put(mid(beam, BEAM_Z + 10), cornerScrews(beam, BEAM_Z + 10, 6), -38)
    // a cable raceway runs along the beam's back, fed by a junction box at the far
    // post — the bench's wiring, so the beam is not a bare bar
    const race = {
      x: M.STATIONS[0]! - 14,
      y: GY - 4,
      w: M.STATIONS[3]! - M.STATIONS[0]! + 28,
      d: 5,
      r: 1.2,
    }
    put(
      mid(race, BEAM_Z + 12),
      S(k.slabOf(race, BEAM_Z + 10, 4, P, 3, 0.4), {
        tone: "mid",
        inner: L(k.sideSeam(race, BEAM_Z + 12, P, 3), { tone: "faint" }),
      }),
      -37,
    )
    for (let x = race.x + 8; x < race.x + race.w - 4; x += 20)
      put(
        [x, GY - 1.5, BEAM_Z + 14.2],
        D([at([x, GY - 1.5, BEAM_Z + 14])], { size: 0.4 }),
        -36,
      )
    const jbox = { x: POST_X[1]! - 12, y: GY - 6, w: 16, d: 12, r: 1.6 }
    put(
      mid(jbox, BEAM_Z + 12),
      S(k.slabOf(jbox, BEAM_Z + 8, 8, P, 3, 0.5), {
        tone: "mid",
        crease: "lo",
      }),
      -35,
    )
    put(
      [jbox.x + jbox.w / 2, GY, BEAM_Z + 18],
      S(k.cylinder(jbox.x + jbox.w / 2, GY, 2.4, BEAM_Z + 16, 3, P, 16), {
        tone: "hi",
      }),
      -34,
    )
    // the four stations hang off the beam: an arm reaching forward, a feed tube,
    // and the funnel a part is let down through. They are all identical — the order
    // is the only difference, so the Director is shown to know nothing of the parts.
    for (const [i, x] of M.STATIONS.entries()) {
      const isOn = i === active
      const parts: string[] = []
      // a saddle clamped around the beam where this station's arm hangs off it
      const BF = G.frameAlong([x - 4, GY, BEAM_Z + 5], [1, 0, 0])
      parts.push(
        S(G.disc(0, 8, 6.4, BF, P, { bevel: 0.4 }), {
          tone: "hi",
          crease: "lo",
        }),
      )
      parts.push(L(G.circleOf(BF, 8, 4, P, 16), { tone: "faint" }))
      const arm = { x: x - 5, y: GY, w: 10, d: M.CY - GY + 4, r: 1.4 }
      parts.push(
        S(k.slabOf(arm, BEAM_Z - 6, 6, P, 2, 0.4), {
          tone: "mid",
          inner: L(k.sideSeam(arm, BEAM_Z - 2, P, 2), { tone: "faint" }),
        }),
      )
      // one connected feed column: a tube from the arm down to the mouth's shoulder
      const tubeTop = BEAM_Z - 6
      const TF = G.frameAlong([x, M.CY, tubeTop], [0, 0, -1])
      const tubeLen = tubeTop - M.CHUTE_Z
      parts.push(
        S(G.disc(0, tubeLen - 3, 3.3, TF, P, {}), {
          tone: "mid",
          crease: "lo",
        }),
      )
      // two collar rings around the feed tube, so it reads as a fitted column
      for (const s of [4, tubeLen - 6])
        parts.push(L(G.circleOf(TF, s, 3.4, P, 16), { tone: "faint" }))
      // the funnel mouth: a chamfered collar that widens the tube into a throat
      const MF = G.frameAlong([x, M.CY, tubeTop - (tubeLen - 3)], [0, 0, -1])
      parts.push(
        S(G.disc(0, 3, MOUTH_R, MF, P, { bevel: 0.4 }), {
          tone: "hi",
          crease: "lo",
        }),
      )
      parts.push(L(G.circleOf(MF, 3, 2.6, P, 14), { tone: "faint" }))
      // a detent ring under the mouth that only the active station lights
      parts.push(
        `<g data-part="led${i}"${isOn ? "" : ' display="none"'}>` +
          L(k.ring(x, M.CY, MOUTH_R + 2.4, M.CHUTE_Z - 0.6, P, 22), {
            tone: "lit",
          }) +
          D([at([x, M.CY - MOUTH_R - 2.4, M.CHUTE_Z + 1])], {
            size: 0.7,
            tone: "hi",
          }) +
          `</g>`,
      )
      // a witness on the arm so a station says which step it is, without words
      parts.push(
        D(
          witnessOf(0).map(([u]) => at([x + u * 0.7, GY + 1, BEAM_Z - 3])),
          { size: 0.4, tone: "lo" },
        ),
      )
      put([x, (GY + M.CY) / 2, BEAM_Z - 4], parts.join(""), isOn ? 0.5 : 0)
    }
  }

  // ── the builder magazine: a board with three cassettes, each showing the product
  //    it builds; the loaded cassette's stand is left empty, because it is in the
  //    gantry feeding the stations
  function magazine(bi: number) {
    const board = { x: 8, y: M.CY - 22, w: 60, d: 6, r: 2 }
    put(
      mid(board, 16),
      S(k.slabOf(board, 0, 32, P, 3, 0.6), {
        tone: "mid",
        inner: L(k.sideSeam(board, 30, P, 3), { tone: "faint" }),
      }),
      -34,
    )
    put(
      mid(board, 32),
      L(k.planOutline(k.insetPlan(board, 2), 32, P, 3), { tone: "lo" }),
      -33,
    )
    put(mid(board, 32.1), cornerScrews(board, 32, 3, 1.6, 9), -32.5)
    const shelf = { x: 8, y: M.CY - 16, w: 60, d: 28, r: 2 }
    put(
      mid(shelf, 1.6),
      S(k.slabOf(shelf, 0, 3.2, P, 3, 0.5), { tone: "mid" }),
      -30,
    )
    put(
      mid(shelf, 3.2),
      L(k.planOutline(k.insetPlan(shelf, 3), 3.2, P, 3), { tone: "faint" }),
      -29,
    )
    const slotX = [20, 38, 56]
    for (const [j, x] of slotX.entries()) {
      const parts: string[] = []
      const pad = { x: x - 9, y: M.CY - 9, w: 18, d: 18, r: 1.8 }
      parts.push(S(k.slabOf(pad, 3.2, 1.6, P, 2, 0.3), { tone: "lo" }))
      parts.push(L(k.ring(x, M.CY, 7.2, 4.9, P, 20), { tone: "faint" }))
      // the builder's whole product in miniature, so a cassette reads as a result
      const B = BUILDERS[j]
      let z = 4.9
      for (const p of B.parts) {
        const r = p.r * MINI_SCALE + 1.1
        const h = p.h * MINI_SCALE
        parts.push($.disc(x, M.CY, z, r, h, "mid", false))
        z += h
      }
      parts.push(S(k.cylinder(x, M.CY, 1.2, z, 2.2, P, 12), { tone: "hi" }))
      // the witness that names this builder on its pad's front lip
      parts.push(
        D(
          witnessOf(j).map(([u, v]) =>
            at([x + u * 0.7, M.CY + 9 + v * 0.2, 4.4]),
          ),
          {
            size: 0.55,
            tone: "hi",
          },
        ),
      )
      const loaded = j === bi
      put(
        [x, M.CY, z / 2 + 6],
        `<g data-part="mag${j}"${loaded ? ' display="none"' : ""}>${parts.join("")}</g>`,
        -1,
      )
    }
  }

  // ── the state the page is built at: the column is loaded, two parts are down,
  //    the carriage stands at station three with its next part held under the chute
  const INITIAL = { bi: 0, active: 2, fresh: false }

  base()
  magazine(INITIAL.bi)
  rails()
  ruler()
  gantry(INITIAL.active)

  // the carriage with its product grown so far — the one moving part of the drawing
  const dx = carriageAt(INITIAL.active)
  put(
    [M.STATIONS[0]! + dx, M.CY, 30],
    `<g data-part="carriage" transform="${k.translateAlong(P, [dx, 0, 0])}">${$.carriage(INITIAL.bi, INITIAL.active, INITIAL.fresh)}</g>`,
    6,
  )
  // the part station three is holding ready, lifted up under its chute
  const heldUp = $.hold(INITIAL.bi, INITIAL.active)
  put(
    [
      M.STATIONS[INITIAL.active]!,
      M.CY,
      seatZ(INITIAL.bi, INITIAL.active) + heldUp / 2,
    ],
    `<g data-part="held" transform="${$.lift(heldUp)}">${$.heldPart(INITIAL.bi, INITIAL.active)}</g>`,
    7,
  )

  const body = ITEMS.sort((a, b) => a.key - b.key)
    .map((item) => item.svg)
    .join("")

  const svg = k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label:
      "An indexing assembly bench. A heavy base carries two rails; a carriage rides them from left to right, bearing a platen and a mandrel on which a product stacks up part by part. Overhead a gantry beam on two posts holds four identical ordered stations, each with a funnel mouth a part is let down through. At station three a next part hangs ready under the chute while two parts already sit on the stack. On the left a magazine shelf carries miniature products of the builders; the loaded cassette's place is empty. A stepped ruler with four detents runs along the bench front, and the carriage drags an index fin along it.",
    body,
  })

  const DATA: FigureData = {
    M,
    P,
    VB: [WIDTH, HEIGHT],
    INITIAL,
    BUILDERS: BUILDERS.map(({ id, zh, en }) => ({ id, zh, en })),
    STEPS: STEPS.map(({ zh }) => ({ zh })),
    TOTALS: BUILDERS.map((_, i) => totalH(i)),
    // the magazine's picture box, so a pointer only picks a cassette where they are
    MAG: (() => {
      const corners = k.boxCorners(
        { x: 6, y: M.CY - 18, w: 62, d: 14, r: 2 },
        4,
        22,
      )
      const px = corners.map((p) => at(p)[0])
      const py = corners.map((p) => at(p)[1])
      return {
        x0: Math.min(...px),
        x1: Math.max(...px),
        y0: Math.min(...py),
        y1: Math.max(...py),
        slots: [20, 38, 56].map((x) => at([x, M.CY, 12])[0]),
      }
    })(),
  }

  const chrome: Chrome = {
    fig: "图 2",
    title: "建造者 · 分度装配台",
    hint: "鼠标移到左侧架上换一台建造者 · 点一下走一道工序 · ←→ 换工序 · 退格清空重来",
    readout: `${BUILDERS[INITIAL.bi].zh} · 工序 ${INITIAL.active}/${M.STATIONS.length} · 已叠 ${stackTop(INITIAL.bi, INITIAL.active) - M.Z_PLATEN} mm`,
    aria: "分度装配台：空格或回车走一道工序，左右方向键换工序，退格清空重来",
    keys: [
      { mark: "lit", label: "刚落下、正在叠的那件：它落上工件就点亮" },
      {
        mark: "raised",
        label: "架上三台建造者：每台都预先摆出它要造的那件成品",
      },
      { mark: "flat", label: "架上空着的那格：已装机的建造者在机里送料" },
      {
        mark: "dim",
        label: "床身、导轨、龙门、四道定序工位：换建造者时全都不动",
      },
    ],
    caption:
      "建造者模式把「一个复杂对象怎么一步步造出来」和「造出来到底长什么样」分开。龙门上四个工位是同一条定序工序——底座、身段、收腰、顶盖，指挥者（Director）只管让小车从左到右一道一道走，永远不知道每步落的是什么件。造出来的那摞东西才是产品。换一盘建造者磁带（左侧架上），四个工位落下的件全变了，而床身、导轨、这道工序的顺序纹丝不动——同一套流程，造出柱式、瓶式、塔式三种不同成品。",
  }
  return { svg, data: DATA, chrome }
}
