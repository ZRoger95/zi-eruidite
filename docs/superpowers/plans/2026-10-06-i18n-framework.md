# i18n 框架（阶段一）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让站点成为"中文默认 + 英文 `/en/`"的双语站点：博客文章支持 `.en.md` 译文与语言切换，未翻译内容有明确呈现（列表标记 + 提示页 + 系列占位块）。

**Architecture:** 语言由文件名 `.en` 后缀派生（blog loader 提供自定义 `generateId`，先剥离标记、复刻默认 slug 规则后回填）；内容工具层新增 locale 感知的展示视图 `PostView`，`/en/` 路由与中文侧共用组件；界面文案走字典 `t(locale, key)`，语言切换器只在有英文路由的页面显示。

**Tech Stack:** Astro 7（content layer / glob loader）、原生 CSS、Biome。零新增依赖；构建不调用 AI。

**Spec:** `docs/superpowers/specs/2026-10-06-i18n-design.md`（执行者需一并阅读；本计划实现该 spec 的「阶段一」）

## Global Constraints

- 包管理器用 npm（用户偏好）：`npm run format:check`、`npm run build`；每个任务结束前两项必须通过，并产生一次提交。
- 零新增依赖；构建过程不调用 AI。
- 中文侧现有 URL、路由树、系列/锚点行为不得变化（唯一预期可见变化：日期变为中文格式、界面文案中文化、首页 hero 挪位）。
- `.en.md` 标记规则：小写 `.en`，位于文件名的最后一段（`index.en.md` → id `x.en`）；`_` 前缀文件不参与。
- id 规则（自定义 `generateId`）：`v1-posts/index.md → v1-posts`、`v1-posts/index.en.md → v1-posts.en`、`v1-posts/rehype-patch.en.md → v1-posts/rehype-patch.en`；`baseId` = 去 `.en`。
- draft 语义：`_` 前缀与 `draft: true` 沿用现状；en 条目为 draft 时按"未翻译"对待。
- 测试方式（仓库无测试框架，沿用 `scripts/tests/deploy-check.sh` 惯例）：`scripts/tests/i18n-check.sh` 先写断言、后实现（新功能），重构性质任务用"先跑通基线、实现后保持通过"；脚本临时写入受控 `.env`（仅 `SITE_URL=https://example.com`）并在退出时恢复（`trap`）。
- Biome：2 空格、80 列、双引号、无分号（`npm run format` 自动处理，勿手改格式）。

## Review Focus

以下五类是 spec 暗示、但容易被执行者忽略的输入/失败模式；对应任务中必须有断言或手动步骤覆盖：

1. 未翻译文章的 `/en/` 直达 URL：必须渲染提示页（noindex、canonical → 中文原文、附中文链接），而不是 404、空白或混入英文列表 —— Task 4（渲染）+ Task 7（canonical）。
2. 系列内部分未翻译：`/en/blog/<系列>/<子文章>` 仍应渲染系列页（未翻译节点为占位块），连续文档不断档 —— Task 4。
3. 中文侧回归：现有 URL、系列链、RSS、标签/作者页列表不得变化；`.en` 条目绝不能泄入中文列表/标签/作者页（即使它们共享 tag/author）—— Task 2/3 断言 + Task 8 手动。
4. 语言切换器显隐：只在 `/`、`/blog`、`/blog/**` 及其 en 对应页出现；zh-only 板块（动态/项目/作者/标签）不出现，且 en 导航指向这些板块时保持中文路径 —— Task 5。
5. head 信号：`hreflang` 仅在有真实译文时输出（提示页无 alternates）；en RSS 只含已翻译文章；sitemap 输出 zh/en 页对的 `xhtml:link` —— Task 7。

---

### Task 1: i18n 核心库与 blog loader id 规则

**Files:**
- Create: `src/lib/i18n.ts`
- Modify: `src/content.config.ts`
- Create: `scripts/tests/i18n-check.sh`

**Interfaces（Produces，后续任务消费）:**

```ts
export const LOCALES = ["zh", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "zh"

export const localeOf: (id: string) => Locale          // 末尾 ".en" → "en"，否则 "zh"
export const baseId: (id: string) => string            // 去掉末尾 ".en"
export const localePath: (path: string, locale: Locale) => string
//   locale "zh" → 原样返回；"en" → "/" 为 "/en/"，其余 "/en" + path（如 "/en/blog"）
export const localeFromPath: (pathname: string) => Locale
//   pathname === "/en" 或 startsWith("/en/") → "en"，否则 "zh"
export const generateBlogEntryId: (opts: { entry: string }) => string
export const SITE_META: Record<Locale, { htmlLang: string; ogLocale: string }>
//   zh: { htmlLang: "zh-CN", ogLocale: "zh_CN" }；en: { htmlLang: "en", ogLocale: "en_US" }
export const UI_STRINGS: Record<Locale, Record<UIKey, string>>
export type UIKey = keyof (typeof UI_STRINGS)["zh"]
export const t: (locale: Locale, key: UIKey) => string
```

