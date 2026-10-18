import type { ImageMetadata } from "astro"

import astroLogo from "@/assets/board/astro.svg"
import cloudflareLogo from "@/assets/board/cloudflare.svg"
import deepseekLogo from "@/assets/board/deepseek.svg"
import humancodedLogo from "@/assets/board/humancoded.svg"
import javaLogo from "@/assets/board/java.svg"
import vueLogo from "@/assets/board/vue.svg"
import stargirl from "@/assets/board/stargirl.jpg"
import donglongdong1 from "@/assets/board/DONGLONGDONG-1.jpg"
import donglongdong2 from "@/assets/board/DONGLONGDONG-2.jpg"
import donglongdong3 from "@/assets/board/DONGLONGDONG-3.jpg"
import unknownCyc1 from "@/assets/board/unknownCYC-1.jpg"
import unknownCyc2 from "@/assets/board/unknownCYC-2.jpg"
import unknownCyc3 from "@/assets/board/unknownCYC-3.jpg"
import preview1 from "@/assets/board/preview-1.png"
import preview2 from "@/assets/board/preview-2.png"

/**
 * 收藏板物件的双语文案：`zh` 为锚点，`en` 缺省时回落 `zh`。
 * 几何（x/y/rotate/z/w/h/scale/flip）与 `image`、`href` 与语言无关，恒取一条。
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
  /** 显示缩放倍率（映射 piece 的 `--s`），缺省 1；仅非 1 才落字段 */
  scale?: number
  /** 水平镜像（映射 piece 的 `--sx`），缺省 false */
  flip?: boolean
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
    x: 0.0664,
    y: 0.7197,
    rotate: -4,
    z: 88,
    href: "https://astro.build",
    title: { zh: "Astro", en: "Astro (EN)" },
    alt: { zh: "Astro framework logo" },
  },
  {
    id: "astronaut-stamp",
    kind: "stamp",
    image: preview2,
    x: 0.7426,
    y: 0,
    rotate: 3,
    z: 86,
    scale: 0.512,
    // 占位来源，后续替换为真实出处
    href: "https://en.wikipedia.org/wiki/Moon_landing",
    denomination: { zh: "¥1.20" },
    postmark: { zh: "BEIJING" },
    title: { zh: "登月邮票" },
    alt: { zh: "一枚登月主题邮票" },
  },
  {
    id: "coastal-stamp",
    kind: "stamp",
    image: preview1,
    x: 0.6139,
    y: 0.2845,
    rotate: -6,
    z: 87,
    scale: 0.64,
    w: 240,
    h: 150,
    // 占位来源，后续替换为真实出处
    href: "https://commons.wikimedia.org/wiki/Category:Coastlines",
    denomination: { zh: "¥2.00" },
    postmark: { zh: "SHANGHAI" },
    title: { zh: "海岸线邮票" },
    alt: { zh: "一枚横版海岸线主题邮票" },
  },
  {
    id: "vue",
    kind: "badge",
    image: vueLogo,
    x: 0.2722,
    y: 0.7404,
    rotate: 5,
    z: 92,
    href: "https://vuejs.org",
    title: { zh: "Vue" },
    alt: { zh: "Vue framework logo" },
  },
  {
    id: "cloudflare",
    kind: "badge",
    image: cloudflareLogo,
    x: 0.1983,
    y: 0.5606,
    rotate: -6,
    z: 91,
    href: "https://www.cloudflare.com",
    title: { zh: "Cloudflare" },
    alt: { zh: "Cloudflare logo" },
  },
  {
    id: "java",
    kind: "badge",
    image: javaLogo,
    x: 0.4147,
    y: 0.7595,
    rotate: 6,
    z: 93,
    href: "https://www.java.com",
    title: { zh: "Java" },
    alt: { zh: "Java logo" },
  },
  {
    id: "deepseek",
    kind: "badge",
    image: deepseekLogo,
    x: 0.0429,
    y: 0.5472,
    rotate: -7,
    z: 89,
    href: "https://df.fenx.work/llm-things/",
    title: { zh: "DeepSeek" },
    alt: { zh: "DeepSeek 鲸鱼标志" },
  },
  {
    id: "humancoded",
    kind: "badge",
    image: humancodedLogo,
    x: 0.0473,
    y: 0.8928,
    rotate: 2,
    z: 90,
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
    x: 0.4099,
    y: 0.1389,
    rotate: -3,
    z: 79,
    scale: 0.512,
    w: 160,
    h: 226,
    // 占位来源，后续替换为真实出处
    href: "https://www.pixiv.net/",
    title: { zh: "星野之梦" },
    alt: { zh: "一幅黑白插画，少女躺在星空下的草地上" },
  },
  {
    id: "long-tailed-tit-stamp",
    kind: "stamp",
    image: unknownCyc1,
    x: 0.0551,
    y: 0.1421,
    rotate: 34,
    z: 37,
    scale: 0.5,
    w: 200,
    h: 200,
    href: "https://weibo.com/7385955461/RmQhZDrLZ",
    title: { zh: "银喉长尾山雀" },
    alt: { zh: "一幅方版鸟类邮票插画，银喉长尾山雀栖在枝头" },
  },
  {
    id: "waxwing-stamp",
    kind: "stamp",
    image: unknownCyc2,
    x: 0,
    y: 0,
    rotate: -20,
    z: 31,
    scale: 0.5,
    w: 200,
    h: 200,
    href: "https://weibo.com/7385955461/RmQhZDrLZ",
    title: { zh: "太平鸟" },
    alt: { zh: "一幅方版鸟类邮票插画，太平鸟俯身啄食浆果" },
  },
  {
    id: "goldcrest-stamp",
    kind: "stamp",
    image: unknownCyc3,
    x: 0.1082,
    y: 0,
    rotate: 6,
    z: 35,
    scale: 0.5,
    w: 200,
    h: 200,
    href: "https://weibo.com/7385955461/RmQhZDrLZ",
    title: { zh: "戴菊" },
    alt: { zh: "一幅方版鸟类邮票插画，戴菊仰头停在松枝上" },
  },
  {
    id: "seashore-stamp",
    kind: "stamp",
    image: donglongdong1,
    x: 0.3074,
    y: 0.0127,
    rotate: 11,
    z: 76,
    scale: 0.512,
    w: 170,
    h: 260,
    href: "https://weibo.com/5905627419/RmXKnFc3M",
    title: { zh: "夏日海岸" },
    alt: {
      zh: "一幅竖版邮票插画（@DONGLONGDONG COLOR #111），少年在碧蓝海浪边的沙滩上奔跑",
    },
  },
  {
    id: "cloudsea-stamp",
    kind: "stamp",
    image: donglongdong2,
    x: 0.3933,
    y: 0.1084,
    rotate: 17,
    z: 80,
    scale: 0.512,
    w: 250,
    h: 134,
    href: "https://weibo.com/5905627419/RmcEWym8a",
    title: { zh: "云海写生" },
    alt: {
      zh: "一幅横版邮票插画（@DONGLONGDONG COLOR #106），少年坐在岩石上对着巨大积雨云作画",
    },
  },
  {
    id: "galaxy-stamp",
    kind: "stamp",
    image: donglongdong3,
    x: 0.3128,
    y: 0,
    rotate: -3,
    z: 77,
    scale: 0.512,
    w: 240,
    h: 142,
    href: "https://weibo.com/5905627419/RjCdJsRZ1",
    title: { zh: "星夜独行" },
    alt: {
      zh: "一幅横版邮票插画（@DONGLONGDONG COLOR #97），少年提着灯仰望银河星空",
    },
  },
]
