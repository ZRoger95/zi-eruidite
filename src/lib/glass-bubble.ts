/* ══ Glass bubble, liquid ═════════════════════════════════
   A ball of glass you drag over a photograph. It bends what is
   under it — a little bigger in the middle, hard at the rim —
   splits the colour a hair at the very edge, catches the light
   along its top, and can be carried off the picture onto the
   card, where there is nothing to bend and it is only light and
   shadow.

   ── A SHADER, NOT A FILTER ──────────────────────────────
   The first Glass bubble was an SVG displacement map through a
   backdrop filter, and it is still there for the Lens page.
   What it could not do is know where its own edge was: a map
   is a picture, drawn once, so the rim was a band of numbers
   rather than a surface. Here the page is a texture and every
   pixel asks a signed distance function how far it is from
   the capsule's edge, which is what lets the bend, the rim
   light and the shadow all follow the SAME edge exactly —
   including while the capsule stretches under a fast drag.

   ── THE RIM READS OUTWARD ───────────────────────────────
   Near the edge each pixel samples from further out along the
   edge's normal, so the band round the rim shows what is just
   outside it, gathered in. That is what makes text curve at
   the edge of real glass. The middle only magnifies.

   Ported from Bencho's lab/LiquidGlass.tsx (MIT, bencho.dev/licence).
   That shipped as a React component, but every frame it writes
   straight to a canvas through refs — React was only a thin
   shell that never drove a render. So here it is on the shell
   this bench actually uses: an autonomous custom element whose
   SSR'd static photo is swapped for the live canvas on mount,
   reading its knobs off the host's data-* attributes. */

/* ── one spring, for everything that settles ───────────────
   The maths was already on this bench twice, copied by hand:
   Humidity's wheel and Brightness's column both accumulate
   velocity toward a target, damp it, and snap when both the
   delta and the velocity fall under 0.02. Two copies is a
   coincidence; five would be a policy, so it comes out here
   before the elastic blocks are written against it.

   The two shipped copies are deliberately NOT refactored onto
   this. They work, they are tuned, and rewriting the innards
   of two live components to prove a point about duplication
   is how a good afternoon becomes a bad one. This is the one
   new code uses.

   Frames, not milliseconds. `dt` is expressed in sixtieths of
   a second and the damping is RAISED to it rather than
   multiplied by it, so a dropped frame decays the same amount
   of energy as the two frames it replaced. Multiplying is the
   version that makes a spring behave differently on a busy
   page, which is the hardest kind of bug to see.

   The loop parks itself the moment the value has settled.
   CLAUDE.md is not complimentary about the one permanent
   requestAnimationFrame already on this bench and there is no
   case for five more. */

/* Read once, the way the wheel and the pill nav do. A
   preference, not a live input. */
const stillness = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/* Bencho's COW was their own pictures, which are not licensed
   to travel. Here the photograph is whatever the host's
   `data-src` points at — a project image, e.g. from
   `src/assets/board/`. */

/* ── the picture, and the room round it ─────────────────
   The photograph is square and the ball has the run of a
   margin on every side, so it can be carried half off the
   picture onto the card — the edge is something you cross, not
   a wall. The margin is part of the canvas and left clear, so
   the card itself shows through it. */
const PIC = 440
const PAD = 90
const W = PIC + PAD * 2
const H = W
/* the photograph's corner at rest; the Corner knob sets it */
const PIC_R = 20

