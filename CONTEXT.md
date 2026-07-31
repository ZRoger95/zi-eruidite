# Domain Glossary

## Site Background

- **Background Image** — a site-wide CSS background applied to the `<body>`, configured via `SITE.background`. Disabled by default (no config entry). Supports internal paths under `public/` and external URLs.
- **Background Color** — a CSS color string as an alternative to a background image. Mutually exclusive with image (image wins if both set).
- **Background Style** — how the image is rendered: `"cover"` (fills viewport, may crop), `"tile"` (repeats to fill), `"contain"` (fits without cropping).
- **Background Opacity** — a number 0–1 controlling the opacity of the background. Applies to both image and color modes. No overlay layer.

## Content Types

- **Blog Post（博客文章）** — long-form article with a required title, description, authors, and date. Supports series/subposts.
- **Project（项目）** — a portfolio entry with name, description, link, and optional date range.
- **Author（作者）** — a person who writes Blog Posts. Has name, avatar, bio, and social links.
- **Moment（动态）** — a personal, lightweight, short-form content entry: a fleeting thought, a photo, a reading update, a project status, or a quick share. Key properties:
  - No title — the Markdown body is the content.
  - No author field — Moments are always personal (single-author site).
  - Displayed chronologically in a timeline feed with date separators.
  - Each Moment has its own detail page (for shareable URLs).
  - Slugs are date-based: `YYYY-MM-DD-NN` (e.g. `2026-07-30-01`).
  - Tags are optional and share the same tag namespace as Blog Posts.
  - An optional link preview card (`link`) can be attached (e.g. for book or repo shares).
  - Images are inline Markdown (`![]()`), not structured frontmatter fields.
  - No interactive actions (like/comment/reshare) — static display only.
  - Paginated at 20 items per page. No RSS feed.
  - Not shown on the homepage by default; can be opted in via `SITE.momentsOnHome`.
- **Moment Link Preview（链接预览卡片）** — an optional structured attachment to a Moment, containing a URL, title, and optional thumbnail image. Rendered as a rich card below the Moment body.

## Routes

- `/blog` — Blog Post listing.
- `/blog/[...id]` — Blog Post detail (supports subpost paths).
- `/moments` — Moment timeline listing (paginated, with date separators).
- `/moments/[...id]` — Moment detail page.
- `/tags` — tag index across Blog Posts and Moments.
- `/tags/[...id]` — content filtered by tag (both Blog Posts and Moments).
- `/projects` — Project listing.
- `/authors` — Author listing.
- `/authors/[...id]` — Author detail.

## Layout

- **Topbar Layout** — a site layout mode where global navigation is placed in a centered top navigation bar and primary page content uses a centered reading column across main pages, not only individual blog posts.
- **Article Header Display** — the wider, centered top portion of a blog article in Topbar Layout, containing breadcrumbs, the banner image, title, and metadata before the narrower reading column begins.

## Editing / Production

- **Moment Composer（动态发布器）** — an authoring bar at the top of the `/moments` timeline that exists only in the editing environment (`astro dev`). It lets the author type plain-text Markdown and create a new Moment by writing a file under `src/content/moments/`. In the production build it is absent entirely — no markup, no endpoint, no requests — rather than hidden.
- **发布动态（publish a Moment）** — the act of creating a new Moment through the Moment Composer. It is an authoring action performed while editing the repository, not a social-platform-style "posting".
- **Editing environment（编辑环境）** — the local `astro dev` state; the only place the Moment Composer exists. Contrast with the **production site（生产站点）**, the output of `astro build` / `astro preview`, which never includes the composer.
