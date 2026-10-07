# zi-erudite

[English](README.en.md) ｜ 中文

zi-erudite 是基于 [enscribe](https://enscribe.dev) 的
[astro-erudite](https://github.com/jktrn/astro-erudite)（MIT）演化的个人站点：
保留原模板的全部能力——原生 CSS 设计系统、Rust 实现的 Sätteri Markdown 处理器、
无 UI / CSS 框架、极少依赖——并新增动态（Moments）、中英双语与 AI 翻译、
站点外观配置与 hexo 式部署。

## 特性

- 完全基于原生 CSS 的设计系统：Utopia 流体字号 / 间距、Radix Colors 明暗自适应、
  自主定制元素（`<page-grid>`、`<prose-content>` 等）替代无意义的 div 嵌套。
- [Sätteri](https://satteri.bruits.org/) Markdown 处理器（Rust 编写）。
- [Expressive Code](https://expressive-code.com/) 代码块高亮，行内代码支持
  `` `code{:lang}` `` 注解。
- LaTeX 数学公式渲染为浏览器原生 MathML（[Temml](https://temml.org/)）。
- 系列文章（Subposts）：整组渲染为连续文档，每篇保留独立 URL。
- 响应式目录（scrollspy 高亮）与可点击的标题锚点。
- GitHub 风格 Callout（`:::` 指令，五种变体、可折叠、零 JavaScript）。
- 每篇文章可精细控制 SEO / Open Graph 元数据；RSS 与 sitemap 生成。
- 作者页与多作者支持；标签体系（博客与动态共用）。
- **双布局**：`sidebar`（默认，两栏 + 侧边栏）与 `topbar`（顶部导航 + 居中阅读栏）。
- **外观配置**：首页头像、全站背景图 / 背景色（见「站点定制」）。
- **动态（Moments）**：时间线 + 活跃图 + 开发环境发布器。
- **中英双语与 AI 翻译**：孪生文件机制 + 翻译脚本 + dev 翻译按钮。
- **hexo 式部署**：`npm run deploy` 一键构建并强推到 Pages 仓库。

## 快速开始

需要 Node.js ≥ 22.12；npm 与 Bun 均可（仓库同时锁定 `package-lock.json` 与
`bun.lock`）。

1. 克隆仓库（或以此为模板创建自己的仓库）：

   ```bash
   git clone https://github.com/[YOUR_USERNAME]/[YOUR_REPO_NAME].git
   cd [YOUR_REPO_NAME]
   ```

2. 安装依赖：

   ```bash
   npm install
   # 或：bun install
   ```

3. 配置环境变量——复制模板并至少填写 `SITE_URL`（sitemap / RSS / canonical 的
   基准 URL）：

   ```bash
   cp .env.example .env
   ```

   缺少 `SITE_URL` 时构建会报错并提示配置方法；部署与翻译所需变量见对应小节。

4. 启动开发服务器并打开 `http://localhost:4321`：

   ```bash
   npm run dev
   ```

### 常用命令

| 命令                                      | 说明                                        |
| ----------------------------------------- | ------------------------------------------- |
| `npm run dev`                             | 启动开发服务器（`localhost:4321`）          |
| `npm run build`                           | 构建生产版到 `dist/`（同时校验内容 schema） |
| `npm run preview`                         | 本地预览构建产物                            |
| `npm run format` / `npm run format:check` | Biome 格式化 / 仅检查                       |
| `npm run translate -- <路径>`             | 把中文文章或系列翻译为英文 `.en.md`         |
| `npm run deploy`                          | 构建 + 部署到 Pages 仓库（hexo 式）         |
| `npm run astro`                           | 运行任意 Astro CLI 命令                     |

使用 Bun 时把 `npm run` 换成 `bun run`（如 `bun dev`、`bun run build`）。

## 站点定制（src/consts.ts）

站点元数据、首页外观与导航都在 `src/consts.ts` 中配置，无需改动组件：

```ts
export const SITE = {
  title: "astro-erudite",
  description: "An opinionated, unstyled blogging template built with Astro.",
  dir: "ltr",
  defaultPageImage: "/static/opengraph-image.png", // 默认 OG 图片
  defaultPostImage: "/static/1200x630.png", // 文章默认封面
  avatar: undefined, // 首页 hero 头像
  layout: "sidebar", // "sidebar" | "topbar"
  background: undefined, // 全站背景（图或色）
  momentsOnHome: undefined, // 首页动态条数，如 { count: 3 }
  hero: {
    // 首页问候段落，zh / en 各一组
  },
}
```

- **头像**：`avatar` 填 `public/` 下的路径（如 `/static/avatar.jpg`）或完整 URL；
  `undefined` 时不显示。
- **背景**：`background` 支持图片或颜色两种模式，通常二选一：

  ```ts
  // 背景图
  background: {
    image: "/static/bg.jpg", // public/ 下路径或完整 URL
    style: "cover", // "cover" | "tile" | "contain"，默认 cover
    opacity: 0.8, // 0–1，默认 1
  },
  // 背景色
  background: { color: "#f6f6f6", opacity: 0.5 },
  ```

- **布局**：`layout` 是默认布局——`"sidebar"`（两栏 + 侧边栏）或
  `"topbar"`（顶栏居中阅读列）；站点在主题/语言按钮旁提供**布局切换按钮**，
  访客可随时切换，偏好存于浏览器，首次访问使用该默认值。
- **首页**：`hero` 按语言给出问候段落（逐段渲染）；`momentsOnHome: { count: N }`
  在首页展示最新 N 条动态。
- **导航与社交**：

  ```ts
  export const NAVIGATION = [
    { key: "navBlog", href: "/blog", bilingual: true }, // bilingual 链接有 /en 镜像
    { key: "navMoments", href: "/moments" },
    // ...
  ]

  export const SOCIALS = [
    { href: "https://github.com/you", label: "GitHub", icon: GitHub },
    // ...
  ]
  ```

  导航文案取自界面文案字典（`key`，见 `src/lib/i18n.ts`）；社交图标从
  `src/assets/icons/` 导入，自定义标签需在 `src/components/SocialIcons.astro`
  中补图标。

站点公开地址由 `.env` 的 `SITE_URL` 提供，用于 sitemap / RSS / canonical URL。

## 内容

内容都放在 `src/content/` 下，frontmatter 由 Zod schema 在构建时校验：

- **博客文章**：`src/content/blog/` 下的 `.md`（或文件夹 `index.md`），必填
  `title`、`description`、`date`、`authors`。
- **系列文章**：同目录 `index.md` + 同级子文章，渲染为连续文档。
- **作者**：`src/content/authors/`；**项目**：`src/content/projects/`；
  **动态**：`src/content/moments/`。

字段表与完整约定见 [内容编写指南](docs/guides/content-authoring.md)；
Markdown 扩展语法（Callout、数学、行内代码高亮）见
[Markdown 扩展语法](docs/guides/markdown-extensions.md)。

## 动态（Moments）

Moments 是短形式的「动态」流：随手记录的想法、照片、阅读进度或项目状态。
无标题，Markdown 正文即内容，可挂一张可选的链接预览卡片，标签与博客共用。

- **时间线**：`/moments` 倒序展示，按日期分隔（今天 / 昨天 / 前天），每页 20 条；
  每条动态有自己的详情页，slug 形如 `2026-07-30-01`。
- **活跃图**：GitHub 贡献图风格，按自然年展示发布分布，可切换年份、悬停查看
  当日数量。
- **发布器**：`npm run dev` 打开 `/moments`，时间线顶部会出现输入栏——写好内容后
  ⌘⏎（Windows / Linux 为 Ctrl⏎）即发布，直接写入
  `src/content/moments/YYYY-MM-DD-NN.md`。发布器只在开发环境存在，生产构建零痕迹。
- **首页展示**：设置 `SITE.momentsOnHome = { count: N }` 展示最新动态。

手工编写动态的格式见 [内容编写指南](docs/guides/content-authoring.md)。

## 中英双语与 AI 翻译

- 站点默认中文（根路径），英文在 `/en/`；顶部导航提供语言切换。
- 英文内容为同目录孪生文件：`welcome/index.md` ↔ `welcome/index.en.md`；
  图片等资源中英共用。
- 未翻译不缺失：英文列表页显示中文标题并附「Not translated yet」徽章；无译文的
  `/en/blog/<id>` 渲染提示页（noindex、canonical 指回中文原文）。
- **翻译脚本**：
  `npm run translate -- <文件或系列目录> [--to en] [--force] [--dry-run]`，
  保结构翻译并在写盘前做结构校验。需在 `.env` 配置 OpenAI 兼容端点：

  ```bash
  TRANSLATE_BASE_URL=   # DeepSeek / OpenAI 等兼容端点的基地址
  TRANSLATE_API_KEY=
  TRANSLATE_MODEL=
  ```

  译文自动标 `aiTranslated: true`（显示「AI 翻译」徽章），`git diff` 即审校。
- **dev 翻译按钮**：`npm run dev` 下打开中文文章，右下角有「翻译成英文」浮动按钮；
  无译文可「生成」，有译文可「继续（跳过已有）/ 全部覆盖 / 查看」；系列按整组翻译，
  进度在终端可见；生产构建零痕迹。

完整规则（语言工具函数、未翻译呈现细节、回归测试）见
[国际化与翻译](docs/guides/i18n.md)。

## 部署（hexo 式）

`npm run deploy` = 构建 + 把 `dist/` 全量强推到 Pages 仓库（不经 GitHub Actions）：

1. `.env` 配置 `DEPLOY_REPO`（如 `git@github.com:<user>/<user>.github.io.git`）与
   `DEPLOY_BRANCH`。
2. 首次部署后到目标仓库 Settings → Pages 选择分支根目录，按需启用 HTTPS。
3. 自定义域名：把域名写入 `public/CNAME`、把 `SITE_URL` 改为该域名后再次部署
   （CNAME 必须随源码提交，否则全量部署会清掉）。

部署脚本复用 `.deploy_git/` 缓存；`rm -rf .deploy_git` 可重置。演练（不触碰真实
仓库）：`bash scripts/tests/deploy-check.sh`。全流程见
[部署指南](docs/guides/deployment.md)。

## 文档导航

- [内容编写指南](docs/guides/content-authoring.md) —— 博客 / 系列 / 作者 / 项目 /
  动态的字段与写法
- [Markdown 扩展语法](docs/guides/markdown-extensions.md) —— Callout、数学、
  行内代码高亮
- [外观定制](docs/guides/visual-customization.md) —— 配色与 favicon
- [国际化与翻译](docs/guides/i18n.md) —— 双语结构与翻译工作流
- [部署指南](docs/guides/deployment.md) —— hexo 式部署全流程
- [AGENTS.md](AGENTS.md) / [CONTEXT.md](CONTEXT.md) —— 仓库结构、样式系统与领域术语

## License 与致谢

本项目基于 [enscribe](https://enscribe.dev) 的
[astro-erudite](https://github.com/jktrn/astro-erudite) 构建，
以 [MIT License](LICENSE) 开源。