const VERT = `
attribute vec2 pos;
varying vec2 vUv;
void main() {
  vUv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  gl_Position = vec4(pos, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
uniform sampler2D tex;
uniform vec2 res;
uniform vec2 c;
uniform vec2 b;
uniform float r;
uniform float bend;
uniform float fringe;
uniform float dark;
varying vec2 vUv;

float sdf(vec2 p) {
  vec2 q = abs(p - c) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

/* premultiplied: the margin round the picture is transparent,
   so the real card shows through it and the glass over it bends
   nothing — only its light and its shadow are left */
vec4 read(vec2 p) {
  return texture2D(tex, clamp(p / res, 0.0, 1.0));
}

void main() {
  vec2 p = vUv * res;
  float d = sdf(p);
  vec4 col = read(p);

  /* what it casts: soft, a little below. It darkens the picture
     where there is one and is a shadow of its own where there
     is not. */
  float ds = sdf(p - vec2(0.0, 9.0));
  float sh = (1.0 - smoothstep(-8.0, 26.0, ds)) * mix(0.14, 0.3, dark);
  if (d > 0.0) col = vec4(col.rgb * (1.0 - sh), col.a) + vec4(0.0, 0.0, 0.0, sh * (1.0 - col.a));

  if (d < 1.0) {
    float e = 1.5;
    vec2 n = normalize(vec2(
      sdf(p + vec2(e, 0.0)) - sdf(p - vec2(e, 0.0)),
      sdf(p + vec2(0.0, e)) - sdf(p - vec2(0.0, e))
    ) + 1e-5);
    /* the bending band scales with the ball, so a big one is
       still a lens and a small one is not all rim */
    float bevel = min(b.y, max(22.0, b.y * 0.36));
    /* 0 at the rim, 1 once past the bevel */
    float t = clamp(-d / bevel, 0.0, 1.0);
    float edge = pow(1.0 - t, 2.4);

    vec2 mag = c + (p - c) / 1.1;
    vec2 off = n * edge * bevel * 1.1 * bend;
    vec2 q = mag + off;
    vec4 mid = read(q);
    vec4 g = vec4(read(q + off * fringe).r, mid.g, read(q - off * fringe).b, mid.a);

    /* the light: a thin lit band just inside the edge, bright
       where it faces up-left, a weaker catch on the far side
       where light has come through and out again */
    vec2 L = normalize(vec2(-0.55, -0.85));
    float rim = smoothstep(0.0, 1.6, -d) * (1.0 - smoothstep(1.6, 4.5, -d));
    float lit = max(dot(n, L), 0.0);
    float far = max(dot(n, -L), 0.0);
    g.rgb *= mix(1.03, 1.08, dark);
    /* light is added as light: colour and coverage together, so
       it shows on the card as well as on the picture */
    float light = rim * (0.18 + 0.75 * lit) + rim * far * 0.22 + edge * mix(0.05, 0.08, dark);
    g += vec4(vec3(light), light);
    g = clamp(g, 0.0, 1.0);

    float a = 1.0 - smoothstep(-0.6, 0.6, d);
    col = mix(col, g, a);
  }
  gl_FragColor = col;
}`

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/* ── light or dark, read off the page ────────────────────
   The theme lives on <html data-theme> — the site's own signal,
   written by ThemeToggle — so that is where this looks, not at
   any store, which keeps the block whole when it is copied out
   into somebody else's app. With no explicit choice the site
   falls back to the OS, so matchMedia is the second read. */
const isDark = () => {
  const theme = document.documentElement.dataset.theme
  return (
    theme === "dark" ||
    (!theme && matchMedia("(prefers-color-scheme: dark)").matches)
  )
}

function compile(gl: WebGLRenderingContext) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  return prog
}

export const GLASS_DEFAULTS = {
  /* the ball's diameter, px */
  size: 180,
  /* how hard the rim bends, 0..100 */
  bend: 60,
  /* how far the colours part at the edge, 0..40 */
  fringe: 30,
  /* the photograph's corner, px */
  corner: PIC_R,
  label: "A ball of glass over a photograph. Drag it.",
}

export type GlassBubbleHandle = {
  attrChanged(name: string): void
  destroy(): void
}

/* The canvas is W×H CSS px at rest (see glass-bubble.css); the
   host may scale it down on a narrow screen, which is fine —
   the pointer maths reads the live rect, the shader the live
   backing-store size. */
