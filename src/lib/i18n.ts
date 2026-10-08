import { slug as githubSlug } from "github-slugger"

export const LOCALES = ["zh", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "zh"

/** File-name marker for English twins: `index.md` ↔ `index.en.md`. */
const MARKER = ".en"

/** Locale of a content id: trailing `.en` → "en", otherwise "zh". */
export const localeOf = (id: string): Locale =>
  id.endsWith(MARKER) ? "en" : "zh"

/** Strips the trailing `.en` marker from a content id. */
export const baseId = (id: string): string =>
  id.endsWith(MARKER) ? id.slice(0, -MARKER.length) : id

/** Prefixes a site path for a locale: zh → as-is; en → `/en…` (`/` → `/en/`). */
export const localePath = (path: string, locale: Locale): string =>
  locale === "zh" ? path : path === "/" ? "/en/" : `/en${path}`

/** Locale of a pathname: `/en` or `/en/…` → "en", otherwise "zh". */
export const localeFromPath = (pathname: string): Locale =>
  pathname === "/en" || pathname.startsWith("/en/") ? "en" : "zh"

/** Site path without its locale prefix: `/en/blog` → `/blog` (`/en` → `/`). */
export const stripLocalePath = (pathname: string): string =>
  pathname === "/en" || pathname.startsWith("/en/")
    ? pathname.slice(3) || "/"
    : pathname

/**
 * Blog loader id: strip `.en` → per-segment githubSlug → normalize a trailing
 * `/index` → re-append `.en`. Keeps `.en.md` twins addressable as `x.en`
 * (the default glob loader would swallow the dot: `x.en.md` → `xen`).
 *
 * Note: the default loader's `data.slug` priority is intentionally omitted —
 * this schema has no slug field, and mirroring it would break twin pairing.
 * Deliberate, not an oversight.
 */
export const generateBlogEntryId = ({ entry }: { entry: string }): string => {
  let stem = entry.replace(/\.md$/, "")
  let marker = ""
  if (stem.endsWith(MARKER)) {
    stem = stem.slice(0, -MARKER.length)
    marker = MARKER
  }
  const slug = stem
    .split("/")
    .map((segment) => githubSlug(segment))
    .join("/")
    .replace(/\/index$/, "")
  return slug + marker
}

export const SITE_META: Record<Locale, { htmlLang: string; ogLocale: string }> =
  {
    zh: { htmlLang: "zh-CN", ogLocale: "zh_CN" },
    en: { htmlLang: "en", ogLocale: "en_US" },
  }

/** Key-name source of truth; `en` is checked for full key parity. */
const ZH_STRINGS = {
  skipLink: "跳到主内容",
  themeToggle: "切换主题",
  fullwidthToggle: "切换全宽",
  layoutToggle: "切换布局",
  prevPost: "上一篇",
  nextPost: "下一篇",
  scrollTop: "回到顶部",
  toc: "目录",
  tocToggle: "展开或折叠目录",
  navBlog: "博客",
  navMoments: "动态",
  navTags: "标签",
  navProjects: "项目",
  navAuthors: "作者",
  blogTitle: "博客",
  latestPosts: "最新文章",
  heroGreeting: "你好，我是",
  untranslatedBadge: "尚未翻译",
  noticeBody: "这篇中文文章还没有英文版。",
  readOriginal: "阅读中文原文",
  backToMoments: "返回动态",
  sectionUntranslated: "本节尚未翻译",
  aiTranslated: "AI 翻译",
  langSwitch: "EN",
  langSwitchAria: "切换到英文",
} as const

export type UIKey = keyof typeof ZH_STRINGS

export const UI_STRINGS: Record<Locale, Record<UIKey, string>> = {
  zh: ZH_STRINGS,
  en: {
    skipLink: "Skip to content",
    themeToggle: "Toggle theme",
    fullwidthToggle: "Toggle full width",
    layoutToggle: "Toggle layout",
    prevPost: "Previous post",
    nextPost: "Next post",
    scrollTop: "Scroll to top",
    toc: "Table of contents",
    tocToggle: "Toggle table of contents",
    navBlog: "Blog",
    navMoments: "Moments",
    navTags: "Tags",
    navProjects: "Projects",
    navAuthors: "Authors",
    blogTitle: "Blog",
    latestPosts: "Latest posts",
    heroGreeting: "Hi! I'm",
    untranslatedBadge: "Not translated yet",
    noticeBody: "This article hasn't been translated into English yet.",
    readOriginal: "Read the Chinese original",
    backToMoments: "Back to moments",
    sectionUntranslated: "This section hasn't been translated yet.",
    aiTranslated: "AI-translated",
    langSwitch: "中文",
    langSwitchAria: "Switch to Chinese",
  },
}

export const t = (locale: Locale, key: UIKey): string => UI_STRINGS[locale][key]
