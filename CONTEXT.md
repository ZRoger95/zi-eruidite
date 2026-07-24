# Domain Glossary

## Site Background

- **Background Image** — a site-wide CSS background applied to the `<body>`, configured via `SITE.background`. Disabled by default (no config entry). Supports internal paths under `public/` and external URLs.
- **Background Color** — a CSS color string as an alternative to a background image. Mutually exclusive with image (image wins if both set).
- **Background Style** — how the image is rendered: `"cover"` (fills viewport, may crop), `"tile"` (repeats to fill), `"contain"` (fits without cropping).
- **Background Opacity** — a number 0–1 controlling the opacity of the background. Applies to both image and color modes. No overlay layer.