`generateBlogEntryId` 完整实现（算法由本计划固定，勿改）：

```ts
import { slug as githubSlug } from "github-slugger"

const MARKER = ".en"

export const generateBlogEntryId = ({ entry }: { entry: string }): string => {
  let stem = entry.replace(/\.md$/, "")
  let marker = ""
  if (stem.endsWith(MARKER)) {
    stem = stem.slice(0, -MARKER.length)
    marker = MARKER
  }
  const slug = stem
    .split("/")
    .map((segment) => githubSlug(segment))
    .join("/")
    .replace(/\/index$/, "")
  return slug + marker
}
```

`UI_STRINGS` 初稿（zh / en，键名照抄）：

| key | zh | en |
| - | - | - |
| skipLink | 跳到主内容 | Skip to content |
| themeToggle | 切换主题 | Toggle theme |
| fullwidthToggle | 切换全宽 | Toggle full width |
| prevPost | 上一篇 | Previous post |
| nextPost | 下一篇 | Next post |
| scrollTop | 回到顶部 | Scroll to top |
| toc | 目录 | Table of contents |
| tocToggle | 展开或折叠目录 | Toggle table of contents |
| navBlog | 博客 | Blog |
| navMoments | 动态 | Moments |
| navTags | 标签 | Tags |
| navProjects | 项目 | Projects |
| navAuthors | 作者 | Authors |
| blogTitle | 博客 | Blog |
| latestPosts | 最新文章 | Latest posts |
| heroGreeting | 你好，我是 | Hi! I'm |
| untranslatedBadge | 尚未翻译 | Not translated yet |
| noticeTitle | 本文尚无英文版 | Not translated yet |
| noticeBody | 这篇中文文章还没有英文版。 | This article hasn't been translated into English yet. |
| readOriginal | 阅读中文原文 | Read the Chinese original |
| sectionUntranslated | 本节尚未翻译 | This section hasn't been translated yet. |
| aiTranslated | AI 翻译 | AI-translated |
| langSwitch | EN | 中文 |
| langSwitchAria | 切换到英文 | Switch to Chinese |

**Steps:**

- [ ] **Step 1: 写检查脚本骨架**

创建 `scripts/tests/i18n-check.sh`：`set -euo pipefail`、`root="$(git rev-parse --show-toplevel)"`、`pass/fail/assert_file/assert_has/assert_lacks/assert_match` 辅助函数（风格照 `scripts/tests/deploy-check.sh`）；临时写入受控 `.env`（备份→写 `SITE_URL=https://example.com`→`trap` 恢复）；`npm run build`；然后断言中文侧基线：

```bash
assert_file dist/index.html "首页存在"
assert_file dist/blog/index.html "博客列表存在"
assert_file dist/blog/introducing-v2/index.html "文章路由存在"
assert_file dist/blog/v1-posts/index.html "系列页存在"
assert_file dist/blog/v1-posts/rehype-patch/index.html "子文章路由存在"
assert_file dist/rss.xml "RSS 存在"
```

- [ ] **Step 2: 跑基线**

Run: `bash scripts/tests/i18n-check.sh`
Expected: 全部 PASS（当前代码基线；此后本脚本是该任务的回归护栏）。

- [ ] **Step 3: 创建 `src/lib/i18n.ts`**

按 Interfaces 与 `generateBlogEntryId` 完整实现落盘（含全部 `UI_STRINGS` 键）。

- [ ] **Step 4: 修改 `src/content.config.ts`**

blog loader 增加 `generateId: generateBlogEntryId`（用相对路径 `import { generateBlogEntryId } from "./lib/i18n"` 导入，`content.config.ts` 位于 `src/` 下必然可解析）；blog schema 增加 `aiTranslated: z.boolean().optional()`。其余集合不动。

- [ ] **Step 5: 验证 id 重构未改变中文路由**

Run: `npm run build && bash scripts/tests/i18n-check.sh`
Expected: 全部 PASS（若任一 assert_file 失败，说明 id 规则偏离默认行为，停下检查 `generateBlogEntryId`）。

- [ ] **Step 6: 格式检查与提交**

Run: `npm run format:check`

