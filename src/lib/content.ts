import { SITE } from "@/consts"
import { getCollection, type CollectionEntry } from "astro:content"
import { baseId, localeOf, type Locale } from "@/lib/i18n"
import { isSubpost } from "@/lib/utils"

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
