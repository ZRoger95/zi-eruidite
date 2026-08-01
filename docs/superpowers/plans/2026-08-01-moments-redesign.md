# /moments 页面视觉优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/moments` 时间线从「竖线+圆点」改为 X 式卡片流：B2 浅底卡、D1 独立日期标签、T3 边框徽章标签、F2 白底边框卡发布器、整卡链接覆盖层可点。

**Architecture:** 纯标记 + 原生 CSS 改造，不新增依赖。`MomentCard` 改为 B2 浅底卡并内置整卡链接覆盖层（X 式 `<a>` 覆盖层 + 内容 `z-index` 上叠，避免嵌套链接）；`/moments` 时间线移除竖线/圆点结构；发布器改 F2 皮肤；详情页传 `link={false}` 防自链；首页移除冗余包裹链接。

**Tech Stack:** Astro 7（静态输出）、原生 CSS（Utopia 令牌 + Radix Colors `light-dark()`）、零 JS 框架、零新 npm 依赖。

## Global Constraints

- **纯视觉精修**：不改任何 frontmatter schema、路由、内容集合、dev 发布逻辑；不新增交互逻辑。
- **设计令牌**：只用 `--muted`、`--border`、`--accent`、`--accent-foreground`、`--muted-foreground`、`--background`、`--foreground`、`--radius-*`、`--space-*`、`--step-*`；颜色派生用 `color-mix(in oklab, ...)`，明暗主题由 `light-dark()` 自动适配，禁止写死颜色。
- **Biome 格式**：2 空格缩进、80 字符行宽、双引号、无分号。
- **可访问性**：详情入口是真实 `<a>`（覆盖层锚点），配 `aria-label` 与 `focus-visible` 焦点环；正文内链、外链卡片、标签保持真实链接并位于覆盖层之上。
- **验证**：仓库无测试框架，任务验证用 `npm run format:check`、`npm run build`、dev server 手动检查（AGENTS.md 约定）。
- **范围外**：不动 `ActivityGraph`、不重做详情页视觉（仅传 `link={false}`）、不引入动画/展开收起等新交互、不修复既有静态模式 `?page=` 分页问题。

---

### Task 1: MomentCard 改造（B2 浅底卡 + 整卡链接覆盖层 + T3 标签 + link prop）

**Files:**
- Modify: `src/components/MomentCard.astro`（整体重写，见下方完整内容）

**Interfaces:**
- Produces（供 Task 2/4 使用，签名必须精确）：
  - 组件 props：`{ moment: CollectionEntry<"moments">; link?: boolean }`，`link` 默认 `true`。
  - 标记结构：`<article class="moment-card">` 内依次为
    `[可选] <a class="moment-card-link">`、`<time>`、`.moment-body`、`[可选] .moment-link`、`[可选] .moment-tags`。
  - **移除** `.moment-time-link`（时间不再是链接）。
  - hover 卡片（覆盖层 hover）时：`time` 与 `.moment-tags a` 变 `--accent`。

**设计说明（实现前必读）**
- 覆盖层模式：`<a class="moment-card-link">` 绝对定位铺满整卡（`inset: 0`，`border-radius: inherit`，
  `z-index: 1`）作为详情页入口；**只有交互元素**（`.moment-body` 内的 `:global(a)`、
  `.moment-link`、`.moment-tags a`）设 `position: relative; z-index: 2` 叠在覆盖层之上，
  各自可点；`time`、正文文本、图片保持在覆盖层之下 → 点击穿透到覆盖层，实现「整卡可点」
  且不产生嵌套链接。`.moment-body` 本身**不得**设 `position`/`z-index`。
- 卡片无覆盖层时（详情页 `link={false}`），`time`/正文等仍为普通文档流，样式不受影响。
- `:global` 正文与图片网格样式**原样保留**（`p`、`a`、`code`、图片网格、`data-images` 逻辑）。

- [ ] **Step 1: 重写 `src/components/MomentCard.astro`**

完整文件内容（替换现有文件全部内容）：