```bash
git add src/lib/i18n.ts src/content.config.ts scripts/tests/i18n-check.sh
git commit -m "i18n：核心库与 blog loader id 规则（.en.md 约定）"
```

---

### Task 2: 内容工具层与卡片 locale 化

**Files:**
- Modify: `src/lib/content.ts`、`src/lib/utils.ts`、`src/components/BlogCard.astro`
- Test: `scripts/tests/i18n-check.sh`

**Interfaces（Produces）:**

```ts
// content.ts
export type PostView = {
  id: string                                    // baseId（无 .en）
  data: CollectionEntry<"blog">["data"]         // en ?? zh
  translated: boolean                           // en 条目存在且非 draft
  zh: CollectionEntry<"blog">
  en?: CollectionEntry<"blog">
}
export async function getPostViews(locale: Locale): Promise<PostView[]>

// utils.ts
export function formatDate(date: Date, locale: Locale = "zh"): string
//   zh → "2026年10月6日"（Intl zh-CN，month 用 "long"；numeric 会输出 2026/10/6，勿用）
//   en → 现状 "Jun 6, 2026"（en-US，month "short"）
```

**Consumes:** Task 1 的 `localeOf/baseId`（来自 `@/lib/i18n`）。

**实现要点:**

- `getPosts()`/`getSubposts()`/`getTags()`/`getAllTags()` 语义不变，但显式排除 `.en` 条目（`localeOf(id) === "zh"`），保证中文列表/标签/作者页不泄漏 `.en`。
- `getPostViews(locale)`：取全部非 draft 的 blog 条目 → 以 zh 侧 base 文章为骨架（`!isSubpost(id) && localeOf(id)==="zh"`）→ 按 `baseId` 配对同名 `.en` 条目（非 draft 才算 `translated`）→ 排序同 `getPosts`。
- `BlogCard.astro`：props 改为 `{ post: CollectionEntry<"blog"> | PostView }`；用 `"translated" in post` 判别并归一为 view；`const locale = localeFromPath(Astro.url.pathname)`；链接改 `localePath(\`/blog/${view.id}\`, locale)`（作者 `/authors/...`、标签 `/tags/...` 维持原样，指向 zh-only 板块）；日期 `formatDate(view.data.date, locale)`；`!view.translated` 时渲染 `<entry-badge>{t(locale, "untranslatedBadge")}</entry-badge>`（小徽章样式加在该组件 `<style>`，参考 `shape.css` 圆角工具类）。

**Steps:**

- [ ] **Step 1: 追加断言（先失败）**

在 `i18n-check.sh` 追加：

```bash
assert_match dist/blog/index.html '[0-9]{4}年[0-9]+月[0-9]+日' "中文列表日期为中文格式"
assert_has dist/blog/index.html 'href="/blog/v1-posts"' "中文列表文章链接不变"
```

- [ ] **Step 2: 运行，期望失败**

Run: `bash scripts/tests/i18n-check.sh`
Expected: FAIL「中文列表日期为中文格式」（当前为 `Jun 6, 2026` 格式）。

- [ ] **Step 3: 实现（按上面实现要点改三个文件）**

- [ ] **Step 4: 运行，期望通过**

Run: `bash scripts/tests/i18n-check.sh`
Expected: 全部 PASS（含 Task 1 基线断言）。

- [ ] **Step 5: 格式检查与提交**

Run: `npm run format:check`

```bash
git add src/lib/content.ts src/lib/utils.ts src/components/BlogCard.astro scripts/tests/i18n-check.sh
git commit -m "i18n：内容工具层 locale 化与卡片徽章"
```

---

### Task 3: fixtures 与 `/en/` 首页、列表

**Files:**
- Create: `src/content/blog/welcome/index.md`、`src/content/blog/welcome/index.en.md`、`src/content/blog/v1-posts/index.en.md`
- Create: `src/pages/en/index.astro`、`src/pages/en/blog/index.astro`
- Test: `scripts/tests/i18n-check.sh`

**fixtures 内容（逐字落盘；它们是开发样例，作者可随后替换/删除）:**

`welcome/index.md`：

```md
---
title: "欢迎：本站支持中英双语了"
description: "站点新增英文版：可随时切换语言，未翻译的文章会有明确提示。"
date: 2026-10-06
authors:
  - enscribe
tags:
  - site
---

本站从今天起开始支持中英双语。

- 中文是默认语言，页面右上角（或侧栏底部）可切换到英文；
- 文章会陆续提供英文版，尚未翻译的文章会标示"尚未翻译"并保留中文原文入口；
- 这是一篇示例文章，可随时替换成你自己的内容。
```

`welcome/index.en.md`（关键断言字符串：`Welcome: this site is now bilingual`）：

