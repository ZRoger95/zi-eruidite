# Anatomy 等距插图集成 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `.superpowers/anatomy/family-press/` 里的等距交互插图以可复用的 TS 模块 + 通用 Astro 组件的形式接进站点,并新增 `/figures` 画廊(中文,本期)。

**Architecture:** 沿用 `src/components/HairlineFigure.astro` 已有的"SSR 出静态内容 + 自主定制元素接管交互 + `<style>` 把图形令牌映射到站点色板"范式;把 `.mjs` 草稿重写成 `src/lib/anatomy/` 下的一组 `.ts`,构建期由 `buildFigure()` 生成完整 SVG、客户端由 `live.ts` 只负责动画。新增单一 `<anatomy-figure>` 定制元素按 `data-slug` 分发到 registry 里的 mount 函数,保证多实例互不干扰。

**Tech Stack:** Astro 7 (Node ≥ 22.12)、TypeScript strict、原生 Web Components、Biome、Vite。无 UI/CSS 框架。

**Spec:** [`docs/superpowers/specs/2026-10-15-anatomy-figures-integration-design.md`](../specs/2026-10-15-anatomy-figures-integration-design.md)

## Global Constraints

- Node `>=22.12.0`(`package.json:engines`)。
- Biome:2 空格缩进、80 字符行宽、JS/TS 双引号、**TS 省略分号**(与仓库现有 `.ts` 一致);CSS 格式化关闭。
- 路径别名 `@/*` → `./src/*`(`tsconfig.json:5`)。
- 站点不用 UI/CSS 框架:交互一律走原生自定义元素;样式全用 CSS 自定义属性 + `light-dark()`。
- 本期只做中文:图内 chrome(标题/hint/读数/图例/说明)沿用草稿里的中文硬编码;不做 i18n。
- 本期不做 `.md` 文章正文内嵌:hast 插件留待后续。
- `.superpowers/` 是 gitignore 草稿目录,只作**移植来源**,不得作为运行/构建依赖。
- `astro.config.ts:29` `compressHTML: true`;产物走 Pages 的 brotli,SVG 体积无需手动降级。

## Review Focus

规范本身没写但一旦出问题最会咬人的输入类:

- **View Transitions 跨页重跑脚本 → `customElements.define` 抛 `NotRegisteredError`**。期望行为:每个 mount 定义处**必须** `if (!customElements.get(name))` 守卫(仓库里 `HairlineFigure.astro:67`、`introducing-v2/index.md:547` 已确立)。
- **同一页两个 `<anatomy-figure>` 实例或跨页复用 → `live.ts` 若仍 `document.querySelector(".iso-stage")` 就串扰**。期望行为:所有 DOM 查询作用域限定到宿主元素;`IntersectionObserver`/`requestAnimationFrame`/`setTimeout` 都在 `disconnectedCallback` 里释放。
- **`prefers-reduced-motion` 下动画应跳终态而不是卡半帧**。原 `live.js:168–194` 已实现(`stepAction` 里 `calm ? 1 : s.t`),移植时**不能删掉这条分支**。
- **主题切换时 figure 应瞬变、不需要 JS 干预**。原 `iso.css` 里的 `.iso[data-theme="light"]{…}` 硬编码色块**必须删干净**;`--anatomy-*` 只保留一套指向 `--gray-*`/`--background`/`--foreground`(它们自带 `light-dark()`)。
- **Astro 对 `set:html` 注入的 SVG 字符串不做处理**,但会作用域化组件 `<style>` 到 `astro-xxxxx` 属性。所以 `anatomy.css` 必须**全局**引入(`Layout.astro` 的 CSS 段)——放组件 `<style>` 里 SVG 拿不到。

---

## File Structure

