/**
 * Hairline 图形注册表 —— 把 `@lucasmarkes/hairline` 的 vanilla 工厂收敛成
 * 「本站已接入的图形」一张表，键名即 `<hairline-figure data-figure>` 的取值。
 *
 * 只走 vanilla API（站点不引入 React），并按名字单独 import：包是
 * `sideEffects: false` 的 ESM，用不到的图形会被 tree-shake 掉。
 * 想加新图形，在此 import 并登记即可（33 幅名字见包文档）。
 */
import {
  type Figure,
  drawer,
  phosphor,
  rail,
  riffle,
  settle,
  sieve,
  terrain,
} from "@lucasmarkes/hairline"

export const HAIRLINE_FIGURES = {
  /** 八张牌组成的牌阵：指针下的那张立起，邻牌依次前倾 */
  riffle,
  /** 三只叠在底盘上的试验筛：指针高度抽出一只，网眼全空 */
  sieve,
  /** 七乘七余辉点阵：静止时自播放循环，指针划过的点像余辉一样渐隐 */
  phosphor,
  /** 三层抽屉的归档柜：指针高度抽出一只，隔板上空空如也 */
  drawer,
  /** 一根衣架杆上七个空衣架：指针拂过依次侧让，最近的最大，随后回正 */
  rail,
  /** 十二块瓷砖歪斜散落在 hub 周围：指针靠近时滑正成一棵树，连线收拢 */
  settle,
  /** 基座上的八十一根立柱绕指针升起：intensity 决定升起的范围 */
  terrain,
} as const

export type HairlineFigureName = keyof typeof HAIRLINE_FIGURES
export type { Figure }

export type HairlineFigureMeta = {
  /** 卡片上显示的中文名 */
  label: string
  /** 一句说明，同时用作图形的无障碍名称 */
  desc: string
}

/**
 * 画廊展示用的图形说明表（`/figures` 逐项渲染）。写成 `Record<名字, …>`
 * 是为了让新增图形时漏登记直接编译报错；说明与上面注册表的注释同源，
 * 改一处记得改另一处。
 */
export const HAIRLINE_FIGURE_META: Record<
  HairlineFigureName,
  HairlineFigureMeta
> = {
  riffle: {
    label: "牌阵",
    desc: "八张牌组成的牌阵：指针下的那张立起，邻牌依次前倾",
  },
  sieve: {
    label: "试验筛",
    desc: "三只叠在底盘上的试验筛：指针高度抽出一只，网眼全空",
  },
  phosphor: {
    label: "余辉点阵",
    desc: "七乘七余辉点阵：静止时自播放循环，指针划过的点像余辉一样渐隐",
  },
  drawer: {
    label: "归档柜",
    desc: "三层抽屉的归档柜：指针高度抽出一只，隔板上空空如也",
  },
  rail: {
    label: "衣架杆",
    desc: "一根衣架杆上七个空衣架：指针拂过依次侧让，最近的最大，随后回正",
  },
  settle: {
    label: "落定瓷砖",
    desc: "十二块瓷砖歪斜散落在 hub 周围：指针靠近时滑正成一棵树，连线收拢",
  },
  terrain: {
    label: "地形柱",
    desc: "基座上的八十一根立柱绕指针升起：intensity 决定升起的范围",
  },
}