```md
---
title: "Welcome: this site is now bilingual"
description: "An English version has arrived. Switch languages anytime; untranslated articles say so clearly."
date: 2026-10-06
authors:
  - enscribe
tags:
  - site
aiTranslated: true
---

This site now speaks both Chinese and English.

- Chinese is the default language; use the switch at the top right (or the sidebar) to read in English;
- Articles will gain English versions over time; untranslated ones are clearly marked and link back to the Chinese original;
- This is a sample post — replace it with your own content whenever you like.
```

`v1-posts/index.en.md`：与 `v1-posts/index.md` 完全相同的 frontmatter 与正文（源文本身是英文演示；不要加 `aiTranslated`，用于验证"无徽章"）。

**页面实现要点:**

- `src/pages/en/index.astro`：结构照 `src/pages/index.astro`，`posts = await getPostViews("en")`，最新 5 篇；hero 暂时保持与中文首页相同的硬编码演示文案（Task 5 再统一挪到 `consts.ts`）；不渲染 moments 区块。
- `src/pages/en/blog/index.astro`：结构照 `src/pages/blog/index.astro`，`getPostViews("en")`，BlogCard 传 view；`MetaPage title="Blog"`（Task 5 再字典化）。

**Steps:**

- [ ] **Step 1: 创建 fixtures 与两个 en 页面（按上面内容）**

- [ ] **Step 2: 追加断言（先失败）**

```bash
assert_file dist/en/index.html "英文首页存在"
assert_file dist/en/blog/index.html "英文列表存在"
assert_has dist/en/blog/index.html 'href="/en/blog/welcome"' "英文列表含已翻译文章链接"
assert_has dist/en/blog/index.html 'Welcome: this site is now bilingual' "英文列表显示英文标题"
assert_has dist/en/blog/index.html 'Not translated yet' "未翻译徽章显示"
assert_has dist/en/blog/index.html 'Introducing astro-erudite v2' "未翻译文章显示中文原标题"
assert_has dist/en/index.html 'href="/en/blog/welcome"' "英文首页含最新文章链接"
assert_lacks dist/blog/index.html 'href="/en/blog/' "中文列表不含英文链接"
assert_lacks dist/blog/index.html 'welcome.en' "中文列表不泄漏 .en id"
assert_lacks dist/authors/enscribe/index.html 'welcome.en' "作者页不泄漏 .en id"
assert_lacks dist/tags/site/index.html 'welcome.en' "标签页不泄漏 .en id"
assert_has dist/blog/index.html 'href="/blog/welcome"' "中文列表含欢迎文章"
```

- [ ] **Step 3: 运行，期望失败**

Run: `bash scripts/tests/i18n-check.sh`
Expected: FAIL「英文首页存在」（dist/en 尚未生成）；中文侧断言应已通过。

- [ ] **Step 4: 实现两个 en 页面（含上述 fixtures）**

- [ ] **Step 5: 运行，期望通过**

Run: `bash scripts/tests/i18n-check.sh`

- [ ] **Step 6: 格式检查与提交**

Run: `npm run format:check`

```bash
git add src/content/blog/welcome src/content/blog/v1-posts/index.en.md src/pages/en scripts/tests/i18n-check.sh
git commit -m "i18n：英文首页与列表（含未翻译标记与样例文章）"
```

---

### Task 4: 文章路由（翻译页 / 提示页 / 系列占位块）

**Files:**
- Create: `src/components/PostChain.astro`（自 `src/pages/blog/[...id].astro` 抽取文章链渲染）
- Create: `src/pages/en/blog/[...id].astro`
- Modify: `src/pages/blog/[...id].astro`（改用 PostChain，中文行为不变）
- Modify: `src/lib/content.ts`（新增 `getSubpostViews(locale)`）
- Modify: `src/components/PostActions.astro`（联合类型 + locale 链接；文案暂不动）
- Test: `scripts/tests/i18n-check.sh`

**Interfaces:**

```ts
// PostChain.astro
type ChainItem = {
  view: PostView                                  // translated=false → 渲染占位块
  Content?: AstroComponentFactory                 // 已翻译条目的 render() 结果；未翻译省略
  authors: CollectionEntry<"authors">[]
}
type Props = { locale: Locale; currentId: string; items: ChainItem[] }
```

**实现要点:**