```astro
---
import { Image } from "astro:assets"
import { render, type CollectionEntry } from "astro:content"

type Props = { moment: CollectionEntry<"moments">; link?: boolean }

const { moment, link = true } = Astro.props
const { Content } = await render(moment)

// Count images in raw body to drive grid layout
const imageCount = (moment.body?.match(/!\[.*?\]\(.*?\)/g) || []).length

const dateStr = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Shanghai",
}).format(moment.data.date)
---

<article class="moment-card">
  {link && (
    <a
      href={`/moments/${moment.id}`}
      class="moment-card-link"
      aria-label={`查看动态详情 · ${dateStr}`}
    ></a>
  )}
  <time datetime={moment.data.date.toISOString()}>{dateStr}</time>
  <div
    class="moment-body"
    data-images={imageCount > 0 ? imageCount : undefined}
  >
    <Content />
  </div>
  {moment.data.link && (
    <a
      href={moment.data.link.url}
      class="moment-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      {moment.data.link.thumbnail && (
        <div class="moment-link-thumb">
          <Image
            src={moment.data.link.thumbnail}
            alt=""
            width={160}
            height={128}
          />
        </div>
      )}
      <div class="moment-link-body">
        <span class="moment-link-title"
          >{moment.data.link.title || moment.data.link.url}</span
        >
        <span class="moment-link-url">{moment.data.link.url}</span>
      </div>
    </a>
  )}
  {moment.data.tags && moment.data.tags.length > 0 && (
    <div class="moment-tags">
      {moment.data.tags.map((tag) => (
        <a href={`/tags/${tag}`}>#{tag}</a>
      ))}
    </div>
  )}
</article>

<style>
  .moment-card {
    position: relative;
    background: color-mix(in oklab, var(--muted) 55%, transparent);
    border-radius: var(--radius-xl);
    padding: var(--space-xs);
    transition: background 0.15s;
  }

  .moment-card:has(.moment-card-link:hover) {
    background: color-mix(in oklab, var(--muted) 75%, transparent);
  }

  .moment-card-link {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    z-index: 1;
  }

  .moment-card-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* 关键：只有「交互元素」叠在覆盖层之上（正文内链/外链卡/标签可独立点击）；
     正文文本、时间、图片保持在覆盖层之下 → 点击穿透到覆盖层，实现整卡可点。
     注意：.moment-body 本身不设 z-index，否则会挡住覆盖层。 */
  .moment-body :global(a),
  .moment-card > .moment-link,
  .moment-card > .moment-tags a {
    position: relative;
    z-index: 2;
  }

  time {
    display: block;
    font-size: var(--step--1);
    color: var(--muted-foreground);
    margin-bottom: var(--space-3xs);
    transition: color 0.15s;
  }

  .moment-card:has(.moment-card-link:hover) time {
    color: var(--accent);
  }

  .moment-body {
    font-size: var(--step-0);
    line-height: 1.6;

    :global(p) {
      margin-bottom: var(--space-xs);
    }

    :global(p:last-child) {
      margin-bottom: 0;
    }

    :global(a) {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-color: transparent;
      text-underline-offset: 2px;
      transition: text-decoration-color 0.15s;
    }

    :global(a:hover) {
      text-decoration-color: var(--accent);
    }

    :global(code) {
      font-family: var(--font-mono);
      font-size: 0.9em;
      padding: 0.1em 0.3em;
      border-radius: var(--radius-sm);
      background: color-mix(in oklab, var(--muted) 60%, transparent);
    }

    /* ─── Image handling ─── */

    /* Image-only paragraphs: strip margin so grid gap controls spacing */
    :global(p:has(> img:only-child)) {
      margin-bottom: 0;
      line-height: 0;
    }

    :global(img) {
      max-width: 100%;
      height: auto;
      border-radius: var(--radius-lg);
    }

    /* Single image: full-width with top margin */
    &[data-images="1"] {
      :global(p:has(> img:only-child)) {
        margin-top: var(--space-s);

        :global(img) {
          width: 100%;
        }
      }
    }

    /* Multiple images: CSS grid on the body */
    &[data-images="2"],
    &[data-images="3"] {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      margin-top: var(--space-s);

      :global(p:has(> img:only-child)) {
        :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          aspect-ratio: 4 / 3;
        }
      }

      /* Non-image children span full width */
      :global(p:not(:has(> img:only-child))),
      :global(ul),
      :global(ol),
      :global(blockquote) {
        grid-column: 1 / -1;
        margin-bottom: var(--space-xs);
      }
    }
  }

  .moment-link {
    display: flex;
    gap: var(--space-s);
    margin-top: var(--space-s);
    padding: var(--space-s);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s;
  }

  .moment-link:hover {
    border-color: var(--accent);
  }

  .moment-link-thumb {
    width: 80px;
    height: 64px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    flex-shrink: 0;

    :global(img) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .moment-link-body {
    flex: 1;
    min-width: 0;
  }

  .moment-link-title {
    font-size: var(--step--1);
    font-weight: 510;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .moment-link-url {
    display: block;
    font-size: calc(var(--step--1) - 1px);
    color: var(--muted-foreground);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .moment-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    margin-top: var(--space-s);

    a {
      font-size: var(--step--1);
      color: var(--muted-foreground);
      text-decoration: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 2px 8px;
      transition:
        border-color 0.15s,
        color 0.15s;
    }

    a:hover {
      color: var(--accent);
      border-color: var(--accent);
    }
  }

  .moment-card:has(.moment-card-link:hover) .moment-tags a {
    color: var(--accent);
    border-color: var(--accent);
  }
</style>
```