```
新增:
  src/lib/anatomy/iso-kit.ts                       复制 .qoder/skills/anatomy/kit/iso-kit.ts(逐字节)
  src/lib/anatomy/lathe.ts                          由 kit/lathe.mjs 移植(仅 SSR 引用)
  src/lib/anatomy/family-press/model.ts             由 model.mjs 移植
  src/lib/anatomy/family-press/geo.ts               由 page-geo.mjs 移植(去 K 形参)
  src/lib/anatomy/family-press/data.ts              客户端安全的 computeData()(不含 lathe)
  src/lib/anatomy/family-press/figure.ts            buildFigure():装配 ITEMS、排序、figureSvg + plateHtml 结构
  src/lib/anatomy/family-press/live.ts              由 live.js 移植:import 真函数、作用域化、DEV 钩子
  src/lib/anatomy/registry.ts                       服务端:FIGURES_META + BUILDERS(含 buildFigure),供 SSR/路由用
  src/lib/anatomy/registry-client.ts               客户端:MOUNTS(只含 live mount),供组件 <script> 用,不拖入 lathe
  src/components/AnatomyFigure.astro                通用组件:SSR 出 <anatomy-figure data-slug data-state>{svg}</...> + 定义元素
  src/pages/figures/index.astro                     画廊首页
  src/pages/figures/[slug].astro                    单图详情(getStaticPaths 由 registry 生成)
  src/styles/anatomy.css                            由 kit/iso.css 移植,单套令牌指向站点色板
  scripts/tests/anatomy-fidelity.mjs                Node 脚本:跑 buildFigure 与 committed fixture 逐字节对比
  scripts/tests/anatomy-check.sh                    端到端 bash 回归:保真 + build + dist grep
  scripts/tests/fixtures/anatomy/family-press.svg   移植时从 .superpowers 现产物提取,后续作为回归基准

修改:
  src/layouts/Layout.astro                           在全局 CSS import 段追加 `import "@/styles/anatomy.css"`
```

---

## Task 1: Anatomy 移植与保真回归

**Files:**
- Create: `src/lib/anatomy/iso-kit.ts` — 逐字节复制 `.qoder/skills/anatomy/kit/iso-kit.ts`
- Create: `src/lib/anatomy/lathe.ts` — 由 `.qoder/skills/anatomy/kit/lathe.mjs` 移植:rename + 补类型(纯数学,无 DOM)
- Create: `src/lib/anatomy/family-press/model.ts` — 由 `.superpowers/anatomy/family-press/model.mjs` 移植
- Create: `src/lib/anatomy/family-press/geo.ts` — 由 `.superpowers/anatomy/family-press/page-geo.mjs` 移植,**去掉 `K` 形参**,内部 `import * as k from "../iso-kit"`
- Create: `src/lib/anatomy/family-press/data.ts` — 客户端安全:导出 `computeData()` 返回 `{ M, P, GLYPHS, WITNESS, DIES, SETS, INITIAL, VB, RACK }`,只 import `iso-kit` + `model` + `geo`,**不 import `lathe`**
- Create: `src/lib/anatomy/family-press/figure.ts` — 服务端 `buildFigure()` 返回 `{ svg: string, data, chrome }`,把 `.superpowers/anatomy/family-press/build.mjs:29-459` 的 ITEMS 装配逻辑包成函数(`lathe` 只在这里 import)
- Create: `scripts/tests/fixtures/anatomy/family-press.svg` — 从 `.superpowers/anatomy/family-press/family-press.html` 里用 `<svg` / `</svg>` 边界提取 `<svg…>…</svg>` 原样落盘
- Create: `scripts/tests/anatomy-fidelity.mjs` — 见 Step 4

**Interfaces:**
- Produces:
  - `buildFigure(): { svg: string; data: FigureData; chrome: FigureChrome }`,`FigureData` = `computeData()` 的返回,`FigureChrome` 含 `{ fig, title, hint, readout, keys, caption }`(本期中文)
  - `computeData(): FigureData`
  - `geo(M: typeof M, GL: GlyphFactory, P: Projection): GeoBundle`(签名去掉旧 `K`)

- [ ] **Step 1: 复制 `iso-kit.ts` 与移植 `lathe.ts`**

逐字节 `cp` 技能的 `kit/iso-kit.ts` 到 `src/lib/anatomy/iso-kit.ts`。把 `kit/lathe.mjs` 转 `lathe.ts`:重命名后缀,给 `frameAlong(o: Point3, a: Point3): Frame` 等纯函数补参数/返回类型,不改逻辑。Biome 允许 TS 分号省略,原 `.mjs` 里带分号的行按 Biome `format --write` 自动去掉即可。

- [ ] **Step 2: 移植 `model.ts`,去掉 `armAngleOf` 与 `depthOfArm` 的重名**

`model.mjs` 已导出 `armAngleOf`,原 `live.js:66` 里又重定义了一遍同名局部函数;移植到 `model.ts` 时**只保留 model 里那份**,`live.ts`(Task 2)删掉局部重定义,直接 `import { armAngleOf }`。

