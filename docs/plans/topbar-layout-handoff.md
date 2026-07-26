# Topbar Layout Handoff

## Status

This handoff captures the outcome of the `/grill-with-docs` discussion for the
`fix/topbar` branch. No implementation has been done yet.

The repository is already on `fix/topbar`. `src/consts.ts` has an existing
uncommitted change that switches `SITE.layout` from `"sidebar"` to `"topbar"`.
Treat that as pre-existing user work.

`CONTEXT.md` has been updated with these glossary terms:

- **Topbar Layout** — a site layout mode where global navigation is placed in a
  centered top navigation bar and primary page content uses a centered reading
  column across main pages, not only individual blog posts.
- **Article Header Display** — the wider, centered top portion of a blog article
  in Topbar Layout, containing breadcrumbs, the banner image, title, and
  metadata before the narrower reading column begins.

## Goal

Fix the Topbar Layout styling so it matches the user's reference direction:
small logo-only top navigation, centered menu, subtle bottom border, centered
main content, and a blog article page whose header area is wider than the body
reading column.

## Decisions

- Topbar navigation menu must be visually centered on the page.
- In Topbar Layout, the site brand should show only the small logo icon, not the
  site title text.
- The topbar bottom border should be less prominent than the current 2px line.
- Topbar Layout should use a centered content column across main pages, not only
  blog posts.
- Blog article pages in Topbar Layout should use an Article Header Display:
  banner image above title, title and metadata centered, then narrower body
  content below.
- Keep the homepage hero and `BlogCard` visual styling as-is. Do not convert
  them to the bordered-card style in the reference screenshot.
- Do not add or redesign breadcrumbs. The user said breadcrumbs already exist
  and do not need to be handled in this pass.
- Do not handle or redesign TOC / post actions in Topbar Layout in this pass.
- Preserve Sidebar Layout behavior unless a shared style must change carefully.

## Likely Files

- `src/components/Topbar.astro`
- `src/layouts/Layout.astro`
- `src/pages/blog/[...id].astro`
- Possibly `src/styles/layout.css` if shared CSS variables are better placed
  there.

## Implementation Plan

1. Update `Topbar.astro`.
   - Use a three-column grid: brand, nav, actions.
   - Center `nav` in the middle column.
   - Keep actions aligned right.
   - Hide the brand text in Topbar Layout; keep only the logo SVG.
   - Reduce logo visual size.
   - Change the bottom border from a prominent 2px line to a subtle 1px or
     color-mixed border.

2. Update Topbar Layout content sizing.
   - In `Layout.astro`, change `page-content-topbar` from full
     `--grid-max-width` behavior to a centered content column.
   - Use a topbar content width around `50rem` for main pages.
   - Keep responsive horizontal padding via `--grid-gutter` or a dedicated
     topbar gutter.
   - Ensure mobile pages keep comfortable side padding.

3. Update blog article Topbar Layout presentation.
   - Add CSS hooks or data attributes so article-specific topbar styles do not
     disturb Sidebar Layout.
   - In Topbar Layout, make the article banner/title/meta live in a wider
     centered header area.
   - Put the banner above the title.
   - Center title and metadata.
   - Constrain `prose-content` to a narrower reading width, likely `--measure`,
     and center it.

4. Leave out-of-scope items alone.
   - Do not create a new breadcrumb component.
   - Do not redesign TOC or post actions.
   - Do not restyle homepage hero or `BlogCard`.

## Validation

Run:

```sh
bun run format:check
bun run build
```

Then visually check at least:

- Home page in Topbar Layout.
- Blog index in Topbar Layout.
- A blog article page in Topbar Layout.
- A narrow/mobile viewport for topbar and content padding.

## Reference Images From Discussion

The user provided reference screenshots showing:

- A minimal topbar with a small logo on the left, centered navigation, and a
  very light visual boundary.
- A centered home/posts layout.
- A blog article layout with wide banner, centered title/meta, post navigation
  below the title area, and narrower body text.

The screenshots were attached in the Codex thread, not copied into the repo.