- [ ] **Step 2: 验证**

Run: `npm run format:check && npm run build`
Expected: 两者均通过；若 Biome 报格式差异，先跑 `npm run format` 再重跑检查。

- [ ] **Step 3: 提交**

```bash
git add src/components/MomentCard.astro
git commit -m "feat: restyle moment card with B2 skin and overlay link"
```

---

### Task 2: `/moments` 时间线布局改为卡片流

**Files:**
- Modify: `src/pages/moments/index.astro`（整体重写，见下方完整内容）

**Interfaces:**
- Consumes（来自 Task 1）：`<MomentCard moment={moment} />`（`link` 走默认 `true`）。
- Produces：`.timeline` 容器内直接渲染日期分组 + `MomentCard`，不再有
  `.timeline-rail` / `.timeline-dot` / `.moment-link-wrapper`。

**设计说明（实现前必读）**
- 移除竖线（`.timeline-rail`）、圆点（`.timeline-dot`）与 `is:global` 的 dot/时间 hover 联动规则。
- 卡片间距由 `.date-group` 的 `display: flex; flex-direction: column; gap: var(--space-2xs)` 承担，
  日期标签与首卡间距同为 `--space-2xs`（对应 D1 确认稿）。
- 日期标签 D1：左对齐、`--step--1`、`--muted-foreground`、`letter-spacing: 0.02em`。
- 分页与空状态移除 `padding-left: 52px`。

- [ ] **Step 1: 重写 `src/pages/moments/index.astro`**

完整文件内容（替换现有文件全部内容）：

```astro
---
import ActivityGraph from "@/components/ActivityGraph.astro"
import MomentCard from "@/components/MomentCard.astro"
import MomentComposer from "@/components/MomentComposer.astro"
import MetaPage from "@/components/MetaPage.astro"
import Layout from "@/layouts/Layout.astro"
import { getMoments } from "@/lib/content"
import type { CollectionEntry } from "astro:content"

const PAGE_SIZE = 20
const allMoments = await getMoments()

// Get page number from URL query param (?page=2) or first page
const currentPage = Number(Astro.url.searchParams.get("page") || 1)
const totalPages = Math.max(1, Math.ceil(allMoments.length / PAGE_SIZE))
const start = (currentPage - 1) * PAGE_SIZE
const moments = allMoments.slice(start, start + PAGE_SIZE)

// Group moments by date for separators
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
})

function groupByDate(
  items: CollectionEntry<"moments">[],
): { label: string; moments: CollectionEntry<"moments">[] }[] {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dayBefore = new Date(today)
  dayBefore.setDate(dayBefore.getDate() - 2)

  const todayStr = today.toDateString()
  const yesterdayStr = yesterday.toDateString()
  const dayBeforeStr = dayBefore.toDateString()

  const groups = new Map<string, CollectionEntry<"moments">[]>()
  for (const m of items) {
    const key = m.data.date.toDateString()
    const group = groups.get(key)
    if (group) group.push(m)
    else groups.set(key, [m])
  }

  return [...groups].map(([key, g]) => {
    let label: string
    if (key === todayStr) label = "今天"
    else if (key === yesterdayStr) label = "昨天"
    else if (key === dayBeforeStr) label = "前天"
    else label = dateFormatter.format(g[0].data.date)
    return { label, moments: g }
  })
}

const grouped = groupByDate(moments)

function pageUrl(p: number): string {
  return p === 1 ? "/moments" : `/moments?page=${p}`
}
---

<Layout>
  <MetaPage slot="head" title="动态" description="短动态、闪念与随手记录。" />
  <div class="timeline-page">
    <h1 class="timeline-title">动态</h1>
    <ActivityGraph moments={allMoments} />
    <MomentComposer />
    <div class="timeline">
      {grouped.map(({ label, moments: groupMoments }) => (
        <div class="date-group">
          <div class="date-separator">
            <span class="date-label">{label}</span>
          </div>
          {groupMoments.map((moment) => (
            <MomentCard moment={moment} />
          ))}
        </div>
      ))}
      {moments.length === 0 && (
        <p class="empty">还没有动态。</p>
      )}
    </div>
    {totalPages > 1 && (
      <nav class="pagination">
        {currentPage > 1 && (
          <a href={pageUrl(currentPage - 1)}>← 上一页</a>
        )}
        <span>{currentPage} / {totalPages}</span>
        {currentPage < totalPages && (
          <a href={pageUrl(currentPage + 1)}>下一页 →</a>
        )}
      </nav>
    )}
  </div>
</Layout>

<style>
  .timeline-page {
    max-width: 640px;
  }

  .timeline-title {
    font-size: var(--step-3);
    font-weight: 510;
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin-bottom: var(--space-xl);
  }

  .date-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-bottom: var(--space-m);
  }

  .date-group:last-child {
    margin-bottom: 0;
  }

  .date-label {
    font-size: var(--step--1);
    font-weight: 450;
    letter-spacing: 0.02em;
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .empty {
    color: var(--muted-foreground);
    font-size: var(--step--1);
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-m);
    margin-top: var(--space-xl);
    font-size: var(--step--1);

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }
  }
</style>
```

