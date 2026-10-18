import { SITE } from "@/consts"
import type { ImageMetadata } from "astro"
import { getCollection, type CollectionEntry } from "astro:content"
import { baseId, localeOf, type Locale } from "@/lib/i18n"
import { isSubpost } from "@/lib/utils"
import { BOARD_ITEMS, type L10n } from "@/data/board"

export const pageTitle = (title: string) => `${title} | ${SITE.title}`

export async function getAuthors(): Promise<CollectionEntry<"authors">[]> {
  const authors = await getCollection("authors", ({ data }) => !data.draft)
  return authors.sort((a, b) => a.data.name.localeCompare(b.data.name))
}

export async function getPosts(): Promise<CollectionEntry<"blog">[]> {
  const posts = await getCollection(
    "blog",
    ({ data, id }) => !data.draft && localeOf(id) === "zh",
  )
  return posts
    .filter((post) => !isSubpost(post.id))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

export async function getSubposts(): Promise<
  Map<string, CollectionEntry<"blog">[]>
> {
  const posts = await getCollection(
    "blog",
    ({ id, data }) =>
      !data.draft && localeOf(id) === "zh" && id.split("/").length === 2,
  )
  posts.sort(
    (a, b) =>
      (a.data.order ?? Infinity) - (b.data.order ?? Infinity) ||
      a.data.date.getTime() - b.data.date.getTime(),
  )
  return Map.groupBy(posts, (post) => post.id.split("/")[0])
}

export type PostView = {
  /** baseId（不含 `.en` 后缀），中英配对键 */
  id: string
  /** 展示用数据：en 页取译文（en ?? zh），zh 页取中文原文 */
  data: CollectionEntry<"blog">["data"]
  /** en 条目存在且非 draft */
  translated: boolean
  zh: CollectionEntry<"blog">
  en?: CollectionEntry<"blog">
}

/** 顶层文章的中英配对展示视图；按源（zh）文章日期倒序，中英列表同序。 */
export async function getPostViews(locale: Locale): Promise<PostView[]> {
  const entries = await getCollection("blog", ({ data }) => !data.draft)
  const enByBaseId = new Map(
    entries
      .filter((entry) => localeOf(entry.id) === "en")
      .map((entry): [string, CollectionEntry<"blog">] => [
        baseId(entry.id),
        entry,
      ]),
  )
  const views = entries
    .filter((entry) => localeOf(entry.id) === "zh" && !isSubpost(entry.id))
    .map((zh) => {
      const en = enByBaseId.get(zh.id)
      return {
        id: zh.id,
        data: locale === "en" ? (en?.data ?? zh.data) : zh.data,
        translated: en !== undefined,
        zh,
        en,
      }
    })
  return views.sort(
    (a, b) => b.zh.data.date.getTime() - a.zh.data.date.getTime(),
  )
}

/**
 * 系列子文章的中英配对展示视图，按父 baseId 分组
 * （`Map<parentBaseId, PostView[]>`）。排序镜像 `getSubposts`：先按 `order`
 * 升序，再按源（zh）文章日期——保证 en 链与 zh 链结构一致。
 */
export async function getSubpostViews(
  locale: Locale,
): Promise<Map<string, PostView[]>> {
  const entries = await getCollection("blog", ({ data }) => !data.draft)
  const enByBaseId = new Map(
    entries
      .filter((entry) => localeOf(entry.id) === "en")
      .map((entry): [string, CollectionEntry<"blog">] => [
        baseId(entry.id),
        entry,
      ]),
  )
  const views = entries
    .filter((entry) => localeOf(entry.id) === "zh" && isSubpost(entry.id))
    .map((zh) => {
      const en = enByBaseId.get(zh.id)
      return {
        id: zh.id,
        data: locale === "en" ? (en?.data ?? zh.data) : zh.data,
        translated: en !== undefined,
        zh,
        en,
      }
    })
  views.sort(
    (a, b) =>
      (a.zh.data.order ?? Infinity) - (b.zh.data.order ?? Infinity) ||
      a.zh.data.date.getTime() - b.zh.data.date.getTime(),
  )
  return Map.groupBy(views, (view) => view.id.split("/")[0])
}

export async function getTags(): Promise<
  Map<string, CollectionEntry<"blog">[]>
> {
  const posts = await getPosts()
  const series = await getSubposts()
  const tags = new Map<string, CollectionEntry<"blog">[]>()
  for (const post of posts) {
    const chain = [post, ...(series.get(post.id) ?? [])]
    for (const tag of new Set(
      chain.flatMap((entry) => entry.data.tags ?? []),
    )) {
      const tagged = tags.get(tag)
      if (tagged) tagged.push(post)
      else tags.set(tag, [post])
    }
  }
  return new Map(
    [...tags].sort(
      ([a, postsA], [b, postsB]) =>
        postsB.length - postsA.length || a.localeCompare(b),
    ),
  )
}

export type BoardView = {
  /** baseId（中英配对键） */
  id: string
  kind: "stamp" | "badge"
  /** 恒取锚点的图（几何与图与语言无关）；栅格图为 ImageMetadata，svg 为字符串 URL */
  image: ImageMetadata | string
  x: number
  y: number
  rotate: number
  z: number
  /** 邮票形状（viewBox 单位，默认 160×208 竖版；横版如 240×150） */
  w: number
  h: number
  /** 徽章图标高度（px），缺省走 CSS 流体尺寸 */
  size?: number
  /** 显示缩放倍率（`--s`），恒有值，缺省 1 */
  scale: number
  /** 水平镜像（`--sx`），恒有值，缺省 false */
  flip: boolean
  href?: string
  /** 以下文案 locale 命中译文则取译文，否则回落 zh */
  title: string
  alt: string
  denomination?: string
  postmark?: string
  /** en 孪生存在且非 draft */
  translated: boolean
}

/** 取双语文案：命中译文则用译文，否则回落 zh。 */
const pick = (text: L10n | undefined, locale: Locale) =>
  text ? (locale === "en" && text.en ? text.en : text.zh) : undefined

/**
 * 收藏板物件展示视图。以 `BOARD_ITEMS` 为源（原 `board` 内容集合已迁出为纯数据
 * 模块），几何（x/y/rotate/z/w/h）、`image`、`href` 与语言无关；文案按 locale 取
 * 译文（无译文回落 zh）。过滤 `draft`，按 `z` 升序、再按 `id` 稳定排序。保留
 * `async` 以维持既有 `await` 调用点；未来接后端时把数据源换成 `fetch` 即可。
 */
export async function getBoardViews(locale: Locale): Promise<BoardView[]> {
  const views = BOARD_ITEMS.filter((item) => !item.draft).map(
    (item): BoardView => ({
      id: item.id,
      kind: item.kind,
      image: item.image,
      x: item.x,
      y: item.y,
      rotate: item.rotate ?? 0,
      z: item.z ?? 0,
      w: item.w ?? 160,
      h: item.h ?? 208,
      size: item.size,
      scale: item.scale ?? 1,
      flip: item.flip ?? false,
      href: item.href,
      title: pick(item.title, locale) ?? "",
      alt: pick(item.alt, locale) ?? "",
      denomination: pick(item.denomination, locale),
      postmark: pick(item.postmark, locale),
      translated: item.title.en !== undefined,
    }),
  )
  return views.sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))
}

