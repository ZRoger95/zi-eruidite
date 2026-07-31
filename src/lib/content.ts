import { SITE } from "@/consts"
import { getCollection, type CollectionEntry } from "astro:content"
import { isSubpost } from "@/lib/utils"

export const pageTitle = (title: string) => `${title} | ${SITE.title}`

export async function getPosts(): Promise<CollectionEntry<"blog">[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft)
  return posts
    .filter((post) => !isSubpost(post.id))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

export async function getSubposts(): Promise<
  Map<string, CollectionEntry<"blog">[]>
> {
  const posts = await getCollection(
    "blog",
    ({ id, data }) => !data.draft && id.split("/").length === 2,
  )
  posts.sort(
    (a, b) =>
      (a.data.order ?? Infinity) - (b.data.order ?? Infinity) ||
      a.data.date.getTime() - b.data.date.getTime(),
  )
  return Map.groupBy(posts, (post) => post.id.split("/")[0])
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