- [ ] **Step 2: 验证**

Run: `npm run format:check && npm run build`
Expected: 均通过；`/moments` dev 页面无竖线/圆点，卡片流、日期标签、分页正常。

- [ ] **Step 3: 提交**

```bash
git add src/pages/moments/index.astro
git commit -m "feat: switch moments timeline to card flow"
```

---

### Task 3: 发布器改 F2 白底边框卡

**Files:**
- Modify: `src/components/MomentComposer.astro`（仅标记 + `<style>`，脚本逻辑不动）

**Interfaces:**
- Produces：`.compose-actions` 内新增 `.compose-hint`（`⌘⏎ 发布`）；`.compose-bar` 皮肤为 F2。

**设计说明（实现前必读）**
- 只改标记与样式：autoGrow、快捷键、状态文案、发布逻辑**一律不动**。
- F2：白底 `var(--background)` + `1px solid var(--border)` + `--radius-xl`，内边距
  由 `var(--space-m)` 收紧为 `var(--space-xs)`。
- 「发布」按钮缩小为 `padding: var(--space-3xs) var(--space-s)`，其余（accent 胶囊、
  hover `opacity: 0.9`、disabled `opacity: 0.4`）保持现状。

- [ ] **Step 1: 修改标记**（在 `<form class="compose-bar">` 内）

将：

```astro
  <div class="compose-actions">
    <button class="compose-submit" type="submit" disabled>发布</button>
  </div>
```

改为：

```astro
  <div class="compose-actions">
    <span class="compose-hint">⌘⏎ 发布</span>
    <button class="compose-submit" type="submit" disabled>发布</button>
  </div>
```

- [ ] **Step 2: 修改样式**（`<style>` 内）

将 `.compose-bar` 规则：

```css
  .compose-bar {
    display: flex;
    align-items: flex-start;
    gap: var(--space-m);
    padding: var(--space-m);
    margin-bottom: var(--space-l);
    background: var(--muted);
    border-radius: var(--radius-xl);
  }
```

改为：

```css
  .compose-bar {
    display: flex;
    align-items: flex-start;
    gap: var(--space-m);
    padding: var(--space-xs);
    margin-bottom: var(--space-l);
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
  }
```

将 `.compose-actions` 规则：

```css
  .compose-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
```

改为：

```css
  .compose-actions {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    flex-shrink: 0;
  }

  .compose-hint {
    font-size: var(--step--1);
    color: var(--muted-foreground);
    white-space: nowrap;
  }
```

将 `.compose-submit` 的内边距：

```css
    padding: var(--space-xs) var(--space-m);
```

改为：

```css
    padding: var(--space-3xs) var(--space-s);
```

（其余 `.compose-submit` 规则、`.compose-status`、`@media (width < 480px)` 不变。）

- [ ] **Step 3: 验证**

