/**
 * Hairline 图形注册表 —— 把 `@lucasmarkes/hairline` 的 vanilla 工厂收敛成
 * 「本站已接入的图形」一张表，键名即 `<hairline-figure data-figure>` 的取值。
 *
 * 只走 vanilla API（站点不引入 React），并按名字单独 import：包是
 * `sideEffects: false` 的 ESM，用不到的图形会被 tree-shake 掉。
 * 想加新图形，在此 import 并登记即可（33 幅名字见包文档）。
 */
import { type Figure, phosphor, riffle, sieve } from "@lucasmarkes/hairline"

export const HAIRLINE_FIGURES = {
  /** 八张牌组成的牌阵：指针下的那张立起，邻牌依次前倾 */
  riffle,
  /** 三只叠在底盘上的试验筛：指针高度抽出一只，网眼全空 */
  sieve,
  /** 七乘七余辉点阵：静止时自播放循环，指针划过的点像余辉一样渐隐 */
  phosphor,
} as const

export type HairlineFigureName = keyof typeof HAIRLINE_FIGURES
export type { Figure }
