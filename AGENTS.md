# Repository Guidelines

## 项目结构与模块组织

这是一个基于 Astro 的静态站点。主要代码位于 `src/`：页面路由在
`src/pages/`，可复用 Astro 组件在 `src/components/`，共享工具函数在
`src/lib/`，页面布局在 `src/layouts/`，全局样式在 `src/styles/`。内容集合位于
`src/content/`，包含 `blog/`、`projects/` 和 `authors/`，对应 schema 定义在
`src/content.config.ts`。字体资源放在 `src/assets/fonts/`；favicon、manifest 等静态
公共文件放在 `public/`。

## 构建、测试与本地开发命令

仓库包含 `bun.lock`，因此首选 Bun：

- `bun install`：安装依赖。
- `bun dev`：启动 Astro 开发服务器，通常为 `http://localhost:4321`。
- `bun run build`：构建生产版本到 `dist/`，并校验 Astro 内容 schema。
- `bun run preview`：本地预览已构建的网站。
- `bun run format`：使用 Biome 格式化支持的文件。
- `bun run format:check`：只检查格式，不写入更改。

也可以使用 npm 执行同名脚本，例如 `npm run dev`、`npm run build`、
`npm run format:check`。但当前仓库没有 `package-lock.json`，若团队希望保持锁文件
一致，依赖安装仍建议使用 Bun，或先统一切换到 npm 并提交 `package-lock.json`。

## 代码风格与命名约定

Biome 是格式化来源。配置使用 2 空格缩进、80 字符行宽、JavaScript/TypeScript 双引号，
并在语法允许时省略分号。CSS 格式化目前关闭，修改 CSS 时请保持与相邻文件一致。
Astro 组件使用 PascalCase，例如 `AuthorCard.astro`；TypeScript 工具模块使用清晰的
小写或 kebab-case，例如 `heading-anchors.ts`；内容 slug 使用 kebab-case。

## 内容与资源规范

博客文章可添加为 `src/content/blog/my-post.md`，或使用
`src/content/blog/my-series/index.md` 组织系列文章。博客 frontmatter 必须包含
`title`、`description`、`date` 和 `authors`；`authors` 必须引用
`src/content/authors/` 中的作者文件。未发布内容可使用 `_` 前缀文件名，或设置
`draft: true`。项目条目放在 `src/content/projects/`，必须包含 `name`、
`description` 和 `link`。

## 测试与验证指南

当前没有独立测试脚本。提交前至少运行 `bun run format:check` 和 `bun run build`。
若只使用 npm 工作流，对应命令为 `npm run format:check` 和 `npm run build`。
涉及可视样式、排版或路由变化时，请在本地开发服务器中手动检查相关页面。

## 提交与 Pull Request 指南

当前 Git 历史只有初始提交，尚未形成严格提交规范。建议使用简短的祈使句提交信息，
例如 `Add author profile` 或 `Fix RSS metadata`。Pull Request 应说明变更内容、
影响的页面或内容集合，关联相关 issue；涉及 UI、排版或图片变更时附截图。提交评审前
确保格式检查和构建通过。

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
