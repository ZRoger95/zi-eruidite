import type { SvgComponent } from "astro/types"
import Email from "@/assets/icons/email.svg"
import GitHub from "@/assets/icons/github.svg"
import RSS from "@/assets/icons/rss.svg"
import Twitter from "@/assets/icons/twitter.svg"

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
  locale: "en-US",
  dir: "ltr",
  defaultPageImage: "/static/opengraph-image.png",
  defaultPostImage: "/static/1200x630.png",
  /** Path to the avatar image for the homepage hero. Place image in public/ and reference it here. */
  avatar: undefined as string | undefined,
  /** Layout mode: "sidebar" (default, two-column with sidebar) or "topbar" (top navigation, centered content). */
  layout: "sidebar" as "sidebar" | "topbar",
  /** Background image configuration. When undefined, no background image is applied. */
  background: undefined as BackgroundConfig | undefined,
  /** Show recent Moments on the homepage. When undefined, Moments are not shown. Set { count: N } to display the latest N moments. */
  momentsOnHome: undefined as { count: number } | undefined,
} as const

export const NAVIGATION = [
  { href: "/blog", label: "Blog" },
  { href: "/moments", label: "Moments" },
  { href: "/tags", label: "Tags" },
  { href: "/projects", label: "Projects" },
  { href: "/authors", label: "Authors" },
]

export const SOCIALS: { href: string; label: string; icon: SvgComponent }[] = [
  { href: "https://github.com/jktrn", label: "GitHub", icon: GitHub },
  { href: "https://twitter.com/enscrbe", label: "Twitter", icon: Twitter },
  { href: "mailto:jason@enscribe.dev", label: "Email", icon: Email },
  { href: "/rss.xml", label: "RSS", icon: RSS },
]
