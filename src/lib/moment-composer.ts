import { readdir, writeFile } from "node:fs/promises"
import path from "node:path"

export const MOMENTS_DIR = "src/content/moments"
export const MAX_MOMENT_LENGTH = 2000

const SLUG_RE = /^(\d{4}-\d{2}-\d{2})-(\d+)\.md$/

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** 生成与现有 Moment 文件一致的 frontmatter 日期格式：YYYY-MM-DD HH:mm。 */
export function formatMomentDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 校验发布内容，合法返回 null，否则返回错误信息。 */
export function validateMomentContent(content: unknown): string | null {
  if (typeof content !== "string" || content.trim() === "") {
    return "内容不能为空"
  }
  if (content.trim().length > MAX_MOMENT_LENGTH) {
    return `内容不能超过 ${MAX_MOMENT_LENGTH} 个字符`
  }
  return null
}

/**
 * 计算下一条动态的 slug：YYYY-MM-DD-NN，NN 为当日已有最大序号 + 1。
 * existingSlugs 为不含扩展名的动态 id（如 "2026-07-30-01"）。
 */
export function nextMomentSlug(date: Date, existingSlugs: string[]): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  let max = 0
  for (const slug of existingSlugs) {
    if (slug.startsWith(day)) {
      const num = Number(slug.slice(day.length + 1))
      if (Number.isFinite(num)) max = Math.max(max, num)
    }
  }
  return `${day}-${pad(max + 1)}`
}

/** 序列化为一个完整的 Moment Markdown 文件。 */
export function serializeMoment(date: Date, content: string): string {
  return `---\ndate: ${formatMomentDate(date)}\n---\n\n${content.trim()}\n`
}

/** 列出 moments 目录下顶层 .md 文件的 slug（不含扩展名），按字典序排列。 */
export async function listMomentSlugs(): Promise<string[]> {
  const dir = path.resolve(process.cwd(), MOMENTS_DIR)
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && SLUG_RE.test(entry.name))
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .sort()
}

/** 写入动态文件；文件名已存在时抛 EEXIST，由调用方决定是否重试。 */
export async function writeMomentFile(
  slug: string,
  text: string,
): Promise<void> {
  const dir = path.resolve(process.cwd(), MOMENTS_DIR)
  await writeFile(path.join(dir, `${slug}.md`), text, {
    encoding: "utf8",
    flag: "wx",
  })
}
