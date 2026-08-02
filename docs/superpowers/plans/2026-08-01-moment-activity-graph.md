# 动态活跃图（Moment Activity Graph）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/moments` 页面的发布器上方添加一个 GitHub 风格的动态活跃图：自然年视图（默认当前年份），原生 `<select>` 下拉切换历史年份，悬停显示日期与条数，零 JS 首屏、渐进增强。

**Architecture:** 纯同构逻辑模块 `src/lib/activity-graph.ts`（服务端构建与客户端切换共用，含数据构建 + 网格 HTML 生成），组件 `src/components/ActivityGraph.astro` 服务端渲染默认年份网格并内嵌紧凑年份数据，内联 `<script>` 为 `<select>` 绑定 change 事件，用共享逻辑客户端重建任意年份网格。放在 `src/pages/moments/index.astro` 的 `<h1>` 与 `<MomentComposer />` 之间。

**Tech Stack:** Astro 7（静态输出）、原生 CSS（Utopia 令牌 + Radix Colors `light-dark()`）、零 JS 框架、零新 npm 依赖。

## Global Constraints

- **公开功能**：组件不得包含 `import.meta.env.PROD` 早退（与 dev-only 的 `MomentComposer` 不同）。
- **数据口径**：仅统计 moments；日期按 `date.toDateString()` 分组，与时间线页面一致。
- **自然年视图**：默认当前年份（选项标签「今年」），`<select>` 仅列出有数据的年份 + 当前年份。
- **静态模式**：站点为 Astro 默认静态输出，查询参数在生产不生效——不得用 `?year=` 方案。
- **零新依赖**：不新增 npm 包、不引入 UI/CSS 框架。
- **样式**：仅用设计令牌（`--space-*`、`--radius-*`、`--accent`、`--gray-*`、`--background`、`--muted-foreground`、`--border`、`--foreground`），颜色用 `color-mix(in oklab, ...)` 派生，`light-dark()` 自动适配明暗主题。
- **Biome 格式**：2 空格缩进、80 字符行宽、双引号、无分号；行内 `<script>` 需包 IIFE，`querySelector` 需泛型 + `!` 断言（strict TS）。
- **可访问性**：年份切换用真实 `<select>` + `<label>`；网格 `aria-hidden="true"`；活跃日另有 `sr-only` 列表（随切换同步）。
- **范围外**：不做点击筛选、不做实时更新、不修改 composer 与时间线逻辑、不修复既有 `?page=` 分页在静态模式失效的问题。
- **验证**：仓库无测试框架，任务验证用 `npm run format:check`、`npm run build`、dev server 手动检查（AGENTS.md 约定）。

---

### Task 1: 纯同构逻辑模块 `src/lib/activity-graph.ts`

**Files:**
- Create: `src/lib/activity-graph.ts`

**Interfaces:**
- Produces（供 Task 2 使用，签名必须精确）：
  - `type DayCount = { date: Date; count: number }`
  - `type ActivityLevel = 0 | 1 | 2 | 3 | 4`
  - `type ActivityCell = { date: Date; count: number; level: ActivityLevel }`
  - `type MonthLabel = { column: number; label: string }`
  - `type ActivityStats = { total: number; activeDays: number; peak: { date: Date; count: number } | null }`
  - `type YearData = { year: number; weeks: number; cells: ActivityCell[]; monthLabels: MonthLabel[]; stats: ActivityStats }`
  - `countByDay(moments: { date: Date }[]): DayCount[]`
  - `getYears(moments: { date: Date }[]): number[]`
  - `buildYearData(dayCounts: DayCount[], year: number): YearData`
  - `serializeYearMaps(dayCounts: DayCount[], years: number[]): Record<string, Record<string, number>>`
  - `deserializeYearMap(year: number, yearMap: Record<string, number>): DayCount[]`
  - `formatTip(date: Date, count: number): string`
  - `formatCaption(year: number, stats: ActivityStats, currentYear: number): string`
  - `renderGrid(data: YearData, todayStr?: string): string`
  - `renderSrList(data: YearData): string`

**设计说明（实现前必读）**
- 该模块必须**同构**：Astro frontmatter（Node 侧）与组件内联 `<script>`（浏览器侧）都
  会 `import` 它。因此只能包含纯函数与类型，**禁止**导入 `node:*`、`astro:*` 或
  `astro:content`。
- `renderGrid`/`renderSrList` 返回 HTML 字符串：服务端用 `set:html` 注入、客户端用
  `innerHTML` 注入，两侧共用同一份代码，避免网格逻辑漂移。
- 网格布局：单一 CSS 网格，列 1 = 星期栏（gutter），列 2..weeks+1 = 各周；行 1 =
  月份标签，行 2..8 = 周日..周六。单元格位置由内联 `grid-row`/`grid-column` 指定。
