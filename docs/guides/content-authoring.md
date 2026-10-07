# 内容编写指南

本指南覆盖五类内容的编写方式：博客文章、系列文章（Subposts）、作者、项目与动态（Moments）。
所有内容都是 Markdown 文件，frontmatter 由 `src/content.config.ts` 中的 Zod schema 在构建时校验。

## 博客文章

放在 `src/content/blog/` 下，两种组织形式均可：

- 单文件：`src/content/blog/my-post.md`
- 文件夹（便于与图片等资源放在一起）：`src/content/blog/my-post/index.md`

### Frontmatter 示例

```yml
---
title: "文章标题"
description: "一句话摘要（建议 ≤155 字符）"
date: 2026-01-01
authors:
  - enscribe
image: ./assets/banner.png
tags:
  - tag1
  - tag2
---
```

### 字段参考

| 字段           | 类型（Zod）              | 说明                                                                                        | 必填 |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------- | ---- |
| `title`        | `string`                 | 建议 ≤60 字符                                                                               | 是   |
| `description`  | `string`                 | 建议 ≤155 字符                                                                              | 是   |
| `date`         | `coerce.date()`          | `YYYY-MM-DD` 格式                                                                           | 是   |
| `order`        | `number`                 | 系列内排序，缺省为 0                                                                        | 否   |
| `tags`         | `string[]`               | 建议 kebab-case                                                                             | 否   |
| `authors`      | `reference("authors")[]` | 每个条目必须匹配 `src/content/authors/` 中的文件名（不含扩展名），构建时校验                 | 是   |
| `image`        | `image()`                | 建议 1200×630                                                                               | 否   |
| `draft`        | `boolean`                | 缺省 `false`；为 `true` 时不进入列表与路由                                                  | 否   |
| `aiTranslated` | `boolean`                | 标记机器译文（文章页显示「AI 翻译」徽章）；由翻译脚本自动写入，手写译文不必设置              | 否   |

> 文件名以 `_` 前缀（如 `_draft.md`）的文件不会被内容加载器收集；`.mdx` 同样不被收集
> （glob 为 `**/[^_]*.md`）。未发布内容也可以用 `_` 前缀或 `draft: true` 隐藏。

## 系列文章（Subposts）

在同一目录下放置 `index.md` 与多个同级子文章即可构成系列：

```
src/content/blog/
├── a-standalone-post.md
└── my-series/
    ├── index.md
    ├── getting-started.md
    └── going-further.md
```

- 整个系列渲染为一篇**连续文档**，滚动时地址栏会自动同步到当前子文章的 URL。
- 每个子文章仍有独立 URL（如 `/blog/my-series/getting-started`），可用于深层链接。
- 用 `order` frontmatter 字段控制排序。
- 只支持一层嵌套，更深的文件会被忽略。

## 作者

`src/content/authors/` 下的 Markdown 文件即作者条目。文件名（不含扩展名）就是 id，
被文章 frontmatter 的 `authors` 字段引用：

```yml
---
name: "enscribe"
pronouns: "he/him"
avatar: "https://avatars.githubusercontent.com/u/71956291?v=4"
bio: "d(-_-)b"
mail: "jason@enscribe.dev"
socials:
  website: "https://enscribe.dev"
  twitter: "https://twitter.com/enscrbe"
  github: "https://github.com/jktrn"
---
```

| 字段       | 类型（Zod）                              | 说明                                                                                                       | 必填 |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| `name`     | `string`                                 | —                                                                                                          | 是   |
| `pronouns` | `string`                                 | —                                                                                                          | 否   |
| `avatar`   | `url()` 或以 `/` 开头的路径              | 完整 URL，或 `public/` 下路径                                                                              | 是   |
| `bio`      | `string`                                 | —                                                                                                          | 否   |
| `mail`     | `email()`                                | —                                                                                                          | 否   |
| `socials`  | `record(string, url())`                  | 键名匹配 `src/components/SocialIcons.astro` 中的图标；自定义标签需补图标                                    | 否   |
| `draft`    | `boolean`                                | 为 `true` 时仅从 `/authors` 列表隐藏，个人页仍会生成（文章引用与链接不受影响）                              | 否   |

## 项目

`src/content/projects/` 下的 Markdown 文件：

```yml
---
name: "Project A"
description: "项目描述"
tags: ["Framework A", "Library B", "Tool C"]
image: "./placeholder.png"
link: "https://example.com"
startDate: "2024-01-01"
endDate: "2024-02-01"
---
```

| 字段          | 类型（Zod）      | 说明                    | 必填 |
| ------------- | ---------------- | ----------------------- | ---- |
| `name`        | `string`         | —                       | 是   |
| `description` | `string`         | —                       | 是   |
| `link`        | `url()`          | 合法 URL                | 是   |
| `tags`        | `string[]`       | —                       | 否   |
| `image`       | `image()`        | 建议 1200×630           | 否   |
| `startDate`   | `coerce.date()`  | `YYYY-MM-DD` 格式       | 否   |
| `endDate`     | `coerce.date()`  | `YYYY-MM-DD` 格式       | 否   |

## 动态（Moments）

`src/content/moments/` 下的 Markdown 文件，是轻量短内容：随手的想法、照片、阅读进度、
项目状态等。无标题，Markdown 正文即内容。

### Frontmatter 示例

```md
---
date: 2026-07-30 08:15
tags: [reading, distributed-systems]
link:
  url: https://example.com/book
  title: "书名 — 作者"
  thumbnail: ./cover.png
---

正在读这本书，读到第三章。
```

| 字段   | 类型（Zod）                    | 说明                                                                     | 必填 |
| ------ | ------------------------------ | ------------------------------------------------------------------------ | ---- |
| `date` | `coerce.date()`                | 支持 `YYYY-MM-DD`；也可带时间（如 `2026-07-30 08:15`），用于同日多条排序 | 是   |
| `tags` | `string[]`                     | 与博客文章共用标签体系（`/tags`）                                        | 否   |
| `link` | `{ url, title?, thumbnail? }`  | 可选链接预览卡片（如分享书籍、仓库时）                                   | 否   |
| `draft`| `boolean`                      | 缺省 `false`                                                             | 否   |

### 约定与细节

- 文件名约定 `YYYY-MM-DD-NN`（如 `2026-07-30-01`），`NN` 为当日序号，也是 URL slug
  和排序依据；`npm run dev` 下的 dev 发布器会自动按此规则命名。
- 图片用行内 Markdown（`![](...)`）插入，不是结构化字段。
- 标签共享博客体系；时间线每页 20 条；不进入 RSS 订阅。
- dev 发布器的正文上限为 2000 字符，手工编写不受此限制（schema 未做长度校验）。
