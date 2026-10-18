/* ══ Scramble text ═══════════════════════════════════════════
   Text that decodes. Every character flips to a random glyph and
   then locks, left to right, until the real string is readable
   again. On trigger a frame counter starts; the character at
   index i settles once the counter passes `settle + i * stagger`,
   so the line of locks walks across the string at a steady pace.

   ── WHY IT IS NOT A HOOK ────────────────────────────────
   The reference implementation was a React hook that kept
   `display` in `useState` and re-rendered a <span> each frame.
   That state was only ever a copy of a string the component
   already knew, so dropping the framework costs nothing: here
   each frame writes `textContent` once and there is no render
   to schedule.

   What the hook did *not* handle, and this does — the four
   reasons to make it a component instead of a snippet:

   • retriggering started a second interval while the first was
     still writing, so the two raced over the end state;
   • `text.split("")` cuts on UTF-16 code units, turning one
     astral character into two flickering halves;
   • random glyphs are not the same width as the characters they
     replace, so the row shimmied sideways every frame;
   • a backgrounded tab throttles `setInterval` to one tick a
     second, and the animation resumed as a slow typewriter.

   The first three are fixed by the play() guard, a code-point
   spread and the ::before sizer in scramble-text.css. The last
   one is why the loop runs on requestAnimationFrame and counts
   frames from elapsed time: a paused rAF resumes where it left
   instead of snapping to the end.

   There is ONE copy of the string in the DOM — the one being
   painted. The box it churns inside is sized by generated CSS
   content off `data-text`, so a heading that scrambles still
   holds one readable title for the crawler, the screen reader
   and the copy buffer. */

/* The glyph pool. Printable ASCII symbols, no letters — a
   scrambling row can never accidentally spell something. In a
   monospace face each member is exactly as wide as the character
   it replaces, which is what keeps the row still. */
const POOL = "!<>-_/[]{}=+*^?#"

/* Whitespace is never scrambled: it is where the line may break,
   so a random glyph in its place could reflow the whole row. */
const gap = /\s/

/* Read once, the way the wheel and the pill nav do. A
   preference, not a live input. */
const stillness = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

const num = (v: string | undefined, d: number) => {
  const n = Number.parseFloat(v ?? "")
  return Number.isFinite(n) ? n : d
}

export type ScrambleTrigger = "load" | "hover" | "manual"

/* Which face the churn is painted in. `mono` is the signature look
   — one slot per character, nothing shifts sideways. `inherit` lets
   the text keep its host's face (a heading stays a heading) and is
   a CSS-only concern, so the mount never reads it: see the
   [data-face="inherit"] rule in scramble-text.css. */
export type ScrambleFace = "mono" | "inherit"

export const SCRAMBLE_DEFAULTS = {
  /* one frame of the churn, in ms — a cadence, not a frame rate,
     since frames are counted off elapsed time */
  speed: 35,
  /* how many frames later the next character to the right locks */
  stagger: 1.2,
  /* how long one character churns before it locks */
  settle: 14.4,
  /* ms to wait before a `load` trigger starts; carried into the
     frame clock as a head start rather than armed separately, so
     there is one thing to cancel and one clock to keep honest */
  delay: 0,
  pool: POOL,
  trigger: "load" as ScrambleTrigger,
}

export type ScrambleTextHandle = {
  /* start, or restart, the decode. Always wins over the run it
     interrupts — the old frame loop is cancelled first. */
  play(): void
  destroy(): void
}

export function mountScrambleText(host: HTMLElement): ScrambleTextHandle {
  const live = host.querySelector<HTMLElement>(".sct-live")
  if (!live) return { play() {}, destroy() {} }

  const d = host.dataset
  const speed = Math.max(1, num(d.speed, SCRAMBLE_DEFAULTS.speed))
  const stagger = num(d.stagger, SCRAMBLE_DEFAULTS.stagger)
  const settle = num(d.settle, SCRAMBLE_DEFAULTS.settle)
  const pool = d.pool && d.pool.length > 0 ? d.pool : SCRAMBLE_DEFAULTS.pool
  const lead = Math.max(0, num(d.delay, SCRAMBLE_DEFAULTS.delay)) / speed
  const raw = d.trigger
  const trigger: ScrambleTrigger =
    raw === "hover" || raw === "manual" || raw === "load"
      ? raw
      : SCRAMBLE_DEFAULTS.trigger

  /* the settled string, one code point per slot — read off the
     layer that paints it; `data-text` only sizes the box */
  const final = [...(live.textContent ?? "")]
  /* the last character's lock frame — past this nothing is left
     to churn, so the loop retires rather than spinning */
  const total = settle + Math.max(0, final.length - 1) * stagger
  const settled = final.join("")

  let raf = 0
  let start = 0

  const glyph = (c: string) => {
    const i = (Math.random() * pool.length) | 0
    /* a draw that lands on the character itself reads as an early
       lock; step one along the pool instead */
    return pool[pool[i] === c ? (i + 1) % pool.length : i]!
  }

  const paint = (f: number) => {
    let out = ""
    for (let i = 0; i < final.length; i++) {
      const c = final[i]!
      out += gap.test(c) || f - i * stagger > settle ? c : glyph(c)
    }
    live.textContent = out
  }

  const step = (now: number) => {
    if (!start) start = now
    const f = (now - start) / speed - lead
    if (f >= total) {
      raf = 0
      live.textContent = settled
      return
    }
    /* inside the lead-in the row still reads as the settled text;
       the clock is running, the paint has not started */
    if (f >= 0) paint(f)
    raf = requestAnimationFrame(step)
  }

  const play = () => {
    /* an interrupted run stops writing before this one starts */
    cancelAnimationFrame(raf)
    if (stillness()) {
      raf = 0
      live.textContent = settled
      return
    }
    start = 0
    raf = requestAnimationFrame(step)
  }

  const enter = () => play()
  if (trigger === "hover") host.addEventListener("pointerenter", enter)
  if (trigger === "load") play()

  return {
    play,
    destroy() {
      host.removeEventListener("pointerenter", enter)
      cancelAnimationFrame(raf)
      raf = 0
      /* a page swap mid-flight must not hand the next mount
         half-decoded text to sit there as if it were finished */
      live.textContent = settled
    },
  }
}