- 年份网格范围：从「1 月 1 日所在周的周日（含 12 月提前几天）」到「12 月 31 日所在
  周的周六（含次年 1 月几天）」，列数即 `weeks`（通常 52–53）。

- [ ] **Step 1: 编写模块**

创建 `src/lib/activity-graph.ts`，内容如下（完整实现，非占位）：

```ts
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
    if (d.date.getFullYear() === year) counts.set(d.date.toDateString(), d.count)
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
    const key = `${d.date.getMonth() + 1}-${d.date.getDate()}`
    out[String(d.date.getFullYear())][key] = d.count
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
```

- [ ] **Step 2: 冒烟测试（纯逻辑验证）**

仓库无测试框架，用 Node 的 TS 剥离特性直接跑纯逻辑。若本机 Node 不支持
`--experimental-strip-types`，跳过本步，靠 Step 3 的构建 + 页面检查兜底。

Run:
```bash
node --experimental-strip-types --input-type=module -e "
import { buildYearData, countByDay, deserializeYearMap, getYears, renderGrid, serializeYearMaps } from './src/lib/activity-graph.ts'
const days = [
  { date: new Date(2026, 6, 30, 10) },
  { date: new Date(2026, 6, 30, 11) },
  { date: new Date(2026, 6, 30, 12) },
  { date: new Date(2026, 6, 29, 9) },
  { date: new Date(2025, 11, 31, 9) },
]
const counts = countByDay(days)
console.log('years:', JSON.stringify(getYears(days)))
console.log('dayCounts:', counts.length)
const data = buildYearData(counts, 2026)
console.log('weeks:', data.weeks, 'cells:', data.cells.length, 'total:', data.stats.total, 'activeDays:', data.stats.activeDays)
console.log('level of 7-30 cell:', data.cells.find((c) => c.date.getMonth() === 6 && c.date.getDate() === 30)?.level)
const maps = serializeYearMaps(counts, getYears(days))
const rebuilt = buildYearData(deserializeYearMap(2026, maps['2026']), 2026)
console.log('roundtrip equal:', rebuilt.stats.total === data.stats.total)
console.log('grid html length:', renderGrid(data, new Date(2026, 6, 30).toDateString()).length)
"
```

Expected:
- `years: [2026,2025]`
- `dayCounts: 3`（测试含 2026-07-30、2026-07-29、2025-12-31 三个自然日）
- `weeks: 53`、`cells: 371`、`total: 4`、`activeDays: 2`
- `level of 7-30 cell: 3`（3 条 → level 3；≥4 才为 level 4）
- `roundtrip equal: true`
- `grid html length:` 大于 0

- [ ] **Step 3: 格式检查与提交**

Run: `npm run format:check`
Expected: PASS（无格式差异）

```bash
git add src/lib/activity-graph.ts
git commit -m "Add isomorphic activity graph logic module"
```

---

### Task 2: 组件 `src/components/ActivityGraph.astro`

**Files:**
- Create: `src/components/ActivityGraph.astro`

**Interfaces:**
- Consumes（来自 Task 1，精确签名）：
  - `countByDay(moments: { date: Date }[]): DayCount[]`
  - `getYears(moments: { date: Date }[]): number[]`
  - `buildYearData(dayCounts: DayCount[], year: number): YearData`
  - `serializeYearMaps(dayCounts: DayCount[], years: number[]): Record<string, Record<string, number>>`
  - `deserializeYearMap(year: number, yearMap: Record<string, number>): DayCount[]`
  - `formatCaption(year, stats, currentYear): string`
  - `renderGrid(data, todayStr?): string`
  - `renderSrList(data): string`
- Consumes（来自页面）：props `{ moments: CollectionEntry<"moments">[] }`
- Produces（供 Task 3）：默认导出 Astro 组件 `<ActivityGraph moments={moments} />`

**设计说明（实现前必读）**
- 组件 **不** 自行调用 `getMoments()`，数据由页面通过 prop 传入（页面已取过
  `allMoments`，避免重复查询）。
- 网格 HTML 由 `renderGrid`/`renderSrList` 生成并经 `set:html` 注入。Astro 的 scoped
  CSS 不会作用于 `set:html` 内容，因此**整个 `<style>` 块必须用 `is:global`**，类名统一
  以 `activity-` 前缀避免污染。
- 客户端脚本从 `@/lib/activity-graph` import 共享逻辑（Astro 会为内联 `<script>`
  打包，别名可用；该 lib 是同构纯模块，浏览器可安全加载）。
- 内嵌数据放在根元素 `data-years` 属性上（`JSON.stringify` 后由 Astro 自动做 HTML
  转义，客户端 `root.dataset.years` 读回再 `JSON.parse`）。
