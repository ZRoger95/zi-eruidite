// Builds the plate: a lead-seal stamping press that makes "abstract factory" one
// machine. A head carries a whole family of dies; the frame, the screw, the stroke
// and the index never learn what the head knows, so swapping the head swaps the
// family and changes nothing else. Each head hangs on its own shelf pin, and only
// its own bore fits it, so a mixed family cannot be assembled by accident.
//
//   node build.mjs            dark page
//   node build.mjs --light    light page
import * as k from "../iso-kit"
import * as G from "../lathe"
import { M, FAMILIES, CELLS, DIES, SETS, glyphOf, witnessOf } from "./model"
import type { GlyphEl } from "./model"
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
  GLYPHS: GlyphEl[][][]
  WITNESS: [number, number][][]
  DIES: number[]
  SETS: number[]
  FAMILIES: { id: string; zh: string; kind: number }[]
  CELLS: { zh: string }[]
  INITIAL: {
    loaded: number
    advance: number
    depth: number
    angle: number
    sets: { kind: number; at: number }[]
    fresh: { kind: number; at: number } | null
  }
  VB: [number, number]
  RACK: { x0: number; x1: number; y0: number; y1: number; slots: number[] }
}
export type FigureResult = { svg: string; data: FigureData; chrome: Chrome }

