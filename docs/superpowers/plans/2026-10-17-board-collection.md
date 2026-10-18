# 收藏板 `/board` 可拖拽拼贴板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/board` 页面，把作者策展的邮票与徽章渲染成一块可自由拖拽重新摆放的拼贴收藏板。

**Architecture:** 新建内容集合 `board`（每枚物件一个 `.md`，含 `.en.md` 孪生）；`getBoardViews(locale)` 做中英配对取数；`Board.astro` 组件用自主定制元素 `stamp-board`/`board-piece` 先 SSR 铺好默认坐标（无 JS 即成图），一段 `<script>` 接 Pointer Events 做渐进增强拖拽（只改内存 CSS 变量、不持久化）。窄屏 `< 64rem` 回退只读网格。

**Tech Stack:** Astro（内容集合 + `image()` + `glob` loader）、原生 Web Components（`customElements.define` + Pointer Events）、原生 CSS（Utopia `clamp` + Radix `light-dark()` 令牌，无框架）、Biome、bash + grep 对 `dist/` 的回归脚本。

**Spec:** `docs/superpowers/specs/2026-10-17-board-collection-design.md`

## Global Constraints

- 包管理器/命令用 **npm**（本仓库以 npm 构建，见经验条目）：`npm run format:check`、`npm run build`。
- Biome：2 空格缩进、80 列、JS/TS 双引号、能省则省分号；CSS 不格式化，改样式对齐相邻文件。
- 布局/交互组件遵循「SSR 静态内容 + 客户端激活」；自定义元素一律**带连字符**；**不引入任何 UI/CSS 框架**、不改全站骨架。
- 界面词唯一来源 `src/lib/i18n.ts`：新增须 zh/en 双份。
- 颜色一律 `light-dark()` 令牌，亮暗两版；尺寸走 Utopia `clamp()`/`--space-*`。
- 每个 Task 提交前：`npm run format:check` 与 `npm run build` 必须绿。
- 回归脚本遵循 **backup/restore `.env`** 模式 + 受控 `SITE_URL=https://example.com`（照抄 `scripts/tests/i18n-check.sh` 的 `ENV_KEEP`/`trap` 段）。

## Review Focus

（spec 隐含、但没有哪个 Task 的自动化断言全覆盖、最可能咬使用者的失效模式；每条在对应 Task 里补一条钉住它的断言或人工核验。）

- **无 JS 也成图**：JS 关掉时，`dist` 里每枚 `board-piece` 必须已带默认 `--x/--y/--rot`（SSR 落进 HTML），板不是空白。→ Task 3 断言 + Task 4 人工核验。
- **点 vs 拖不可吞链接**：带 `href` 的徽章指针「按下即拖」也不能吃掉点击——位移超阈值才判拖，否则放行链接。→ Task 4 人工核验。
- **拖不出界、不撑横滚**：`--x/--y` 夹紧后物件不得越过板边，`stamp-board` 不得引发横向滚动条。→ Task 4 人工核验。
- **窄屏可读**：`< 64rem` 忽略绝对坐标、排成不重叠网格、拖拽停用。→ Task 3 断言（CSS 产出）+ 人工核验截图。
- **未翻译不露馅**：`/en/board` 上无 `.en` 孪生的物件显示中文原标题（不是 `undefined`/空），且中文板不得泄漏 `.en` id。→ Task 5 断言。

---

## Task 1: 内容集合 `board` 与种子内容

**Files:**
- Modify: `src/content.config.ts`（在 `collections` 里加 `board`）
- Create: `src/content/board/astro.md`（badge 种子）
- Create: `src/content/board/astronaut-stamp.md`（stamp 种子）
- Create: `src/content/board/astro.en.md`（badge 英文孪生）
- Create: `src/content/board/img/`（放两张占位图，供 `image()` 解析）
- Modify: `src/content.config.ts` 顶部 import（复用 `generateBlogEntryId`）

**Interfaces:**
- Consumes: `generateBlogEntryId`（已在 `src/lib/i18n.ts` 导出，blog loader 用它保 `.en` 可寻址）。
- Produces: 内容集合名 `"board"`；`CollectionEntry<"board">["data"]` 字段形状（供 Task 3 的 `getBoardViews` 消费）：