- 单元格不做 `tabindex`（避免 371 个 Tab 停靠点）；键盘/读屏用户的信息由 `sr-only`
  列表承载，工具提示仅 `:hover` 触发。

- [ ] **Step 1: 编写组件**

创建 `src/components/ActivityGraph.astro`，内容如下（完整实现，非占位）：

```astro
---
import type { CollectionEntry } from "astro:content"
import {
  buildYearData,
  countByDay,
  deserializeYearMap,
  formatCaption,
  getYears,
  renderGrid,
  renderSrList,
  serializeYearMaps,
} from "@/lib/activity-graph"

type Props = { moments: CollectionEntry<"moments">[] }

const { moments } = Astro.props

// 适配：lib 的纯函数接受 { date: Date }[]，此处将 CollectionEntry 映射为日期列表
const dates = moments.map((m) => ({ date: m.data.date }))
const currentYear = new Date().getFullYear()
const dayCounts = countByDay(dates)
const years = getYears(dates)
const yearMaps = serializeYearMaps(dayCounts, years)
const defaultData = buildYearData(dayCounts, currentYear)
const todayStr = new Date().toDateString()

const options = [currentYear, ...years.filter((y) => y !== currentYear)]
---

<figure
  class="activity-graph"
  data-activity-graph
  data-years={JSON.stringify({ years, maps: yearMaps, currentYear })}
>
  <figcaption class="activity-caption">
    <span data-caption>{formatCaption(currentYear, defaultData.stats, currentYear)}</span>
    <label class="activity-year-label">
      <span class="activity-sr-only">选择年份</span>
      <select data-year-select>
        {options.map((y) => (
          <option value={y} selected={y === currentYear}>
            {y === currentYear ? "今年" : y}
          </option>
        ))}
      </select>
    </label>
  </figcaption>
  <div class="activity-scroll">
    <div class="activity-grid" data-grid aria-hidden="true" style={`--weeks: ${defaultData.weeks}`} set:html={renderGrid(defaultData, todayStr)}></div>
  </div>
  <div class="activity-legend" aria-hidden="true">
    <span class="activity-legend-label">少</span>
    {[0, 1, 2, 3, 4].map((level) => (
      <span class="activity-legend-swatch" data-level={level}></span>
    ))}
    <span class="activity-legend-label">多</span>
  </div>
  <div class="activity-sr-only" data-sr-list set:html={renderSrList(defaultData)}></div>
</figure>

<script>
  import {
    buildYearData,
    deserializeYearMap,
    formatCaption,
    renderGrid,
    renderSrList,
    type YearData,
  } from "@/lib/activity-graph"

  ;(() => {
    const root = document.querySelector<HTMLElement>("[data-activity-graph]")
    if (!root) return
    const select = root.querySelector<HTMLSelectElement>("[data-year-select]")
    const grid = root.querySelector<HTMLElement>("[data-grid]")
    const caption = root.querySelector<HTMLElement>("[data-caption]")
    const srList = root.querySelector<HTMLElement>("[data-sr-list]")
    if (!select || !grid || !caption || !srList) return

    let payload: {
      years: number[]
      maps: Record<string, Record<string, number>>
      currentYear: number
    }
    try {
      payload = JSON.parse(root.dataset.years ?? "{}")
    } catch {
      return
    }

    select.addEventListener("change", () => {
      const year = Number(select.value)
      const map = payload.maps[String(year)] ?? {}
      const data: YearData = buildYearData(deserializeYearMap(year, map), year)
      grid.innerHTML = renderGrid(data, year === payload.currentYear ? new Date().toDateString() : undefined)
      grid.style.setProperty("--weeks", String(data.weeks))
      caption.textContent = formatCaption(year, data.stats, payload.currentYear)
      srList.innerHTML = renderSrList(data)
    })
  })()
</script>

<style is:global>
  .activity-graph {
    --activity-1: color-mix(in oklab, var(--accent) 30%, var(--background));
    --activity-2: color-mix(in oklab, var(--accent) 55%, var(--background));
    --activity-3: color-mix(in oklab, var(--accent) 80%, var(--background));
    --cell: 9px;
    --gap: 2px;
    margin-bottom: var(--space-l);
  }

  .activity-caption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    margin-bottom: var(--space-xs);
    font-size: var(--step--1);
    color: var(--muted-foreground);
  }

  .activity-year-label select {
    font-family: var(--font-sans);
    font-size: var(--step--1);
    color: var(--muted-foreground);
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-2xs);
    cursor: pointer;
  }

  .activity-scroll {
    overflow-x: auto;
  }

  .activity-grid {
    display: grid;
    grid-template-columns: 20px repeat(var(--weeks, 53), var(--cell));
    grid-template-rows: auto repeat(7, var(--cell));
    column-gap: var(--gap);
    row-gap: var(--gap);
    width: max-content;
  }

  .activity-month {
    align-self: start;
    justify-self: start;
    font-size: calc(var(--step--1) - 1px);
    color: var(--muted-foreground);
    line-height: 1.3;
    white-space: nowrap;
  }

  .activity-weekday {
    align-self: center;
    justify-self: end;
    padding-right: 4px;
    font-size: 10px;
    line-height: 1;
    color: var(--muted-foreground);
  }

  .activity-cell {
    position: relative;
    width: var(--cell);
    height: var(--cell);
    border-radius: 2px;
    background: var(--gray-4);
  }

  .activity-cell[data-level="1"] {
    background: var(--activity-1);
  }

  .activity-cell[data-level="2"] {
    background: var(--activity-2);
  }

  .activity-cell[data-level="3"] {
    background: var(--activity-3);
  }

  .activity-cell[data-level="4"] {
    background: var(--accent);
  }

  .activity-cell[data-today] {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }

  .activity-cell::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--radius-sm);
    background: var(--foreground);
    color: var(--background);
    font-size: calc(var(--step--1) - 1px);
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s;
  }

  .activity-cell:hover::after {
    opacity: 1;
  }

  .activity-legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
    font-size: calc(var(--step--1) - 1px);
    color: var(--muted-foreground);
  }

  .activity-legend-swatch {
    width: var(--cell);
    height: var(--cell);
    border-radius: 2px;
    background: var(--gray-4);
  }

  .activity-legend-swatch[data-level="1"] {
    background: var(--activity-1);
  }

  .activity-legend-swatch[data-level="2"] {
    background: var(--activity-2);
  }

  .activity-legend-swatch[data-level="3"] {
    background: var(--activity-3);
  }

  .activity-legend-swatch[data-level="4"] {
    background: var(--accent);
  }

  .activity-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: PASS（Astro 内容 schema 校验通过、无编译错误）

Run: `npm run format:check`
Expected: PASS

```bash
git add src/components/ActivityGraph.astro
git commit -m "Add activity graph component with year switch"
```

---

### Task 3: 接入 `/moments` 页面

**Files:**
- Modify: `src/pages/moments/index.astro`（import 区 + `<h1>` 与 `<MomentComposer />` 之间）

**Interfaces:**
- Consumes：Task 2 的 `<ActivityGraph moments={...} />` 组件；页面现有 `allMoments`
  变量（类型 `CollectionEntry<"moments">[]`，位于 frontmatter 第 9 行附近）

- [ ] **Step 1: 添加 import**

在 `src/pages/moments/index.astro` 的 import 区（`MomentComposer` import 之后）添加：

```astro
import ActivityGraph from "@/components/ActivityGraph.astro"
```

- [ ] **Step 2: 插入组件**

将 `<h1 class="timeline-title">动态</h1>` 与 `<MomentComposer />` 之间的位置改为：

```astro
    <h1 class="timeline-title">动态</h1>
    <ActivityGraph moments={allMoments} />
    <MomentComposer />
