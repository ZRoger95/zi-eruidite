// Client-side registry: slug -> mount fn only. The AnatomyFigure <script> imports
// exactly this, so the client bundle carries live.ts + iso-kit but never figure.ts
// or lathe.ts (which stay server-side).
import { mountFamilyPress } from "./family-press/live"
import { mountBuilderBench } from "./builder-bench/live"

export type Mount = (host: HTMLElement) => { destroy(): void }

export const MOUNTS: Record<string, Mount> = {
  "family-press": mountFamilyPress,
  "builder-bench": mountBuilderBench,
}
