// geo.ts — the geometry the drawing and the live page share, built with iso-kit
// only (never lathe), so it can reach the client bundle. What the page has to move
// or rebuild — the carriage that carries the product, the stack that grows on it,
// the part a station is letting down, the index flag on the ruler — is written here
// once, so the picture and the motion cannot disagree.
import * as k from "../iso-kit"
import { BUILDERS, M, seatZ, stackTop } from "./model"

export const geo = (P: k.Projection) => {
  const iso = (point: k.Point3) => k.iso(point, P)
  const CY = M.CY
  const S0 = M.STATIONS[0]

  // one machined disc: a turned body, the ring where its bore meets the mandrel,
  // and a centre mark. Built with iso-kit so the page can restack it every frame.
  const disc = (
    cx: number,
    cy: number,
    z0: number,
    r: number,
    h: number,
    tone: k.Tone,
    lit = false,
  ) => {
    const parts: string[] = []
    parts.push(
      k.solidSvg(k.cylinder(cx, cy, r, z0, h, P, 30, 0.5), {
        tone,
        crease: "lo",
        lit,
      }),
    )
    // the bore the mandrel passes through, drawn on the top face
    parts.push(
      k.lineSvg(k.ring(cx, cy, 2.1, z0 + h + 0.05, P, 16), {
        tone: lit ? "lit" : "faint",
      }),
    )
    // a shoulder seam around the rim so the disc reads turned, not printed
    parts.push(
      k.lineSvg(k.ring(cx, cy, r - 1.5, z0 + h, P, 26), { tone: "faint" }),
    )
    return parts.join("")
  }

  // the stack the carriage carries: parts 0..count-1, coaxial on the mandrel,
  // painted bottom to top so each new ring hides the one under it.
  const stack = (bi: number, count: number, fresh: boolean) => {
    const parts: string[] = []
    const B = BUILDERS[bi]
    for (let i = 0; i < count; i++) {
      const p = B.parts[i]!
      const lit = fresh && i === count - 1
      parts.push(disc(S0, CY, seatZ(bi, i), p.r, p.h, "hi", lit))
    }
    return parts.join("")
  }

  // the mandrel the parts stack onto: a thin post off the platen with a small stop
  // on top. It is a fixed height (taller than any builder's product), so swapping a
  // cassette never has to rebuild it — the stack simply grows up toward the stop.
  const mandrel = () => {
    const top = 58
    const parts: string[] = []
    parts.push(
      k.solidSvg(k.cylinder(S0, CY, 2.3, M.Z_PLATEN, top - M.Z_PLATEN, P, 18), {
        tone: "hi",
        crease: "lo",
      }),
    )
    parts.push(
      k.solidSvg(k.cylinder(S0, CY, 3.4, top, 2.6, P, 16, 0.4), { tone: "hi" }),
    )
    parts.push(
      k.lineSvg(k.ring(S0, CY, 3.4, top + 2.6, P, 12), { tone: "faint" }),
    )
    return parts.join("")
  }

  // the carriage: the ways-plate it rides on four bushings, the platen table it
  // turns up, a measuring scale post, the mandrel and the stack so far. Built at
  // station one's x; the caller translates it along x.
  const carriage = (bi: number, count: number, fresh: boolean) => {
    const parts: string[] = []
    const RAIL_Z = 17.4
    // four bushings that grip the two ways, one at each corner of the plate
    for (const ry of [CY - 16, CY + 16])
      for (const bx of [S0 - 16, S0 + 16]) {
        const skirt = { x: bx - 4.5, y: ry - 4.5, w: 9, d: 9, r: 1.8 }
        parts.push(
          k.solidSvg(k.slabOf(skirt, RAIL_Z - 4, 9, P, 3, 0.5), {
            tone: "mid",
            inner: k.lineSvg(k.sideSeam(skirt, RAIL_Z, P, 3), {
              tone: "faint",
            }),
          }),
        )
      }
    // the ways-plate
    const plate = { x: S0 - 23, y: CY - 20, w: 46, d: 40, r: 3 }
    parts.push(
      k.solidSvg(k.slabOf(plate, M.Z_HOME, 4.4, P, 4, 0.7), {
        tone: "hi",
        crease: "lo",
      }),
    )
    parts.push(
      k.lineSvg(k.planOutline(k.insetPlan(plate, 3.2), M.Z_HOME + 4.4, P, 4), {
        tone: "faint",
      }),
    )
    for (const [px, py] of k.corners(plate, 6.5))
      parts.push(
        k.dotsSvg([iso([px, py, M.Z_HOME + 4.5])], { size: 0.5, tone: "mid" }),
      )
    // the platen table the mandrel and stack rise from, narrower than the widest
    // part so a finished product stands proud of its table
    parts.push(
      k.solidSvg(k.cylinder(S0, CY, 11.5, M.Z_HOME + 4.4, 1.6, P, 34, 0.4), {
        tone: "mid",
        crease: "lo",
      }),
    )
    parts.push(
      k.solidSvg(
        k.cylinder(
          S0,
          CY,
          10,
          M.Z_HOME + 6,
          M.Z_PLATEN - (M.Z_HOME + 6),
          P,
          34,
        ),
        { tone: "hi", crease: "lo" },
      ),
    )
    parts.push(
      k.lineSvg(k.ring(S0, CY, 10, M.Z_PLATEN + 0.05, P, 30), {
        tone: "faint",
      }),
    )
    parts.push(
      k.lineSvg(k.ring(S0, CY, 4.2, M.Z_PLATEN + 0.1, P, 18), { tone: "lo" }),
    )
    // T-slots across the platen face, so the table reads machined, not printed
    for (const dx of [-6, 0, 6])
      parts.push(
        k.lineSvg(
          k.lineOnTop(
            [S0 + dx, CY - 9],
            [S0 + dx, CY + 9],
            M.Z_PLATEN + 0.1,
            P,
          ),
          { tone: "faint", free: true },
        ),
      )
    // the measuring scale post at the back of the plate: the product's height is
    // read against it, so the growing stack carries a true measurement with it
    const post = { x: S0 - 21, y: CY - 19, w: 2.4, d: 2.4, r: 0.6 }
    parts.push(
      k.solidSvg(k.slabOf(post, M.Z_HOME + 4.4, 56, P, 2, 0.3), {
        tone: "mid",
      }),
    )
    for (let z = 30; z <= 58; z += 4) {
      const big = (z - 30) % 12 === 0
      parts.push(
        k.lineSvg(
          k.lineOnTop(
            [post.x + post.w, CY - 17.8],
            [post.x + post.w + (big ? 3 : 1.6), CY - 17.8],
            z,
            P,
          ),
          { tone: big ? "mid" : "lo", free: true },
        ),
      )
    }
    // the mandrel, then the product grown so far (in its own group, so the live
    // page can restack it every frame without touching the carriage it rides on)
    parts.push(mandrel())
    parts.push(`<g data-part="stack">${stack(bi, count, fresh)}</g>`)
    // the gauge pointer riding the scale at the stack's current height
    parts.push(
      `<g data-part="gauge" transform="${k.translateAlong(P, [0, 0, stackTop(bi, count) - M.Z_PLATEN])}">` +
        k.solidSvg(
          k.extrude(
            [
              [post.x + post.w + 0.4, CY - 19],
              [post.x + post.w + 0.4, CY - 16.6],
              [post.x + post.w + 4.4, CY - 17.8],
            ],
            M.Z_PLATEN - 0.7,
            1.4,
            P,
            { convex: true, bevel: 0.2 },
          ),
          { tone: "hi", crease: "lo" },
        ) +
        `</g>`,
    )
    // the index fin, sticking forward off the plate to point at the step ruler on
    // the bench's front face: it rides with the carriage, so it always marks where
    // the Director stands
    const fin = { x: S0 - 3, y: CY + 18, w: 6, d: 8, r: 1 }
    parts.push(
      k.solidSvg(k.slabOf(fin, 9, 4, P, 2, 0.3), { tone: "mid", crease: "lo" }),
    )
    parts.push(k.dotsSvg([iso([S0, CY + 25, 11])], { size: 0.7, tone: "hi" }))
    return parts.join("")
  }

  // how high a station's part hangs before the Director lets it down: its top tucks
  // under the chute belly, so it is always poised directly above the seat it aims at
  const flyZ = (bi: number, step: number): number =>
    M.CHUTE_Z - BUILDERS[bi].parts[step]!.h
  // the world height a held part rides above its own seat while it waits at the chute
  const hold = (bi: number, step: number): number =>
    flyZ(bi, step) - seatZ(bi, step)

  // the part a station is holding ready: built at its seat, then the page lifts it
  // up under the chute by translating along z — a pure vertical move, no rebuild
  const heldPart = (bi: number, step: number) => {
    const p = BUILDERS[bi].parts[step]!
    return disc(M.STATIONS[step]!, CY, seatZ(bi, step), p.r, p.h, "hi", true)
  }
  // the screen translation for a held part hovering `up` world-mm above its seat
  const lift = (up: number) => k.translateAlong(P, [0, 0, up])

  return {
    iso,
    CY,
    S0,
    disc,
    stack,
    mandrel,
    carriage,
    flyZ,
    hold,
    heldPart,
    lift,
  }
}
