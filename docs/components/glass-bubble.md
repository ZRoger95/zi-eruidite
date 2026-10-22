# GlassBubble 玻璃泡组件

一颗可以拖过照片的玻璃泡：中间略微放大、边缘强力折射、最外圈有一丝色散，顶部有
高光，拖到画面外（板上/纸面上）就只剩光与影。适合让读者「透过玻璃」端详一张图。

移植自 [Bencho](https://bencho.dev) 的 React 组件
「[Glass bubble](https://bencho.dev/blocks/glass-bubble)」（
[MIT 授权](https://bencho.dev/licence)），按本站惯例改写为**原生自主定制元素**
（不引入 React），遵循「SSR 出静态照片 + 客户端激活 WebGL」范式。

## 文件位置

- 组件：`src/components/GlassBubble.astro`（SSR 出静态 `<img>` + 注册 `<glass-bubble>` 元素）
- 逻辑：`src/lib/glass-bubble.ts`（WebGL 着色器、SDF 折射、弹簧跟随、指针拖拽）
- 注册：`src/lib/glass-bubble-element.ts`（`registerGlassBubble()`，组件脚本与收藏板
  双击预览共用；动态建元素前必须先有它）
- 样式：`src/styles/glass-bubble.css`，已在 `src/layouts/Layout.astro` 中**全局引入**，
  用的时候无需再管 CSS。

## 快速上手

```astro
---
import GlassBubble from "@/components/GlassBubble.astro"
import photo from "@/assets/board/DONGLONGDONG-3.jpg"
---

<GlassBubble src={photo.src} alt="一张插画" label="照片上的一颗玻璃泡，拖动它" />
```

栅格图 import 得 `ImageMetadata`，传 `.src`；svg import 得字符串 URL，直接传。
画布纹理走 `new Image()` + 同源资源，外部 CDN 图若无 CORS 头会画成空图（玻璃
只剩光影，不报错）。

## Props

全部可选（`src` 建议必传），数值型会做区间约束。运行期改宿主对应 `data-*`
属性会即时生效（`data-src`/`data-corner` 重贴纹理，其余重画一帧）。

| 名称 | 类型 / 取值 | 默认 | 说明 |
| - | - | - | - |
| `src` | `string`（资产 URL） | — | 玻璃泡下的照片；Bencho 的 COW 占位不带图，必须自己指 |
| `alt` | `string` | `""` | SSR 静态照片的替代文本 |
| `label` | `string` | `"A ball of glass over a photograph. Drag it."` | 画布 `role="img"` 的 `aria-label` |
| `size` | 100 – 280 | `180` | 球直径（画布逻辑像素） |
| `bend` | 0 – 100 | `60` | 边缘折射强度 |
| `fringe` | 0 – 40 | `30` | 边缘色散（RGB 分离距离） |
| `corner` | 0 – 60 | `20` | 照片圆角 |

## 画布几何（为什么是 620px 方的）

照片装进 `PIC = 440` 见方的盒子居中，四周留 `PAD = 90` 的空边，合起来
`620×620`。照片**按原始比例完整适配**（contain，不裁切）：横图/竖图/方图都整张
亮相，装不满的那一侧由透明空边吸收，自带圆角。空边**不进纹理**（保持透明），
所以板/纸的背景会从底下透出来——球可以被拖过半出画面，越过的是一条「边」而不是
一堵「墙」；影子在图上压暗、在图外则投在纸上。
宿主盒 `width: min(100%, 620px); aspect-ratio: 1`，窄屏等比缩小：指针映射读
实时 `getBoundingClientRect()`，缩放不需要同步改任何数字。

## 无障碍与降级

- 画布 `role="img"` + `aria-label`（`label` 属性），照片 `<img>` 带 `alt`。
- **无 JS / 无 WebGL 也有图**：SSR 的照片 `<img>` 原样可见，画布挂载成功
  （`[data-active]`）才把它藏掉；`getContext("webgl")` 或着色器编译失败时
  直接不建画布，照片留存。
- **`prefers-reduced-motion`**：命中时取消弹簧与拖拽拉伸，球瞬移到指针。
- 触屏可拖：画布 `touch-action: none`，`setPointerCapture` 失败（脚本化事件）
  不崩整次拖拽。

## 注意事项

- **明暗主题**：着色器按 `dark` uniform 微调受光与投影强度；主题信号读
  `<html data-theme>`（`MutationObserver` 监听），无显式选择时回落
  `prefers-color-scheme`。换主题会重贴纹理（空边透出的「纸」颜色变了）。
- **双语孪生页**：`label`/`alt` 是组件属性、不走 `t()` 字典；需要双语时两版页面
  各自传对应语言文字（收藏板预览则是从 SSR 骨架的 `data-bubble-label` 取当前
  语言文案）。
- **一台画布一个 WebGL context**：一页面放多颗没问题（浏览器上限约八个），
  但不要整版每枚邮票挂一颗；要「看板上每件东西」应共用一颗球或按需挂载。
- **弹簧与 rAF**：循环「settle 即停」，无常驻 rAF；页面断开
  （View Transitions）时 `destroy()` 会撤画布、回落到静态照片。
- **命名元素**：宿主是自定义元素 `<glass-bubble>`（带连字符，合法命名）。

## 完整示例（收藏板的双击原图预览）

板下原有的「透过玻璃泡看」独立试验位已撤；现在的落地方式是
[`Board.astro`](../../src/components/Board.astro) 里的**双击邮票弹原图预览**：
SSR 骨架 `<dialog class="board-preview">`（原生 dialog）+ 客户端动态建泡，机制详见
[board.md §7](./board.md)。动态挂载的命令式用法：

```ts
const bubble = document.createElement("glass-bubble")
bubble.dataset.src = img.src
bubble.dataset.size = "180" // 球直径，画布逻辑像素，100–280
bubble.dataset.label = "原图上有一颗玻璃泡，按住它拖动"
host.replaceChildren(bubble)
// 移除：bubble.remove() 即触发 disconnectedCallback → destroy()，释放 WebGL
```

静态页面用法（直接放一颗泡）仍同「快速上手」：`<GlassBubble src={photo.src} … />`。