export function mountGlassBubble(host: HTMLElement): GlassBubbleHandle {
  const still = stillness()
  const num = (name: string, fallback: number) => {
    const v = Number.parseFloat(host.dataset[name] ?? "")
    return Number.isFinite(v) ? v : fallback
  }

  /* a re-mount (view transitions) reuses the canvas it left
   * behind rather than stacking a second one */
  const cv =
    host.querySelector<HTMLCanvasElement>("canvas") ??
    document.createElement("canvas")
  if (!cv.isConnected) host.append(cv)
  cv.setAttribute("role", "img")
  cv.setAttribute("aria-label", host.dataset.label ?? GLASS_DEFAULTS.label)

  let glc: {
    g: WebGLRenderingContext
    prog: WebGLProgram
    tex: WebGLTexture
  } | null = null
  let page: HTMLCanvasElement | null = null
  let raf = 0
  /* it starts on the picture, up and right of the middle */
  const s = {
    x: W * 0.6,
    y: H * 0.42,
    vx: 0,
    vy: 0,
    tx: W * 0.6,
    ty: H * 0.42,
  }
  let grab: { dx: number; dy: number } | null = null

  /* ── one frame ─────────────────────────────────────────── */
  const draw = () => {
    const G = glc
    if (!G) return
    const { g, prog } = G
    const k = cv.width / W
    /* a fast drag stretches it along the way it is going and
       thins it across — the same volume, moving */
    const sp = Math.hypot(s.vx, s.vy)
    const stretch = still ? 0 : Math.min(0.14, sp * 0.012)
    const ax = sp > 0.01 ? Math.abs(s.vx) / sp : 1
    const rad = clamp(num("size", GLASS_DEFAULTS.size), 100, 280) / 2
    const bx = rad * (1 + stretch * ax - stretch * 0.5 * (1 - ax))
    const by = rad * (1 + stretch * (1 - ax) - stretch * 0.5 * ax)
    g.viewport(0, 0, cv.width, cv.height)
    g.useProgram(prog)
    const u = (n: string) => g.getUniformLocation(prog, n)
    g.uniform2f(u("res"), cv.width, cv.height)
    g.uniform2f(u("c"), s.x * k, s.y * k)
    g.uniform2f(u("b"), bx * k, by * k)
    g.uniform1f(u("r"), Math.min(bx, by) * k)
    g.uniform1f(
      u("bend"),
      clamp(num("bend", GLASS_DEFAULTS.bend), 0, 100) / 100,
    )
    g.uniform1f(
      u("fringe"),
      clamp(num("fringe", GLASS_DEFAULTS.fringe), 0, 40) / 100,
    )
    g.uniform1f(u("dark"), isDark() ? 1 : 0)
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
  }

  /* ── the loop: a spring toward the hand, then stop ─────── */
  const run = () => {
    if (raf) return
    let prev = 0
    const tick = (t: number) => {
      const dt = prev ? clamp((t - prev) / 16.67, 0, 2.5) : 1
      prev = t
      if (still) {
        s.x = s.tx
        s.y = s.ty
        s.vx = 0
        s.vy = 0
      } else {
        const k = 0.22
        const d = Math.pow(0.66, dt)
        s.vx = (s.vx + (s.tx - s.x) * k * dt) * d
        s.vy = (s.vy + (s.ty - s.y) * k * dt) * d
        s.x += s.vx * dt
        s.y += s.vy * dt
      }
      draw()
      const moving =
        Math.abs(s.tx - s.x) > 0.05 ||
        Math.abs(s.ty - s.y) > 0.05 ||
        Math.abs(s.vx) > 0.05 ||
        Math.abs(s.vy) > 0.05 ||
        grab !== null
      raf = moving ? requestAnimationFrame(tick) : 0
    }
    raf = requestAnimationFrame(tick)
  }

  /* ── the page under the glass ──────────────────────────── */
  const paint = async () => {
    const G = glc
    if (!G) return
    const pg = (page ??= document.createElement("canvas"))
    pg.width = cv.width
    pg.height = cv.height
    const x = pg.getContext("2d")!
    const k = cv.width / W
    /* the margin stays clear: the card behind the canvas is
       the ground, whatever colour it is */
    x.clearRect(0, 0, pg.width, pg.height)
    const im = new Image()
    const src = host.dataset.src ?? ""
    if (src) {
      im.src = src
      await im.decode().catch(() => {})
    }
    /* the photograph keeps its own proportions and is shown
       whole: it is fitted inside the square box, centred, with
       its own rounded corners — the clear margin absorbs
       whatever the picture is wider or taller than the box */
    const px = PAD * k
    const ps = PIC * k
    const rad = clamp(num("corner", PIC_R), 0, 60) * k
    if (im.width && im.height) {
      const sc = Math.min(ps / im.width, ps / im.height)
      const iw = im.width * sc
      const ih = im.height * sc
      const ix = px + (ps - iw) / 2
      const iy = px + (ps - ih) / 2
      x.save()
      x.beginPath()
      x.roundRect(ix, iy, iw, ih, rad)
      x.clip()
      x.drawImage(im, ix, iy, iw, ih)
      x.restore()
    }
    const { g, tex } = G
    g.bindTexture(g.TEXTURE_2D, tex)
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, pg)
    draw()
  }

  /* ── set up once ───────────────────────────────────────── */
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = Math.round(W * dpr)
  cv.height = Math.round(H * dpr)
  const gl = cv.getContext("webgl", {
    antialias: true,
    premultipliedAlpha: true,
    alpha: true,
  })
  const prog = gl && compile(gl)
  if (!gl || !prog) {
    /* no WebGL, no shader: leave the SSR'd photo showing and
       go no further — the degradation the SSR half is for */
    cv.remove()
    return { attrChanged() {}, destroy() {} }
  }
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const loc = gl.getAttribLocation(prog, "pos")
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  glc = { g: gl, prog, tex }
  /* NOT loseContext() here. A teardown may be followed by a
     straight re-mount on the SAME canvas (view transitions),
     and a context that has been lost comes straight back from
     getContext still lost — a sad-face canvas. The browser
     frees it with the element. */
  host.dataset.active = ""

  /* the page repaints when what is on it changes; the theme
     is on <html data-theme>, with the OS as fallback signal */
  const mo = new MutationObserver(() => paint())
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  const sys = matchMedia("(prefers-color-scheme: dark)")
  const onSys = () => paint()
  sys.addEventListener("change", onSys)

  paint()

  /* ── the hand ──────────────────────────────────────────── */
  const at = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect()
    const k = r.width / W
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }
  }
  const onGlass = (p: { x: number; y: number }) =>
    Math.hypot(p.x - s.x, p.y - s.y) <=
    clamp(num("size", GLASS_DEFAULTS.size), 100, 280) / 2 + 4

  cv.addEventListener("pointerdown", (e) => {
    const p = at(e)
    if (!onGlass(p)) return
    grab = { dx: p.x - s.x, dy: p.y - s.y }
    try {
      cv.setPointerCapture(e.pointerId)
    } catch {
      /* scripted */
    }
    run()
  })
  cv.addEventListener("pointermove", (e) => {
    const p = at(e)
    cv.dataset.over = onGlass(p) || grab ? "true" : "false"
    if (!grab) return
    s.tx = clamp(p.x - grab.dx, 0, W)
    s.ty = clamp(p.y - grab.dy, 0, H)
    run()
  })
  cv.addEventListener("pointerup", () => {
    if (!grab) return
    grab = null
    run()
  })
  cv.addEventListener("pointercancel", () => {
    grab = null
    run()
  })

  return {
    attrChanged(name: string) {
      if (name === "data-src" || name === "data-corner") paint()
      else if (name === "data-label")
        cv.setAttribute(
          "aria-label",
          host.dataset.label ?? GLASS_DEFAULTS.label,
        )
      /* the glass redraws when a knob moves */ else draw()
    },
    destroy() {
      cancelAnimationFrame(raf)
      raf = 0
      glc = null
      mo.disconnect()
      sys.removeEventListener("change", onSys)
      delete host.dataset.active
      /* back to the static photo until something remounts */
      cv.remove()
    },
  }
}
