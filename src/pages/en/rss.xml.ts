import { SITE } from "@/consts"
import { getPostViews } from "@/lib/content"
import rss from "@astrojs/rss"
import type { APIContext } from "astro"

export async function GET(context: APIContext) {
  const views = await getPostViews("en")
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    items: views
      .filter((view) => view.translated)
      .map((view) => ({
        title: view.data.title,
        description: view.data.description,
        pubDate: view.data.date,
        link: `/en/blog/${view.id}`,
      })),
  })
}
