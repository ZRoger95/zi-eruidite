# Anatomy 等距插图集成进 Astro 站点 —— 设计说明

日期：2026-10-15
状态：待评审
关联产物：`.superpowers/anatomy/family-press/`（gitignore 草稿区，只读，不作源码依赖）

## 1. 背景与动机

`family-press` 是用 `anatomy` 技能做的一幅「抽象工厂 · 家族冲压机」等距交互插图，
当前只存在于 gitignore 的草稿目录 `.superpowers/anatomy/family-press/`，以
`node build.mjs` 产出的自包含 HTML 页形式存在。目标是把它接进站点，作为可长期
维护、可继续扩展的能力。

### 1.1 为什么现有产物是 `.mjs` 而不是 `.ts`（背景说明，非缺陷）

`anatomy` 技能有两条互斥的接入路线：

| 路线 | 交付物 | 用到的核心 |
| --- | --- | --- |
| 独立 HTML / 静态 SVG / 非 React 站点 | `node build.mjs` 直接产出浏览器可打开的页面 | `kit/iso-kit.mjs`（技能把 TS 核心编译成纯 ESM） |
| React / Next.js 项目 | 把 `kit/` 拷进项目，几何放 `.ts`，静态图在 server component 生成 | `kit/iso-kit.ts` + `kit/react/draw.tsx` + `live.tsx` |

`family-press` 走的是第一条：`.mjs` 脚本能被 Node 零工具链直接执行，产出的是**构建期
中间产物**；浏览器最终拿到的是已内联的纯 JS（`kitScript()` 去掉 `export` + `live.js`）。
站点明确不用框架（无 React/Vue/Svelte），所以第一条路线本契合，`.mjs` 是设计使然而非问题。

**一旦要进 `src/` 长期维护，结论反转**：应改用 TypeScript。技能为此准备了带类型的
`kit/iso-kit.ts`（已核实：77 个 export、842 行，`fitProjection`/`solidSvg`/`lineSvg`/
`dotsSvg`/`figureSvg`/`plateHtml`/`pageHtml`/`haloOf`/`translateAlong`/`sideSeam`/
`radialTicks`/`knurl`/`topTicks`/`sideArc` 等本模块需要的函数全在其中）。

## 2. 目标与非目标

### 2.1 本期目标

- 建立一套**可复用的 anatomy 集成骨架**：以后新增一幅插图只需在 `src/lib/anatomy/<slug>/`
  下补一组模块并在 registry 登记一条。
- 把 `family-press` 作为第一幅图接入，落地到 `/figures` 画廊。
- `/figures` 列表页展示所有已登记插图；`/figures/<slug>` 展示单幅完整交互图。
- 插图跟随站点明暗主题自动翻转，无需为图单独维护一套主题开关。
- 无 JS / `prefers-reduced-motion` 降级：静态 SVG 由 SSR 产出，不执行脚本也能看到
  完整机器与已压印的一族印记。

### 2.2 本期非目标（明确延后）

- **不做中英双语**：`/figures` 本期只有中文。图内 chrome 文案（标题/hint/读数/图例/说明）
  维持现有硬编码中文。（双语作为紧随其后的第二步。）
- **不做 `.md` 文章正文内嵌**：不写 hast 指令把 `<family-press>` 注入 Markdown。
  `/figures` 是 `.astro` 路由，直接用 Astro 组件即可。内嵌进博客文章是另一件事，
  架构上不冲突，后续单独做。
- 不改动 `.superpowers/` 草稿区；不动已有页面/组件的行为。

## 3. 架构

沿用站点既有的 `HairlineFigure.astro` 范式：**SSR 出静态内容 + 一个自主定制元素
在客户端接管交互 + `<style>` 把图形主题令牌映射到站点色板**。区别在于 anatomy 的
SSR 出的是**完整 SVG**（不只是占位宿主），客户端脚本只负责"动"。

### 3.1 目录结构