- [ ] **Step 3: 移植 `geo.ts`(去掉 `K` 形参),写 `data.ts` 与 `figure.ts`**

`geo.ts`:文件顶部 `import * as k from "../iso-kit"`,把 `geo` 从 `(K, M, GL, P) => {…}` 改成 `(M, GL, P) => {…}`,内部所有 `K.xxx` 换成 `k.xxx`(用 sed/编辑器一次性替换)。

`data.ts`:从 `build.mjs:18-44` 抽出 P 的计算(依赖 `k.fitProjection` + `k.boxCorners`),再按 `build.mjs:24-26`、`build.mjs:436-460` 抽出 GLYPHS/WITNESS/RACK/VB/INITIAL,组合成一个纯函数。客户端脚本 `live.ts` 会 import 它,所以**不得 import `lathe`**(lathe 只在 `figure.ts` 里用)。

`figure.ts`:`export function buildFigure()` 里执行原 `build.mjs:56-433` 的全部 ITEMS 装配(base/seals/magazine/bolster/frame/carriageSvg/headSvg/ramSvg 各函数照搬,`k.`/`G.` 前缀保留),最后调用 `k.figureSvg({...})` 得到 `svg`,调用 `k.plateHtml({...})` 得到卡片外壳 `chrome`(把 `build.mjs:467-483` 里的字段原样搬过来,`body` 位暂不拼,由 Astro 组件负责)。返回 `{ svg, data, chrome }`。

- [ ] **Step 4: 写保真度测试 `scripts/tests/anatomy-fidelity.mjs` 与 fixture**

先跑一次性命令提取参考 SVG 到 fixture:

```bash
mkdir -p scripts/tests/fixtures/anatomy
node -e 'const fs=require("node:fs");const h=fs.readFileSync(".superpowers/anatomy/family-press/family-press.html","utf8");const s=h.indexOf("<svg"),e=h.indexOf("</svg>")+6;fs.writeFileSync("scripts/tests/fixtures/anatomy/family-press.svg",h.slice(s,e))'
```

`anatomy-fidelity.mjs`(Node ≥ 22.12 原生 strip-types):

```js
// 用 node --experimental-strip-types 执行
import { buildFigure } from "../../src/lib/anatomy/family-press/figure.ts"
import { readFileSync } from "node:fs"
const { svg } = buildFigure()
const want = readFileSync(new URL("./fixtures/anatomy/family-press.svg", import.meta.url), "utf8")
if (svg !== want) {
  console.error("family-press 移植后 SVG 与原产物不一致(长度", svg.length, "vs", want.length, ")")
  process.exit(1)
}
console.log("anatomy fidelity ok,", svg.length, "bytes")
```

- [ ] **Step 5: 跑保真测试验证通过**

Run: `node --experimental-strip-types scripts/tests/anatomy-fidelity.mjs`
Expected: `anatomy fidelity ok, <N> bytes`(退出码 0)

若失败,先对比 fixture 与 `buildFigure().svg` 的头 200 字节找差异——通常是 `figure.ts` 里 `put()` 顺序、`LAYER` 起始值或 `depthSort` key 与原 `build.mjs` 有一处偏差;修复靠**回到 build.mjs 逐段比对**,不靠"接受小差异"(否则 §Review Focus 的"SVG 未改动"假设会失效)。

- [ ] **Step 6: `format:check` 与构建通过**

Run: `npm run format:check && npm run build`
Expected: 两者都成功;此时**没有任何页面 import `figure.ts`**,所以 `dist/` 大小不变。这一步只是证明新 `.ts` 编译/打包不炸。

- [ ] **Step 7: Commit**

```bash
git add src/lib/anatomy src/styles scripts/tests/anatomy-fidelity.mjs scripts/tests/fixtures/anatomy Task1相关的 .superpowers 只读来源不算入 git
git commit -m "Port anatomy family-press kit to TypeScript with fidelity check"
```

---

## Task 2: `live.ts` 客户端动画模块

**Files:**
- Create: `src/lib/anatomy/family-press/live.ts` — 由 `.superpowers/anatomy/family-press/live.js` 移植

**Interfaces:**
- Consumes: `iso-kit`、`./model`、`./geo`、`./data` 里的 `computeData`
- Produces: `export function mountFamilyPress(host: HTMLElement): { destroy(): void }`,`host` 是 `<anatomy-figure data-slug="family-press">`,其 `dataset.state` 已由 SSR 填好 JSON

