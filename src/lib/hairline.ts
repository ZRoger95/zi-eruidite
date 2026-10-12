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