```
src/lib/anatomy/
  iso-kit.ts            ← 复制 .qoder/skills/anatomy/kit/iso-kit.ts（带类型，客户端安全，不含 DOM）
  lathe.ts              ← 由 kit/lathe.mjs 移植（机械改名 + 补类型），仅 SSR 构建期使用，不进客户端 bundle
  family-press/
    model.ts            ← model.mjs 移植：纯数据与运动学，无 DOM、无 kit 依赖
    geo.ts              ← page-geo.mjs 移植：geo(M, GL, P) 几何工厂（去掉 K 形参，直接 import iso-kit）
    data.ts             ← 客户端安全：computeData() 用 iso-kit + model 算出 { M, P, GLYPHS, WITNESS, DIES, SETS, INITIAL, VB, RACK }
    figure.ts           ← 服务端：buildFigure() 复用 build.mjs 的 ITEMS 装配逻辑，产出完整 SVG 字符串 + 卡片结构
    live.ts             ← live.js 移植为 ES module：import 真函数，作用域限定到宿主元素，动画/交互/readout 全保留
  registry.ts           ← 插图登记表：[{ slug, title, hint, build, module }]，画廊与 getStaticPaths 都读它
src/components/AnatomyFigure.astro   ← 通用组件：按 slug 渲染 SSR SVG + 挂载客户端 live 元素
src/pages/figures/index.astro    ← 画廊首页，遍历 registry 出卡片（预览 + 链到详情）
src/pages/figures/[slug].astro   ← 单图详情，getStaticPaths 由 registry 生成，渲染完整交互图
src/styles/anatomy.css           ← 由 kit/iso.css 移植，--anatomy-* 令牌改指向站点令牌（见 §6）
```

> 注：具体函数签名、模块边界、类型细节由实现计划（writing-plans）确定；本文只锁定
> 单元职责与接口形态。

### 3.2 SSR / 客户端切分（核心不变量）

- **构建期（Node，Astro frontmatter）**：`figure.ts` 的 `buildFigure()` 用 `iso-kit` +
  `lathe` + `geo` 装配全部静态零件，排序后拼成 `<svg>…</svg>` 字符串与卡片 HTML，
  连同 `data.ts` 的 `computeData()` 结果一起交出去。`lathe` 只出现在这条路径。
- **客户端（浏览器）**：只有 `live.ts` + `data.ts` + `iso-kit.ts`（动画要用 iso-kit
  函数，且这些全是纯字符串/数学、无 DOM）被打包。**客户端不 import `lathe` 与
  `figure.ts`**，避免把服务端构建逻辑带进 bundle。
- **一致性保证**：SVG 与动画共用同一份 `geo`/`model`/`P`，由 Astro 打包器保证
  同一模块只解析一次——这正是原 `build.mjs` 用 `fn.toString()` 内联所要解决的
  "构建与页面漂移"问题，在模块世界里自动成立。

### 3.3 数据如何进客户端

`AnatomyFigure.astro` 把 `computeData()` 的 JSON 序列化进宿主元素的 `data-*` 属性
（或伴随一个 `<script type="application/json">`）。`live.ts` 从宿主元素读该 JSON，
再用 `import` 进来的 `geo`/`model` 重建 `$`。选择"属性传 JSON + 模块 import 逻辑"
而非"客户端重算 P"，是为了让 data 与 SSR 出图用的是同一份计算结果，杜绝二次漂移。

### 3.4 定制元素生命周期

- 元素名按 slug 命名（如 `<family-press-figure>`），或用单一 `<anatomy-figure>` +
  `data-slug` 分发；由实现计划择一，倾向前者（每幅图独立、互不干扰）。
- `connectedCallback` 挂载、`disconnectedCallback` 销毁（停 RAF、断 IO、清 timer）。
- **必须** `if (!customElements.get(name))` 再 `define`：站点用了 View Transitions，
  跨页切换会重跑 body 脚本，重复 `define` 会抛错。此范式 `HairlineFigure.astro` 与
  `introducing-v2/index.md` 的 `<click-counter>` 均已确立。

## 4. `.mjs`/`.js` → `.ts` 移植规则（关键改动点）

1. **iso-kit**：复制技能现成的 `iso-kit.ts`，**不改名、不重编译**。
2. **lathe**：`lathe.mjs` → `lathe.ts`，机械补类型（纯向量/矩阵数学，无 DOM）。仅服务端引用。
3. **model**：`model.mjs` → `model.ts`，给 `M`/`CELLS`/`FAMILIES`/`glyphOf` 等补类型。
4. **geo**：`page-geo.mjs` → `geo.ts`。当前签名 `geo(K, M, GL, P)` 传 kit 是因为独立页把
   kit 当全局内联；模块版删掉 `K` 形参，改在文件内 `import * as k from "../iso-kit"`，
   调用点用 `k.xxx`。