**关键点**:
- **删**原 `live.js:11-39` 那段 `const K = { iso, pathOf, … }` 全局垫片,改成 `import { iso, pathOf, lineSvg, dotsSvg, solidSvg, slabOf, cylinder, extrude, ring, onTop, lineOnTop, planOutline, insetPlan, corners, sideSeam, radialTicks, knurl, topTicks, translateAlong, towardViewer, depthOf, segment } from "../iso-kit"`。
- **删**原 `live.js:6-7` `__DATA__`/`__GEO__` 占位;`const DATA = computeData()`(客户端重算一次是安全的——`data.ts` 是纯函数;但为了严格与 SSR 出图同源,`host.dataset.state` 里的 JSON 才是**权威**,`computeData()` 只用来给 `$ = geo(M, GL, P)` 补上 `P` 之外的绑定,见下条)。
- **P 从 host.dataset.state 反解**:原 `DATA.P` 是 `Projection` 对象(几个数字),JSON 化没问题,`live.ts` 里 `const { M, P, GLYPHS, WITNESS, DIES, SETS, INITIAL, VB, RACK } = JSON.parse(host.dataset.state)`。`geo(M, GL, P)` 三参都齐了。
- **作用域化查询**:原 `live.js:44-48` 用 `document.querySelector(".iso-stage")` / `[data-readout]` / `[data-live]`,全部改成 `host.querySelector(...)`;`svgEl = host.querySelector("svg")!`。
- **`window.__press`** 改成 `if (import.meta.env.DEV) (window as any).__press = s`。
- **`armAngleOf`** 从 `./model` import(Task 1 Step 2 已锁定单一定义)。
- 生命周期:`mountFamilyPress` 返回 `destroy`,`destroy` 里做:`cancelAnimationFrame(frame)` / `io.disconnect()` / `clearTimeout(idleTimer)`,并把 `stage` 上的三个 `addEventListener` 用 `AbortController` 一次性拆掉。

**Interfaces (Reveal):**

```ts
export function mountFamilyPress(host: HTMLElement): { destroy(): void }
```

- [ ] **Step 1: 移植 `live.js` → `live.ts`,按上面关键点逐条改**

一步完成:整段复制、按上面清单做定点替换。**不改动画/交互/readout 逻辑**——原 `live.js` 是 anatomy 已验收的成品。

- [ ] **Step 2: `astro build` 通过(此任务无人引用,只证明类型 OK)**

Run: `npm run build`
Expected: 构建成功。`live.ts` 尚未被任何页面引用,不会进任何 bundle,`dist/` 大小不变。

- [ ] **Step 3: `format:check` 通过**

Run: `npm run format:check`
Expected: 无 diff。

- [ ] **Step 4: Commit**

```bash
git add src/lib/anatomy/family-press/live.ts
git commit -m "Port family-press live.js to ES module with host-scoped queries"
```

---

## Task 3: `anatomy.css` 主题令牌映射 + Layout 全局引入

**Files:**
- Create: `src/styles/anatomy.css` — 由 `.qoder/skills/anatomy/kit/iso.css` 移植
- Modify: `src/layouts/Layout.astro`(在全局 CSS import 段末尾追加一行 `import "@/styles/anatomy.css"`,当前段是 `Layout.astro:2-17`)

**Interfaces:**
- Produces: 全局 CSS,`.iso` 选择器下的 `--anatomy-*` 变量指向站点令牌;`.iso-*` 组件类沿用 iso.css 定义。

**移植规则(逐条)**:
- **删掉**整块 `.iso[data-theme="light"] { … }` 硬编码(light 由令牌自动翻)。
- `.iso` 根块里所有 `--anatomy-*` 换成站点令牌(具体档位对照 spec §6):
  - `--anatomy-paper`、`--anatomy-card`、`--anatomy-top`、`--anatomy-face` 都取 `var(--background)`(实心零件底色等于图形所坐底色,避免"补丁"效应)
  - `--anatomy-hi: var(--gray-12)`、`--anatomy-strong: var(--gray-12)`
  - `--anatomy-mid: var(--gray-9)`、`--anatomy-text: var(--gray-11)`
  - `--anatomy-lo: var(--gray-6)`、`--anatomy-muted: var(--gray-8)`
  - `--anatomy-faint: var(--gray-4)`
  - `--anatomy-lit: light-dark(#000, #fff)`
  - `--anatomy-shade-0/1/2/3`:按 spec §6 的 `color-mix(in oklab, var(--background), var(--gray-8) X%)`,X 依次 22/15/8/3
  - `--anatomy-halo: var(--gray-8)`、`--anatomy-halo-opacity: .25`
  - `--anatomy-dot: var(--gray-11)`
  - `--anatomy-red/green/blue` 保留 iso.css 里的 `light-dark(·, ·)`(本期不用)
  - `--anatomy-weight`、`--anatomy-ease`、`--anatomy-mono`、`--anatomy-lift` 沿用 iso.css 原值