```ts
// data 形状（image 为 astro:content 的 image() 产物）
kind: "stamp" | "badge"
title: string
image: ImageLike        // 必填
alt: string
x: number               // 0–1
y: number               // 0–1
rotate?: number         // deg，默认 0
z?: number
denomination?: string
postmark?: string
href?: URL | string
draft?: boolean
```

- [ ] **Step 1: 写 `board` 集合 schema**

在 `src/content.config.ts` 定义（`glob` + `schema`，照 blog 结构）。`generateId` 用 `generateBlogEntryId` 以保留 `.en` 配对键。`kind` 用 `z.enum(["stamp", "badge"])`，`x`/`y` 用 `z.number().min(0).max(1)`，`rotate`/`z` 可选数字，`href` 用 `z.string().url().optional()`（宽松：stamp 上误填 `denomination` 不报错）。加入 `export const collections = { ... , board }`。

- [ ] **Step 2: 放种子图与 `.md`**

从 `public/static/` 复制两张现成图（如 `preview-1.png`、`logo.svg`）进 `src/content/board/img/`，供 `image()` 相对解析。写三个文件：
- `astro.md`：`kind: badge`、`title: Astro`、`image: ./img/preview-1.png`、`alt`、`x: 0.15`、`y: 0.2`、`rotate: -4`、`href: https://astro.build`。
- `astronaut-stamp.md`：`kind: stamp`、`title: 登月邮票`、`image: ./img/logo.svg`、`alt`、`x: 0.55`、`y: 0.4`、`rotate: 3`、`denomination: ¥1.20`、`postmark: BEIJING`。**故意不写 `.en` 孪生**（给 Task 5 测「未翻译回退」）。
- `astro.en.md`：`kind: badge`、`title: Astro (EN)`、`image`/坐标同 `astro.md`（几何以 zh 锚点为准，见 Task 3）、`alt` 英文、`href` 同。

- [ ] **Step 3: 跑构建验 schema**

Run: `npm run build`
Expected: PASS（`board` 集合校验通过，两张 `image()` 解析成功；无 `.en` id 吞点告警）。

- [ ] **Step 4: 格式化并提交**

```bash
npm run format
git add src/content.config.ts src/content/board
git commit -m "Add board content collection with stamp and badge seeds"
```

---

## Task 2: 界面词 `navBoard` 与导航入口

**Files:**
- Modify: `src/lib/i18n.ts`（`ZH_STRINGS` 与 `en` 各加 `navBoard`）
- Modify: `src/consts.ts:53-60`（`NAVIGATION` 数组加一项）
- Create: `scripts/tests/board-check.sh`（新回归脚本，本 Task 先放导航断言）

**Interfaces:**
- Consumes: 现有 `UIKey`（= `keyof typeof ZH_STRINGS`）、`NAVIGATION: { key: UIKey; href: string; bilingual?: boolean }[]`。
- Produces: `navBoard` 这个 `UIKey`；导航项 `{ key: "navBoard", href: "/board", bilingual: true }`。

- [ ] **Step 1: 写失败断言（board-check.sh）**

新建 `scripts/tests/board-check.sh`，`set -euo pipefail` + `root="$(git rev-parse --show-toplevel)"; cd "$root"`，照抄 `i18n-check.sh` 的 `pass/fail/assert_has/assert_file/assert_match` 助手与 `ENV_KEEP` backup/restore + `trap` + `printf 'SITE_URL=https://example.com\n' > .env` + `npm run build`。本 Task 末尾加断言：

```bash
zh_board_nav=$( [ -f dist/index.html ] && grep -qF 'href="/board"' dist/index.html; echo $? )
[ "${zh_board_nav}" -eq 0 ] || fail "中文导航含 /board 入口"
grep -qF 'href="/en/board"' dist/en/index.html || fail "英文导航含 /en/board 入口"
grep -qF '>收藏板<' dist/index.html || fail "中文导航收藏板标签"
pass "导航入口双语就位"
```

- [ ] **Step 2: 跑脚本确认失败**

Run: `bash scripts/tests/board-check.sh`
Expected: FAIL（找不到 `href="/board"`，因 `NAVIGATION` 还没这一项）。

- [ ] **Step 3: 加 `navBoard` 界面词**

`src/lib/i18n.ts`：`ZH_STRINGS` 加 `navBoard: "收藏板"`（放在 `navFigures` 附近），`en` 镜像加 `navBoard: "Board"`。两份键数保持一致（`en` 有全键校验兜底）。

