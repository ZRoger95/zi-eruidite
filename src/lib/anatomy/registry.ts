// Server-side registry: maps a slug to its figure chrome and its SSR builder.
// Imported by Astro frontmatter and by the /figures routes' getStaticPaths.
// Keeping the builders here (and only the mount fns in registry-client.ts) is what
// stops lathe.ts / figure.ts from ever reaching the client bundle.
import { buildFigure as buildFamilyPress } from "./family-press/figure"
import type { Chrome } from "./family-press/figure"
import { buildFigure as buildBuilderBench } from "./builder-bench/figure"

export type { Chrome }
export type FigureMeta = { title: string; hint: string }
// Each figure carries its own machine state as `data`; the registry only needs to
// hand it to the host as an opaque blob, so the two figures' differing shapes fit.
export type BuiltFigure = { svg: string; data: unknown; chrome: Chrome }

export const FIGURES_META: Record<string, FigureMeta> = {
  "family-press": {
    title: "抽象工厂 · 家族冲压机",
    hint: "鼠标移到架上挑一只头 · 点一下压一次 · ←→ 换头 · 退格送料",
  },
  "builder-bench": {
    title: "建造者 · 分度装配台",
    hint: "鼠标移到左侧架上换建造者 · 点一下走一道工序 · ←→ 换工序 · 退格清空",
  },
}

export const BUILDERS: Record<string, () => BuiltFigure> = {
  "family-press": buildFamilyPress,
  "builder-bench": buildBuilderBench,
}