- `.iso-plate` 的 `box-shadow` 里 `0 0 0 1px var(--anatomy-mid)` 那条**换成站点自己的 hairline 语言**(参考 `src/styles/shape.css` 里的 1px 细线约定)。
- 四角标签的 `font-size: 10.5px` → `font-size: var(--step--1)`(Utopia 流体小字号)。

- [ ] **Step 1: 写 `src/styles/anatomy.css`**

逐段照 iso.css 结构抄,应用上面规则。保留所有 `.iso-svg`/`.iso-solid`/`.iso-line`/`.iso-halo`/`.iso-plate` 等选择器,只改令牌定义与两条 chrome 规则。

- [ ] **Step 2: 在 `Layout.astro` 追加全局 import**

在 `Layout.astro` 顶部 CSS import 段的末尾(现有 `import "@/styles/shape.css"` 之后,即 line 17 后)加一行:

```ts
import "@/styles/anatomy.css"
```

- [ ] **Step 3: 验证**

Run: `npm run build && grep -R "anatomy-paper" dist/_astro/*.css | head -1 && grep -c 'data-theme="light"' dist/_astro/*.css`
Expected: 构建成功;至少一个 CSS chunk 里出现 `--anatomy-paper:var(--background)` 之类的映射(说明 CSS 进了产物);`data-theme="light"` 出现次数为 **0**(整块被删干净)。

- [ ] **Step 4: Commit**

```bash
git add src/styles/anatomy.css src/layouts/Layout.astro
git commit -m "Add anatomy.css mapped to site tokens and wire it globally in Layout"
```

---

## Task 4: `registry.ts` + `AnatomyFigure.astro`

**Files:**
- Create: `src/lib/anatomy/registry.ts` — **服务端安全**:import `buildFigure`,导出 `FIGURES_META` + `BUILDERS`,供 Astro frontmatter 与路由 `getStaticPaths` 使用
- Create: `src/lib/anatomy/registry-client.ts` — **客户端专用**:只 import `mountFamilyPress`,导出 `MOUNTS`,绝不拖进 `figure.ts`/`lathe`
- Create: `src/components/AnatomyFigure.astro`

**Interfaces:**
- Consumes: Task 1 的 `buildFigure`、Task 2 的 `mountFamilyPress`
- Produces:
  - `FIGURES_META: Record<string, { title: string; hint: string }>`
  - `BUILDERS: Record<string, () => { svg: string; data: Record<string, unknown>; chrome: Chrome }>`(`Chrome = { fig, title, hint, readout, keys, caption }`),from `registry.ts`
  - `MOUNTS: Record<string, (host: HTMLElement) => { destroy(): void }>`,from `registry-client.ts`
  - Astro 组件 props:`{ slug: string }`
  - 自定义元素 `anatomy-figure`:`connectedCallback` 从 `data-slug` 查 `MOUNTS` 调 `mount`,把返回的 `{destroy}` 存实例上供 `disconnectedCallback`。

> **关键不变量(spec §3.2)**:`AnatomyFigure.astro` 的 `<script>` 只 import `registry-client.ts`。若它 import 了汇总版 `registry.ts`,Vite 会把 `figure.ts`(含 `lathe`)一并打进客户端 bundle,违反"客户端不含 lathe"。因此从一开始就分 server/client 两份,不写"先合后拆"。

- [ ] **Step 1: 写 `registry.ts`(服务端)**

```ts
import { buildFigure } from "./family-press/figure"
export const FIGURES_META: Record<string, { title: string; hint: string }> = {
  "family-press": {
    title: "抽象工厂 · 家族冲压机",
    hint: "鼠标移到架上挑一只头 · 点一下压一次 · ←→ 换头 · 退格送料",
  },
}
export const BUILDERS: Record<
  string,
  () => { svg: string; data: Record<string, unknown>; chrome: Chrome }
> = {
  "family-press": buildFigure,
}
```