- [ ] **Step 4: 加导航项**

`src/consts.ts` 的 `NAVIGATION` 数组内加 `{ key: "navBoard", href: "/board", bilingual: true }`。

- [ ] **Step 5: 跑脚本确认通过**

Run: `bash scripts/tests/board-check.sh`
Expected: PASS（导航断言）。

- [ ] **Step 6: 提交**

```bash
npm run format:check
git add src/lib/i18n.ts src/consts.ts scripts/tests/board-check.sh
git commit -m "Add board nav entry and bilingual UI string"
```

---

## Task 3: 取数 `getBoardViews` + `Board.astro` 静态渲染 + `/board` 路由

**Files:**
- Modify: `src/lib/content.ts`（加 `BoardView` 类型与 `getBoardViews`）
- Create: `src/components/Board.astro`（SSR 拼贴板 + scoped 样式 + 齿孔/网格/窄屏回退）
- Create: `src/pages/board/index.astro`（zh 路由）

**Interfaces:**
- Consumes: `getCollection("board")`、`localeOf`/`baseId`/`type Locale`（来自 `src/lib/i18n`）、`CollectionEntry<"board">`（Task 1）。
- Produces:
  - `getBoardViews(locale: Locale): Promise<BoardView[]>` — 以 zh 条目为锚，几何/`image`/`href` 恒取 zh 锚点；文案（`title`/`alt`/`denomination`/`postmark`）locale 命中译文则取译文、否则回落 zh。

```ts
export type BoardView = {
  id: string                 // baseId（配对键）
  kind: "stamp" | "badge"
  image: ImageLike
  x: number; y: number; rotate: number; z: number
  href?: string
  title: string
  alt: string
  denomination?: string
  postmark?: string
  translated: boolean        // en 孪生存在且非 draft
}
```
  - 组件 `Board.astro`：`type Props = { locale: Locale }`；渲染 `<stamp-board>` 容器与每枚 `<board-piece data-kind style="--x;--y;--rot;--z">`。

- [ ] **Step 1: 追加失败断言到 board-check.sh**

在 Task 2 脚本后追加（此时 `/board` 尚无路由 → 失败）：

```bash
assert_file dist/board/index.html "中文收藏板路由存在"
assert_has dist/board/index.html "<stamp-board" "板容器渲染"
assert_match dist/board/index.html 'board-piece[^>]*--x:' "piece 带 SSR 默认 --x"
assert_has dist/board/index.html 'data-kind="stamp"' "stamp 类渲染"
assert_has dist/board/index.html 'data-kind="badge"' "badge 类渲染"
assert_lacks dist/board/index.html 'astro.en' "中文板不泄漏 .en id"
```

- [ ] **Step 2: 跑脚本确认失败**

Run: `bash scripts/tests/board-check.sh`
Expected: FAIL（`dist/board/index.html` 不存在）。

- [ ] **Step 3: 写 `getBoardViews`**

在 `src/lib/content.ts` 照 `getPostViews` 的配对写法实现：取全部非 draft `board` 条目，`enByBaseId` 按 `baseId` 索引 `localeOf==="en"` 条目，遍历 zh 锚点合成 `BoardView`（几何/`image`/`href` 来自 zh，文案 `locale==="en"&&translated ? en : zh`），按 `z`（默认 0）升序、再 `id` 稳定排序返回。

- [ ] **Step 4: 写 `Board.astro`**