- PostChain 承载原 `blog/[...id].astro` 中 `<article>` 循环与其全部样式：`data-url={localePath(\`/blog/${view.id}\`, locale)}`、`data-title={pageTitle(view.data.title)}`、`data-embedded={i > 0}`、`id={i === 0 ? undefined : subpostSlug(view.id)}`、`priority={view.id === currentId}`、`data-article-topbar`；已翻译条目渲染 header（含 `aiTranslated` 徽章：`view.en?.data.aiTranslated && <ai-translated-badge>{t(locale, "aiTranslated")}</ai-translated-badge>`）、banner、`<prose-content><Content /></prose-content>`；未翻译条目渲染 `<untranslated-section data-untranslated>`（标题 = `view.data.title`、文案 `t(locale, "sectionUntranslated")`、链接 `t(locale, "readOriginal") → \`/blog/${view.id}\``）。
- `blog/[...id].astro`：把文章循环替换为 `<PostChain locale="zh" currentId={post.id} items={...} />`，items 由现有 chain 构造（`translated: true` 的伪 view：`{ id: entry.id, data: entry.data, translated: true, zh: entry }`）。页面其余部分（crumbs/ToC/PostActions/SeriesReader）不动。
- `en/blog/[...id].astro`：
  - `getStaticPaths`：`const views = await getPostViews("en")`；子文章视图由 `getSubpostViews("en")` 提供（在 `content.ts` 增加，与 `getPostViews` 同构：`Map<parentBaseId, PostView[]>`，仅 en）；对每个 parent 生成 `[parent, ...subposts]` 全链路由（params.id = view.id）；
  - 渲染：构建 ChainItems（`render(view.en!)` + `getEntries(view.data.authors)` 仅对 translated 节点）；`chain.some(v => v.translated) === false` 时整页渲染**提示页**：Layout + `MetaPage noindex` + `<untranslated-notice>`（`view.data.title` / `t(locale,"noticeBody")` / `t(locale,"readOriginal") → \`/blog/${view.id}\``，即当前请求对应的中文原文）；否则渲染 Layout + crumbs（本地化）+ ToC（sections 用 en 标题、`subpostSlug(view.id)` 锚点）+ `PostChain locale="en"` + PostActions（prev/next 取 en 视图邻位）+ SeriesReader（chain.length > 1 时）。
  - 提示页与文章页的 `<html lang>` 由 Task 5 的 Layout 自动处理；本任务不断言。
- `PostActions.astro`：props 类型改 `{ prev?: CollectionEntry<"blog"> | PostView; next?: ... }`，归一后链接用 `localePath`；`title/aria-label` 暂维持英文模板（Task 5 字典化）。

**Steps:**

- [ ] **Step 1: 追加断言（先失败）**

```bash
assert_file dist/en/blog/welcome/index.html "英文文章页存在"
assert_has dist/en/blog/welcome/index.html 'Welcome: this site is now bilingual' "英文文章渲染英文内容"
assert_has dist/en/blog/welcome/index.html 'AI-translated' "AI 翻译徽章显示"
assert_file dist/en/blog/introducing-v2/index.html "未翻译文章有提示页"
assert_has dist/en/blog/introducing-v2/index.html "hasn't been translated into English" "提示页文案正确"
assert_has dist/en/blog/introducing-v2/index.html 'noindex' "提示页 noindex"
assert_file dist/en/blog/v1-posts/rehype-patch/index.html "未翻译子文章 URL 可用"
assert_has dist/en/blog/v1-posts/index.html 'data-untranslated' "系列占位块存在"
assert_has dist/en/blog/v1-posts/index.html 'This section hasn' "占位块文案正确"
assert_has dist/blog/v1-posts/rehype-patch/index.html 'data-url="/blog/v1-posts/rehype-patch"' "中文文章页回归"
```

（注：模式刻意在撇号前截断，避免 bash 引号转义问题。）

- [ ] **Step 2: 运行，期望失败**

Run: `bash scripts/tests/i18n-check.sh`
Expected: FAIL「英文文章页存在」。

- [ ] **Step 3: 抽取 PostChain 并改造中文文章页（中文回归先跑通）**

Run: `npm run build && bash scripts/tests/i18n-check.sh`
Expected: 全部既有断言 PASS（中文文章页结构不变）。

- [ ] **Step 4: 实现 `getSubpostViews` 与 `en/blog/[...id].astro`、PostActions 调整**

- [ ] **Step 5: 运行，期望通过**

Run: `bash scripts/tests/i18n-check.sh`

- [ ] **Step 6: 格式检查与提交**

Run: `npm run format:check`

```bash
git add src/components/PostChain.astro src/components/PostActions.astro src/pages/blog/[...id].astro src/pages/en/blog/[...id].astro src/lib/content.ts scripts/tests/i18n-check.sh
git commit -m "i18n：英文文章路由（译文页、提示页、系列占位块）"
```

---