```

- [ ] **Step 3: 构建与手动验证**

Run: `npm run build`
Expected: PASS

Run: `npm run format:check`
Expected: PASS

启动 dev server（`npm run dev`，需非沙箱执行，Astro 遥测写用户目录），在浏览器手动
检查 `/moments`：

1. 活跃图出现在标题与发布器之间。
2. 默认显示「今年」；网格含月份标签、一/三/五星期标签、图例「少 → 多」。
3. 悬停有动态的格子出现「2026年7月30日 · 3 条动态」式提示。
4. 切换 `<select>` 到历史年份：网格、图注（「2025 · 共 N 条动态」）、`sr-only` 列表
   同步更新；「今天」描边只在今年出现。
5. 切换明暗主题：5 级色块随之适配。
6. 窄屏（<640px）：网格横向滚动而非溢出。
7. 键盘操作 `<select>`（Tab 聚焦 + 方向键）可切换年份。

```bash
git add src/pages/moments/index.astro
git commit -m "Add activity graph to moments page"
```

---

## Self-Review 记录

（由计划作者在写完本计划后逐项勾选，问题就地修复。）

- [x] Spec 覆盖：需求要点（公开/仅动态/悬停/自然年/下拉切换/accent 蓝）、静态模式
      约束、可访问性（select+label、aria-hidden、sr-only、JS 降级）、图注图例、
      今天描边、空年份、YAGNI（无点击筛选/无实时更新）——逐条对应到 Task 1–3。
- [x] 占位符扫描：本计划无 TBD/TODO/「适当处理」类占位；所有代码均为完整实现。
- [x] 类型一致性：`buildYearData`/`renderGrid`/`renderSrList`/`formatCaption` 等在
      Task 1 定义、Task 2 使用，签名逐一核对一致。
