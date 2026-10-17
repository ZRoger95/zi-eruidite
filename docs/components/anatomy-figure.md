# AnatomyFigure 等距机器组件

把一段抽象的技术概念画成**一台看得懂的小机器**（等距、实色零件、四段明暗、带框卡片与
实时读数），并给它加上克制的动画：鼠标悬停挑件、点一下走一道工序、←→ 切换、退格清空。
适合做设计模式的讲解图或文章里的技术插图。

由 [Anatomy 技能](https://skills.wheresryan.sh/anatomy)（本地副本见
[`.agents/skills/anatomy/SKILL.md`](../../.agents/skills/anatomy/SKILL.md)）生成，按本站惯例落为
**「构建期出全图 SVG + 客户端只做动画」** 范式：SSR 一次出全、无 JS 也能看全，客户端 bundle
里永不含 `figure.ts` / `lathe.ts`（构建专用）。

## 文件位置

- 组件：`src/components/AnatomyFigure.astro`（渲染 `<div class="iso"><anatomy-figure …></…></div>` +
  定义自主元素，客户端只 `import` `registry-client.ts`）
- 服务端注册表：`src/lib/anatomy/registry.ts`（`FIGURES_META` 标题/hint、`BUILDERS` 构建函数）
- 客户端注册表：`src/lib/anatomy/registry-client.ts`（`MOUNTS`：slug → mount 函数，返回 `{ destroy }`）
- 每幅机器：`src/lib/anatomy/<slug>/`（`figure.ts` 构建 SSR、`live.ts` 挂载交互）
- 底座工具：`src/lib/anatomy/iso-kit.ts`（等距投影、挤出、路径生成、`plateHtml` 卡片外壳）
- 样式：`src/styles/anatomy.css`（把 `--anatomy-*` 令牌指向站点色板，已全局引入）

## 快速上手

```astro
---
import AnatomyFigure from "@/components/AnatomyFigure.astro"
---

<AnatomyFigure slug="family-press" />
```

`slug` 必填，取值见下表；未知 slug 会在构建期抛 `Unknown anatomy figure`。

## Props

| 名称 | 类型 / 取值 | 默认 | 说明 |
| - | - | - | - |
| `slug` | `string`（见下）| 必填 | 选哪台机器；组件据此查 `BUILDERS` 出图、查 `MOUNTS` 激活 |

### 已接入的机器（`FIGURES_META` / `BUILDERS`）

| slug | 标题 | 交互 hint |
| - | - | - |
| `family-press` | 抽象工厂 · 家族冲压机 | 鼠标移到架上挑一只头 · 点一下压一次 · ←→ 换头 · 退格送料 |
| `builder-bench` | 建造者 · 分度装配台 | 鼠标移到左侧架上换建造者 · 点一下走一道工序 · ←→ 换工序 · 退格清空 |

> 画廊 `/figures`（`src/pages/figures/index.astro`）与详情页 `/figures/[slug].astro`
> 都按 `FIGURES_META` 枚举自动列出生成，新增机器无需改路由。

## 主要模式 / 新增一台机器

组件本身只有 `slug` 一个「模式」。真正的工作量在**登记一台新机器**，务必 server / client 分开：

1. 建目录 `src/lib/anatomy/<slug>/`，写 `figure.ts`（导出 `buildFigure()`，构建期产出
   `{ svg, data, chrome }`）与 `live.ts`（导出 `mount<Name>(host)`，返回 `{ destroy }`，
   只做动画并把交互状态读回 `host`）。
2. 在 `registry.ts`：`import { buildFigure }` 进 `BUILDERS`，并补 `FIGURES_META` 的标题/hint。
3. 在 `registry-client.ts`：`import` 对应 mount 进 `MOUNTS`。

> **关键不变量**：`AnatomyFigure.astro` 的 `<script>` 只 `import` `registry-client.ts`。
> 一旦它 import 了汇总版 `registry.ts`，Vite 会把 `figure.ts`（含 `lathe`）打进客户端
> bundle，违反「客户端不含构建专用代码」。所以从一开始就分 server / client 两份，不写「先合后拆」。

## 无障碍与降级

- **SSR 出全图**：`connectedCallback` 之前，`<anatomy-figure>` 里已带着完整机器 SVG，
  无脚本、首屏、读屏都能看全；客户端只是把静态图「接管」成可交互舞台（`.iso-stage`）。
- 舞台带 `role="group"` + `aria-label`，实时读数走 `aria-live="polite"` 的 `.iso-live`。
- 元素定义用 `if (!customElements.get("anatomy-figure"))` 守卫：View Transitions 跨页会
  重跑 body 脚本，重复 `define` 会抛 `NotRegisteredError`。`disconnectedCallback` 里释放
  `requestAnimationFrame` / `IntersectionObserver` / `setTimeout`，后台循环不会活过它的页面。

## 注意事项

- **多实例互不干扰**：所有 DOM 查询作用域限定到宿主元素，按 `data-slug` 分发，禁止全局
  `document.querySelector(".iso-stage")`，否则同页两台机器会串扰。
- **令牌 / 明暗**：机器配色由 `anatomy.css` 的 `.iso` 令牌块决定，全部指向自带 `light-dark()`
  的 Radix 色阶，故随 `<html data-theme>` 自动明暗、无需 JS。明暗面的明暗方向以 `--background`
  为基准做 `color-mix`（顶面朝白、暗面朝黑），改色改这里。
- **构建产物校验**：改完后 `npm run build`，确认 `dist/` 客户端 chunk 不含 `lathe`/`figure`。
- **双语孪生页**：目前 `FIGURES_META` 的标题/hint 为中文；若要英文版，需为对应文案补 `en` 变体。

## 完整示例（详情页）

`src/pages/figures/[slug].astro` 用 `getStaticPaths` 按 `FIGURES_META` 生成每幅机器：

```astro
---
import Layout from "@/layouts/Layout.astro"
import AnatomyFigure from "@/components/AnatomyFigure.astro"
import { FIGURES_META } from "@/lib/anatomy/registry"

export function getStaticPaths() {
  return Object.entries(FIGURES_META).map(([slug, meta]) => ({
    params: { slug },
    props: { slug, meta },
  }))
}
const { slug, meta } = Astro.props
---

<Layout>
  <h1>{meta.title}</h1>
  <AnatomyFigure slug={slug} />
</Layout>
```

在文章里当讲解图，直接写 `<AnatomyFigure slug="builder-bench" />` 即可。