5. **build → figure**：`build.mjs` 是一段顶层脚本（算 P → 装配 `ITEMS` → 排序 → `figureSvg`）。
   包成 `buildFigure()` 纯函数返回 `{ svg, data }`，供 frontmatter 调用。卡片文案沿用
   `plateHtml` 的结构（本期硬编码中文）。
6. **live**：`live.js` → `live.ts`。
   - 删掉顶部把 kit 当全局的垫片 `const K = { iso, pathOf, … }`，改为 `import`。
   - `const DATA = __DATA__` → 从宿主元素读 JSON；`const GEO = __GEO__` → `import { geo }`。
   - **作用域化查询**：现在是 `document.querySelector(".iso-stage")`（假设全局单例）。
     改为在宿主元素内部 `this.querySelector(...)`，使多幅/多个实例互不串扰。
   - `window.__press = s` 调试钩子改为 `if (import.meta.env.DEV) window.__press = s`。
   - 动画主体（队列、巡演、`IntersectionObserver` 可见性、`prefers-reduced-motion`
     跳终态、pointer/keyboard）逻辑不变。

## 5. 组件与路由

### 5.1 `AnatomyFigure.astro`

```astro
---
// props: slug
// 1) 从 registry 取该 slug 的 buildFigure()，得 { svg, data }
// 2) 渲染 <family-press-figure data-state={json}> {@html svg} </...>
// 3) <script> import live.ts，注册定制元素（带 get() 守卫）
---
```

- 卡片外壳（`Fig / 标题 / hint / 读数` 四角 + 图例 + caption）由 SSR 出，与 anatomy
  成品视觉一致；caption 等文案本期中文。

### 5.2 `/figures/index.astro`

- 遍历 `registry`，每幅出预览卡（缩略/标题/一句 hint），链到 `/figures/<slug>`。
- 复用站点列表页既有排版（Utopia 12 列网格、`--step-*` 字号、卡片语言）。

### 5.3 `/figures/[slug].astro`

- `getStaticPaths` 由 `registry` 生成；页内渲染 `<AnatomyFigure slug={…} />`。
- 纳入站点导航/Layout，走 `Layout.astro` 的 `article`/常规两种布局皆可（本期用常规正文壳即可）。

## 6. 主题令牌映射

站点明暗信号是 `:root[data-theme="dark"│"light"]`（见 `ThemeToggle.astro`），Radix
`--gray-*` 与 `--background`/`--foreground` 自带 `light-dark()`。因此把 anatomy 的
`--anatomy-*` 令牌**定义为单套**、全部指向站点令牌，它们会随主题自动翻，无需把
`data-theme` 再传进 `.iso` 宿主。做法与 `HairlineFigure.astro` 的 `<style>` 映射一致：

```css
.iso {
  /* paper 必须等于图形所坐底色，否则实心零件会显出一块补丁 */
  --anatomy-paper: var(--background);
  --anatomy-card: var(--background);
  --anatomy-hi: var(--gray-12);      --anatomy-strong: var(--gray-12);
  --anatomy-mid: var(--gray-9);      --anatomy-text: var(--gray-11);
  --anatomy-lo: var(--gray-6);       --anatomy-muted: var(--gray-8);
  --anatomy-faint: var(--gray-4);
  --anatomy-lit: light-dark(#000, #fff);      /* 全站唯一 lit 强调 */
  --anatomy-shade-0: color-mix(in oklab, var(--background), var(--gray-8) 22%);
  --anatomy-shade-1: color-mix(in oklab, var(--background), var(--gray-8) 15%);
  --anatomy-shade-2: color-mix(in oklab, var(--background), var(--gray-8) 8%);
  --anatomy-shade-3: color-mix(in oklab, var(--background), var(--gray-8) 3%);
  --anatomy-halo: var(--gray-8);     --anatomy-halo-opacity: .25;
}
```