Run: `npm run format:check && npm run build`
Expected: 均通过；dev 下发布框为白底边框卡、含 `⌘⏎ 发布` 提示，发布流程可用。

- [ ] **Step 4: 提交**

```bash
git add src/components/MomentComposer.astro
git commit -m "feat: restyle moment composer as bordered card"
```

---

### Task 4: 详情页与首页适配（MomentCard 其他消费方）

**Files:**
- Modify: `src/pages/moments/[...id].astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes（来自 Task 1）：`MomentCard` 的 `link?: boolean` prop。

**设计说明（实现前必读）**
- 详情页传 `link={false}`：卡片不渲染覆盖层，避免链接指向自身。
- 首页移除 `.moment-home-link` 的 `<a>` 包裹（卡片自带覆盖层链接，否则嵌套链接）；
  列表间距由 `--space-m` 收紧为 `--space-2xs`（与时间线一致）。

- [ ] **Step 1: 详情页传 `link={false}`**

将 `src/pages/moments/[...id].astro` 中：

```astro
    <MomentCard moment={moment} />
```

改为：

```astro
    <MomentCard moment={moment} link={false} />
```

- [ ] **Step 2: 首页移除包裹链接**

将 `src/pages/index.astro` 中：

```astro
      <div class="moments-list">
        {moments.map((moment) => (
          <a
            href={`/moments/${moment.id}`}
            class="moment-home-link"
          >
            <MomentCard moment={moment} />
          </a>
        ))}
      </div>
```

改为：

```astro
      <div class="moments-list">
        {moments.map((moment) => (
          <MomentCard moment={moment} />
        ))}
      </div>
```

将 `src/pages/index.astro` 的 `<style>` 中：

```css
  .moments-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  .moment-home-link {
    text-decoration: none;
    color: inherit;
  }
```

改为：

```css
  .moments-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
```

- [ ] **Step 3: 验证**

Run: `npm run format:check && npm run build`
Expected: 均通过；首页最新动态为浅底卡、点击进入详情；详情页卡片不产生自链。

- [ ] **Step 4: 提交**

```bash
git add src/pages/moments/[...id].astro src/pages/index.astro
git commit -m "feat: adapt detail and home pages to card overlay link"
```

---

### Task 5: 全量验证 + UI 合规复核

**Files:**
- 无（验证任务）

**设计说明（实现前必读）**
- 启动 dev server（需非沙箱执行，Astro 遥测写 `~/Library/Preferences`；`ASTRO_TELEMETRY_DISABLED=1` 可禁用）。
- 按清单逐项检查；发现问题按「最小编改」修复并重新提交。

- [ ] **Step 1: 全量构建与格式**

Run: `npm run format:check && npm run build`
Expected: 均通过。

- [ ] **Step 2: dev 手动检查清单**

Run: `npm run dev`，浏览器打开 `http://localhost:4321/moments`（端口以实际为准），逐项核对：

- `/moments`：无竖线/圆点；日期分组（今天/昨天/前天/本地化日期）标签正确；卡片为浅底圆角卡。
- 卡片 hover：底色加深、时间变 `--accent`、标签边框/文字变 `--accent`；点击卡片空白进入详情页。
- 卡片内链接：正文行内链接、外链卡片、标签各自可点，不被覆盖层拦截。
- 键盘：Tab 聚焦卡片时出现 `focus-visible` 焦点环，Enter 进入详情。
- 图片网格：单图通栏、2–3 图双列 `4:3 cover`。
- 深色模式：卡片、发布器、标签颜色随主题自动切换，无写死颜色。
- 窄屏（<480px）：发布器换行、卡片流无横向滚动。
- 分页：`?page=2` 分页导航可用。
- 发布器（dev）：白底边框卡、`⌘⏎ 发布` 提示、发布/成功/失败流程正常。
- 首页 `/`：最新动态为浅底卡，点击进详情，无嵌套链接。
- 详情页 `/moments/<id>`：卡片无自链覆盖层，返回链接正常。

- [ ] **Step 3: UI 合规复核**

用 `web-design-guidelines` 技能审阅改动的 UI（重点：标签徽章与浅底卡的对比度 ≥ 4.5:1、
覆盖层 `aria-label` 与焦点可见性、触控目标尺寸）。

- [ ] **Step 4: 收尾提交**

如有修复，提交：

```bash
git add -A
git commit -m "fix: polish moments redesign after QA"
```

Expected: 工作区干净（`git status` 无未提交改动）。
