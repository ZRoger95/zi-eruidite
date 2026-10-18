import type { ImageMetadata } from "astro"

import astroLogo from "@/assets/board/astro.svg"
import cloudflareLogo from "@/assets/board/cloudflare.svg"
import deepseekLogo from "@/assets/board/deepseek.svg"
import humancodedLogo from "@/assets/board/humancoded.svg"
import javaLogo from "@/assets/board/java.svg"
import vueLogo from "@/assets/board/vue.svg"
import stargirl from "@/assets/board/stargirl.jpg"
import preview1 from "@/assets/board/preview-1.png"
import preview2 from "@/assets/board/preview-2.png"

/**
 * 收藏板物件的双语文案：`zh` 为锚点，`en` 缺省时回落 `zh`。
 * 几何（x/y/rotate/z/w/h）与 `image`、`href` 与语言无关，恒取一条。
 */
export type L10n = { zh: string; en?: string }

/**
 * 收藏板物件。原为内容集合 `board`（每条一个空正文 md），现收敛为本模块的
 * 纯数据数组，方便集中管理与未来接入后端 API（届时 `fetch` 返回同形状数组即可）。
 * `image`：栅格图（png/jpg）导入为 `ImageMetadata`，仍走 Astro 图片优化；
 * svg 导入为字符串资源 URL，以原生 `<img>` 渲染。
 */
export type BoardItem = {
  /** 稳定配对/排序键（原 zh 文件 stem） */
  id: string
  kind: "stamp" | "badge"
  image: ImageMetadata | string
  x: number
  y: number
  rotate?: number
  z?: number
  w?: number
  h?: number
  /** 徽章图标高度（px）：缺省走 CSS 流体尺寸 `clamp(3.5rem, 6vw, 5rem)`；
   * 横版字标（如 humancoded 253×56）需显式压小，否则宽度会顶满板面 */
  size?: number
  href?: string
  title: L10n
  alt: L10n
  denomination?: L10n
  postmark?: L10n
  draft?: boolean
}

/**
 * 收藏板物件数据。按 `z` 排序由消费方（`getBoardViews`）负责，此处顺序仅为可读性。
 */
export const BOARD_ITEMS: BoardItem[] = [
  {
    id: "astro",
    kind: "badge",
    image: astroLogo,
    x: 0.15,
    y: 0.2,
    rotate: -4,
    z: 1,
    href: "https://astro.build",
    title: { zh: "Astro", en: "Astro (EN)" },
    alt: { zh: "Astro framework logo" },
  },
  {
    id: "astronaut-stamp",
    kind: "stamp",
    image: preview2,
    x: 0.55,
    y: 0.4,
    rotate: 3,
    z: 2,
    denomination: { zh: "¥1.20" },
    postmark: { zh: "BEIJING" },
    title: { zh: "登月邮票" },
    alt: { zh: "一枚登月主题邮票" },
  },
  {
    id: "coastal-stamp",
    kind: "stamp",
    image: preview1,
    x: 0.18,
    y: 0.6,
    rotate: -6,
    z: 3,
    w: 240,
    h: 150,
    denomination: { zh: "¥2.00" },
    postmark: { zh: "SHANGHAI" },
    title: { zh: "海岸线邮票" },
    alt: { zh: "一枚横版海岸线主题邮票" },
  },
  {
    id: "vue",
    kind: "badge",
    image: vueLogo,
    x: 0.44,
    y: 0.16,
    rotate: 5,
    z: 4,
    href: "https://vuejs.org",
    title: { zh: "Vue" },
    alt: { zh: "Vue framework logo" },
  },
  {
    id: "cloudflare",
    kind: "badge",
    image: cloudflareLogo,
    x: 0.8,
    y: 0.34,
    rotate: -6,
    z: 5,
    href: "https://www.cloudflare.com",
    title: { zh: "Cloudflare" },
    alt: { zh: "Cloudflare logo" },
  },
  {
    id: "java",
    kind: "badge",
    image: javaLogo,
    x: 0.8,
    y: 0.72,
    rotate: 6,
    z: 6,
    href: "https://www.java.com",
    title: { zh: "Java" },
    alt: { zh: "Java logo" },
  },
  {
    id: "deepseek",
    kind: "badge",
    image: deepseekLogo,
    x: 0.04,
    y: 0.06,
    rotate: -7,
    z: 8,
    href: "https://df.fenx.work/llm-things/",
    title: { zh: "DeepSeek" },
    alt: { zh: "DeepSeek 鲸鱼标志" },
  },
  {
    id: "humancoded",
    kind: "badge",
    image: humancodedLogo,
    x: 0.24,
    y: 0.04,
    rotate: 2,
    z: 9,
    size: 40,
    // 图里已经自带「Human Coded」字标，下方小字改成中文注释而不重复
    href: "https://df.fenx.work/llm-things/",
    title: { zh: "人写的代码", en: "Human Coded" },
    alt: { zh: "Human Coded 字标徽章（手写代码，非 AI 生成）" },
  },
  {
    id: "stargirl",
    kind: "stamp",
    image: stargirl,
    x: 0.36,
    y: 0.55,
    rotate: -3,
    z: 7,
    w: 160,
    h: 226,
    title: { zh: "星野之梦" },
    alt: { zh: "一幅黑白插画，少女躺在星空下的草地上" },
  },
]
