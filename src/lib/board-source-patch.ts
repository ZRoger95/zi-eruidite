/**
 * 收藏板布局的 dev 写回：把当前板面几何（x/y/rotate/z/scale/flip）逐字段改写回
 * `src/data/board.ts` 的 `BOARD_ITEMS` 源码。纯字符串函数，不读盘、不依赖 Astro，
 * 便于离线断言（见 scripts/tests/board-source-patch-check.sh）。
 *
 * 设计约束：
 * - 按 `id: "<id>"` 锚点定位每个 item 块（块 = 本锚点行 → 下一个锚点行或数组尾）；
 *   未知 id 计入 `skipped`、静默跳过，绝不改动结构。
 * - 只改写六个几何字段行；几何行带行尾注释（如 `z: 1, // 层叠`）时就地换值、
 *   原样保留逗号与注释（宽匹配识别字段已存在，绝不另插同名字段造成重复键）；
 *   `image`/`href`/`kind`/`title`/`alt` 等非几何字段与整行/行内注释逐字保留。
 * - 默认值不落字段：rotate/z 归 0、scale 归 1、flip 归 false 时删除既有行或省略，
 *   回落到 `BoardItem` 的可选字段默认。x/y 为必填恒保留。
 * - 数值统一 `round4`（非有限归 0），负零归 0，无多余小数。幂等：同值二次改写
 *   `updated` 为 0、`source` 与输入全等。
 */

/** 一件物件的当前几何（编辑器从 DOM 采集，对应渲染的 `--x/--y/--rot/--z/--s/--sx`）。 */
export type BoardLayoutPatch = {
  id: string
  x: number
  y: number
  rotate: number
  z: number
  scale: number
  flip: boolean
}

/** 六几何字段的规范顺序（插入缺失字段时据此排布）。 */
const GEOM_FIELDS = ["x", "y", "rotate", "z", "scale", "flip"] as const
type GeomField = (typeof GEOM_FIELDS)[number]

/** 各字段的默认值：等于默认则不落字段；x/y 必填，故为 null（永不删）。 */
const DEFAULTS: Record<GeomField, number | boolean | null> = {
  x: null,
  y: null,
  rotate: 0,
  z: 0,
  scale: 1,
  flip: false,
}

/** 保留至多 4 位小数，负零归 0；非有限输入兜底为 0（防 Infinity 泄入源码）。 */
export function round4(n: number): number {
  if (!Number.isFinite(n)) return 0
  const r = Math.round(n * 1e4) / 1e4
  return r === 0 ? 0 : r
}

/** 取 patch 里对应字段的规范化值（flip 归布尔，其余走 round4）。 */
function valueOf(patch: BoardLayoutPatch, field: GeomField): number | boolean {
  if (field === "flip") return patch.flip
  return round4(patch[field as "x" | "y" | "rotate" | "z" | "scale"])
}

/**
 * 是否为几何字段行（宽匹配：允许值前后空格、可省的尾逗号、行尾注释）。
 * 命中返回 { field, indent, rest }，rest 为数值之后的原样文本（含逗号与注释），
 * 供换值时逐字保留；未命中返回 null。
 */
function matchGeomLine(
  line: string,
): { field: GeomField; indent: string; rest: string } | null {
  const m =
    /^(\s*)(x|y|rotate|z|scale|flip)\s*:\s*(-?(?:\d+(?:\.\d+)?|\.\d+)|true|false)(.*)$/.exec(
      line,
    )
  if (!m) return null
  return { field: m[2] as GeomField, indent: m[1], rest: m[4] }
}

/** 若为 `id: "<id>"` 锚点行，返回其 id，否则 null。 */
function anchorId(line: string): string | null {
  const m = /^\s*id:\s*"([^"]+)",?\s*$/.exec(line)
  return m ? m[1] : null
}

