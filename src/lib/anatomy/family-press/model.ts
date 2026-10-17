// model.mjs — the one truth of the press: what a family is, what a stroke does.
// The drawing, the motion and the readout all read these numbers, so nothing the
// figure claims can drift from what the machine shows. World units are millimetres
// of the thing at about one pixel.

export type UV = [number, number]
export type GlyphEl = {
  t: "line" | "fill" | "core"
  closed: boolean
  pts: UV[]
  width?: number
}

export const M = {
  STROKE: 2.0, // mm the ram closes at the bottom of every stroke — one setting, every family
  GAP: 1.6, // the stand-off between a die face and the lead at rest
  SCREW_PITCH: 4.0, // the arbor screw: one turn of the arm is 4 mm of ram
  ARM_R: 12, // the indicating arm's radius, and the index ring's radius
  DIE_R: 3.4, // a die shank's radius: wide enough to carry its mark
  PITCH: 8, // the die spacing on a head
  INDEX: 20, // the carriage's index per strike: one struck family, plus a gutter
  ADVANCE_MAX: 40, // three families march down one lead band
  RAM_X: 196, // the die axis, fixed in the frame
  RAM_Y: -14, // and so in y: the die face sits over the band's centre line
  STRIP_X: 138, // the band's datum in x at zero advance
  STRIP_L: 80, // the band's length
  STRIP_Y: -14, // the band's centre line in y
  Z_PAPER: 33.2, // the lead's face
}

const TAU = Math.PI * 2

export type Model = typeof M
export type Glyphs = {
  glyph: (kind: number, index: number) => GlyphEl[]
  dies: number[]
  witness: (kind: number) => UV[]
}

// a family is one head: the three products it can make, and nothing else.
export const CELLS = [
  { id: "button", zh: "圆钮", en: "button" },
  { id: "toggle", zh: "开关", en: "toggle" },
  { id: "check", zh: "复选框", en: "checkbox" },
]

export const FAMILIES = [
  { id: "sun", zh: "太阳系列", en: "Sun family", kind: 0, knob: 1 },
  { id: "moon", zh: "月相系列", en: "Moon family", kind: 1, knob: 0 },
  { id: "key", zh: "高对比系列", en: "Key family", kind: 2, knob: 1 },
]

// ── cell space ──────────────────────────────────────────────────────────────
// A mark is described once in a flat (u, v) cell, u along the strip and v across
// it. The strip's top face and a head's front face place that same cell on two
// different planes, so a die and the printing it makes are literally one drawing.
const circle = (r: number, at: UV = [0, 0], n = 24, a0 = 0): UV[] => {
  const pts: UV[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU
    pts.push([at[0] + r * Math.cos(a), at[1] + r * Math.sin(a)])
  }
  return pts
}

// a rounded rectangle; r >= the half size gives a stadium, r = 0 a square
const round = (
  hw: number,
  hh: number,
  r: number,
  at: UV = [0, 0],
  steps = 5,
): UV[] => {
  const R = Math.max(0, Math.min(r, Math.min(hw, hh)))
  if (R < 0.02)
    return [
      [at[0] + hw, at[1] + hh],
      [at[0] - hw, at[1] + hh],
      [at[0] - hw, at[1] - hh],
      [at[0] + hw, at[1] - hh],
    ]
  const cx = [hw - R, hh - R, -(hw - R), -(hh - R)]
  const cy = [hh - R, -(hh - R), -(hh - R), hh - R]
  const a0 = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
  const pts: UV[] = []
  for (let c = 0; c < 4; c++)
    for (let i = 0; i <= steps; i++) {
      const a = a0[c] + (i / steps) * (Math.PI / 2)
      pts.push([
        at[0] + cx[c] + R * Math.cos(a),
        at[1] + cy[c] + R * Math.sin(a),
      ])
    }
  return pts
}

// a square taken in at its four corners
const chamfer = (hw: number, hh: number, c: number, at: UV = [0, 0]): UV[] => [
  [at[0] + hw - c, at[1] + hh],
  [at[0] - hw + c, at[1] + hh],
  [at[0] - hw, at[1] + hh - c],
  [at[0] - hw, at[1] - hh + c],
  [at[0] - hw + c, at[1] - hh],
  [at[0] + hw - c, at[1] - hh],
  [at[0] + hw, at[1] - hh + c],
  [at[0] + hw, at[1] + hh - c],
]

