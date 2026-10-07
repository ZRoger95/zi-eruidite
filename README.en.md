# zi-erudite

English ｜ [中文](README.md)

zi-erudite is a personal site evolved from [enscribe](https://enscribe.dev)'s
[astro-erudite](https://github.com/jktrn/astro-erudite) (MIT). It keeps everything the
original template offers — a design system built entirely on native CSS, the Rust-powered
[Sätteri](https://satteri.bruits.org/) Markdown processor, no UI or CSS framework, and
minimal dependencies — and adds Moments, zh/en bilingual support with an AI translation
workflow, site appearance configuration, and hexo-style deployment.

## Features

- A design system built entirely on native CSS: Utopia fluid type/space scales, Radix
  Colors with automatic light/dark pairs, and autonomous custom elements (`<page-grid>`,
  `<prose-content>`, …) instead of meaningless div nesting.
- [Sätteri](https://satteri.bruits.org/) Markdown processor (written in Rust).
- [Expressive Code](https://expressive-code.com/) for code blocks; inline code supports
  `` `code{:lang}` `` annotations.
- LaTeX math rendered to browser-native MathML via [Temml](https://temml.org/).
- Subposts: a series renders as one continuous document while every part keeps its own
  URL.
- Responsive table of contents (scrollspy) and clickable heading anchors.
- GitHub-style callouts (`:::` directives, five variants, collapsible, zero JavaScript).
- Per-post SEO / Open Graph metadata control; RSS feed and sitemap generation.
- Author pages with multi-author support; a tag system shared by posts and moments.
- **Two layouts**: `sidebar` (default, two columns + sidebar) and `topbar` (top
  navigation + centered reading column).
- **Appearance config**: homepage avatar, site-wide background image/color (see "Site
  configuration").
- **Moments**: timeline + activity graph + a dev-only composer.
- **zh/en bilingual with AI translation**: twin-file mechanism, translation script, dev
  translate button.
- **hexo-style deployment**: `npm run deploy` builds and force-pushes to your Pages
  repository.

## Getting started

Requires Node.js ≥ 22.12; both npm and Bun work (the repo locks both `package-lock.json`
and `bun.lock`).

1. Clone the repository (or create your own repo from this template):

   ```bash
   git clone https://github.com/[YOUR_USERNAME]/[YOUR_REPO_NAME].git
   cd [YOUR_REPO_NAME]
   ```

2. Install dependencies:

   ```bash
   npm install
   # or: bun install
   ```

3. Set up environment variables — copy the template and at least fill in `SITE_URL`
   (the base URL for sitemap / RSS / canonical URLs):

   ```bash
   cp .env.example .env
   ```

   The build fails with a configuration hint when `SITE_URL` is missing. Deployment and
   translation variables are covered in their sections below.

4. Start the dev server and open `http://localhost:4321`:

   ```bash
   npm run dev
   ```

### Commands

| Command                                   | Description                                          |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                             | Start the dev server (`localhost:4321`)              |
| `npm run build`                           | Build for production to `dist/` (validates content)  |
| `npm run preview`                         | Preview the built site locally                       |
| `npm run format` / `npm run format:check` | Format with Biome / check only                       |
| `npm run translate -- <path>`             | Translate a Chinese post/series into English `.en.md` |
| `npm run deploy`                          | Build + deploy to the Pages repo (hexo-style)        |
| `npm run astro`                           | Run any Astro CLI command                            |

With Bun, replace `npm run` with `bun run` (e.g. `bun dev`, `bun run build`).

## Site configuration (`src/consts.ts`)

Site metadata, homepage appearance and navigation all live in `src/consts.ts` — no
component changes needed:

```ts
export const SITE = {
  title: "astro-erudite",
  description: "An opinionated, unstyled blogging template built with Astro.",
  dir: "ltr",
  defaultPageImage: "/static/opengraph-image.png", // default OG image
  defaultPostImage: "/static/1200x630.png", // fallback post cover
  avatar: undefined, // homepage hero avatar
  layout: "sidebar", // "sidebar" | "topbar"
  background: undefined, // site-wide background (image or color)
  momentsOnHome: undefined, // e.g. { count: 3 } to show moments on the homepage
  hero: {
    // homepage greeting paragraphs, one set per locale (zh / en)
  },
}
```

- **Avatar**: point `avatar` at a path under `public/` (e.g. `/static/avatar.jpg`) or a
  full URL; `undefined` hides it.
- **Background**: `background` supports image or color mode, usually one of the two:

  ```ts
  // image
  background: {
    image: "/static/bg.jpg", // path under public/ or a full URL
    style: "cover", // "cover" | "tile" | "contain", default "cover"
    opacity: 0.8, // 0–1, default 1
  },
  // color
  background: { color: "#f6f6f6", opacity: 0.5 },
  ```

- **Layout**: `layout` sets the default site layout — `"sidebar"` (two-column
  with sidebar) or `"topbar"` (centered reading column with a top bar). Visitors
  can switch layouts anytime via the toggle next to the theme/language buttons;
  the choice is stored in the browser, and this config is the first-visit default.
- **Homepage**: `hero` provides greeting paragraphs per locale (rendered paragraph by
  paragraph); `momentsOnHome: { count: N }` shows the latest N moments on the homepage.
- **Navigation & socials**:

  ```ts
  export const NAVIGATION = [
    { key: "navBlog", href: "/blog", bilingual: true }, // bilingual → gets an /en twin
    { key: "navMoments", href: "/moments" },
    // ...
  ]

  export const SOCIALS = [
    { href: "https://github.com/you", label: "GitHub", icon: GitHub },
    // ...
  ]
  ```

  Nav labels come from the UI string dictionary (`key`, see `src/lib/i18n.ts`); social
  icons are imported from `src/assets/icons/`, and custom labels need an icon added in
  `src/components/SocialIcons.astro`.

The public site URL comes from `SITE_URL` in `.env`, used for sitemap / RSS / canonical
URLs.

## Content

All content lives under `src/content/`, with frontmatter validated by Zod schemas at
build time:

- **Blog posts**: `.md` files under `src/content/blog/` (or a folder `index.md`);
  `title`, `description`, `date` and `authors` are required.
- **Series (subposts)**: an `index.md` plus sibling subposts in the same folder, rendered
  as one continuous document.
- **Authors**: `src/content/authors/`; **Projects**: `src/content/projects/`;
  **Moments**: `src/content/moments/`.

See the [content authoring guide](docs/guides/content-authoring.md) for the full field
tables, and the [Markdown extensions guide](docs/guides/markdown-extensions.md) for
callouts, math and inline-code highlighting. (Both guides are written in Chinese.)

## Moments

Moments are short-form entries — a fleeting thought, a photo, a reading update, a project
status. No title; the Markdown body is the content. An optional link preview card can be
attached, and tags are shared with blog posts.

- **Timeline**: `/moments` lists entries in reverse chronological order with date
  separators (today / yesterday / the day before), 20 per page; each moment has its own
  detail page with a slug like `2026-07-30-01`.
- **Activity graph**: a GitHub-contribution-style graph of the current natural year, with
  a year switcher and hover counts.
- **Composer**: run `npm run dev` and open `/moments` — a composer bar appears above the
  timeline. Write your content and press ⌘⏎ (Ctrl⏎ on Windows/Linux) to publish; it
  writes `src/content/moments/YYYY-MM-DD-NN.md` directly. The composer exists in the dev
  environment only — zero trace in production builds.
- **Homepage**: set `SITE.momentsOnHome = { count: N }` to show the latest moments.

For the file format, see the [content authoring guide](docs/guides/content-authoring.md).

## Bilingual i18n & AI translation

- Chinese is the default locale (root paths); English lives under `/en/`, with a language
  switch in the top navigation.
- English content is provided as twin files: `welcome/index.md` ↔ `welcome/index.en.md`;
  assets like images are shared between locales.
- Untranslated content never breaks: the English list shows Chinese titles with a
  "Not translated yet" badge; untranslated `/en/blog/<id>` URLs render a notice page
  (noindex, canonical back to the Chinese original).
- **Translation script**:
  `npm run translate -- <file or series dir> [--to en] [--force] [--dry-run]` —
  structure-preserving translation with validation before writing. Configure an
  OpenAI-compatible endpoint in `.env`:

  ```bash
  TRANSLATE_BASE_URL=   # base URL of a compatible endpoint (DeepSeek / OpenAI / …)
  TRANSLATE_API_KEY=
  TRANSLATE_MODEL=
  ```

  Translations are marked `aiTranslated: true` (shown as an "AI-translated" badge);
  review them with `git diff`.
- **Dev translate button**: with `npm run dev`, Chinese article pages show a floating
  "translate to English" button in the bottom-right corner — "generate" when no
  translation exists; "continue (skip existing) / overwrite all / view" when one does.
  Series translate as a whole group, and progress is visible in the terminal. Zero trace
  in production builds.

Full rules (locale helpers, untranslated rendering details, regression tests) are in the
[i18n guide](docs/guides/i18n.md) (in Chinese).

## Deployment (hexo-style)

`npm run deploy` = build + force-push `dist/` to your Pages repository (no GitHub
Actions):

1. Configure `DEPLOY_REPO` (e.g. `git@github.com:<user>/<user>.github.io.git`) and
   `DEPLOY_BRANCH` in `.env`.
2. After the first deploy, open the target repo's Settings → Pages and pick the branch
   root; enable HTTPS as needed.
3. Custom domain: write the domain into `public/CNAME`, change `SITE_URL` to it, and
   deploy again (CNAME must live in the source — a full deployment would wipe any file
   generated by GitHub settings).

The deploy script reuses a `.deploy_git/` cache; `rm -rf .deploy_git` resets it. Dry run
(no real repository touched): `bash scripts/tests/deploy-check.sh`. See the
[deployment guide](docs/guides/deployment.md) (in Chinese) for the full walkthrough.

## Documentation

- [Content authoring](docs/guides/content-authoring.md) — fields and conventions for
  posts, series, authors, projects and moments
- [Markdown extensions](docs/guides/markdown-extensions.md) — callouts, math, inline code
- [Visual customization](docs/guides/visual-customization.md) — colors and favicons
- [i18n & translation](docs/guides/i18n.md) — bilingual structure and translation
  workflow
- [Deployment](docs/guides/deployment.md) — the full hexo-style deployment guide
- [AGENTS.md](AGENTS.md) / [CONTEXT.md](CONTEXT.md) — repo structure, style system and
  domain glossary

(The guides are currently written in Chinese.)

## License & credits

Built on top of [enscribe](https://enscribe.dev)'s
[astro-erudite](https://github.com/jktrn/astro-erudite), released under the
[MIT License](LICENSE).