/** 改写单个块（blockLines = 该块 [start,end) 的行），返回替换后的新行数组。 */
function rewriteBlock(blockLines: string[], patch: BoardLayoutPatch): string[] {
  // 块内各几何字段首次出现的行号
  const fieldLine = new Map<GeomField, number>()
  for (let i = 0; i < blockLines.length; i++) {
    const m = matchGeomLine(blockLines[i])
    if (m && !fieldLine.has(m.field)) fieldLine.set(m.field, i)
  }

  const delIdx = new Set<number>()
  const replaceMap = new Map<number, string>()
  const pendingInserts: GeomField[] = []

  for (const field of GEOM_FIELDS) {
    const v = valueOf(patch, field)
    const isDefault = DEFAULTS[field] !== null && v === DEFAULTS[field]
    const at = fieldLine.get(field)
    if (at !== undefined) {
      if (isDefault) {
        delIdx.add(at)
      } else {
        const m = matchGeomLine(blockLines[at])!
        // 保留原行逗号与行尾注释，只换数值——避免重复键且不丢注释
        replaceMap.set(at, `${m.indent}${field}: ${v}${m.rest}`)
      }
    } else if (!isDefault && field !== "x" && field !== "y") {
      // x/y 恒存在于正常数据；缺失的可选非默认字段走插入
      pendingInserts.push(field)
    }
  }

  // 插入锚点：[x,y,rotate,z] 中最后一条未删除的行（x/y 恒保留，故至少落在 y）
  let anchorIdx = -1
  for (const field of ["x", "y", "rotate", "z"] as GeomField[]) {
    const at = fieldLine.get(field)
    if (at !== undefined && !delIdx.has(at)) anchorIdx = Math.max(anchorIdx, at)
  }
  if (anchorIdx < 0) anchorIdx = 0 // 兜底：贴块首（理论上 x/y 恒在，不会触发）
  const anchorIndent = /^(\s*)/.exec(blockLines[anchorIdx])?.[1] ?? "    "
  const insertTexts = pendingInserts.map(
    (field) => `${anchorIndent}${field}: ${valueOf(patch, field)},`,
  )

  const rebuilt: string[] = []
  for (let i = 0; i < blockLines.length; i++) {
    if (delIdx.has(i)) continue
    rebuilt.push(replaceMap.has(i) ? replaceMap.get(i)! : blockLines[i])
    if (i === anchorIdx && insertTexts.length) rebuilt.push(...insertTexts)
  }
  return rebuilt
}

/** 改写结果：新文本、真实变更条数、因未知而跳过的 id。 */
export type BoardLayoutResult = {
  source: string
  updated: number
  skipped: string[]
}

/**
 * 改写源码。`updated` = 内容真实变化的块数（同值为 0，供调用方据此判是否写盘）；
 * `skipped` = 未在源码找到锚点的 patch id（静默跳过、不改结构）。
 */
export function patchBoardSource(
  source: string,
  patches: BoardLayoutPatch[],
): BoardLayoutResult {
  const byId = new Map(patches.map((p) => [p.id, p]))
  const lines = source.split("\n")

  // 收集所有 item 锚点行号
  const anchors: { id: string; start: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const id = anchorId(lines[i])
    if (id !== null) anchors.push({ id, start: i })
  }
  const anchorIds = new Set(anchors.map((a) => a.id))
  const skipped = patches.filter((p) => !anchorIds.has(p.id)).map((p) => p.id)

  // 逆序处理：后面块增删行不影响前面块的行号
  const result = lines.slice()
  let updated = 0
  for (let k = anchors.length - 1; k >= 0; k--) {
    const { id, start } = anchors[k]
    const patch = byId.get(id)
    if (!patch) continue
    const end = k + 1 < anchors.length ? anchors[k + 1].start : lines.length
    const originalBlock = result.slice(start, end)
    const rebuilt = rewriteBlock(originalBlock, patch)
    const blockChanged =
      rebuilt.length !== originalBlock.length ||
      rebuilt.some((l, i) => l !== originalBlock[i])
    if (blockChanged) updated++
    result.splice(start, end - start, ...rebuilt)
  }

  return { source: result.join("\n"), updated, skipped }
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v)

export type ValidationResult =
  | { ok: true; items: BoardLayoutPatch[] }
  | { ok: false; error: string }

/**
 * 校验编辑器上报的布局载荷（与 patchBoardSource 同处本模块，保持零依赖、可离线
 * 单测）。要求：`items` 非空数组（拒绝「一键清空」误写）；每项 `id` 非空字符串；
 * `x`/`y` 为 [0,1] 内有限数；`rotate`/`z`/`scale` 有限；`flip` 布尔。
 * 未知 id 不在此拒绝（交由 patchBoardSource 静默跳过）。
 */
export function validateLayoutItems(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "请求格式错误" }
  }
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "缺少物件布局数据" }
  }
  const patches: BoardLayoutPatch[] = []
  for (const entry of items) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "物件数据格式错误" }
    }
    const it = entry as Record<string, unknown>
    if (typeof it.id !== "string" || it.id.trim() === "") {
      return { ok: false, error: "物件 id 无效" }
    }
    if (!isFiniteNumber(it.x) || it.x < 0 || it.x > 1) {
      return { ok: false, error: `物件 ${it.id} 的 x 越界` }
    }
    if (!isFiniteNumber(it.y) || it.y < 0 || it.y > 1) {
      return { ok: false, error: `物件 ${it.id} 的 y 越界` }
    }
    if (
      !isFiniteNumber(it.rotate) ||
      !isFiniteNumber(it.z) ||
      !isFiniteNumber(it.scale)
    ) {
      return { ok: false, error: `物件 ${it.id} 的几何数值无效` }
    }
    if (typeof it.flip !== "boolean") {
      return { ok: false, error: `物件 ${it.id} 的 flip 非布尔` }
    }
    patches.push({
      id: it.id,
      x: it.x,
      y: it.y,
      rotate: it.rotate,
      z: it.z,
      scale: it.scale,
      flip: it.flip,
    })
  }
  return { ok: true, items: patches }
}