(`Chrome` 类型由 `figure.ts` 导出或在此声明,取二者之一保持一致。)

- [ ] **Step 2: 写 `registry-client.ts`(客户端)**

```ts
import { mountFamilyPress } from "./family-press/live"
export const MOUNTS: Record<
  string,
  (host: HTMLElement) => { destroy(): void }
> = {
  "family-press": mountFamilyPress,
}
```

- [ ] **Step 3: 写 `AnatomyFigure.astro`**

frontmatter(**只 import `registry.ts`,SSR 端**):

```astro
---
import { BUILDERS, FIGURES_META } from "@/lib/anatomy/registry"
type Props = { slug: string }
const { slug } = Astro.props
const build = BUILDERS[slug]
if (!build) throw new Error(`Unknown anatomy figure: ${slug}`)
const { svg, data, chrome } = build()
---
```

模板:外层 `<div class="iso">` 挂根令牌;按 `iso-kit.ts:706 plateHtml` 的结构手写 `figure.iso-figure > .iso-plate > .iso-plate-corners(四角 fig/title/hint/readout)+ <anatomy-figure data-slug={slug} data-state={JSON.stringify(data)}>{@html svg}</anatomy-figure>` + `figcaption.iso-legend(keys/caption)`。四角文案取 `chrome`,读数为 `chrome.readout`。

客户端 `<script>`(**只 import `registry-client.ts`**):

```js
import { MOUNTS } from "@/lib/anatomy/registry-client"
if (!customElements.get("anatomy-figure")) {
  customElements.define("anatomy-figure", class extends HTMLElement {
    #h = null
    connectedCallback() {
      if (this.#h) return
      const mount = this.dataset.slug ? MOUNTS[this.dataset.slug] : null
      if (!mount) return
      this.#h = mount(this)
    }
    disconnectedCallback() {
      this.#h?.destroy()
      this.#h = null
    }
  })
}
```

- [ ] **Step 4: `npm run build` 通过**

Run: `npm run build`
Expected: 成功。此任务结束时 `dist/` 里仍无 `/figures` 路由(下一步建),但 `AnatomyFigure.astro` 与两个 registry 文件都存在。

- [ ] **Step 5: Commit**

```bash
git add src/lib/anatomy/registry*.ts src/components/AnatomyFigure.astro
git commit -m "Add anatomy figure registry and generic AnatomyFigure component"
```

---

## Task 5: `/figures` 画廊路由

**Files:**
- Create: `src/pages/figures/index.astro`
- Create: `src/pages/figures/[slug].astro`

**Interfaces:**
- Consumes: `FIGURES_META`(来自 `registry.ts`)、`AnatomyFigure.astro`
- Produces: `dist/figures/index.html`、`dist/figures/<slug>/index.html`

- [ ] **Step 1: `/figures/[slug].astro`**

```astro
---
import Layout from "@/layouts/Layout.astro"
import AnatomyFigure from "@/components/AnatomyFigure.astro"
import { FIGURES_META } from "@/lib/anatomy/registry"
export function getStaticPaths() {
  return Object.entries(FIGURES_META).map(([slug, meta]) => ({
    params: { slug },
    props: { meta },
  }))
}
const { meta } = Astro.props
---
<Layout>
  <h1>{meta.title}</h1>
  <AnatomyFigure slug={Astro.params.slug} />
</Layout>
```

- [ ] **Step 2: `/figures/index.astro`**

列 `FIGURES_META`,每幅一行卡片(标题 + hint),链到 `/figures/<slug>`。复用站点既有列表页样式(参考 `src/pages/blog/index.astro` 与 `src/pages/moments/` 的做法,用 `<ListingHead>` 之类的现成组件)。

- [ ] **Step 3: sitemap/RSS 处理**

本期**不做**(见 spec §11 假设)。`astro.config.ts:40-44` 现有 `filter` 只影响 `/blog`/`/authors`/`/tags`;`/figures` 会默认进 sitemap。若嫌噪音,加一条 `!/\/figures\/?/.test(page)`,但本期**不加**,让默认走。

- [ ] **Step 4: 验证**

Run: `npm run build`
Expected: 成功。产物:

```bash
test -f dist/figures/index.html && \
test -f dist/figures/family-press/index.html && \
grep -c '<anatomy-figure data-slug="family-press"' dist/figures/family-press/index.html
```

