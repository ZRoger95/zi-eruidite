// page-geo.ts — the geometry the drawing and the live page share.
// What the page has to redraw (a struck band, a head's face, the indicating arm,
// the squeezed spring) is built here once, so the picture and the motion cannot
// disagree. `GL` is the glyph factory of the model, `P` the projection.
import * as k from "../iso-kit"
import type { GlyphEl, Glyphs, Model } from "./model"

type Mapper = (a: number, b: number) => k.Flat
type MarkSet = { kind: number; at: number }

export const geo = (M: Model, GL: Glyphs, P: k.Projection) => {
  // ── world layout, in millimetres of the press ─────────────────────────────
  const BASE = { x: 0, y: -50, w: 278, d: 72, r: 7 }
  const BASE_H = 10
  const FOOT_H = 8
  const BOLSTER = { x: 120, y: -31, w: 150, d: 38, r: 3 }
  const Z_BOL = 18 // the bolster's face
  const RAILS = [-26, -6] // the two ways the carriage rides
  const RAIL_R = 2.6
  const RAIL_Z = 23.6
  const RAIL_X0 = 124
  const RAIL_X1 = 266
  const CAR = { x: 134, y: -29.5, w: 88, d: 27, r: 2.6 }
  const CAR_Z = 26.4 // its face: the lead band lies on it
  const CAR_H = 5.4
  const BAND = { x: M.STRIP_X, y: -24, w: M.STRIP_L, d: 20, r: 0.8 }
  const BAND_CY = -14
  const Z_BAND0 = CAR_Z + CAR_H
  const LEG = { x: 132, y: -46, w: 14, d: 12, r: 2 }
  const LEG2 = { x: 250, y: -46, w: 14, d: 12, r: 2 }
  const Z_CROWN0 = 66
  const Z_CROWN1 = 76
  const CROWN = { x: 126, y: -50, w: 144, d: 44, r: 2.6 }
  const HEAD = { x: M.RAM_X - 13, y: -19, w: 26, d: 10, r: 1.4 }
  const Z_HEAD0 = 45
  const Z_HEAD1 = 57
  const HEAD_MID_Z = 51.4 // the centre of the engraving on its front face
  const HEAD_FACE_Y = HEAD.y + HEAD.d
  const Z_TIP = M.Z_PAPER + M.GAP // a die end stands clear of the lead by the gap
  const TENON = { x: M.RAM_X - 4, y: -18, w: 8, d: 8, r: 1.2 }
  const Z_TENON1 = 66
  const CLAMP = { x: HEAD.x - 2, y: HEAD.y - 1, w: 30, d: 12, r: 1.6 }
  const Z_CLAMP1 = 55
  const RAM_R = 3.6
  const BUSH_R = 5.5
  const Z_BUSH1 = 86 // the bushing stands on the boss plate, 3 above the crown's face
  const SPR_R = 6.6
  const RETAIN = { r: 7.4, z0: 94, z1: 97 }
  const NUT = { r: 5, z0: 97, z1: 101.5 }
  const HUB = { r: 4, z0: 101.5, z1: 104 }
  const ARM_Z0 = 104
  const ARM_Z1 = 107.2
  const Z_INDEX = Z_CROWN1 + 6.2 // the arm's pointer hangs to just above the index ring
  const BALL_R = 3.1
  const BOARD = { x: 12, y: -46, w: 100, d: 4, r: 1.6 }
  const Z_BOARD1 = 86
  const BOARD_FACE = -42 // the board's front face, in y
  const RAIL_Y = -35 // the rail every head hangs on
  const RAIL_BAR_Z = 62
  const SLOTS = [32, 62, 92]
  const SPARE = { w: 26, d: 10, y: -40, z0: 48, z1: 62, mid: 57.6 }
  const EYE = { w: 8, d: 8, z0: 62, z1: 67.5 }
  const SPARE_BAND = { z0: 48.6, h: 4.4 }

  const iso = (point: k.Point3) => k.iso(point, P)

  // ── cells on the two planes a mark lives on ───────────────────────────────
  // A mark is described once, in a flat (u, v) cell. The band's top face and a
  // head's front face both place that same cell, so a die and its imprint are one
  // drawing laid on two different planes.
  const topAt =
    (x0: number, z: number): Mapper =>
    (u, v) =>
      iso([x0 + u, BAND_CY + v, z])
  const faceAt =
    (x0: number, y: number, z0: number): Mapper =>
    (u, v) =>
      iso([x0 + u, y, z0 + v])

  const elementSvg = (at: Mapper, el: GlyphEl, tone: k.LineTone) => {
    const d = k.pathOf(
      el.pts.map(([u, v]) => at(u, v)),
      el.closed,
    )
    if (el.t === "fill")
      return (
        `<path class="iso-shade" data-shade="0" d="${d}"/>` +
        k.lineSvg(d, { tone: "lo" })
      )
    if (el.t === "core")
      return `<path class="iso-top" d="${d}"/>` + k.lineSvg(d, { tone: "lo" })
    return k.lineSvg(d, { tone, free: el.closed ? undefined : true })
  }

  // A struck mark is sunk: the same cell twice, the lower copy the wall in shadow,
  // the upper the edge that catches the light. An engraved die face is one line.
  const markSvg = (
    at: Mapper,
    elements: GlyphEl[],
    tone: k.LineTone,
    sunk: boolean,
  ) => {
    if (!sunk) return elements.map((el) => elementSvg(at, el, tone)).join("")
    const sunkAt = (u: number, v: number): k.Flat => {
      const p = at(u, v)
      return [p[0] - 0.35, p[1] - 0.45]
    }
    return (
      elements.map((el) => elementSvg(sunkAt, el, "lo")).join("") +
      elements.map((el) => elementSvg(at, el, tone)).join("")
    )
  }

  // ── a head's three products, at the pitch the dies are ground to ──────────
  const headFace = (centreX: number, plane: Mapper, kind: number) => {
    const parts: string[] = []
    for (let j = 0; j < 3; j++) {
      const at = (u: number, v: number) =>
        plane(centreX + (j - 1) * M.PITCH + u, v)
      parts.push(markSvg(at, GL.glyph(kind, j), "hi", false))
    }
    return parts.join("")
  }

  // ── the band's face: what has been struck, and what is still blank ────────
  // A set is { kind, at }: the family, and the advance it was struck at. The band
  // carries its own marks along, so a struck cell keeps the place it had when the
  // ram closed on it, and the next family lands on fresh lead behind it.
  const bandFace = (sets: MarkSet[], fresh: MarkSet | null) => {
    const parts: string[] = [
      k.lineSvg(
        k.pathOf([
          iso([BAND.x, BAND_CY, M.Z_PAPER]),
          iso([BAND.x + BAND.w, BAND_CY, M.Z_PAPER]),
        ]),
        { tone: "faint" },
      ),
    ]
    for (const s of sets) {
      const tone: k.LineTone = s === fresh ? "lit" : "mid"
      for (let j = 0; j < 3; j++) {
        const x = GL.dies[j] - s.at
        parts.push(
          markSvg(topAt(x, M.Z_PAPER), GL.glyph(s.kind, j), tone, true),
        )
      }
    }
    return parts.join("")
  }

  // ── a coil on a vertical axis, split so the rod paints between its halves ──
  const vcoil = (
    cx: number,
    cy: number,
    z0: number,
    z1: number,
    r: number,
    turns: number,
  ) => {
    const total = turns * Math.PI * 2
    const steps = Math.max(64, Math.round(turns * 32))
    const tv = k.towardViewer(P)
    const runs: Record<"back" | "front", k.Flat[][]> = { back: [], front: [] }
    let run: k.Flat[] = []
    let side: "back" | "front" | null = null
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * total
      const facing = Math.cos(a) * tv[0] + Math.sin(a) * tv[1]
      const s = facing >= 0 ? "front" : "back"
      const point = iso([
        cx + r * Math.cos(a),
        cy + r * Math.sin(a),
        z0 + ((z1 - z0) * a) / total,
      ])
      if (side === null) {
        run.push(point)
        side = s
        continue
      }
      if (s !== side) {
        run.push(point)
        runs[side as "back" | "front"].push(run)
        run = [point]
        side = s
      } else run.push(point)
    }
    if (run.length > 1) runs[side as "back" | "front"].push(run)
    const d = (list: k.Flat[][]) => list.map((r) => k.pathOf(r)).join("")
    return { back: d(runs.back), front: d(runs.front) }
  }

  // ── the indicating arm: its sweep is the screw's turn, so it reads the gap ──
  const armBar = (angle: number) => {
    const cx = M.RAM_X
    const cy = M.RAM_Y
    const r = M.ARM_R
    const nx = -Math.sin(angle)
    const ny = Math.cos(angle)
    const w0 = 2
    const w1 = 1.3
    const a0 = 2.6
    const ring: k.Plane[] = [
      [
        cx + Math.cos(angle) * a0 + nx * w0,
        cy + Math.sin(angle) * a0 + ny * w0,
      ],
      [cx + Math.cos(angle) * r + nx * w1, cy + Math.sin(angle) * r + ny * w1],
      [cx + Math.cos(angle) * r - nx * w1, cy + Math.sin(angle) * r - ny * w1],
      [
        cx + Math.cos(angle) * a0 - nx * w0,
        cy + Math.sin(angle) * a0 - ny * w0,
      ],
    ]
    return k.solidSvg(
      k.extrude(ring, ARM_Z0, ARM_Z1 - ARM_Z0, P, {
        convex: false,
        bevel: 0.3,
      }),
      {
        tone: "hi",
        crease: "lo",
      },
    )
  }
  const armTip = (angle: number, z: number): k.Flat =>
    iso([
      M.RAM_X + M.ARM_R * Math.cos(angle),
      M.RAM_Y + M.ARM_R * Math.sin(angle),
      z,
    ])
  const armShift = (angle: number): k.Flat => {
    const a = armTip(angle, ARM_Z1 + BALL_R)
    const b = armTip(0, ARM_Z1 + BALL_R)
    return [a[0] - b[0], a[1] - b[1]]
  }
  const pointerD = (angle: number) =>
    k.pathOf([armTip(angle, ARM_Z0), armTip(angle, Z_INDEX)])
  const pointerFoot = (angle: number) => armTip(angle, Z_INDEX)

  return {
    BASE,
    BASE_H,
    FOOT_H,
    BOLSTER,
    Z_BOL,
    RAILS,
    RAIL_R,
    RAIL_Z,
    RAIL_X0,
    RAIL_X1,
    CAR,
    CAR_Z,
    CAR_H,
    BAND,
    BAND_CY,
    Z_BAND0,
    LEG,
    LEG2,
    Z_CROWN0,
    Z_CROWN1,
    CROWN,
    HEAD,
    Z_HEAD0,
    Z_HEAD1,
    HEAD_MID_Z,
    HEAD_FACE_Y,
    Z_TIP,
    TENON,
    Z_TENON1,
    CLAMP,
    Z_CLAMP1,
    RAM_R,
    BUSH_R,
    Z_BUSH1,
    Z_INDEX,
    SPR_R,
    RETAIN,
    NUT,
    HUB,
    ARM_Z0,
    ARM_Z1,
    BALL_R,
    BOARD,
    Z_BOARD1,
    BOARD_FACE,
    RAIL_Y,
    RAIL_BAR_Z,
    SLOTS,
    SPARE,
    SPARE_BAND,
    EYE,
    iso,
    topAt,
    faceAt,
    elementSvg,
    markSvg,
    headFace,
    bandFace,
    vcoil,
    armBar,
    armTip,
    armShift,
    pointerD,
    pointerFoot,
  }
}
