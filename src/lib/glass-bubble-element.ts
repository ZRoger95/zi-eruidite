/* <glass-bubble> 自主定制元素的注册（实现见 glass-bubble.ts 的 mountGlassBubble）。
   提成共享模块是因为有两个宿主脚本都要它：GlassBubble.astro 的静态用法，以及
   Board.astro 的双击原图预览（本页不渲染那个组件，Astro 不会把组件脚本带上页面，
   动态 `createElement("glass-bubble")` 得先有注册）。守卫共存、谁先到谁注册；
   View Transitions 重跑 body 脚本时同守卫兜底，断开时销毁以便 rAF 活不过它的页面。 */

import { mountGlassBubble, type GlassBubbleHandle } from "@/lib/glass-bubble"

export function registerGlassBubble(): void {
  if (customElements.get("glass-bubble")) return
  customElements.define(
    "glass-bubble",
    class extends HTMLElement {
      #handle: GlassBubbleHandle | null = null

      static observedAttributes = [
        "data-src",
        "data-label",
        "data-size",
        "data-bend",
        "data-fringe",
        "data-corner",
      ]

      connectedCallback(): void {
        if (this.#handle) return
        this.#handle = mountGlassBubble(this)
      }

      attributeChangedCallback(name: string): void {
        this.#handle?.attrChanged(name)
      }

      disconnectedCallback(): void {
        this.#handle?.destroy()
        this.#handle = null
      }
    },
  )
}