`Props = { locale }`。frontmatter：`const views = await getBoardViews(locale)`。标记：
```astro
<stamp-board>
  {views.map(v => (
    <board-piece data-kind={v.kind}
      style={`--x:${v.x}; --y:${v.y}; --rot:${v.rotate}deg; --z:${v.z}`}
      aria-label={v.title}>
      {v.kind === "stamp"
        ? <span class="stamp">{/* <Image/> + 齿孔 + denomination/postmark */}</span>
        : <span class="badge">{/* href 有则 <a>，无则 <span>；<Image/> + 可选 title */}</span>}
    </board-piece>
  ))}
</stamp-board>
```
`import { Image } from "astro:assets"` 渲染 `v.image`（`alt={v.alt}`、给个 `width`/`height` 或按形状 `height="auto"`）。scoped `<style>`：
- `stamp-board { position: relative; height: clamp(…); background-image: 极淡网格; }`（网格线用 `--border`/`color-mix`，`light-dark()` 自适应；四周 `padding` 呼吸）。
- `board-piece { position: absolute; left: calc(var(--x)*100%); top: calc(var(--y)*100%); transform: rotate(var(--rot)); }`。
- `.stamp`：齿孔边 CSS `mask`（`radial-gradient` 重复遮罩）+ 纸白内边距 + 轻 `box-shadow`；`denomination`/`postmark` 角标（缺字段不占位）。
- `.badge`：随 `Image` 形状不套死框、可 `href`；下方 `title` 小字。
- 窄屏 `@media (width < 64rem)`：`stamp-board` 改 `display:grid`、`board-piece` 复位 `position:static; transform:none`、拖拽无关样式关闭。

- [ ] **Step 5: 写 `/board` 路由**

`src/pages/board/index.astro`：`import Layout`、`MetaPage`、`ListingHead`、`Board`；`<Layout><MetaPage slot="head" title="收藏板" alternates={{ zh: "/board", en: "/en/board" }} /><ListingHead …/><Board locale="zh" /></Layout>`。

- [ ] **Step 6: 跑脚本确认通过 + 构建**

Run: `bash scripts/tests/board-check.sh && npm run build`
Expected: PASS（`dist/board/index.html` 含板、piece 带 `--x`、stamp/badge 类、无 `.en` 泄漏）。

- [ ] **Step 7: 提交**

```bash
npm run format
git add src/lib/content.ts src/components/Board.astro src/pages/board scripts/tests/board-check.sh
git commit -m "Render static board page with stamps and badges"
```

---

## Task 4: 拖拽客户端激活（Pointer Events）

**Files:**
- Modify: `src/components/Board.astro`（新增 scoped `<script>`；补 `.board-piece` 抓取态样式）

**Interfaces:**
- Consumes: DOM 上 `stamp-board`/`board-piece`（Task 3）与其内联 `--x/--y/--rot/--z`。
- Produces: `customElements.define("stamp-board", …)` 注册的板元素；拖拽只改内存 CSS 变量。

- [ ] **Step 1: 追加断言到 board-check.sh**

```bash
assert_has dist/board/index.html "customElements.define" "板激活脚本入产物"
assert_has dist/board/index.html "setPointerCapture" "拖拽用 Pointer Capture"
```

- [ ] **Step 2: 跑脚本确认失败**

Run: `bash scripts/tests/board-check.sh`
Expected: FAIL（产物尚无 `customElements.define`）。

- [ ] **Step 3: 写板元素激活脚本**

在 `Board.astro` 末尾加 `<script>`（scoped，组件内自包含，照 `TableOfContents.astro` 内联脚本范式）：
- `customElements.define("stamp-board", class extends HTMLElement { connectedCallback(){…} })`。
- **媒体门槛**：`matchMedia("(width >= 64rem)")` 不匹配则**不绑事件**（窄屏只读，对齐 §Review Focus/Task 3 CSS）。
- 每个 `board-piece` 绑 `pointerdown`：缓存 `boardWidth/boardHeight`（此刻测一次，`resize` 失效）；记起始指针与起始 `--x/--y`；`setPointerCapture`。
- `pointermove`：把像素位移换算成百分比写回 `--x/--y`，**夹紧** `x∈[0, 1 - pieceW/boardW]`、`y∈[0, 1 - pieceH/boardH]`；置一个 `dragged` 标志（位移 > 阈值，约 3–4px）。
- `pointerup`：若 `!dragged` 且 piece 是 `<a>` 链接 → 放行导航；否则 `preventDefault`。清 `dragged`。
- `pointerdown` 时把该 piece 的 `--z` 抬到当前最大 +1（置顶）。
- **不写 localStorage、不回写内容集合**。
- 抓取/悬停加轻微抬起放大（hover-lift 质感），`@media (prefers-reduced-motion: reduce)` 下去掉过渡与放大。
- 为 `prefers-reduced-motion` 拖拽本身不禁用（用户主动操作）。

- [ ] **Step 4: 跑脚本确认通过 + 构建**

Run: `bash scripts/tests/board-check.sh && npm run build`
Expected: PASS（产物含 `customElements.define`/`setPointerCapture`）。