### Task 5: 共享界面文案与语言切换器

**Files:**
- Create: `src/components/LanguageSwitch.astro`
- Modify: `src/layouts/Layout.astro`、`src/components/{Topbar,Sidebar,ThemeToggle,PostActions,ScrollToTop,TableOfContents,MetaPost,MetaPage}.astro`、`src/consts.ts`、`src/pages/index.astro`、`src/pages/en/index.astro`、`src/pages/blog/index.astro`、`src/pages/en/blog/index.astro`
- Test: `scripts/tests/i18n-check.sh`

**实现要点:**

- **Layout.astro**：`const locale = localeFromPath(Astro.url.pathname)`；`<html lang={SITE_META[locale].htmlLang} dir={SITE.dir}>`；skip-link 文案 `t(locale,"skipLink")`。
- **consts.ts**：`NAVIGATION` 改为 `{ key: UIKey; href: string; bilingual?: boolean }[]`（`navBlog` + `bilingual: true`，其余 zh 路径）；新增 `SITE.hero: Record<Locale, { paragraphs: string[] }>`（zh 用一段中文占位文案、en 保持现有两段演示文字，作者后续自行修改）；删除 `SITE.locale`（保留 `dir`）。
- **Topbar/Sidebar**：标签 `t(locale, item.key)`；href：`item.bilingual ? localePath(item.href, locale) : item.href`；**基于 pathname 的判断先剥离 `/en`**（`const base = locale === "en" ? stripped : pathname`）再匹配 `isArticle`/`section`/`aria-current`（en 页的 `aria-current` 用本地化 href 与原 pathname 比较）；在操作区/底栏（ThemeToggle 旁）插入 `<LanguageSwitch />`。
- **LanguageSwitch.astro**：无 props；`localeFromPath` 取当前语言；`stripped` = 去 `/en` 前缀的路径；只在这些路径显示：`/`、`/blog`、`/blog/**`（否则 `return` 空）；目标 href：zh 页 `localePath(stripped, "en")`，en 页 `stripped`；输出 `<a data-language-switch href lang={SITE_META[target].htmlLang} aria-label={t(locale,"langSwitchAria")}>{t(locale,"langSwitch")}</a>`（zh 页显示 `EN`，en 页显示 `中文`），样式沿用 `icon-button.css` 风格。
- **MetaPost/MetaPage**：`og:locale` 用 `SITE_META[locale].ogLocale`；把 `SITE.locale` 的所有引用清除（`rg "SITE.locale" src` 应为空）。
- **MetaPost/MetaPage 的文案键**：`ThemeToggle`（aria-label）、`ScrollToTop`（aria-label）、`TableOfContents`（nav aria + toggle aria）、`PostActions`（上一篇/下一篇；title/aria 改为 `${t(locale,"prevPost")}: ${view.data.title}`）、`Topbar` 全宽按钮（aria/title）。
- **blog 列表页标题**：`MetaPage title={t(locale, "blogTitle")}`（zh 变"博客"，en 保持 "Blog"）。
- **首页 hero**：`pages/index.astro` 与 `pages/en/index.astro` 用 `t(locale,"heroGreeting")` + `SITE.hero[locale].paragraphs` 渲染（zh 的演示文字换成中文占位，作者自行润色）。

**Steps:**

- [ ] **Step 1: 追加断言（先失败）**

```bash
assert_has dist/blog/index.html '>博客<' "中文列表标题中文化"
assert_has dist/blog/index.html '跳到主内容' "中文跳过链接"
assert_has dist/blog/index.html 'data-language-switch' "中文列表有切换器"
assert_has dist/blog/index.html 'href="/en/blog"' "切换器指向英文"
assert_has dist/index.html 'href="/en/"' "中文首页切换器指向 /en/"
assert_has dist/en/blog/index.html '>Blog<' "英文列表标题"
assert_has dist/en/blog/index.html 'Skip to content' "英文跳过链接"
assert_has dist/en/blog/index.html 'data-language-switch' "英文列表有切换器"
assert_has dist/en/blog/index.html 'href="/blog"' "英文切换器指回中文"
assert_has dist/en/blog/index.html '>Moments<' "英文导航英文标签"
assert_has dist/en/blog/index.html 'href="/moments"' "en 导航指向中文板块"
assert_has dist/en/blog/index.html '<html lang="en"' "英文页面 html lang"
assert_has dist/blog/index.html '<html lang="zh-CN"' "中文页面 html lang"
assert_has dist/en/blog/index.html 'Oct 6, 2026' "英文日期格式"
assert_has dist/index.html '你好，我是' "中文首页 hero 中文化"
assert_file dist/moments/index.html
assert_lacks dist/moments/index.html 'data-language-switch' "zh-only 板块无切换器"
```

