import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

/** id 解析结果：kind 区分单篇/系列；target 为传给翻译脚本的绝对路径 */
export type TargetInfo = {
  kind: "single" | "series"
  target: string
  viewUrl: string
}

/** dev 端点错误：status 为应返回的 HTTP 状态码（400 校验失败 / 404 目标不存在） */
export class TranslateDevError extends Error {
  readonly status: 400 | 404

  constructor(message: string, status: 400 | 404) {
    super(message)
    this.name = "TranslateDevError"
    this.status = status
  }
}

const MD = ".md"
const EN_MD = ".en.md"

function invalidId(id: string): TranslateDevError {
  return new TranslateDevError(`非法 id：${id}`, 400)
}

/**
 * 校验内容 id：非空字符串、最多两段（系列/子文章）；每段拒绝空段、
 * `.`/`..`、`_` 前缀草稿、`.en` 结尾（英文译文）、反斜杠与 NUL。
 * 校验失败返回 400。
 */
function validateId(id: unknown): string[] {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TranslateDevError("缺少合法的 id（须为非空字符串）", 400)
  }
  const segments = id.split("/")
  if (segments.length > 2) {
    throw new TranslateDevError(`非法 id：${id}（最多两段）`, 400)
  }
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw invalidId(id)
    }
    if (segment.startsWith("_")) {
      throw new TranslateDevError(`拒绝 _ 前缀草稿：${segment}`, 400)
    }
    if (segment.endsWith(".en")) {
      throw new TranslateDevError(`拒绝英文译文 id：${segment}`, 400)
    }
    if (segment.includes("\\") || segment.includes("\0")) {
      throw invalidId(id)
    }
  }
  return segments
}

/** 解析后断言目标仍在内容根内（防穿越兜底；正常路径不可达） */
function assertInside(root: string, target: string): void {
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new TranslateDevError(`目标越界：${target}`, 404)
  }
}

function requireSeriesIndex(seriesDir: string, label: string): void {
  if (!existsSync(path.join(seriesDir, "index.md"))) {
    throw new TranslateDevError(`系列目录缺少 index.md：${label}`, 404)
  }
}

/**
 * 把内容 id 解析为翻译目标（按序探测）：
 * 1. C/<id>.md：1 段 → 单篇；2 段 → 其父目录（系列，须含 index.md）；
 * 2. C/<id>/index.md → 系列；
 * 3. 否则 404（文件名须与 id 一致，不做模糊匹配）。
 */
export function resolveTarget(contentRoot: string, id: unknown): TargetInfo {
  const segments = validateId(id)
  const root = path.resolve(contentRoot)
  const relId = segments.join("/")

  const fileCandidate = path.resolve(root, `${relId}${MD}`)
  if (existsSync(fileCandidate) && statSync(fileCandidate).isFile()) {
    if (segments.length === 1) {
      assertInside(root, fileCandidate)
      return {
        kind: "single",
        target: fileCandidate,
        viewUrl: `/en/blog/${relId}`,
      }
    }
    const seriesDir = path.dirname(fileCandidate)
    assertInside(root, seriesDir)
    requireSeriesIndex(seriesDir, segments[0])
    return {
      kind: "series",
      target: seriesDir,
      viewUrl: `/en/blog/${segments[0]}`,
    }
  }

  const dirCandidate = path.resolve(root, relId, "index.md")
  if (existsSync(dirCandidate) && statSync(dirCandidate).isFile()) {
    const seriesDir = path.dirname(dirCandidate)
    assertInside(root, seriesDir)
    return {
      kind: "series",
      target: seriesDir,
      viewUrl: `/en/blog/${segments[0]}`,
    }
  }

  throw new TranslateDevError(
    `找不到内容：${relId}（文件名须与 id 一致，不做模糊匹配）`,
    404,
  )
}

/**
 * 统计内容单元的译文进度：单篇 total=1；系列按脚本 discoverSeries 同规则
 * （`*.md`、非 `_` 前缀、非 `.en.md`、含 index.md）计源文件数，对应
 * `.en.md` 存在数即 translated。
 */
export function countUnit(info: TargetInfo): {
  total: number
  translated: number
} {
  if (info.kind === "single") {
    const dst = `${info.target.slice(0, -MD.length)}${EN_MD}`
    return { total: 1, translated: existsSync(dst) ? 1 : 0 }
  }
  const names = readdirSync(info.target, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(MD))
    .filter((name) => !name.startsWith("_"))
    .filter((name) => !name.endsWith(EN_MD))
  const translated = names.filter((name) =>
    existsSync(path.join(info.target, `${name.slice(0, -MD.length)}${EN_MD}`)),
  ).length
  return { total: names.length, translated }
}

/** 构造翻译 CLI 参数（相对项目根执行 scripts/translate.mjs） */
export function buildTranslateArgs(target: string, force: boolean): string[] {
  return ["scripts/translate.mjs", target, ...(force ? ["--force"] : [])]
}

/**
 * 从子进程 stderr 提取错误：取尾部 800 字符，取最后一个非空行 trim 后截
 * 400 字符；无内容 → undefined。
 */
export function extractError(stderr: string): string | undefined {
  const lines = stderr.slice(-800).split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (line !== "") {
      return line.slice(0, 400)
    }
  }
  return undefined
}