- [ ] **Step 5: 人工浏览器核验（必须）**

dev server（`npm run dev`，`http://localhost:4321/board`）+ `playwright` 截图/交互核验：桌面 × {light, dark} 拖一枚确认**置顶生效、边界夹紧不撑横滚、hover-lift**；带 `href` 徽章**点击能跳转**（点 vs 拖阈值）；窄屏 `<64rem` 确认网格只读、拖拽停用。

- [ ] **Step 6: 提交**

```bash
npm run format
git add src/components/Board.astro scripts/tests/board-check.sh
git commit -m "Add pointer-drag activation to stamp-board element"
```

---

## Task 5: 英文路由 `/en/board` 与未翻译回退

**Files:**
- Create: `src/pages/en/board/index.astro`
- Modify: `scripts/tests/board-check.sh`（追加 en 断言）
- Modify: `scripts/tests/i18n-check.sh`（追加 `/en/board` 与双语导航断言）

**Interfaces:**
- Consumes: `Board locale="en"`（Task 3/4）、`getBoardViews("en")`（译文回落逻辑已内建）。
- Produces: `dist/en/board/index.html`。

- [ ] **Step 1: 追加失败断言（board-check.sh）**

```bash
assert_file dist/en/board/index.html "英文收藏板路由存在"
assert_has dist/en/board/index.html "Astro (EN)" "已翻译物件显示英文标题"
assert_has dist/en/board/index.html "登月邮票" "未翻译物件回落中文标题（非空）"
assert_lacks dist/en/board/index.html "undefined" "英文板无 undefined 泄漏"
assert_has dist/en/board/index.html 'hreflang="zh-CN"' "英文板输出 zh alternate"
```

- [ ] **Step 2: 跑脚本确认失败**

Run: `bash scripts/tests/board-check.sh`
Expected: FAIL（`dist/en/board/index.html` 不存在）。

- [ ] **Step 3: 写 `/en/board` 路由**

`src/pages/en/board/index.astro`：照 zh 路由，`<Board locale="en" />`、`MetaPage title`（英文页标题走 `navBoard` 的 en 值或写死 `Board`）、`alternates` 同。`ListingHead` 传英文 kicker/desc（英文页头文案；未翻译物件标题由 `getBoardViews` 自动回落 zh，**不**在拼贴里加「Not translated」徽章）。

- [ ] **Step 4: i18n-check.sh 追加 `/en/board` 断言**

在 `i18n-check.sh` 末尾（cleanup `trap` 生效范围内）加：

```bash
assert_file dist/en/board/index.html "en 板产出"
assert_has dist/en/board/index.html '<html lang="en"' "en 板 html lang"
assert_has dist/en/board/index.html 'href="/board"' "en 板切换回中文"
```

- [ ] **Step 5: 跑两个脚本 + 构建确认通过**

Run: `bash scripts/tests/board-check.sh && bash scripts/tests/i18n-check.sh && npm run build`
Expected: PASS（已翻译显英文标题、未翻译显中文、无 `undefined`、hreflang/canonical 正确；i18n 全绿）。

- [ ] **Step 6: 提交**

```bash
npm run format
git add src/pages/en/board scripts/tests/board-check.sh scripts/tests/i18n-check.sh
git commit -m "Add English board route with untranslated fallback"
```

---

## Task 6: 组件文档与全量验证

**Files:**
- Create: `docs/components/board.md`（照 `docs/components/README.md` 模板）
- 无产品代码改动

**Interfaces:**
- Consumes: 已完成的 `stamp-board`/`board-piece`、`Board.astro`、`getBoardViews`。
- Produces: 用法文档（AGENTS 要求：可交互自主定制元素须补一篇）。

- [ ] **Step 1: 写 `docs/components/board.md`**

按组件文档结构：用途、SSR+激活范式、`Props`、内容集合 frontmatter 字段表、拖拽行为与窄屏回退、双主题令牌、示例。

- [ ] **Step 2: 全量闸**

Run: `npm run format:check && npm run build && bash scripts/tests/board-check.sh && bash scripts/tests/i18n-check.sh`
Expected: 全绿。

- [ ] **Step 3: 提交**

```bash
git add docs/components/board.md
git commit -m "Document stamp-board custom element usage"
```