- [ ] **Step 2: 运行，期望失败**

Run: `bash scripts/tests/i18n-check.sh`
Expected: FAIL「中文列表标题中文化」等。

- [ ] **Step 3: 按实现要点完成全部改动**

- [ ] **Step 4: 运行，期望通过**

Run: `bash scripts/tests/i18n-check.sh`

- [ ] **Step 5: 格式检查与提交**

Run: `npm run format:check`

```bash
git add src/components src/layouts src/consts.ts src/pages scripts/tests/i18n-check.sh
git commit -m "i18n：全站界面文案与语言切换器"
```

---

### Task 6: zh-only 板块界面文案中文化

**Files:**
- Modify: `src/pages/tags/**`、`src/pages/authors/**`、`src/pages/moments/**`、`src/pages/projects/**`，必要时 `src/components/{MomentCard,ProjectCard,AuthorCard}.astro`
- Test: `scripts/tests/i18n-check.sh`

**实现要点:**

- 先审计（不遗漏）：`rg -n '"[A-Za-z][^"]*"' src/pages/tags src/pages/authors src/pages/moments src/pages/projects src/components/MomentCard.astro src/components/ProjectCard.astro src/components/AuthorCard.astro`
- 把所有**界面文案**改中文（页面标题、面包屑、空态、section 标题、按钮/aria）；不改代码标识符、URL、frontmatter 字段名。已知示例：
  - `tags/index.astro`：`Tags` → `标签`；`tags/[...id].astro`：crumb `Tags` → `标签`、`Content tagged with ${tag}.` → `标注为 #${tag} 的内容。`、`No content tagged with #${tag}.` → `暂无标注 #${tag} 的内容。`；
  - `authors/[...id].astro`：`Posts` → `文章`、`No posts yet.` → `暂无文章。`、`${name} (Author)` → `${name}（作者）`；
  - moments/projects 页面按审计结果同样处理。

**Steps:**

- [ ] **Step 1: 审计并替换（列出所有命中并逐一处理）**
- [ ] **Step 2: 追加断言（先失败）**

```bash
assert_has dist/tags/index.html '标签' "标签页中文化"
assert_has dist/authors/enscribe/index.html '文章' "作者页中文化"
assert_lacks dist/tags/index.html '>Tags<' "标签页无残留英文标题"
```

- [ ] **Step 3: 运行，期望失败 → 实现 → 再运行，期望通过**

Run: `bash scripts/tests/i18n-check.sh`（实现前 FAIL、实现后 PASS）

- [ ] **Step 4: 格式检查与提交**

Run: `npm run format:check`

```bash
git add src/pages src/components
git commit -m "i18n：动态/项目/作者/标签页面文案中文化"
```

---

### Task 7: SEO 与输出（hreflang / canonical / sitemap / RSS）

**Files:**
- Modify: `src/components/{MetaPost,MetaPage,MetaHead}.astro`、`astro.config.ts`、`src/pages/blog/index.astro`、`src/pages/blog/[...id].astro`、`src/pages/index.astro`、`src/pages/en/**`
- Create: `src/pages/en/rss.xml.ts`
- Test: `scripts/tests/i18n-check.sh`

**Interfaces:**

```ts
// MetaPost / MetaPage 新增可选 prop：
alternates?: { zh: string; en: string }   // 存在时输出 hreflang="zh-CN" / hreflang="en" / x-default(=zh)
// MetaPage 新增可选 prop：
canonical?: string                        // 覆盖默认的"指向自身"
```

**实现要点:**

- 页面传入规则：首页 `{ zh: "/", en: "/en/" }`；列表 `{ zh: "/blog", en: "/en/blog" }`；文章仅当 `translated` 时传 `{ zh: "/blog/<id>", en: "/en/blog/<id>" }`；提示页不传、并传 `canonical={/blog/<id>}`；zh-only 板块不传。
- `MetaHead.astro`：RSS alternate `href` 按 `localeFromPath` 指向 `/rss.xml` 或 `/en/rss.xml`。
- `astro.config.ts`：`sitemap({ i18n: { defaultLocale: "zh", locales: { zh: "zh-CN", en: "en" } }, filter: <现状规则> })`（已核实包支持该字段；filter 规则本身无需变化，仅回归验证）。
- `src/pages/en/rss.xml.ts`：`getPostViews("en").filter(v => v.translated)`，items `link: /en/blog/${v.id}`，title/description 取 `v.data`；中文 RSS 不动。

**Steps:**

- [ ] **Step 1: 追加断言（先失败）**

