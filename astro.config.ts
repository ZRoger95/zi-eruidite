import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import { loadEnv } from "vite"
import { satteri } from "@astrojs/markdown-satteri"
import {
  blockExpressiveCode,
  inlineExpressiveCode,
} from "./src/lib/expressive-code"
import { temmlMath } from "./src/lib/math"
import { calloutDirective } from "./src/lib/callout"
import { externalLinks } from "./src/lib/external-links"
import { headingNamespace } from "./src/lib/heading-namespace"
import { headingAnchors } from "./src/lib/heading-anchors"
import { momentComposerPlugin } from "./src/lib/moment-composer-plugin"

const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "")
const site = (env.SITE_URL ?? "").trim()

if (!site) {
  throw new Error(
    "缺少 SITE_URL：请复制 .env.example 为 .env（或设置同名环境变量），" +
      "填入含协议的站点地址，如 https://example.com",
  )
}

export default defineConfig({
  site,
  compressHTML: true,
  prefetch: { prefetchAll: true },
  vite: {
    plugins: [momentComposerPlugin()],
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: "zh",
        locales: { zh: "zh-CN", en: "en" },
      },
      filter: (page) =>
        !/\/blog\/[^/]+\/[^/]+\/?$/.test(page) &&
        !/\/authors\/[^/]+\/?$/.test(page) &&
        !page.includes("/tags/"),
    }),
  ],
  markdown: {
    syntaxHighlight: false,
    processor: satteri({
      features: { directive: true, math: true },
      mdastPlugins: [calloutDirective, inlineExpressiveCode, temmlMath],
      hastPlugins: [
        externalLinks,
        blockExpressiveCode,
        headingNamespace,
        headingAnchors,
      ],
    }),
  },
})