export async function getMoments(): Promise<CollectionEntry<"moments">[]> {
  const moments = await getCollection("moments", ({ data }) => !data.draft)
  return moments.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

/** Returns a merged tag map across both Blog posts and Moments. */
export async function getAllTags(): Promise<
  Map<
    string,
    { blog: CollectionEntry<"blog">[]; moments: CollectionEntry<"moments">[] }
  >
> {
  const posts = await getPosts()
  const series = await getSubposts()
  const moments = await getMoments()
  const tags = new Map<
    string,
    { blog: CollectionEntry<"blog">[]; moments: CollectionEntry<"moments">[] }
  >()

  for (const post of posts) {
    const chain = [post, ...(series.get(post.id) ?? [])]
    for (const tag of new Set(
      chain.flatMap((entry) => entry.data.tags ?? []),
    )) {
      const entry = tags.get(tag)
      if (entry) entry.blog.push(post)
      else tags.set(tag, { blog: [post], moments: [] })
    }
  }

  for (const moment of moments) {
    for (const tag of moment.data.tags ?? []) {
      const entry = tags.get(tag)
      if (entry) entry.moments.push(moment)
      else tags.set(tag, { blog: [], moments: [moment] })
    }
  }

  return new Map(
    [...tags].sort(
      ([a, aItems], [b, bItems]) =>
        bItems.blog.length +
          bItems.moments.length -
          (aItems.blog.length + aItems.moments.length) || a.localeCompare(b),
    ),
  )
}