```bash
assert_has dist/blog/welcome/index.html 'hreflang="en"' "中文文章输出 en alternate"
assert_has dist/blog/welcome/index.html 'hreflang="x-default"' "输出 x-default"
assert_has dist/en/blog/welcome/index.html 'hreflang="zh-CN"' "英文文章输出 zh alternate"
assert_has dist/en/blog/introducing-v2/index.html 'rel="canonical" href="https://example.com/blog/introducing-v2' "提示页 canonical 指向中文"
assert_lacks dist/en/blog/introducing-v2/index.html 'hreflang' "提示页无 alternates"
assert_file dist/en/rss.xml
assert_has dist/en/rss.xml 'Welcome: this site is now bilingual' "en RSS 含已翻译文章"
assert_lacks dist/en/rss.xml 'Introducing astro-erudite v2' "en RSS 不含未翻译文章"
assert_has dist/sitemap-0.xml 'hreflang="en"' "sitemap 输出 hreflang"
assert_has dist/sitemap-0.xml '/en/blog/welcome/' "sitemap 含英文文章"
assert_has dist/en/blog/index.html 'href="https://example.com/en/rss.xml"' "en 页 RSS alternate"
assert_has dist/blog/index.html 'href="https://example.com/rss.xml"' "zh 页 RSS alternate"
```

- [ ] **Step 2: 运行，期望失败 → 实现 → 再运行，期望通过**
- [ ] **Step 3: 格式检查与提交**

```bash
git add src/components src/pages astro.config.ts scripts/tests/i18n-check.sh
git commit -m "i18n：hreflang、sitemap 与英文 RSS"
```

---

### Task 8: 文档与手动验收

**Files:**
- Modify: `AGENTS.md`
- Test: 手动清单 + 全量脚本

**Steps:**

- [ ] **Step 1: AGENTS.md 增补「i18n（中英双语）约定」小节**

内容：`.en.md` 命名与 id 规则（示例）；`/en/` 路由与未翻译处理（提示页/占位块）；draft/`_` 语义；`src/lib/i18n.ts` 的 helper（localeOf/baseId/localePath/localeFromPath/t）；检查脚本用法 `bash scripts/tests/i18n-check.sh`；并注明阶段二翻译脚本（`.env` 的 `TRANSLATE_*`）为后续工作。

- [ ] **Step 2: 全量验证**

Run: `bash scripts/tests/i18n-check.sh && npm run format:check && npm run build`
Expected: 全部 PASS。

- [ ] **Step 3: 手动浏览器清单（`npm run dev`）**

逐项检查并记录结果：
1. 中文侧：首页、`/blog`、`/blog/welcome`、`/blog/v1-posts`（系列链与目录）、`/blog/v1-posts/rehype-patch`（锚点/URL 行为）、`/moments`、`/tags`、`/authors/enscribe` 外观与链接；日期为中文格式。
2. 英文侧：`/en/`、`/en/blog`（未翻译卡片徽章 + 中文标题）、`/en/blog/welcome`（英文正文 + AI 徽章）、`/en/blog/introducing-v2`（提示页 + 回链）、`/en/blog/v1-posts`（占位块 + 已译父文）、`/en/blog/v1-posts/rehype-patch`（占位锚点）。
3. 切换器：`/` ↔ `/en/`、`/blog` ↔ `/en/blog`、文章页双向；`/moments`、`/tags`、`/authors/...` 不出现。
4. 深链：英文页刷新后 URL/内容一致；中英 canonical、hreflang（view-source）。
5. `/rss.xml`、`/en/rss.xml`、`/sitemap-index.xml` 内容抽样。

- [ ] **Step 4: 提交**

```bash
git add AGENTS.md
git commit -m "AGENTS：记录 i18n 约定"
```

---

## 自查记录（写作时）

- Spec 覆盖：语言/URL（T1/T3/T5）、内容模型与工具层（T1/T2/T4）、界面与切换器（T5）、未翻译呈现（T3/T4/T7）、SEO/RSS/sitemap（T7）、文档（T8）；「阶段二翻译脚本」明确拆分为独立计划，未在本计划内。
- 与 spec 的差异（有意为之）：spec 写 `getPosts(locale)`/`getSubposts(locale)`；实现采用 **保留 zh 语义的 `getPosts()/getSubposts()` + 新增 `getPostViews()/getSubpostViews()`**，避免改动全部中文侧调用方；语义等价。
- 类型一致性：`PostView`、`ChainItem`、`alternates`、`canonical` 在各任务间签名一致。
- Review Focus 五条均落到断言/手动步骤（见上文映射）。
