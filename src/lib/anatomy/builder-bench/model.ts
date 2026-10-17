// model.ts — the one truth of the bench: what a builder is, what a step does.
// The drawing, the motion and the readout all read these numbers, so nothing the
// figure claims can drift from what the machine shows. World units are millimetres
// of the thing at about one pixel.
//
// The Builder pattern, kept honest by the machine:
//   • the Director is the carriage's fixed walk through ordered stations —
//     the same sequence every build, and it never learns what the parts are;
//   • the Builder is one slide-in cassette that supplies all four steps' parts —
//     swap the cassette and every part changes, while the walk, the bench and the
//     order stay exactly the same;
//   • the Product is the stack that grows one part per visited station, so it can
//     only finish by walking the whole sequence (the opposite of a one-shot press).

export type Part = { r: number; h: number }

export const M = {
  // the bench, in world millimetres
  STATIONS: [64, 112, 160, 208] as number[], // the four ordered stations along x
  CY: 4, // the platen's centre line in y (a little forward of the base centre)
  Z_HOME: 20, // the top face of the carriage plate the platen stands on
  Z_PLATEN: 26, // the top face of the platen table: where the stack begins
  Z_CHUTE: 70, // a waiting part hangs here, under the gantry beam
  CHUTE_Z: 66, // the belly of every station chute: a held part hangs just under it
  DROP: 12, // how far above its seat a part waits before it is let down
  RAIL_L: 218, // the carriage's ways run this far along x
  // one full step of the Director: the head lowers, hands over the part, returns
  STROKE: 2.4, // mm the dispenser lowers at the bottom of every place-action
  GAP: 1.8, // the stand-off between a waiting part and the stack top at rest
}

// The Director's algorithm: the same four ordered steps, whatever is being built.
// The names belong to the process, not to any one product.
export const STEPS = [
  { zh: "底座", en: "base" },
  { zh: "身段", en: "body" },
  { zh: "收腰", en: "waist" },
  { zh: "顶盖", en: "cap" },
]

// Three interchangeable builders. Each is a whole cassette: four parts, one per
// step. The parts are coaxial discs so they stack; a builder's character is the
// radii and heights it commits at each step — never the order.
export const BUILDERS = [
  {
    id: "col",
    zh: "柱式",
    en: "Column",
    // a turned column: a wide foot, a tall straight body, a bolted collar, a cap
    parts: [
      { r: 12, h: 4 },
      { r: 8.5, h: 15.5 },
      { r: 11, h: 4 },
      { r: 6, h: 5 },
    ] as Part[],
  },
  {
    id: "flask",
    zh: "瓶式",
    en: "Flask",
    // a flask: a small foot, a wide belly, a drawn-in shoulder, a narrow mouth
    parts: [
      { r: 9, h: 3.5 },
      { r: 13, h: 9.5 },
      { r: 6.5, h: 8.5 },
      { r: 5, h: 4 },
    ] as Part[],
  },
  {
    id: "taper",
    zh: "塔式",
    en: "Taper",
    // a stepped tower: every step a ring smaller than the one below it
    parts: [
      { r: 13, h: 6 },
      { r: 10, h: 6 },
      { r: 7.5, h: 6 },
      { r: 5, h: 7 },
    ] as Part[],
  },
]

// the witness a builder carries on its cassette and its chute: this is the builder,
// not the shape — three dots for column, a square for flask, a bar for taper
export const witnessOf = (bi: number): [number, number][] =>
  bi === 0
    ? [
        [-2.6, 0],
        [0, 0],
        [2.6, 0],
      ]
    : bi === 1
      ? [
          [-1.4, 1.4],
          [1.4, 1.4],
          [-1.4, -1.4],
          [1.4, -1.4],
        ]
      : [
          [-2.2, 0],
          [2.2, 0],
        ]

// ── stack arithmetic: one builder's product, grown step by step ───────────────
// the z of the underside of part i once it is seated on the stack
export const seatZ = (bi: number, i: number): number => {
  let z = M.Z_PLATEN
  for (let j = 0; j < i; j++) z += BUILDERS[bi].parts[j]!.h
  return z
}
// the top face of part i once seated
export const topZ = (bi: number, i: number): number =>
  seatZ(bi, i) + BUILDERS[bi].parts[i]!.h
// the stack top after `count` parts have been seated (count 0..4)
export const stackTop = (bi: number, count: number): number => {
  let z = M.Z_PLATEN
  for (let j = 0; j < count; j++) z += BUILDERS[bi].parts[j]!.h
  return z
}
// a finished product's total height, so the readout can promise the real number
export const totalH = (bi: number): number =>
  BUILDERS[bi].parts.reduce((sum, p) => sum + p.h, 0)

// where the carriage stands for a given step, measured from the first station
export const carriageAt = (step: number): number =>
  M.STATIONS[Math.max(0, Math.min(M.STATIONS.length - 1, Math.round(step)))] -
  M.STATIONS[0]
