// Proves the TypeScript port of family-press reproduces the draft's SVG byte-for-byte.
// Bundles figure.ts with esbuild (resolves the extensionless .ts graph) and compares
// buildFigure().svg to the committed fixture. Run: `node scripts/tests/anatomy-fidelity.mjs`
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const entry = join(root, "src/lib/anatomy/family-press/figure.ts")
const fixture = join(here, "fixtures/anatomy/family-press.svg")
const esbuild = join(root, "node_modules/.bin/esbuild")

const dir = mkdtempSync(join(tmpdir(), "anatomy-fidelity-"))
const bundle = join(dir, "figure.mjs")
execFileSync(
  esbuild,
  [entry, "--bundle", "--format=esm", "--platform=node", `--outfile=${bundle}`],
  { stdio: "inherit" },
)

const { buildFigure } = await import(bundle)
const { svg } = buildFigure()
const want = readFileSync(fixture, "utf8")

if (svg !== want) {
  let i = 0
  const n = Math.min(svg.length, want.length)
  while (i < n && svg[i] === want[i]) i++
  console.error(
    `anatomy fidelity FAIL: got ${svg.length} bytes, want ${want.length} bytes`,
  )
  console.error(`first diff at index ${i}`)
  console.error(" got:", JSON.stringify(svg.slice(Math.max(0, i - 40), i + 40)))
  console.error(
    "want:",
    JSON.stringify(want.slice(Math.max(0, i - 40), i + 40)),
  )
  process.exit(1)
}

console.log("anatomy fidelity ok,", svg.length, "bytes")
