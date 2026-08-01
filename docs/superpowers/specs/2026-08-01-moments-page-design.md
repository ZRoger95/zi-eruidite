# /moments 页面视觉优化设计

日期：2026-08-01
状态：已批准（2026-08-01，经视觉伴侣逐屏确认）

## 背景与目标

作者对当前 `/moments` 页面的评价是「没设计感，很粗糙，像个原型」。本次目标是**纯视觉精修**：
在不改变信息架构、数据模型与交互功能的前提下，将页面打磨出层次与精致感，风格对齐
**X/Twitter 式时间线**（卡片层次、时间戳靠左、简洁现代）。

## 范围

**覆盖**：

- 时间线列表（`src/pages/moments/index.astro` 的布局与样式）。
- 动态卡片 `src/components/MomentCard.astro`。
- 发布器 `src/components/MomentComposer.astro`（dev-only，但视觉上纳入本次打磨）。

**不覆盖**：

- 活跃图 `ActivityGraph.astro`（已有独立已批准设计，本次不动）。
- 详情页 `/moments/[id]`（`pages/moments/[...id].astro`）。
- 首页最新动态区块（`src/pages/index.astro`）：结构不动，但该区块复用 `MomentCard`，
  新卡片样式会自然生效，实现时需检查其呈现是否协调，必要时只调首页间距。

## 设计决策（已逐项确认）

### 整体布局：B · X 式卡片流

- **移除**现有左侧竖线（`.timeline-rail`）与圆点（`.timeline-dot`）。
- 每条动态为**独立卡片**，单列堆叠，卡片间距 `--space-2xs`（约 8–9px，与确认稿 mockup 的 10–11px 相当）。
- 日期分组标签保留（见 D1），卡片与卡片之间不再有连线/圆点。

### 卡片皮肤：B2 · 浅底卡片

- 底色：`color-mix(in oklab, var(--muted) 55%, transparent)`。
- **无硬边框**；圆角 `--radius-xl`（0.75rem = 12px，确认稿约 13px，采用 token 值）；内边距 `--space-xs`（约 12–14px）。
- hover：底色加深（`var(--muted)` 比例提升），并可让时间/标签细节变强调色（见交互）。
- 与首页 hero-card 同源（都是 `var(--muted)` 底），保持站点一致性。

### 日期与时间：D1 · 独立日期标签

- 日期分组标签**独立于卡片**：左对齐、`--step--1` 小字、`--muted-foreground` 色、
  `letter-spacing: 0.02em`，标签下方与卡片保持 `--space-2xs` 间距。
- 分组逻辑不变：今天 / 昨天 / 前天 / `Intl.DateTimeFormat("zh-CN")` 本地化日期。
- 卡片内顶部显示时间小字（`HH:mm`，`<time>` + `datetime`，`--muted-foreground`）。

### 标签：T3 · 边框徽章

- 每个标签一个**细边框小徽章**：`1px solid var(--border)`、圆角 `--radius-md`（0.375rem = 6px，确认稿约 7px，采用 token 值）、
  中性色文字（`--muted-foreground`）、内边距 2px 8px，标签间 `--space-2xs` 间距。
- hover / focus：边框与文字变 `--accent`。
- 保持真实 `<a href="/tags/...">` 链接，结构不变。

### 发布器：F2 · 白底边框卡

- 白底（`var(--background)`）+ `1px solid var(--border)` + `--radius-xl`。
- 与浅底卡片形成「可输入区」对比。
- 左侧小字提示 `⌘⏎ 发布`（`--muted-foreground`），右侧「发布」按钮：
  accent 填充圆角胶囊，禁用态 `opacity: 0.45`（现有逻辑，仅视觉微调）。
- 发布中/成功/失败状态文案逻辑不变。

### 交互细节

- **整卡可点击（X 式链接覆盖层）**：卡片内渲染一个绝对定位铺满整卡的
  `<a href="/moments/{id}" class="moment-card-link" aria-label="查看动态详情">`
  作为详情页入口；正文、外链卡片、标签等真实 `<a>` 以 `position: relative; z-index`
  叠在覆盖层之上，各自保持可点。避免嵌套链接，同时保持键盘可聚焦（覆盖层是真实锚点，
  配 `focus-visible` 焦点环）。
- hover 覆盖层（即 hover 卡片）时：时间小字 → `--accent`；徽章标签边框/文字 → `--accent`
  （用 `:has()` 关联）。
