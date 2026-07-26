# Domain Glossary

## Site Background

- **Background Image** — a site-wide CSS background applied to the `<body>`, configured via `SITE.background`. Disabled by default (no config entry). Supports internal paths under `public/` and external URLs.
- **Background Color** — a CSS color string as an alternative to a background image. Mutually exclusive with image (image wins if both set).
- **Background Style** — how the image is rendered: `"cover"` (fills viewport, may crop), `"tile"` (repeats to fill), `"contain"` (fits without cropping).
- **Background Opacity** — a number 0–1 controlling the opacity of the background. Applies to both image and color modes. No overlay layer.

## Layout

- **Topbar Layout** — a site layout mode where global navigation is placed in a centered top navigation bar and primary page content uses a centered reading column across main pages, not only individual blog posts.
- **Article Header Display** — the wider, centered top portion of a blog article in Topbar Layout, containing breadcrumbs, the banner image, title, and metadata before the narrower reading column begins.
