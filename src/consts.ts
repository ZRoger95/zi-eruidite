import type { SvgComponent } from "astro/types"
import Email from "@/assets/icons/email.svg"
import GitHub from "@/assets/icons/github.svg"
import RSS from "@/assets/icons/rss.svg"
import Twitter from "@/assets/icons/twitter.svg"
import type { Locale, UIKey } from "@/lib/i18n"

export type BackgroundStyle = "cover" | "tile" | "contain"

export interface BackgroundConfig {
  /** Path to the background image. Place image in public/ or use an external URL. */
  image?: string
  /** CSS color as an alternative to a background image. Mutually exclusive with image (image wins if both set). */
  color?: string
  /** How the background image is rendered. Only applies when `image` is set. Default: "cover". */
  style?: BackgroundStyle
  /** Opacity of the background, 0–1. Applies to both image and color modes. Default: 1. */
  opacity?: number
}

export const SITE = {
  title: "astro-erudite",
  description: "An opinionated, unstyled blogging template built with Astro.",
  dir: "ltr",
  defaultPageImage: "/static/opengraph-image.png",
  defaultPostImage: "/static/1200x630.png",
  /** Path to the avatar image for the homepage hero. Place image in public/ and reference it here. */
  avatar: undefined as string | undefined,
  /** Default layout: "sidebar" (two-column with sidebar) or "topbar" (top navigation, centered content). Visitors can switch at runtime; this is the first-visit default. */
  layout: "sidebar" as "sidebar" | "topbar",
  /** Background image configuration. When undefined, no background image is applied. */
  background: undefined as BackgroundConfig | undefined,
  /** Show recent Moments on the homepage. When undefined, Moments are not shown. Set { count: N } to display the latest N moments. */
  momentsOnHome: undefined as { count: number } | undefined,
  /** Homepage hero paragraphs per locale. zh copy is placeholder, awaiting the author's own words. */
  hero: {
    zh: {
      paragraphs: [
        "astro-erudite 是一个有主见、无预设样式的静态博客模板，基于 Astro 与原生 CSS 构建；不使用任何 UI 或 CSS 框架，依赖极少。",
        "想使用这个模板，可以访问 GitHub 仓库；想了解它背后的设计取舍，请阅读博客文章《Introducing astro-erudite v2》。",
      ],
    },
    en: {
      paragraphs: [
        "astro-erudite is enscribe's opinionated, unstyled static blogging template built with Astro and native CSS. astro-erudite uses no UI or CSS framework and contains minimal dependencies.",
        "To use this template, check out the GitHub repository. To learn more about why this template exists, read this blog post: Introducing astro-erudite v2.",
      ],
    },
  } satisfies Record<Locale, { paragraphs: string[] }>,
} as const

/** Nav entries: `key` → UI string; `bilingual` hrefs get a `/en` twin. */
export const NAVIGATION: { key: UIKey; href: string; bilingual?: boolean }[] = [
  { key: "navBlog", href: "/blog", bilingual: true },
  { key: "navMoments", href: "/moments" },
  { key: "navTags", href: "/tags" },
  { key: "navProjects", href: "/projects" },
  { key: "navAuthors", href: "/authors" },
]

export const SOCIALS: { href: string; label: string; icon: SvgComponent }[] = [
  { href: "https://github.com/jktrn", label: "GitHub", icon: GitHub },
  { href: "https://twitter.com/enscrbe", label: "Twitter", icon: Twitter },
  { href: "mailto:jason@enscribe.dev", label: "Email", icon: Email },
  { href: "/rss.xml", label: "RSS", icon: RSS },
]