- 图片网格维持现状：单图通栏（圆角 `--radius-lg`）、2–3 图双列 `4:3 cover`、
  `4px` gap、非图片子元素通栏。
- 链接卡片维持现状结构（thumb + title + url），hover 边框 → `--accent`。
- 深色模式：全部基于 Radix 色板 + `light-dark()` token，自动适配，不写死颜色。

## 实现映射

### `src/pages/moments/index.astro`

- 删除 `.timeline-rail`、`.timeline-dot`、`.moment-link-wrapper` 的竖线/圆点结构；
  卡片流直接用日期分组容器 + `MomentCard`，卡片间距 `--space-2xs`。
- 日期标签样式改为 D1（左对齐小标签，移除当前 `padding-left: 52px` 的轨道对齐）。
- 保留分页（`pagination`）与空状态（`empty`），样式按新布局微调（移除 `padding-left`）。
- `is:global` 的 dot/时间 hover 联动规则移除，替换为卡片覆盖层 hover 规则。

### `src/components/MomentCard.astro`

- `.moment-card` 应用 B2 浅底卡（底色、圆角、内边距、`position: relative`）；正文/图片网格的
  `:global` 样式保留。
- 新增整卡链接覆盖层 `.moment-card-link`（见「交互细节」）；**移除**原 `.moment-time-link`
  时间戳链接，时间变为普通 `<time>` 文本。
- 新增可选 prop `link?: boolean`（默认 `true`）：为 `false` 时不渲染覆盖层（详情页用）。
- 时间小字置顶；hover 变强调色。
- `.moment-tags` 改为 T3 边框徽章（保留 `<a>`），标签渲染在覆盖层之上。
- 图片网格、链接卡片样式基本保留，统一圆角 token。

### 其他受影响页面

- 详情页 `src/pages/moments/[...id].astro`：`<MomentCard moment={moment} link={false} />`，
  避免卡片链接指向自身。
- 首页 `src/pages/index.astro`：移除 `.moment-home-link` 的 `<a>` 包裹（卡片自带覆盖层链接，
  否则嵌套链接）；`.moments-list` 间距按新皮肤微调。

### `src/components/MomentComposer.astro`

- `.compose-bar` 应用 F2 白底边框卡样式。
- 保留 autoGrow、快捷键、状态文案等全部现有逻辑；仅调整视觉与新增 `⌘⏎ 发布` 提示。

## 样式归属

- 时间线布局：`src/pages/moments/index.astro` 的 scoped `<style>`。
- 卡片：`MomentCard.astro` scoped `<style>`（`is:global` 部分维持现状）。
- 发布器：`MomentComposer.astro` scoped `<style>`。
- 全部使用现有设计 token（`--muted`、`--border`、`--accent`、`--muted-foreground`、
  `--radius-*`、`--space-*`、`--step-*`），不引入 CSS 框架，不新增 npm 依赖。

## 可访问性与边界

- 详情页入口是真实 `<a>`（覆盖层锚点），键盘可达；配 `aria-label` 与 `focus-visible` 焦点环。
- 正文内链、外链卡片、标签保持真实链接，位于覆盖层之上，鼠标/键盘均可独立访问。
- 时间/日期保持 `<time datetime>` 语义。
- 徽章标签中性色文字需与浅底卡背景满足 WCAG AA 对比度（≥ 4.5:1），实现时以
  `web-design-guidelines` 复核。
- 覆盖层为独立元素，不影响读屏对正文内容的朗读顺序。
- 不改变任何 frontmatter schema、路由、内容集合或 dev 发布逻辑。

## 测试与验证

- `npm run format:check` 与 `npm run build`。
- dev server 手动检查：`/moments` 桌面/窄屏、明暗主题、卡片 hover、日期分组、
  图片网格、链接卡片、分页、发布器（dev）、首页最新动态区块呈现。
- 用 `web-design-guidelines` 技能对改动的 UI 做一次合规复核。

## 不做的事（YAGNI）

- 不做动画库/框架引入；不做置顶/点赞/回复等新功能；不重做活跃图；
  不重做详情页视觉（仅向其传入 `link={false}` 防卡片自链）；不引入卡片级
  「展开/收起」等新交互；不重构 `MomentCard` 的 `:global` 正文样式逻辑。
