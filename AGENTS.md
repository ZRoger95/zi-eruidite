# Repository Guidelines

## 项目结构与模块组织

这是一个基于 Astro 的静态站点。主要代码位于 `src/`：页面路由在
`src/pages/`，可复用 Astro 组件在 `src/components/`，共享工具函数在
`src/lib/`，页面布局在 `src/layouts/`，全局样式在 `src/styles/`。内容集合位于
`src/content/`，包含 `blog/`、`projects/` 和 `authors/`，对应 schema 定义在
`src/content.config.ts`。字体资源放在 `src/assets/fonts/`；图标 SVG 放在
`src/assets/icons/`；favicon、manifest 等静态公共文件放在 `public/`。

### 样式系统

本项目不使用 Tailwind 或任何 CSS 框架。样式完全基于原生 CSS，使用以下设计系统：

- **[Utopia](https://utopia.fyi/) 流体设计系统**：通过 `clamp()` 生成无断点的
  流体字号（`--step--1` 到 `--step-3`）和间距（`--space-3xs` 到 `--space-3xl`），
  在最小视口（328px）和最大视口（1215px）之间平滑插值。生成代码位于
  `src/styles/typography.css` 和 `src/styles/layout.css`。
- **[Radix Colors](https://www.radix-ui.com/colors)**：色彩系统，每级包含
  `light-dark()` 明暗双值，定义在 `src/styles/color.css`。
- **自主定制元素（autonomous custom elements）**：使用带连字符的 HTML 标签
  （如 `<page-grid>`、`<prose-content>`、`<math-display>`）替代无意义的 `<div>`
  嵌套，配合原生 CSS 选择器进行样式化。这遵循
  [HTML 规范](https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name)
  中允许的任意自定义元素命名方式。

CSS 文件按职责精细拆分：`color.css`（色彩）、`layout.css`（布局与间距）、
`fonts.css`（字体加载）、`shape.css`（圆角、阴影等工具类）、`reset.css`（浏览器
重置，来自 Tailwind Preflight 的本地副本），以及 `typography*.css` 系列（
`typography.css` 聚合块级/行内/标题/列表/表格/数学等子文件）。修改样式时请在
对应职责文件中进行。

## 构建、测试与本地开发命令

包管理器遵循**用户偏好**：仓库作者偏好 Bun（仓库包含 `bun.lock`），但以用户
当前选择的工具为准——若用户偏好 npm，则优先使用 npm 工作流。

Bun 工作流（仓库默认，含 `bun.lock`）：

- `bun install`：安装依赖。
- `bun dev`：启动 Astro 开发服务器，通常为 `http://localhost:4321`。
- `bun run build`：构建生产版本到 `dist/`，并校验 Astro 内容 schema。
- `bun run preview`：本地预览已构建的网站。
- `bun run format`：使用 Biome 格式化支持的文件。
- `bun run format:check`：只检查格式，不写入更改。
- `bun run translate -- <路径>`：翻译单篇/系列并写入 `.en.md`，见
  「i18n」小节；需 `.env` 的 `TRANSLATE_*`。
- `bun run deploy`：hexo 式部署——构建并把 `dist/` 强推到 `.env` 中
  `DEPLOY_REPO` / `DEPLOY_BRANCH` 指定的 Pages 仓库。

npm 工作流（当用户偏好 npm 时优先使用）：

- `npm install`：安装依赖。
- `npm run dev`：启动 Astro 开发服务器。
- `npm run build`：构建生产版本到 `dist/`。
- `npm run preview`：本地预览已构建的网站。
- `npm run format`：使用 Biome 格式化支持的文件。
- `npm run format:check`：只检查格式，不写入更改。
- `npm run translate -- <路径>`：翻译单篇/系列并写入 `.en.md`，见
  「i18n」小节；需 `.env` 的 `TRANSLATE_*`。
- `npm run deploy`：hexo 式部署——构建并把 `dist/` 强推到 `.env` 中
  `DEPLOY_REPO` / `DEPLOY_BRANCH` 指定的 Pages 仓库。

仓库同时跟踪 `bun.lock` 与 `package-lock.json`，两种包管理器的依赖版本均已锁定，
可放心按用户偏好选用 Bun 或 npm。

站点公开地址通过 `.env` 的 `SITE_URL` 配置（模板见 `.env.example`），`astro.config.ts`
读取它作为 `site`（sitemap / RSS / canonical 的基准 URL）。首次使用先
`cp .env.example .env` 并填写自己的域名；部署目标（`DEPLOY_REPO` / `DEPLOY_BRANCH`）
也配置在该文件中（见「部署」小节）。`.env` 已被 gitignore，也可用同名环境变量临时
覆盖（如 `SITE_URL=https://example.com npm run build`）。缺少该变量时构建会报错并
提示配置方法。

## 代码风格与命名约定

Biome 是格式化来源。配置使用 2 空格缩进、80 字符行宽、JavaScript/TypeScript 双引号，
并在语法允许时省略分号。CSS 格式化目前关闭，修改 CSS 时请保持与相邻文件一致。
Astro 组件使用 PascalCase，例如 `AuthorCard.astro`；TypeScript 工具模块使用清晰的
小写或 kebab-case，例如 `heading-anchors.ts`；内容 slug 使用 kebab-case。

### 组件与样式模式

- **默认不使用 UI 框架**（无 React、Vue、Svelte）。交互逻辑优先通过原生 Web 组件
  （`customElements.define()`）或 `<script>` 标签内联实现。若用户明确要求使用某个
  框架（例如用 Vue 做小工具），可破例引入；推荐用 `defineCustomElement` 将组件
  包装为自定义元素，以保持文章内容为纯 Markdown。
- **不使用 CSS 框架**（无 Tailwind）。样式使用自主定制元素选择器 + CSS 自定义属性。
- 页面布局使用 Utopia 12 列流体网格，通过 `--grid-max-width`、`--grid-gutter`、
  `--grid-columns` 和 `grid-column: x / y` 控制区域跨度。
- **布局（Layout）**：`<html data-layout>` 是布局的唯一信号（`sidebar`/`topbar`）；
  两种布局共用一份统一骨架（`page-shell > [page-nav, page-toc, main, page-footer]`），
  由 `:root[data-layout=…]` 作用域 CSS 呈现；访客经切换按钮运行时切换
  （`localStorage.layout`，见 `docs/superpowers/specs/2026-10-07-layout-switch-design.md`）。

## 内容与资源规范

博客文章只接受 `.md` 文件（`.mdx` 默认不被内容加载器收集，glob 为
`**/[^_]*.md`）。文章可添加为 `src/content/blog/my-post.md`，或使用
`src/content/blog/my-series/index.md` 组织系列文章。博客 frontmatter 必须包含
`title`、`description`、`date` 和 `authors`；`authors` 必须引用
`src/content/authors/` 中的作者文件（使用 `reference("authors")` 校验）。
未发布内容可使用 `_` 前缀文件名，或设置 `draft: true`。作者条目同样支持
`draft: true`：仅从 `/authors` 目录隐藏，个人页仍会生成（文章引用与链接不受
影响）。项目条目放在 `src/content/projects/`，必须包含 `name`、`description`
和 `link`。

### 系列文章（Subposts）

系列文章通过在同一目录下放置 `index.md` 和多个同级 `.md` 子文章来创建。所有子文章
渲染为**连续的单页文档**，通过 `IntersectionObserver` 在滚动时自动更新地址栏 URL。
每个子文章仍有独立 URL（如 `/blog/my-series/getting-started`），可用于深层链接。
使用 `order` frontmatter 字段控制排序。只支持一层嵌套。

### Markdown 扩展语法

- **Callout 指令**：使用 `:::note[标题]` / `:::` 语法（五种变体：`note`、`tip`、
  `warning`、`caution`、`important`），渲染为可折叠 `<details>` 元素。追加
  `{closed}` 可使 callout 默认折叠。
- **数学公式**：`$...$`（行内）和 `$$...$$`（块级），通过 Temml 渲染为浏览器原生
  MathML。
- **行内代码高亮**：使用 `` `code{:<lang>}` `` 或 `` `code{:<scope>}` `` 语法，
  例如 `` `const x = 1{:ts}` `` 按 TypeScript 高亮，`` `text{:.string}` `` 使用
  主题的字符串颜色。

## i18n（中英双语）约定

站点默认中文（根路径），英文位于 `/en/` 前缀下。英文内容以**同目录孪生文件**
提供：把中文文件加 `.en.md` 后缀即为英文版（如 `welcome/index.md` ↔
`welcome/index.en.md`），内容 id 保留该标记，例如 `v1-posts/index.en.md` →
`v1-posts.en`。blog loader 使用自定义 `generateId` 实现（默认 glob loader 会吞掉
`.en` 中的点）。图片等资产中英共用，无需复制。机器翻译产物可在 frontmatter 标
`aiTranslated: true`，文章页会按当前语言显示「AI 翻译」（zh）/「AI-translated」
（en）徽章（`PostChain` 标签取当前语言）。

`/en/` 下未翻译内容的呈现规则：

- 列表页收录全部已发布文章：未翻译条目显示中文原标题并附「Not translated yet」
  徽章，已翻译条目显示英文标题。
- 无译文的文章 URL（`/en/blog/<id>`）渲染提示页：`noindex`、canonical 指回中文
  原文，并提供回链。
- 系列中未翻译的子文章在英文系列页渲染占位锚点，其独立 URL 渲染所属系列页；
  仅当整个系列均无任何已翻译节点时，该系列全部 URL（父与子）才统一渲染提示页。

draft 与 `_` 前缀语义沿用中文侧规则：`draft: true` 的文章不进入列表与路由；`_`
前缀文件不被内容加载器收集（约定仅用于中文草稿）；英文孪生条目为 draft 时按
「未翻译」处理。

作者页（`/authors/<id>`）列中文署名作品；仅英文译文署名（如 AI 服务商）的译作
会补充列出——链到 `/en/blog/<id>`，`aiTranslated` 时带「AI 翻译」徽章；同一作品
只列一次（中文已署名时优先链中文原文）。

`src/lib/i18n.ts` 是语言工具的唯一来源：

- `localeOf(id)` / `baseId(id)`：解析内容 id 的语言与基础 id（中英配对键）。
- `localeFromPath(pathname)`：由站点路径判定语言（`/en` 前缀 → en）。
- `localePath(path, locale)` / `stripLocalePath(pathname)`：为站点路径加/剥
  `/en` 前缀（如 `/en/blog` ↔ `/blog`）。
- `t(locale, key)`：界面文案字典（`UI_STRINGS`），新增界面文字需同时补 `zh` 与
  `en` 两份。

i18n 回归检查：`bash scripts/tests/i18n-check.sh` —— 临时写入受控 `.env` 后构建，
再对 `dist/` 输出逐条断言（中文基线、英文路由、未翻译呈现、切换器、SEO/RSS/
sitemap），修改 i18n 相关代码后必须全绿。

翻译工作流：`npm run translate -- <文件或系列目录> [--to en] [--force] [--dry-run]`
读取 `.env` 的 `TRANSLATE_*`（模板见 `.env.example`）；保结构翻译并在写盘前做
结构校验，失败译文与差异清单落 `.translate/`（已 gitignore）。无 draft 门禁，
`git diff` 即审校；译文自动标 `aiTranslated: true`，手写 `.en.md` 仍然有效。
可选 `TRANSLATE_AUTHOR=<slug>`（取值 = `src/content/authors/` 下的文件名，如
`deepseek`）把 AI 服务商追加为英文译文作者（仅 `.en.md`，系列全部文件；作者
文件缺失仅警告、照常署名，由构建引用校验兜底）。

### dev 翻译按钮

`astro dev` 下中文文章页右下角有「翻译成英文」浮动按钮（模式同 Moment
Composer，生产构建零痕迹）：点击实时检测译文状态——无译文给「生成」，
已有译文给「继续（跳过已有）」「全部覆盖」「查看」；系列按整组、独立文章按
单篇。经 dev 端点 spawn `scripts/translate.mjs` 执行，进度在终端可见。
内容根默认 `src/content/blog/`，可用 `TRANSLATE_DEV_CONTENT_ROOT` 覆盖
（测试隔离用）。回归：`bash scripts/tests/translate-ui-check.sh`。

## 测试与验证指南

测试脚本位于 `scripts/tests/`（部署干跑 `deploy-check.sh`、i18n 回归
`i18n-check.sh`、翻译脚本离线桩 `translate-check.sh`）。提交前至少运行
`bun run format:check` 和 `bun run build`。
若只使用 npm 工作流，对应命令为 `npm run format:check` 和 `npm run build`。
涉及可视样式、排版或路由变化时，请在本地开发服务器中手动检查相关页面。

部署脚本另有干跑校验：`bash scripts/tests/deploy-check.sh` —— 在 `/tmp` 临时 bare 仓库上覆盖全流程与错误路径（不触碰真实 Pages 仓库；测试期间临时使用受控 `.env`，退出时恢复原文件），运行前需已安装依赖。

翻译脚本另有离线桩校验：`bash scripts/tests/translate-check.sh` ——
覆盖发现/分块/校验/重试等路径，无需真实 API key。

## 部署（hexo 式）

部署复刻 hexo-deployer-git 的方式，不经 GitHub Actions：本机 `npm run deploy`（或
`bun run deploy`）= `astro build` + `scripts/deploy.sh`。

- **机制**：`scripts/deploy.sh` 把目标仓库克隆为项目根的 `.deploy_git/` 缓存目录；
  每次部署先与远端目标分支对齐，清空（保留 `.git`）后把 `dist/` 全量拷入，提交
  `Site updated: <时间>`，再以 `git push --force` 推送。repo-b 是纯产物仓库，
  不要在网页端直接修改。
- **配置**：`.env` 中的 `DEPLOY_REPO` / `DEPLOY_BRANCH`（模板见 `.env.example`；
  `.env` 不入库，部署目标不随仓库提交）。同名环境变量可临时覆盖（演练用），但不能
  替代 `.env` 中的定义。
- **重置**：`rm -rf .deploy_git`，下次部署会自动重新克隆。
- **首次一次性设置**：
  1. 在 GitHub 新建空仓库（如 `zingrigger.github.io`）；
  2. 首次部署后到 repo-b 的 Settings → Pages → Deploy from a branch → `main` /
     `(root)`；
  3. 按需启用 Enforce HTTPS。
- **后续绑定自定义域名**（如 `xxx.blog`）：
  1. `public/CNAME` 写入域名并部署；
  2. 在 `.env` 中把 `SITE_URL` 改为新域名并部署（见 `.env.example`）；
  3. Cloudflare 添加 `xxx.blog → zingrigger.github.io` 的 CNAME 记录（证书签发期间
     建议「仅 DNS」），并在 repo-b Settings 填写 Custom domain、启用 HTTPS。
  之所以 CNAME 必须放在源码里：部署是全量覆盖，GitHub 设置生成的 `CNAME` 文件会被
  下次部署清掉（hexo 文档同款说明）。

## 提交与 Pull Request 指南

当前 Git 历史只有初始提交，尚未形成严格提交规范。建议使用简短的祈使句提交信息，
例如 `Add author profile` 或 `Fix RSS metadata`。Pull Request 应说明变更内容、
影响的页面或内容集合，关联相关 issue；涉及 UI、排版或图片变更时附截图。提交评审前
确保格式检查和构建通过。

## Markdown 处理管线

本项目使用 **[Sätteri](https://satteri.bruits.org/)** 作为 Markdown 处理器
（Rust 编写），配置在 `astro.config.ts` 的 `markdown.processor` 中。不使用传统的
unified/remark/rehype 插件生态。

所有 Markdown 处理插件都是 `src/lib/` 中的自定义模块，作为 Sätteri 的 MDAST 或
HAST 插件运行：

| 插件文件 | 类型 | 功能 |
| - | - | - |
| `callout.ts` | MDAST | 将 `:::` 指令转换为 `<details>` callout |
| `math.ts` | MDAST | 将 `$...$` / `$$...$$` 通过 Temml 转为 MathML |
| `expressive-code/inline.ts` | MDAST | 行内代码语法高亮 |
| `expressive-code/index.ts` | HAST | 代码块语法高亮（Expressive Code） |
| `external-links.ts` | HAST | 为外部链接添加 `target="_blank"` 等属性 |
| `heading-namespace.ts` | HAST | 系列文章中的标题 ID 命名空间化 |
| `heading-anchors.ts` | HAST | 为标题添加可点击的锚点链接 |

如需添加新的 Markdown 功能，应编写 Sätteri 插件而非安装 remark/rehype 插件。
参考现有插件作为实现模板。

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