export function buildFigure(): FigureResult {
  const WIDTH = 640
  const HEIGHT = 452

  // the glyph data, computed once here and handed to the page as it is
  const GLYPHS = [0, 1, 2].map((kind) =>
    CELLS.map((_, index) => glyphOf(kind, index)),
  )
  const WITNESS = [0, 1, 2].map(witnessOf)
  const GL = {
    glyph: (kind: number, index: number) => GLYPHS[kind][index],
    dies: DIES,
    witness: (kind: number) => WITNESS[kind],
  }

  // ── camera ────────────────────────────────────────────────────────────────────
  const P = k.fitProjection(
    [
      ...k.boxCorners({ x: 0, y: -50, w: 278, d: 72, r: 7 }, -18, 0),
      ...k.boxCorners({ x: 120, y: -31, w: 150, d: 38, r: 3 }, 0, 18),
      ...k.boxCorners({ x: 12, y: -46, w: 100, d: 4, r: 2 }, 0, 90),
      ...k.boxCorners({ x: 126, y: -50, w: 144, d: 44, r: 3 }, 66, 76),
      ...k.boxCorners({ x: 134, y: -29.5, w: 128, d: 27, r: 3 }, 20, 34.6),
      ...k.boxCorners({ x: 183, y: -20, w: 26, d: 12, r: 1 }, 33, 66),
      [M.RAM_X + 16, -14, 112],
      [M.RAM_X - 16, -14, 112],
      [M.RAM_X, -2, 96],
    ],
    WIDTH,
    HEIGHT,
    { pad: 26, azimuth: 47, elevation: 37 },
  )

  const $ = geo(M, GL, P)
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

  // one depth-sorted list; a moving part takes the slot it physically sits in
  const ITEMS: { key: number; svg: string }[] = []
  // flat things everything stands on are painted in their own pass, or a depth key
  // alone would let the face they stand on hide them
  let LAYER = 0
  const put = (anchor: k.Point3, svg: string, bias = 0) =>
    ITEMS.push({ key: depth(anchor) + bias + LAYER, svg })

  // a ring rooted in a face with its dot: the corner screw of a plate
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

  // ── the base ──────────────────────────────────────────────────────────────────
  function base() {
    LAYER = -9000
    const B = $.BASE
    put(
      mid(B, -$.BASE_H - 4),
      `<path class="iso-halo" d="${k.haloOf(B, -$.BASE_H - $.FOOT_H, $.BASE_H, P)}"/>`,
      -9999,
    )
    for (const [x, y] of byDepth(k.corners(B, 18))) {
      put(
        [x, y, -$.BASE_H - $.FOOT_H / 2],
        S(k.cylinder(x, y, 9, -$.BASE_H - $.FOOT_H, 2.4, P, 24), {
          tone: "lo",
        }),
      )
      put(
        [x, y, -$.FOOT_H / 2],
        S(
          k.cylinder(
            x,
            y,
            6.2,
            -$.BASE_H - $.FOOT_H + 2.4,
            $.FOOT_H - 2.4,
            P,
            24,
          ),
          { tone: "mid" },
        ),
      )
    }
    put(
      mid(B, -$.BASE_H / 2),
      S(k.slabOf(B, -$.BASE_H, $.BASE_H, P, 8, 1.4), { tone: "mid" }),
    )
    put(
      mid(B, 0),
      L(k.planOutline(k.insetPlan(B, 5), 0, P), { tone: "lo" }),
      0.4,
    )
    put(mid(B, 0), cornerScrews(B, 0, 11, 2.4), 0.5)
    // a chip gutter along the front edge, with drain slots at both ends
    const gutter = { x: 128, y: B.y + B.d - 13, w: 138, d: 6.5, r: 2 }
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
    for (const x of [gutter.x + 9, gutter.x + gutter.w - 9])
      put(
        [x, gutter.y + gutter.d / 2, 0],
        L(
          k.planOutline(
            { x, y: gutter.y + 1.4, w: 3.6, d: 3.6, r: 1.8 },
            0,
            P,
            3,
          ),
          { tone: "lo" },
        ),
        0.9,
      )
    // a ruler strip between the legs, and a maker's plate by the gutter
    const strip = { x: 152, y: B.y + 2, w: 84, d: 7, r: 1.2 }
    put(
      mid(strip, 0.5),
      S(k.slabOf(strip, 0, 1, P, 3), { tone: "lo", crease: "none" }),
      0.5,
    )
    const ticks = k.topTicks(
      strip.x + 3,
      strip.x + strip.w - 3,
      4,
      5,
      strip.y,
      1,
      [2, 3.8],
      P,
    )
    put(mid(strip, 1.1), L(ticks.minor, { tone: "lo" }), 0.6)
    put(mid(strip, 1.1), L(ticks.major, { tone: "mid" }), 0.6)
    const plate = { x: 200, y: B.y + B.d - 32, w: 42, d: 15, r: 1.8 }
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
      const y = plate.y + 3.6 + i * 3.6
      put(
        [plate.x + plate.w / 2, y, 1.4],
        L(
          k.lineOnTop(
            [plate.x + 4, y],
            [plate.x + 4 + (plate.w - 8) * len, y],
            1.4,
            P,
          ),
          { tone: "lo", free: true },
        ),
        0.7,
      )
    }
    put(
      mid(plate, 1.4),
      D(
        [
          at([plate.x + 2.6, plate.y + 2.6, 1.3]),
          at([plate.x + plate.w - 2.6, plate.y + plate.d - 2.6, 1.3]),
        ],
        { size: 0.45 },
      ),
      0.8,
    )
    LAYER = 0
  }

  // ── three finished seals on the bench: what a family looks like when it is off ──
  function seals() {
    for (const [kind, x] of [12, 48, 84].entries()) {
      const plan = { x, y: 8, w: 30, d: 10, r: 1 }
      put(
        [x + 15, 13, 0.6],
        S(k.slabOf(plan, 0, 1.2, P, 3, 0.3), { tone: "hi", crease: "lo" }),
        0.2,
      )
      put(
        [x + 15, 13, 1.2],
        L(k.planOutline(k.insetPlan(plan, 1.4), 1.2, P, 3), { tone: "faint" }),
        3,
      )
      // the wire hole at one end, and the three marks of the family along it
      put(
        [x + 4, 13, 1.3],
        L(k.ring(x + 4, 13, 1.4, 1.2, P, 12), { tone: "lo" }),
        3.1,
      )
      for (let j = 0; j < 3; j++)
        put(
          [x + 10 + j * M.PITCH, 13, 1.35],
          $.markSvg(
            (u, v) => at([x + 10 + j * M.PITCH + u, 13 + v, 1.2]),
            GLYPHS[kind][j],
            "mid",
            true,
          ),
          3.2,
        )
      put(
        [x + 15, 13, 0.1],
        `<path class="iso-halo" d="${k.haloOf(plan, -0.6, 0.6, P)}"/>`,
        -0.4,
      )
    }
  }

  // ── the rack: a rail, three places, and the head that is on the press is missing ─
  function magazine(loaded: number) {
    const BOARD = $.BOARD
    const face = $.BOARD_FACE
    LAYER = -4000
    put(
      [BOARD.x + BOARD.w / 2, BOARD.y + 2, 43],
      S(k.slabOf(BOARD, 0, $.Z_BOARD1, P, 4, 1), { tone: "mid" }),
    )
    const inset = 5
    const edge: k.Point3[] = [
      [BOARD.x + inset, face + 0.1, inset],
      [BOARD.x + BOARD.w - inset, face + 0.1, inset],
      [BOARD.x + BOARD.w - inset, face + 0.1, $.Z_BOARD1 - inset],
      [BOARD.x + inset, face + 0.1, $.Z_BOARD1 - inset],
    ]
    put(
      [BOARD.x + BOARD.w / 2, face, 43],
      L(k.pathOf(edge.map(at), true), { tone: "faint" }),
      0.4,
    )
    const crown = {
      x: BOARD.x - 2,
      y: BOARD.y - 2,
      w: BOARD.w + 4,
      d: BOARD.d + 4,
      r: 2,
    }
    put(
      [BOARD.x + BOARD.w / 2, BOARD.y + 2, $.Z_BOARD1 + 2],
      S(k.slabOf(crown, $.Z_BOARD1, 4, P, 4, 0.6), { tone: "mid" }),
      0.3,
    )
    put(
      [BOARD.x + BOARD.w / 2, BOARD.y + 2, $.Z_BOARD1 + 4.1],
      cornerScrews(crown, $.Z_BOARD1 + 4, 4, 2),
      0.4,
    )
    for (const x of [BOARD.x + 4, BOARD.x + BOARD.w - 10]) {
      const foot = { x, y: BOARD.y - 4, w: 6, d: BOARD.d + 8, r: 1.4 }
      put(
        [x + 3, BOARD.y + 2, 4],
        S(k.slabOf(foot, 0, 8, P, 3, 0.4), { tone: "lo" }),
        0.2,
      )
    }
    LAYER = 0
    // the rail, carried by two brackets off the board's face
    for (const x of [BOARD.x + 4, BOARD.x + BOARD.w - 8]) {
      const arm = { x, y: face, w: 4, d: $.RAIL_Y - face, r: 1 }
      put(
        [x + 2, (face + $.RAIL_Y) / 2, $.RAIL_BAR_Z],
        S(k.slabOf(arm, $.RAIL_BAR_Z - 4, 8, P, 2, 0.4), { tone: "mid" }),
        0.2,
      )
    }
    const barF = G.frameAlong([BOARD.x + 2, $.RAIL_Y, $.RAIL_BAR_Z], [1, 0, 0])
    // the rail and its detents sit behind the heads that hang on them, so they paint
    // before the heads and only show where a place stands empty
    put(
      [BOARD.x + BOARD.w / 2, $.RAIL_Y, $.RAIL_BAR_Z],
      S(G.disc(0, BOARD.w - 4, 1.9, barF, P, {}), { tone: "hi", crease: "lo" }),
      -9,
    )
    for (const cx of $.SLOTS) {
      // a detent on the rail under each place: the shape only its own head's bore has
      const keyF = G.frameAlong([cx - 2.4, $.RAIL_Y, $.RAIL_BAR_Z], [1, 0, 0])
      put(
        [cx, $.RAIL_Y, $.RAIL_BAR_Z],
        S(G.disc(0, 4.8, 2.5, keyF, P, { bevel: 0.3 }), { tone: "mid" }),
        -8.6,
      )
      // a tag on the board's face under each place: three printed lines
      const tag = { x: cx - 14, y: BOARD.y, w: 28, d: BOARD.d + 0.6, r: 1.2 }
      put(
        [cx, face, 34],
        S(k.slabOf(tag, 30, 8, P, 2, 0.4), { tone: "hi", crease: "lo" }),
        0.4,
      )
      for (const [i, len] of [0.72, 0.44, 0.58].entries()) {
        const z = 36.4 - i * 2.4
        put(
          [cx, face + 0.1, z],
          L(
            k.pathOf([
              at([tag.x + 3, face + 0.1, z]),
              at([tag.x + 3 + 22 * len, face + 0.1, z]),
            ]),
            { tone: "lo", free: true },
          ),
          0.6,
        )
      }
      // every head is drawn, and the one that is on the press is put out of sight,
      // so the page can hand a place back when the head comes home
      const kind = $.SLOTS.indexOf(cx)
      const head = {
        x: cx - $.SPARE.w / 2,
        y: $.SPARE.y,
        w: $.SPARE.w,
        d: $.SPARE.d,
        r: 1.4,
      }
      const parts = []
      // three die ends, hanging free under the head
      for (let j = 0; j < 3; j++) {
        const x = cx + (j - 1) * M.PITCH
        parts.push(
          S(
            k.cylinder(
              x,
              head.y + head.d / 2,
              M.DIE_R - 0.6,
              $.SPARE.z0 - 5.4,
              5.4,
              P,
              18,
            ),
            { tone: "hi", crease: "lo" },
          ),
        )
        parts.push(
          L(k.ring(x, head.y + head.d / 2, 1.5, $.SPARE.z0 - 5.4, P, 10), {
            tone: "lo",
          }),
        )
        parts.push(
          L(
            k.sideArc(
              x,
              head.y + head.d / 2,
              M.DIE_R - 0.6,
              $.SPARE.z0 - 1.4,
              P,
              14,
            ),
            { tone: "faint" },
          ),
        )
      }
      parts.push(
        S(k.slabOf(head, $.SPARE.z0, $.SPARE.z1 - $.SPARE.z0, P, 3, 0.6), {
          tone: "hi",
          crease: "lo",
        }),
      )
      parts.push(
        L(k.planOutline(k.insetPlan(head, 2), $.SPARE.z1, P, 3), {
          tone: "faint",
        }),
      )
      parts.push(cornerScrews(head, $.SPARE.z1, 2.8, 1.8, 10))
      // the clamp band across the dies, with its two binding screws
      const band = {
        x: head.x - 1.5,
        y: head.y - 0.8,
        w: $.SPARE.w + 3,
        d: head.d + 1.6,
        r: 1.4,
      }
      parts.push(
        S(k.slabOf(band, $.SPARE_BAND.z0, $.SPARE_BAND.h, P, 3, 0.4), {
          tone: "mid",
          inner: L(k.sideSeam(band, $.SPARE_BAND.z0 + 2.2, P, 3), {
            tone: "faint",
          }),
        }),
      )
      for (const dx of [-11, 11]) {
        const F = G.frameAlong(
          [cx + dx, band.y + band.d, $.SPARE_BAND.z0 + 2.2],
          [0, 1, 0],
        )
        parts.push(S(G.disc(0, 2.6, 1.6, F, P, { bevel: 0.3 }), { tone: "hi" }))
      }
      // the eye that hangs on the rail, its bore keyed to this family
      const eye = {
        x: cx - $.EYE.w / 2,
        y: head.y + 1,
        w: $.EYE.w,
        d: head.d - 2,
        r: 1.2,
      }
      parts.push(
        S(k.slabOf(eye, $.SPARE.z1, $.EYE.z1 - $.SPARE.z1, P, 2, 0.4), {
          tone: "mid",
        }),
      )
      parts.push(L(k.ring(cx, $.RAIL_Y, 2.5, $.EYE.z1, P, 14), { tone: "lo" }))
      parts.push(
        D(
          WITNESS[kind].map(([u, v]) =>
            at([cx + u * 0.62, $.RAIL_Y + v * 0.62, $.EYE.z1 + 0.1]),
          ),
          { size: 0.5, tone: "hi" },
        ),
      )
      // the family's three products, engraved on the face the reader sees, and its
      // witness on the clamp band below them
      parts.push(
        $.headFace(
          cx,
          (x, v) => at([x, head.y + head.d, $.SPARE.mid + v]),
          kind,
        ),
      )
      parts.push(
        D(
          WITNESS[kind].map(([u, v]) =>
            at([
              cx + u * 1.2,
              band.y + band.d + 0.1,
              $.SPARE_BAND.z0 + 2.2 + v * 0.4,
            ]),
          ),
          { size: 0.55, tone: "hi" },
        ),
      )
      put(
        [cx, head.y + head.d / 2, ($.SPARE.z0 + $.SPARE.z1) / 2],
        `<g data-part="rack${kind}"${kind === loaded ? ' display="none"' : ""}>${parts.join("")}</g>`,
        0.5,
      )
    }
  }

  // ── the bolster: the bed, its two ways, the stops and the index ruler ─────────
  function bolster() {
    const B = $.BOLSTER
    LAYER = -5000
    put(
      mid(B, 9),
      S(k.slabOf(B, 0, $.Z_BOL, P, 4, 1.2), {
        tone: "mid",
        inner: L(k.sideSeam(B, 11, P, 4), { tone: "faint" }),
      }),
    )
    put(
      mid(B, $.Z_BOL),
      L(k.planOutline(k.insetPlan(B, 4), $.Z_BOL, P, 4), { tone: "lo" }),
      0.4,
    )
    put(mid(B, $.Z_BOL), cornerScrews(B, $.Z_BOL, 7), 0.5)
    LAYER = 0
    // the two ways, with their end collars and oil holes
    for (const y of $.RAILS) {
      const F = G.frameAlong([$.RAIL_X0, y, $.RAIL_Z], [1, 0, 0])
      put(
        [($.RAIL_X0 + $.RAIL_X1) / 2, y, $.RAIL_Z],
        S(G.disc(0, $.RAIL_X1 - $.RAIL_X0, $.RAIL_R, F, P, {}), {
          tone: "hi",
          crease: "lo",
        }),
      )
      for (const x of [$.RAIL_X0, $.RAIL_X1 - 3.4]) {
        const CF = G.frameAlong([x, y, $.RAIL_Z], [1, 0, 0])
        put(
          [x + 1.7, y, $.RAIL_Z],
          S(G.disc(0, 3.4, 3.7, CF, P, { bevel: 0.3 }), { tone: "mid" }),
          0.2,
        )
        put(
          [x + 1.7, y, $.RAIL_Z + 2],
          L(G.circleOf(CF, 1.7, 1.6, P, 12), { tone: "faint" }),
          0.4,
        )
      }
    }
    // the home stop and the stop at the end of the band
    for (const [x, w] of [
      [$.RAIL_X0 - 4, 6],
      [$.CAR.x + $.CAR.w + M.ADVANCE_MAX - 6, 6],
    ]) {
      const stop = { x, y: -29, w, d: 26, r: 1.2 }
      put(
        mid(stop, 24),
        S(k.slabOf(stop, $.Z_BOL, 12, P, 2, 0.4), {
          tone: "mid",
          inner: L(k.sideSeam(stop, 26, P, 2), { tone: "faint" }),
        }),
      )
      put(
        mid(stop, 30.1),
        D(
          k.corners(stop, 2).map(([px, py]) => at([px, py, 30])),
          { size: 0.45 },
        ),
        0.4,
      )
    }
    // the ruler the advance is read on: a division per die pitch, a mark per index
    const strip = { x: $.RAIL_X0, y: 0.5, w: $.RAIL_X1 - $.RAIL_X0, d: 6, r: 1 }
    put(
      mid(strip, 18.6),
      S(k.slabOf(strip, $.Z_BOL, 1.2, P, 3), { tone: "lo", crease: "none" }),
      0.5,
    )
    const ticks = k.topTicks(
      strip.x,
      strip.x + strip.w,
      M.PITCH,
      M.INDEX / M.PITCH,
      strip.y,
      19.2,
      [2.2, 4.4],
      P,
    )
    put(mid(strip, 19.3), L(ticks.minor, { tone: "lo" }), 0.6)
    put(mid(strip, 19.3), L(ticks.major, { tone: "mid" }), 0.6)
    for (const x of [strip.x + 4, strip.x + strip.w - 4])
      put(
        [x, strip.y + 3, 19.3],
        L(k.ring(x, strip.y + 3, 1.6, 19.3, P, 10), { tone: "faint" }),
        0.7,
      )
  }

  // ── the carriage: it carries the lead, and nothing of what the head knows ─────
  function carriageSvg(
    advance: number,
    sets: { kind: number; at: number }[],
    fresh: { kind: number; at: number } | null,
  ) {
    const C = $.CAR
    const parts = []
    parts.push(
      S(k.slabOf(C, $.CAR_Z, $.CAR_H, P, 5, 0.8), { tone: "hi", crease: "lo" }),
    )
    parts.push(
      L(k.planOutline(k.insetPlan(C, 3.2), $.CAR_Z + $.CAR_H, P, 5), {
        tone: "faint",
      }),
    )
    parts.push(
      D(
        k.corners(C, 4.6).map(([x, y]) => at([x, y, $.CAR_Z + $.CAR_H + 0.1])),
        { size: 0.5 },
      ),
    )
    // four skirts, one on each corner of the ways
    for (const [x, y] of [
      [C.x + 5, $.RAILS[0]],
      [C.x + 5, $.RAILS[1]],
      [C.x + C.w - 13, $.RAILS[0]],
      [C.x + C.w - 13, $.RAILS[1]],
    ]) {
      const skirt = { x, y: y - 4.6, w: 9.2, d: 9.2, r: 1.8 }
      parts.push(
        S(k.slabOf(skirt, $.RAIL_Z - 5.2, 11.6, P, 3, 0.5), {
          tone: "mid",
          inner: L(k.sideSeam(skirt, $.RAIL_Z, P, 3), { tone: "faint" }),
        }),
      )
      parts.push(
        D(
          k
            .corners(skirt, 2.4)
            .map(([px, py]) => at([px, py, $.RAIL_Z + 6.4 + 0.1])),
          { size: 0.45 },
        ),
      )
    }
    // two clamps hold the lead down at its ends
    for (const x of [$.BAND.x - 5.5, $.BAND.x + $.BAND.w + 1.5]) {
      const clamp = { x, y: $.BAND.y - 1.6, w: 4, d: $.BAND.d + 3.2, r: 1 }
      parts.push(S(k.slabOf(clamp, $.Z_BAND0, 2.4, P, 2, 0.4), { tone: "mid" }))
      const grip = k.cylinder(
        x + 2,
        $.BAND_CY,
        1.8,
        $.Z_BAND0 + 2.4,
        3.6,
        P,
        14,
      )
      parts.push(S(grip, { tone: "hi" }))
      parts.push(
        L(
          k.knurl(x + 2, $.BAND_CY, 1.8, $.Z_BAND0 + 2.4, $.Z_BAND0 + 6, 16, P),
          { tone: "lo" },
        ),
      )
    }
    // the pull the reader moves the carriage with: a neck and a knurled grip
    const pull = { x: C.x + C.w / 2 - 3, y: C.y + C.d - 1, w: 6, d: 4, r: 1 }
    parts.push(S(k.slabOf(pull, $.CAR_Z + 1, 3.4, P, 2, 0.4), { tone: "mid" }))
    parts.push(
      S(
        k.cylinder(
          C.x + C.w / 2,
          C.y + C.d + 4.6,
          2.4,
          $.CAR_Z + 1.4,
          4.4,
          P,
          16,
        ),
        { tone: "hi" },
      ),
    )
    parts.push(
      L(
        k.knurl(
          C.x + C.w / 2,
          C.y + C.d + 4.6,
          2.4,
          $.CAR_Z + 1.4,
          $.CAR_Z + 5.8,
          18,
          P,
        ),
        { tone: "lo" },
      ),
    )
    parts.push(
      L(k.ring(C.x + C.w / 2, C.y + C.d + 4.6, 1.2, $.CAR_Z + 5.8, P, 10), {
        tone: "faint",
      }),
    )
    // the lead band, and the families it already carries
    parts.push(
      S(k.slabOf($.BAND, $.Z_BAND0, 1.4, P, 3, 0.3), {
        tone: "hi",
        crease: "lo",
      }),
    )
    parts.push(`<g data-part="bandFace">${$.bandFace(sets, fresh)}</g>`)
    return `<g data-part="carriage" transform="${k.translateAlong(P, [advance, 0, 0])}">${parts.join("")}</g>`
  }

  // ── the frame: two legs, the crown, the bushing the screw turns in ────────────
  function frame() {
    for (const leg of [$.LEG, $.LEG2]) {
      // the legs are painted before the crown that sits on them: their faces are
      // covered by it, so they must not come after it in the order
      put(
        mid(leg, 33),
        S(k.slabOf(leg, 0, $.Z_CROWN0, P, 3, 0.8), {
          tone: "mid",
          inner: L(k.sideSeam(leg, 34, P, 3), { tone: "faint" }),
        }),
        -30,
      )
      for (const dy of [-3.4, 1.4]) {
        const rib = {
          x: leg.x + 2,
          y: leg.y + leg.d + dy,
          w: leg.w - 4,
          d: 3,
          r: 1,
        }
        put(
          [rib.x + rib.w / 2, rib.y + 1.5, 12],
          S(k.slabOf(rib, 0, 24, P, 2, 0.4), { tone: "lo" }),
          -30.2,
        )
      }
      // a machined band round each leg, and two socket head screws above it
      put(
        [leg.x + leg.w / 2, leg.y + leg.d, 40],
        L(k.sideSeam(leg, 40, P, 3), { tone: "faint" }),
        -29.8,
      )
      put(
        [leg.x + leg.w / 2, leg.y + leg.d, 56],
        D(
          [
            at([leg.x + 3, leg.y + leg.d, 56]),
            at([leg.x + leg.w - 3, leg.y + leg.d, 56]),
          ],
          { size: 0.5 },
        ),
        -29.6,
      )
    }
    const C = $.CROWN
    put(
      mid(C, 71),
      S(k.slabOf(C, $.Z_CROWN0, 10, P, 4, 1), {
        tone: "mid",
        inner: L(k.sideSeam(C, 70, P, 4), { tone: "faint" }),
      }),
    )
    put(
      mid(C, $.Z_CROWN1),
      L(k.planOutline(k.insetPlan(C, 4), $.Z_CROWN1, P, 4), { tone: "lo" }),
      0.4,
    )
    put(mid(C, $.Z_CROWN1 + 0.1), cornerScrews(C, $.Z_CROWN1, 7), 0.5)
    const bx = M.RAM_X
    const by = M.RAM_Y
    // the boss plate the bushing stands on, so the crown's face carries the index
    const pad = { x: bx - 17, y: by - 17, w: 34, d: 34, r: 2.4 }
    put(
      mid(pad, 78),
      S(k.slabOf(pad, $.Z_CROWN1, 3, P, 3, 0.6), { tone: "mid" }),
      0.45,
    )
    put(mid(pad, 81.1), cornerScrews(pad, $.Z_CROWN1 + 3, 3, 1.7, 9), 0.55)
    // the bushing, its bore and its retaining screws
    put(
      [bx, by, $.Z_BUSH1 - 3.5],
      S(k.cylinder(bx, by, $.BUSH_R, $.Z_CROWN1 + 3, 7, P, 30, 0.5), {
        tone: "mid",
      }),
      0.6,
    )
    put(
      [bx, by, $.Z_CROWN1 + 3.2],
      L(k.ring(bx, by, $.BUSH_R - 1.5, $.Z_CROWN1 + 3, P, 22), {
        tone: "faint",
      }),
      0.7,
    )
    put(
      [bx, by, $.Z_BUSH1],
      L(k.ring(bx, by, 4.1, $.Z_BUSH1, P, 20), { tone: "lo" }),
      0.8,
    )
    put(
      [bx, by, $.Z_BUSH1 + 0.1],
      D(
        G.dotsOf(
          G.frameOf([bx, by, $.Z_BUSH1], [0, 0, 1], [1, 0, 0], [0, 1, 0]),
          0,
          $.BUSH_R - 1.6,
          3,
          P,
          { all: true },
        ) as k.Point3[],
        { size: 0.45 },
      ),
      0.85,
    )
    // the index ring the arm's pointer reads: one turn of the arm is one screw pitch
    const ring = k.radialTicks(
      bx,
      by,
      M.ARM_R,
      36,
      3,
      $.Z_CROWN1 + 3,
      [1.5, 3],
      P,
    )
    put([bx, by, $.Z_CROWN1 + 3.2], L(ring.minor, { tone: "lo" }), 0.55)
    put([bx, by, $.Z_CROWN1 + 3.2], L(ring.major, { tone: "mid" }), 0.55)
    put(
      [bx, by, $.Z_CROWN1 + 3.2],
      L(k.ring(bx, by, M.ARM_R, $.Z_CROWN1 + 3, P, 52), { tone: "lo" }),
      0.5,
    )
    // two oil cups on the crown's face, and an access cover over the screw's far end
    for (const x of [bx - 36, bx + 36]) {
      put(
        [x, by, 79],
        S(k.cylinder(x, by, 3.2, $.Z_CROWN1, 5.4, P, 16), { tone: "mid" }),
        0.6,
      )
      put(
        [x, by, 81.8],
        L(k.ring(x, by, 1.9, $.Z_CROWN1 + 5.4, P, 12), { tone: "faint" }),
        0.7,
      )
    }
    const cover = { x: bx + 52, y: -46, w: 40, d: 30, r: 2 }
    put(
      mid(cover, 78.2),
      S(k.slabOf(cover, $.Z_CROWN1, 2.4, P, 3, 0.5), { tone: "mid" }),
      0.5,
    )
    put(
      mid(cover, 80.7),
      L(k.planOutline(k.insetPlan(cover, 2.4), $.Z_CROWN1 + 2.4, P, 3), {
        tone: "faint",
      }),
      0.6,
    )
    put(
      mid(cover, 80.8),
      cornerScrews(cover, $.Z_CROWN1 + 2.4, 3.4, 1.8, 9),
      0.7,
    )
    // a hatch across the cover's face, so the big flat reads as machined
    const hatch = []
    for (let i = 0; i < 5; i++) {
      const y = cover.y + 6 + i * 4.5
      hatch.push(
        k.lineOnTop([cover.x, y], [cover.x + cover.w, y], $.Z_CROWN1 + 2.5, P),
      )
    }
    put(mid(cover, 81), L(hatch.join(""), { tone: "faint" }), 0.8)
  }

  // ── the head: three dies, one family, and the bore only its own pin fits ──────
  function headSvg(kind: number, lift: number) {
    const head = $.HEAD
    const parts = []
    for (let j = 0; j < 3; j++) {
      const x = DIES[j]
      const F = G.frameAlong([x, M.RAM_Y, $.Z_HEAD0], [0, 0, 1])
      parts.push(
        S(G.disc($.Z_TIP - $.Z_HEAD0, 0, M.DIE_R, F, P, {}), {
          tone: "hi",
          crease: "lo",
        }),
      )
      parts.push(
        S(G.disc(-1.8, 0, M.DIE_R + 0.9, F, P, { bevel: 0.3 }), {
          tone: "mid",
        }),
      )
      parts.push(
        L(G.circleOf(F, $.Z_TIP - $.Z_HEAD0, M.DIE_R - 0.8, P, 16), {
          tone: "lo",
        }),
      )
      parts.push(
        L(G.arcOf(F, -1.8, M.DIE_R + 0.9, P, { steps: 18 }), { tone: "faint" }),
      )
    }
    parts.push(
      S(k.slabOf(head, $.Z_HEAD0, $.Z_HEAD1 - $.Z_HEAD0, P, 3, 0.7), {
        tone: "hi",
        crease: "lo",
      }),
    )
    parts.push(
      L(k.planOutline(k.insetPlan(head, 2), $.Z_HEAD1, P, 3), {
        tone: "faint",
      }),
    )
    parts.push(cornerScrews(head, $.Z_HEAD1, 2.8, 1.8, 10))
    // the clamp band that holds the dies in, with two binding screws the reader can see
    parts.push(
      S(k.slabOf($.CLAMP, $.Z_CLAMP1 - 4.4, 4.4, P, 3, 0.4), {
        tone: "mid",
        inner: L(k.sideSeam($.CLAMP, $.Z_CLAMP1 - 2, P, 3), { tone: "faint" }),
      }),
    )
    for (const dx of [-10.5, 10.5]) {
      const F = G.frameAlong(
        [M.RAM_X + dx, $.CLAMP.y + $.CLAMP.d, $.Z_CLAMP1 - 2.2],
        [0, 1, 0],
      )
      parts.push(S(G.disc(0, 3.2, 2, F, P, { bevel: 0.3 }), { tone: "hi" }))
      parts.push(
        L(G.ribsOf(F, 1.6, 3.2, 2, 12, P, { least: 0.1 }) as string, {
          tone: "lo",
        }),
      )
    }
    // the family's three products, engraved where the reader can see them, and its
    // witness, so a head says which family it is without words
    parts.push(
      `<g data-part="headFace">${$.headFace(M.RAM_X, (x, v) => at([x, $.HEAD_FACE_Y, $.HEAD_MID_Z + v]), kind)}${D(
        WITNESS[kind].map(([u, v]) =>
          at([M.RAM_X + u * 1.3, $.HEAD_FACE_Y, $.Z_HEAD0 + 1.6 + v * 0.5]),
        ),
        { size: 0.6, tone: "hi" },
      )}</g>`,
    )
    return `<g data-part="head" transform="${k.translateAlong(P, [0, 0, lift])}">${parts.join("")}</g>`
  }

  // ── the ram above the crown: the screw, the spring, the arm that reads the gap ─
  function ramSvg(depthNow: number, angle: number) {
    const bx = M.RAM_X
    const by = M.RAM_Y
    const parts = []
    // the tenon the head hangs on
    parts.push(
      S(k.slabOf($.TENON, $.Z_HEAD1, $.Z_TENON1 - $.Z_HEAD1, P, 3, 0.5), {
        tone: "mid",
      }),
    )
    const coil = $.vcoil(bx, by, $.Z_BUSH1, $.RETAIN.z0 - depthNow, $.SPR_R, 4)
    // both ends of the helix land on a seat washer, so no coil tail stops in the air
    const seats =
      k.ring(bx, by, $.SPR_R, $.Z_BUSH1, P, 26) +
      k.ring(bx, by, $.SPR_R, $.RETAIN.z0 - depthNow, P, 26)
    const screwF = G.frameAlong([bx, by, $.Z_BUSH1], [0, 0, 1])
    // every turned part on the screw is measured along it from the bushing's face
    const sz = (z: number) => z - $.Z_BUSH1
    const above = []
    above.push(
      S(G.disc(0, sz($.RETAIN.z0), $.RAM_R, screwF, P, {}), {
        tone: "hi",
        crease: "lo",
      }),
    )
    above.push(
      S(
        G.disc(sz($.RETAIN.z0), sz($.RETAIN.z1), $.RETAIN.r, screwF, P, {
          bevel: 0.4,
        }),
        { tone: "mid" },
      ),
    )
    above.push(
      S(
        G.disc(sz($.NUT.z0), sz($.NUT.z1), $.NUT.r, screwF, P, { bevel: 0.4 }),
        { tone: "hi" },
      ),
    )
    above.push(
      L(
        G.ribsOf(
          screwF,
          sz($.NUT.z0 + 0.7),
          sz($.NUT.z1 - 0.7),
          $.NUT.r,
          24,
          P,
          { least: 0.12 },
        ) as string,
        { tone: "lo" },
      ),
    )
    above.push(
      L(G.arcOf(screwF, sz($.NUT.z1), $.NUT.r, P, { steps: 24 }), {
        tone: "faint",
      }),
    )
    above.push(
      S(
        G.disc(sz($.HUB.z0), sz($.HUB.z1), $.HUB.r, screwF, P, { bevel: 0.3 }),
        { tone: "mid" },
      ),
    )
    // the ball on the arm's end: a sphere's picture does not change as it moves, so
    // it is built once and only shifted on screen; the bar itself turns, so it is
    // rebuilt, and the pointer hangs from the tip down to the ring it reads
    const ball = S(
      G.sphereOf([bx + M.ARM_R, by, $.ARM_Z1 + $.BALL_R], $.BALL_R, P, {
        steps: 44,
      }),
      { tone: "hi" },
    )
    const shift = $.armShift(angle)
    return {
      back: coil.back,
      front: coil.front,
      seats,
      ram: [
        `<g data-part="ramMove" transform="${k.translateAlong(P, [0, 0, -depthNow])}">`,
        parts.join(""),
        above.join(""),
        `<path data-part="pointer" class="iso-line" data-tone="hi" data-free="end" d="${$.pointerD(angle)}"/>`,
        `<g data-part="arm" transform="translate(${shift[0].toFixed(2)} ${shift[1].toFixed(2)})">${$.armBar(angle)}${ball}</g>`,
        `</g>`,
      ].join(""),
    }
  }

  // ── the state the page is built at, so it reads correctly with no script ──────
  // the sun family has already been struck and the carriage has indexed once: the
  // moon head is on the press, its shelf stands empty, and the rail holds two heads
  const INITIAL = {
    loaded: 1,
    advance: M.INDEX,
    depth: 0,
    angle: 0,
    sets: [{ kind: 0, at: 0 }],
    fresh: null,
  }

  base()
  seals()
  magazine(INITIAL.loaded)
  bolster()
  frame()
  put(
    [$.CAR.x + $.CAR.w / 2 + INITIAL.advance, -16, 29],
    carriageSvg(INITIAL.advance, INITIAL.sets, INITIAL.fresh),
  )
  put([M.RAM_X, M.RAM_Y, 51], headSvg(INITIAL.loaded, 0))
  const RAM = ramSvg(INITIAL.depth, INITIAL.angle)
  const line = (part: string, d: string, tone: string) =>
    `<path data-part="${part}" class="iso-line" data-tone="${tone}" d="${d}"/>`
  put([M.RAM_X, M.RAM_Y, 88], line("springBack", RAM.back, "lo"), -0.4)
  put([M.RAM_X, M.RAM_Y, 89], line("springSeats", RAM.seats, "mid"), -0.2)
  put([M.RAM_X, M.RAM_Y, 90], RAM.ram, 0.2)
  put([M.RAM_X, M.RAM_Y, 91], line("springFront", RAM.front, "mid"), 0.4)

  const body = ITEMS.sort((a, b) => a.key - b.key)
    .map((item) => item.svg)
    .join("")

  const svg = k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label:
      "A lead-seal stamping press. A crown on two legs carries an arbor screw; below it a ram hangs a die head holding three dies — a round button, a toggle and a checkbox — over a lead band clamped to a carriage that rides two ways. The head's face is engraved with the three marks it strikes at once. Behind the press a board carries a rail with three places: two heads hang there on their own locating pins and the middle place is empty, because that head is on the press. On top, an arm on the screw points at a ring of index ticks.",
    body,
  })

  // ── the page: the same model, the same builders ───────────────────────────────
  const DATA: FigureData = {
    M,
    P,
    GLYPHS,
    WITNESS,
    DIES,
    SETS,
    FAMILIES: FAMILIES.map(({ id, zh, kind }) => ({ id, zh, kind })),
    CELLS: CELLS.map(({ zh }) => ({ zh })),
    INITIAL,
    VB: [WIDTH, HEIGHT],
    // the rack's picture box, so a pointer only picks a head where heads are
    RACK: (() => {
      const corners = k.boxCorners(
        { x: $.BOARD.x, y: $.BOARD.y, w: $.BOARD.w, d: 12, r: 2 },
        40,
        $.Z_BOARD1,
      )
      const px = corners.map((p) => at(p)[0])
      const py = corners.map((p) => at(p)[1])
      return {
        x0: Math.min(...px),
        x1: Math.max(...px),
        y0: Math.min(...py),
        y1: Math.max(...py),
        slots: $.SLOTS.map((cx) => at([cx, -35, 55])[0]),
      }
    })(),
  }

  const chrome: Chrome = {
    fig: "图 1",
    title: "抽象工厂 · 家族冲压机",
    hint: "鼠标移到架上挑一只头 · 点一下压一次 · ←→ 换头 · 退格送料",
    readout: `${FAMILIES[INITIAL.loaded].zh} · 压入 0.40 · 第 1 族`,
    aria: "家族冲压机：左右方向键换头，空格或回车压一次，退格送料",
    keys: [
      { mark: "lit", label: "刚压出的那一族：三件产品在同一次行程里出来" },
      { mark: "raised", label: "头（具体工厂）：三把模具、它的销孔与印记" },
      { mark: "flat", label: "架上的三个格：每格一只头，在机的那格空着" },
      {
        mark: "dim",
        label: "床身、螺杆、2 mm 行程、20 mm 送料距：换族时都不动",
      },
    ],
    caption:
      "抽象工厂是一个接口，它只承诺「造出一族相关的东西」，不说是哪一族。机架上是三只头——太阳、月相、高对比——每只都带同样三把模具：圆钮、开关、复选框；模具的形状就是压出来的形状，换一只头，整族跟着换，而床身、螺杆、2 mm 的行程与 20 mm 的送料距全都不知道换了什么。每格下面那只定位销只有同族的销孔才套得进去，所以混着拼一族在这台机器上装不出来。",
  }
  return { svg, data: DATA, chrome }
}