- 删掉 `iso.css` 里 `.iso[data-theme="light"]{…}` 那一整套硬编码色值（单套 + 令牌即可）。
- 与站点设计语言对齐：卡片 `box-shadow` 的 `0 0 0 1px var(--anatomy-mid)` 换成站点
  1px hairline 约定；四角标签 `font-size:10.5px` 换成 `--step--1`。
- 具体灰阶档位（`--gray-4/6/8/9/11/12` 是否为项目实际 ramp 名）在实现计划里对照
  `src/styles/color.css` 核实后填。

## 7. 体积与性能

- `iso-kit` 由 Vite 对 `<script type="module">` 去重分块，全站只出一份 chunk，画廊多幅
  共用，不随图数量线性增长。客户端 bundle **不含** `lathe`（仅 SSR 用）。
- family-press 的 SVG 含大量路径数据，详情页整页在 `compressHTML: true` + Pages 的
  brotli 下会显著压缩。**确切体积在实现时用构建产物实测后再决定是否优化**，本文不预设
  数字。若实测偏重，可选优化：圆柱 `steps` 从 18/24 降到 12/16，或列表页缩略只保留压印区
  局部放大图。**本期不主动降级**，先按成品质量落地。
- 交互循环 `live.ts` 已有：仅在元素可见时 `requestAnimationFrame`（IntersectionObserver），
  `prefers-reduced-motion` 下跳过动画直接终态，空闲巡演在用户接手时让位。

## 8. 错误处理与边界

- **多实例隔离**：作用域化到宿主元素后，同一页放多幅不串扰（见 §4.6）。
- **View Transitions 重跑**：`customElements.get()` 守卫防重复注册；`disconnectedCallback`
  彻底清理（停 RAF、断 IO、`clearTimeout`），避免离开页面后仍在后台跑循环。
- **SSR 失败**：`buildFigure()` 抛错应在构建期暴露（frontmatter 直接崩），不留到运行时；
  这是期望行为——坏图不进产物。
- **降级可见性**：不执行 JS 时，SSR 的完整 SVG 必须已含初始压印状态（`INITIAL` 设定
  "月相在机、太阳已压过一次"），使静态图独立可读。

## 9. 验证

- `npm run format:check`（Biome）全绿；新增 `.ts` 均通过。
- `npm run build` 通过（内容 schema 校验 + 路由生成）。
- `npm run dev` 手动检查：
  - `/figures` 列表出现 family-press 卡片；点进 `/figures/family-press` 见完整交互图。
  - 明暗主题切换下图形正确跟随（含 paper 补丁、shade 层次、lit 强调）。
  - hover 挑头 / 点击压印 / ←→ 换头 / 退格送料 / 空格回车压一次 均可用。
  - 移动端宽度（390px）不横向溢出。
  - 关掉 JS：静态机器 + 已压印印记可见；开 `prefers-reduced-motion`：交互跳终态。
- **不需要**重跑 anatomy 的 `lines.mjs` 线端点检查——静态 SVG 与 `build.mjs` 成品逐字节
  一致（同一段装配逻辑、同一份 geo），该检查在草稿阶段已归零；仅在移植中改动了任何
  路径生成时才需回归。

## 10. 交付顺序（供 writing-plans 细化）

1. 复制 `iso-kit.ts`；移植 `lathe.ts`（服务端）。
2. 移植 `family-press`：`model.ts` → `geo.ts`（去 K 形参）→ `data.ts`（computeData）
   → `figure.ts`（buildFigure）→ `live.ts`（作用域化 + 删垫片 + DEV 钩子）。
3. 移植 `anatomy.css` + §6 令牌映射，对照 `color.css` 校准灰阶。
4. `registry.ts` + `AnatomyFigure.astro` + `/figures/index.astro` + `/figures/[slug].astro`。
5. §9 全量验证（format / build / dev 手检 / 降级）。

## 11. 假设

- 站点导航加入 `/figures` 入口不在本期强约束内（可后续补 topbar/sidebar 链接）；本期
  保证 `/figures` 路由可直达即可。
- `/figures` 纳入 sitemap/RSS 的处理沿用站点现状，若需排除在实现计划里加过滤。
- family-press 的交互语义与读数文案维持草稿成品原样（本期中文，不改模型数值）。
