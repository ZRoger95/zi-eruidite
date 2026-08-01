export type DayCount = { date: Date; count: number }
export type ActivityLevel = 0 | 1 | 2 | 3 | 4
export type ActivityCell = { date: Date; count: number; level: ActivityLevel }
export type MonthLabel = { column: number; label: string }
export type ActivityStats = {
  total: number
  activeDays: number
  peak: { date: Date; count: number } | null
}
export type YearData = {
  year: number
  weeks: number
  cells: ActivityCell[]
  monthLabels: MonthLabel[]
  stats: ActivityStats
}

const WEEKDAYS = 7
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"]
// 只显示 一、三、五（行号 = WEEKDAY_LABELS 下标）
const GUTTER_ROWS = [1, 3, 5]

const tipFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
})

/** 计数 → 5 级强度：0、1、2、3、≥4。 */
export function getLevel(count: number): ActivityLevel {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count === 3) return 3
  return 4
}

/** 按 toDateString() 归并为每日计数（与时间线分组键一致），按日期升序。 */
export function countByDay(moments: { date: Date }[]): DayCount[] {
  const map = new Map<string, DayCount>()
  for (const m of moments) {
    const d = new Date(m.date)
    d.setHours(0, 0, 0, 0)
    const key = d.toDateString()
    const entry = map.get(key)
    if (entry) entry.count += 1
    else map.set(key, { date: d, count: 1 })
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** 有动态的年份列表，降序。 */
export function getYears(moments: { date: Date }[]): number[] {
  const years = new Set<number>()
  for (const m of moments) years.add(m.date.getFullYear())
  return [...years].sort((a, b) => b - a)
}

/** 构建某自然年的网格数据。 */
export function buildYearData(dayCounts: DayCount[], year: number): YearData {
  const firstDay = new Date(year, 0, 1)
  const lastDay = new Date(year, 11, 31)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())
  const end = new Date(lastDay)
  end.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  const counts = new Map<string, number>()
  for (const d of dayCounts) {
    if (d.date.getFullYear() === year)
      counts.set(d.date.toDateString(), d.count)
  }

  const cells: ActivityCell[] = []
  let total = 0
  let activeDays = 0
  let peak: { date: Date; count: number } | null = null

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const inYear = d.getFullYear() === year
    const count = inYear ? (counts.get(d.toDateString()) ?? 0) : 0
    cells.push({ date: new Date(d), count, level: getLevel(count) })
    if (inYear && count > 0) {
      total += count
      activeDays += 1
      if (!peak || count > peak.count) peak = { date: new Date(d), count }
    }
  }

  const weeks = Math.ceil(cells.length / WEEKDAYS)

  const monthLabels: MonthLabel[] = []
  let prevMonth = -1
  for (let w = 0; w < weeks; w++) {
    const date = cells[w * WEEKDAYS].date
    const month = date.getMonth()
    if (month !== prevMonth) {
      // 跳过起始列中上一年 12 月前导格的标签，避免与紧邻的「1月」标签重叠
      const isLeadingPrevYear =
        w === 0 && month === 11 && date.getFullYear() < year
      if (!isLeadingPrevYear)
        monthLabels.push({ column: w, label: `${month + 1}月` })
      prevMonth = month
    }
  }

  return { year, weeks, cells, monthLabels, stats: { total, activeDays, peak } }
}

/** 序列化为紧凑映射 { year: { "M-D": count } }，供页面内嵌。 */
export function serializeYearMaps(
  dayCounts: DayCount[],
  years: number[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const y of years) out[String(y)] = {}
  for (const d of dayCounts) {
    const yearKey = String(d.date.getFullYear())
    ;(out[yearKey] ??= {})[`${d.date.getMonth() + 1}-${d.date.getDate()}`] =
      d.count
  }
  return out
}

/** 反序列化单年映射为 DayCount 列表（客户端重建网格用）。 */
export function deserializeYearMap(
  year: number,
  yearMap: Record<string, number>,
): DayCount[] {
  const out: DayCount[] = []
  for (const [key, count] of Object.entries(yearMap)) {
    const [m, d] = key.split("-").map(Number)
    out.push({ date: new Date(year, m - 1, d), count })
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** 悬停提示文本，如「2026年7月30日 · 3 条动态」。 */
export function formatTip(date: Date, count: number): string {
  return `${tipFormatter.format(date)} · ${count} 条动态`
}

/** 图注文本：今年/2025 · 共 N 条动态；空年份 · 暂无动态。 */
export function formatCaption(
  year: number,
  stats: ActivityStats,
  currentYear: number,
): string {
  const label = year === currentYear ? "今年" : String(year)
  if (stats.total === 0) return `${label} · 暂无动态`
  return `${label} · 共 ${stats.total} 条动态`
}

/**
 * 生成网格内部 HTML（月份标签 + 星期标签 + 单元格）。
 * todayStr 形如 toDateString()；匹配到的单元格加 data-today 标记。
 */
export function renderGrid(data: YearData, todayStr?: string): string {
  const parts: string[] = []
  for (const m of data.monthLabels) {
    parts.push(
      `<span class="activity-month" style="grid-row: 1; grid-column: ${m.column + 2}">${m.label}</span>`,
    )
  }
  for (const row of GUTTER_ROWS) {
    parts.push(
      `<span class="activity-weekday" style="grid-row: ${row + 2}; grid-column: 1">${WEEKDAY_LABELS[row]}</span>`,
    )
  }
  for (let i = 0; i < data.cells.length; i++) {
    const cell = data.cells[i]
    const week = Math.floor(i / WEEKDAYS)
    const day = i % WEEKDAYS
    const todayAttr =
      todayStr && cell.date.toDateString() === todayStr ? " data-today" : ""
    parts.push(
      `<span class="activity-cell" data-level="${cell.level}" data-tip="${formatTip(cell.date, cell.count)}"${todayAttr} style="grid-row: ${day + 2}; grid-column: ${week + 2}"></span>`,
    )
  }
  return parts.join("")
}

/** 生成活跃日 sr-only 列表 HTML（无障碍）。 */
export function renderSrList(data: YearData): string {
  const items = data.cells.filter((c) => c.count > 0)
  return `<ul class="activity-sr-list">${items
    .map((c) => `<li>${formatTip(c.date, c.count)}</li>`)
    .join("")}</ul>`
}