const shift = (pts: UV[], dx: number): UV[] => pts.map(([u, v]) => [u + dx, v])

// One product, three per family. kind 0 sun: open outlines with round terminals
// and a radiating ring. kind 1 moon: the same shapes filled, the light carried by
// a knocked-out core. kind 2 key: double lines, chamfered corners, nothing filled.
export function glyphOf(
  kind: number,
  index: number,
  at: UV = [0, 0],
): GlyphEl[] {
  const sun = kind === 0
  const moon = kind === 1
  const key = kind === 2
  const P = (pts: UV[]): UV[] => pts.map(([u, v]) => [at[0] + u, at[1] + v])
  const out: GlyphEl[] = []
  if (index === 0) {
    out.push({ t: "line", closed: true, pts: P(circle(2.15)) })
    if (sun)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + TAU / 16
        out.push({
          t: "line",
          closed: false,
          pts: P([
            [2.75 * Math.cos(a), 2.75 * Math.sin(a)],
            [3.4 * Math.cos(a), 3.4 * Math.sin(a)],
          ]),
        })
      }
    if (key) out.push({ t: "line", closed: true, pts: P(circle(1.35)) })
    if (moon) {
      out.push({ t: "fill", closed: true, pts: P(circle(2.15)) })
      out.push({ t: "core", closed: true, pts: P(circle(0.8)) })
    } else out.push({ t: "line", closed: true, pts: P(circle(0.8)) })
  } else if (index === 1) {
    const hw = 3.15
    const r = 1.4
    out.push({ t: "line", closed: true, pts: P(round(hw, r, r, [0, 0], 6)) })
    if (key)
      out.push({
        t: "line",
        closed: true,
        pts: P(round(hw - 0.65, r - 0.65, r - 0.65, [0, 0], 6)),
      })
    if (moon)
      out.push({ t: "fill", closed: true, pts: P(round(hw, r, r, [0, 0], 6)) })
    const kx = FAMILIES[kind].knob ? hw - r : -(hw - r)
    out.push({
      t: moon ? "core" : "fill",
      closed: true,
      pts: P(shift(circle(0.95, [0, 0], 16), kx)),
    })
  } else {
    const hw = 2.35
    const frame = sun ? round(hw, hw, 0.8, [0, 0], 5) : chamfer(hw, hw, 0.9)
    out.push({ t: "line", closed: true, pts: P(frame) })
    if (key)
      out.push({
        t: "line",
        closed: true,
        pts: P(chamfer(hw - 0.65, hw - 0.65, 0.7)),
      })
    if (moon) out.push({ t: "fill", closed: true, pts: P(frame) })
    out.push({
      t: moon ? "core" : "line",
      closed: false,
      pts: P([
        [-1.1, 0],
        [-0.3, -0.95],
        [1.25, 0.95],
      ]),
      width: moon ? 1.1 : 1.0,
    })
  }
  return out
}

export const glyphCells = (kind: number) =>
  CELLS.map((cell, index) => ({ cell, elements: glyphOf(kind, index) }))

// the witness a head carries beside its dies: this is the family, not the shape
export const witnessOf = (kind: number): UV[] =>
  kind === 0
    ? [
        [-3, 0],
        [0, 0],
        [3, 0],
      ]
    : kind === 1
      ? [
          [-1.5, 1.4],
          [1.5, 1.4],
          [-1.5, -1.4],
          [1.5, -1.4],
        ]
      : [
          [-2.2, 0],
          [2.2, 0],
        ]

// ── the press as a machine ─────────────────────────────────────────────────
// The ram hangs from a plain arbor screw through the crown: the arm's sweep IS the
// closed gap, one turn of the arm is one screw pitch. A strike embosses a whole
// family at once, so the carriage indexes by one family width, not by one product.
export const armAngleOf = (depth: number) => (depth / M.SCREW_PITCH) * TAU
export const depthOfArm = (angle: number) => (angle / TAU) * M.SCREW_PITCH
export const STROKE_ANGLE = armAngleOf(M.STROKE) // half a turn of the arm

export const DIES = CELLS.map((_, j) => M.RAM_X + (j - 1) * M.PITCH) // fixed in the frame
export const SETS = [0, M.INDEX, 2 * M.INDEX] // the advance each family is struck at
// a mark struck while the carriage stood at `at` sits at this local u now that the
// carriage is at `a`: the band carries its own prints along with it
export const markU = (worldX: number, a: number) => worldX - (M.STRIP_X + a)