三行都得 0 退出 + 最后一行 ≥ 1。

- [ ] **Step 5: dev 手检**

Run: `npm run dev` 打开 `http://localhost:4321/figures` 与 `/figures/family-press`。检查:
- 明暗主题切换图形跟着翻;
- hover 挑头 / 点击压印 / ←→ 换头 / 退格送料 / 空格回车压一次 均可用;
- 390px 宽不横向溢出;
- 关 JS(DevTools → disable JavaScript)图形仍是完整机器 + 已压印印记;
- `prefers-reduced-motion` 开时交互跳终态。

- [ ] **Step 6: Commit**

```bash
git add src/pages/figures
git commit -m "Add /figures gallery routes"
```

---

## Task 6: 端到端 bash 回归

**Files:**
- Create: `scripts/tests/anatomy-check.sh`

**Interfaces:**
- Consumes: 前 5 个任务全部产物
- Produces: `bash scripts/tests/anatomy-check.sh` 退出 0 表示全绿;任何一步红叉即失败。

- [ ] **Step 1: 写 `scripts/tests/anatomy-check.sh`**

脚本结构参考 `scripts/tests/i18n-check.sh`(临时切 `.env`、构建、对 `dist/` 断言、退出前恢复原 `.env`)。核心断言:

```bash
#!/usr/bin/env bash
set -euo pipefail
# 备份并临时写受控 .env(SITE_URL 已知值),沿用现有 test 脚本套路
# (见 scripts/tests/i18n-check.sh 的 backup/restore 模式)

npm run build

# 保真度
node --experimental-strip-types scripts/tests/anatomy-fidelity.mjs

# 路由存在
test -f dist/figures/index.html
test -f dist/figures/family-press/index.html

# 定制元素与 SSR 完整 SVG 落到位(不执行 JS 也看到机器)
grep -q '<anatomy-figure data-slug="family-press"' dist/figures/family-press/index.html
grep -q 'data-part="head"' dist/figures/family-press/index.html
grep -q 'data-part="bandFace"' dist/figures/family-press/index.html

# 主题令牌映射已生效 & 独立 light 主题块被删净(扫全部 CSS chunk)
grep -Rq -- '--anatomy-paper:var(--background' dist/_astro/
if grep -Rq 'data-theme="light"' dist/_astro/*.css; then
  echo "anatomy.css 里仍有 .iso[data-theme=light] 硬编码块"
  exit 1
fi

# 客户端 bundle 不含 lathe(spec §3.2 不变量)
if grep -l 'frameAlong\|toneOf' dist/_astro/*.js; then
  echo "客户端 JS 里出现 lathe 内部符号"
  exit 1
fi

echo "anatomy check ok"
```

- [ ] **Step 2: 本地跑一遍**

Run: `bash scripts/tests/anatomy-check.sh`
Expected: `anatomy check ok`,退出 0。

- [ ] **Step 3: 全仓最终验证**

Run: `npm run format:check && npm run build && bash scripts/tests/anatomy-check.sh`
Expected: 三条都退出 0。

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/anatomy-check.sh
git commit -m "Add end-to-end anatomy check script"
```

---

## Self-Review 结论

- **Spec coverage**:§3.1 目录、§4 移植规则、§5 组件与路由、§6 主题、§8 边界(ViewTransitions/多实例/reduced-motion/SSR 失败)都有对应任务或步骤;§7 体积的"实测再决定"由 Task 6 的 bundle 检查与产物大小观察覆盖。
- **Step scan**:每个 step 一个动作 + 一个可检结果;保真脚本与 fixture 生成命令都给了确切 shell 行。
- **Type consistency**:`buildFigure()` 返回 `{ svg, data, chrome }` 在 Task 1 定义,Task 4 组件里同名字段一致使用;`mountFamilyPress(host) → { destroy }` 在 Task 2 定义、Task 4 registry 与元素类同名字段。
- **Review Focus**:五条分别在 Task 4 元素类守卫、Task 2 作用域化查询、Task 2 保留 reduced-motion 分支、Task 3 删 `.iso[data-theme=light]`、Task 4 客户端 script 只 import `registry-client` 处被落实,Task 6 端到端 grep 断言再兜一层。
- **Proportion**:计划 ≈ spec 长度的一半,主要靠"引用 spec §X"避免复述;每个 task 的实现细节都留在"签名 + 关键点 + 一句说明",不复述整段代码。
