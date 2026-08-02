# 动态活跃图（Moment Activity Graph）设计

日期：2026-08-01
状态：已批准（含 2026-08-01 年度切换修订）

## 背景与目标

在 `/moments` 页面的 `<MomentComposer />` 上方添加一个类似 GitHub 贡献图的组件，
直观展示作者的动态发布分布。这是一个**公开功能**（生产站点可见），与 dev-only 的
发布器定位不同。

## 需求要点（已与用户确认）

- **定位**：公开功能，生产构建可见。
- **数据口径**：仅统计动态（moments），按天计数。
- **交互程度**：静态渲染 + 悬停提示（零 JS 首屏），外加**年份下拉切换**（原生
  `<select>` + 少量客户端 JS 渐进增强）。
- **时间范围**：**自然年视图**——默认显示当前年份（「今年」），可切换历史年份。
- **配色**：站点 accent 蓝色系 5 级强度（0–4），通过 `light-dark()` 自动适配明暗主题。

## 静态模式约束（重要）

站点为 Astro 默认静态输出，`Astro.url.searchParams` 在构建时为空，查询参数方案在生产
不生效（既有时间线分页 `?page=` 同样受影响，属既有问题，不在本次范围）。因此年份
切换必须走**客户端 JS** 或独立静态页；本设计采用客户端 JS 方案（见「架构与数据流」）。

## 架构与数据流

- 新增组件 `src/components/ActivityGraph.astro`（公开，非 dev-only）。
- 新增纯逻辑模块 `src/lib/activity-graph.ts`（**同构**：服务端构建与客户端切换共用，
  仅含纯函数与类型，不依赖服务端 API）：
  - `buildYearData(moments, year)`：输入时刻列表 + 年份，输出
    `{ cells, monthLabels, stats }`。`cells` 为该自然年 7 行 × 52–53 列的单元格
    （含 `date`、`count`、`level` 0–4）；`monthLabels` 为月份标签（1月…12月）；
    `stats` 为年总条数、活跃天数、最活跃日期。
  - `getYears(moments)`：有动态的年份列表（降序）。
  - `serializeYearMaps(moments)`：输出紧凑 `{ year: { "M-D": count } }`，内嵌页面，
    客户端据此重建任意年份网格。
- **日期归属**：按 `date.toDateString()` 分组，与时间线使用相同键，保证活跃图与下方
  时间线的「某天有几条」完全一致。
- **渲染策略（渐进增强）**：
  1. 服务端渲染默认年份（当前自然年）的完整网格——**零 JS 首屏**。
  2. 页面内嵌年份列表 + 各年 `M-D → count` 紧凑 JSON（`data-years`）。
  3. 内联 `<script>`（与 `MomentComposer` 模式一致）为 `<select data-year-select>`
     绑定 change 事件：选择年份后，用共享的 `buildYearData` 客户端重建网格 HTML，
     替换容器内容，并同步更新图注与 `sr-only` 列表。
     （客户端侧由内嵌的 `M-D → count` 映射重建该年每日的 `{ date, count }` 列表后
     再调用 `buildYearData`；映射为空的年份渲染全空格子。）
- **放置**：`src/pages/moments/index.astro` 中 `<h1>` 与 `<MomentComposer />` 之间
  插入 `<ActivityGraph />`。生产构建时 composer 消失，图自然落在时间线上方。
- **依赖**：仅 `getMoments()`（已存在），零新 npm 依赖。

## 渲染与视觉

### 布局

- **单一 CSS 网格**：
  `grid-template-columns: [gutter] 20px repeat(var(--weeks), minmax(0, 1fr))`、
  `grid-template-rows: auto repeat(7, auto)`。
- 单元格随容器宽度**流体缩放**（1fr 列 + `aspect-ratio: 1`）：桌面约 9px，窄屏自动
  缩小，无横向滚动条；`minmax(0, 1fr)` 防止月份标签把列宽撑大。
- 外层 `.activity-scroll` 使用 `overflow-x: clip`（非 auto），仅裁剪月份标签越界而不
  产生滚动条。
- 月份标签、星期标签（一、三、五）、单元格全部作为网格项，位置由构建/渲染期计算的
  内联 `style="grid-row / grid-column"` 指定，避免对齐漂移。
- 起始列中上一年 12 月的前导格**不输出月份标签**，避免与紧邻的「1月」标签重叠
  （与 GitHub 行为一致）。
- **年份下拉**：位于图注（`figcaption`）右侧的原生 `<select>`，选项「今年」「2025」…
  （仅列出有数据的年份 + 当前年份）。

### 配色（5 级 accent 蓝）

- level 0（无活动）：`var(--gray-4)`
- level 1–3：
  `color-mix(in oklab, var(--accent) 30% / 55% / 80%, var(--background))`
- level 4：`var(--accent)`
- 计数阈值：1→1，2→2，3→3，≥4→4（简单可预测）。
- 「今年」网格中的今天格子以 `--accent` 描边标注（仅当前年份存在「今天」）。

### 悬停提示

- 每个格子带 `data-tip="2026年7月30日 · 3 条动态"`（完整日期含年份，避免跨年份歧义）。
- 提示由内联脚本**事件委托**（`mouseover`/`mouseleave` on grid）显示：单一
  `.activity-tooltip` 元素绝对定位于图内（不在被裁剪的 `.activity-scroll` 内），
  水平夹紧在图表边界内，边缘列提示完整可见、不产生页面溢出或滚动条。
- 仅鼠标悬停触发（格子不设 `tabindex`，避免 371 个 Tab 停靠点；键盘与读屏用户信息由
  `sr-only` 活跃日列表承载）；年份切换时隐藏。

### 图注与图例

- `<figcaption>`：默认「今年 · 共 N 条动态」；切换后由 JS 更新为「2025 · 共 N 条
  动态」；空年份显示「2025 · 暂无动态」。
- 底部图例「少 → 多」5 个色块（所有年份一致，不随切换变化）。

### 样式归属

- 组件 `<style>` 使用 `is:global`（网格 HTML 经 `set:html` 注入，Astro scoped CSS 无法
  匹配注入内容），类名统一 `activity-` 前缀避免污染；与 `MomentCard`、`MomentComposer`
  的 scoped 样式模式不同，属本组件的既定约束。

## 可访问性与边界

- 年份切换使用真实 `<select>`（带 `<label>`），键盘可用。
- 网格容器 `aria-hidden="true"`；另附 `sr-only` 活跃日列表（随切换同步更新），键盘
  与读屏用户不丢失信息。
- 无数据/空年份：正常渲染全空格子 + 「暂无动态」图注。
- **JS 禁用时**：默认年份图完整可用，下拉不可切换（可接受的渐进降级）。
- 不引入点击筛选（点击格子不筛时间线），不修改 composer 与时间线逻辑。

## 测试与验证

- `npm run format:check` 与 `npm run build`。
- dev server 中手动检查：`/moments` 页面渲染、年份切换（网格/图注/`sr-only` 列表
  同步）、明暗主题切换、窄屏横向滚动、悬停提示、空年份、JS 禁用降级。

## 不做的事（YAGNI）

- 不做点击筛选、不做实时更新（发布后仍需刷新/全量重载）、不做多数据源
  （博客+动态合并）。
- 不在首页（`src/pages/index.astro`）重复放置该组件。
- 不修复既有 `?page=` 分页在静态模式失效的问题（超出本次范围）。
