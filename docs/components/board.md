# Board 收藏板组件

## 1. 一句话说明

`<stamp-board>` 是一面可拖拽的拼贴收藏板：把作者策展的邮票（含把任意图装进邮票
框的「自定义邮票」）与技术栈徽章混排在同一块板上，访客用鼠标拖住任意物件即可自由
重新摆放；拿起物件不靠板下工具条（已撤），而是在物件上右键（触屏长按、键盘 Tab 到
物件按 Enter 等价），在其外上角弹出一圈径向操作浮层，可缩放、旋转、镜像、调叠放
次序，点板面空白即放下；双击一枚邮票则弹出原图预览——整张原图摆进
[GlassBubble](./glass-bubble.md) 玻璃泡下，可隔着泡拖动观看。面向 `/board`、`/en/board`
两个页面。

## 2. 文件位置

- 组件：`src/components/Board.astro`（SSR 铺位 + scoped 样式 + 客户端激活脚本）。
- 取数：`src/lib/content.ts` 的 `getBoardViews(locale)` 与 `BoardView` 类型。
- 内容：`src/data/board.ts` 的 `BOARD_ITEMS: BoardItem[]` 纯数据模块（原 `board`
  内容集合已迁出）；图片在 `src/assets/board/`；双语为条目内联 `L10n = { zh, en? }`。
- 样式：主体内联在 `Board.astro` 的 `<style>`（齿孔/徽章/网格/窄屏回退）；原图预览
dialog（`<dialog class="board-preview">`）的呈现住在 `src/styles/glass-bubble.css`（全局，因泡与图
  是 JS 动态建的，scoped 选不中）。
- 路由：`src/pages/board/index.astro`、`src/pages/en/board/index.astro`。
- 回归：`scripts/tests/board-check.sh`（另在 `i18n-check.sh` 有 `/en/board` 断言）。

## 3. 快速上手

```astro
---
import Board from "@/components/Board.astro"
---

<Board locale="zh" />
```

`Board` 自行 `getBoardViews(locale)` 取全部物件并渲染，无需外部传数据。加一枚物件＝
在 `src/data/board.ts` 的 `BOARD_ITEMS` 数组追加一条（见 §5 字段）。

## 4. Props

| 名称     | 类型             | 默认 | 含义                                       |
| -------- | ---------------- | ---- | ------------------------------------------ |
| `locale` | `"zh" \| "en"`   | 必填 | 取哪一语言的文案；无译文的物件回落中文     |

其余 HTML 属性透传给 `<stamp-board>` 根元素。

## 5. 内容字段（`BoardItem`，`src/data/board.ts`）

除 `id` 外，文案字段（`title`/`alt`/`denomination`/`postmark`）均为 `L10n = { zh, en? }`
内联双语，`en` 缺省回落 `zh`；下表“string”指其 `zh` 成员。

| 字段           | 类型                | 必填 | 说明                                       |
| -------------- | ------------------- | ---- | ------------------------------------------ |
| `kind`         | `"stamp" \| "badge"`| 是   | 外观外壳：齿孔邮票 vs 自适应徽章           |
| `title`        | string              | 是   | 名称（徽章下方小字 / 读屏 `aria-label`）   |
| `image`        | `image()`           | 是   | 本地图片，中英共用                         |
| `alt`          | string              | 是   | 无障碍替代文本                             |
| `x` / `y`      | number (0–1)        | 是   | 默认位置，占板宽/板高比例（响应式友好）    |
| `w` / `h`      | number              | 否   | 邮票形状（viewBox 单位，默认 `160`×`208` 竖版；横版如 `240`×`150`，方版 `180`×`180`）。mask 按此比例生成，圆孔不变形 |
| `size`         | number (px)         | 否   | 仅徽章：图标高度。缺省走流体尺寸 `clamp(3.5rem, 6vw, 5rem)`；横版字标（如 `humancoded.svg` 253×56）需显式压小，否则宽度顶满板面 |
| `rotate`       | number (deg)        | 否   | 默认歪斜角，营造拼贴感（默认 0）           |
| `z`            | number              | 否   | 叠放次序（默认 0，同时决定窄屏网格顺序）   |
| `scale`        | number              | 否   | 显示缩放倍率（映射 piece `--s`，默认 1）；仅非 1 才落字段。由 dev 保存浮条写入 |
| `flip`         | boolean             | 否   | 水平镜像（映射 piece `--sx`，默认 false）；由 dev 保存浮条写入 |
| `denomination` | string              | 否   | 仅邮票：面值小角标                         |
| `postmark`     | string              | 否   | 仅邮票：倾斜虚线邮戳                       |
| `href`         | url                 | 否   | 徽章可点（新标签打开）；邮票作 info 卡片的「来源」链接 |
| `draft`        | boolean             | 否   | 全站草稿语义                               |

**配对规则**：以中文条目为锚，几何（`x/y/rotate/z/scale/flip`）、`image`、`href` **恒取一条**（与
语言无关）；`L10n.en` 只覆写文案（`title`/`alt`/`denomination`/`postmark`）。故改位置
只改那一条数据的坐标，与语言无关。

## 6. 无障碍与降级

- **无 JS**：SSR 已把每枚物件按默认 `--x/--y/--rot` 绝对定位铺好，板即作者预设的
  静态拼贴画，可读；带 `href` 的徽章仍可点。浮层 `<board-menu hidden>`、信息卡片
  `<board-card hidden>`、原图预览 `<board-preview hidden>` 与板下提示行都不出现（`board-hint` 默认 `display: none`，靠
  `stamp-board[data-interactive]` 才亮）——
  提示行不能在无 JS 时承诺一个不存在的交互。SSR 默认 `data-tool="drag"`。
- **窄屏（`< 64rem`）**：`<board-grid>` 切成只读 CSS 网格，忽略坐标/旋转，拖拽不绑定，
  按 `z` 顺序陈列；浮层、信息卡片、双击预览与提示行一并禁用，物件也不进 tab 序（`tabIndex` 由
  `enable()` 随断点设 0/−1）。
- **键盘**：宽屏下每枚 `board-piece` 可 Tab 聚焦（`:focus-visible` 走全站 accent 焦点环），
  Enter / 空格 / 菜单键 / Shift+F10 拿起物件并展开浮层；浮层是 `role="toolbar"` +
  roving tabindex，方向键在 8 枚钮间走位、Enter/空格执行、Esc 放下并把焦点还给物件；
  信息卡片开着时 Esc 先关卡片（焦点回物件）、浮层保留，再按才放下物件。
  仍不做键盘方向键调位（挪动只靠拖拽）。原图预览只有鼠标双击入口（无键盘等价）；
  但预览 dialog 本身可键盘操作：Tab 到关闭钮、Esc 关闭（原生 dialog 自带）。
- **触屏**：长按物件 500ms 等价于右键唤出浮层，并取代浏览器原生长按菜单（物件上
  `-webkit-touch-callout: none`，非鼠标 `pointerType` 的 `contextmenu` 也 `preventDefault`）；
  手指越过拖拽阈值即拆掉长按 Timer，“拖”与“长按”互不抢。
- **拖拽是增强**：`matchMedia("(width >= 64rem)")` 命中才绑 Pointer Events。
- **reduced-motion**：hover-lift 抬起/放大、切换标签的入场飞入、浮层弹出散开动画均在该
  偏好下关闭；拖拽本身（用户主动）不禁用。
- 每枚 `board-piece` 带 `aria-label`（取 `title`），读屏能念出物件名。

## 7. 注意事项

- **不持久化**：拖拽与工具操作（缩放/旋转/镜像/层序）都只改内存里的 CSS 变量，刷新即
  回到内容集合里的默认坐标；不写 `localStorage`、不回写内容集合。
- **点 vs 拖**：指针位移超过阈值（约 4px）才判为拖拽；纯点按放行徽章链接导航，拖拽
  结束后抑制紧随的 click，避免「想拖结果误跳」。
- **原生拖拽拦截**：`<img>`/`<a>` 默认会被浏览器原生拖拽，从图片上按下拖动会抢走
  `pointermove`（表现为「拖不动」）。`stamp-board` 在 `connectedCallback` 里统一 `addEventListener("dragstart", e => e.preventDefault())`
  兜住所有子元素；只在 `<a>` 上写 `draggable="false"` 不够（图片仍可拖）。
- **置顶**：每次 `pointerdown` 把该物件 `--z` 抬到当前最大 +1，抓起的总在最上。
- **无工具条（交互全在板内）**：板下方只剩一行提示文案（`board-hint`）。`stamp-board`
  的 `data-tool`（`drag` / `pointer`）退化为纯内部状态：`drag` = 可拖、徽章链接可跳；
  `pointer` = 已拿起一枚物件（`data-selected` + 虚线描边 + 浮层展开），此时物件内链接被
  捕获阶段 `preventDefault` 拦截（只选不跳，要跳转先点空白放下）。拿起（`pick()`）三个
  入口：鼠标右键、触屏/笔长按、键盘 Enter/空格/菜单键；放下（`exitPicked()`）走点板面
  空白、Esc、右键板面空白、切分类标签任一条，一律回到 `drag`。
- **浮层操作（`board-menu`）**：8 枚圆钮＝放大/缩小（`--s` ×/÷1.25，钳制 [0.5, 2.5]）、
  逆/顺时针旋转（`--rot` ±15°）、镜像（`--sx` 在 1/−1 间切换，水平翻转）、叠到最上/最下
  （`--z` 沿 topZ 递增 / bottomZ 递减，只写内存 CSS 变量）、信息（`data-op="info"`，切换
  信息小卡片，不进 `ops` 表）。图标就这一份（SSR 直接写在 `<board-menu>` 里）。
  `board-piece` 的 transform 合成顺序为 `rotate → scale → scaleX`，
  hover 抬升/拖拽放大/入场飞入关键帧均携带 `--s/--sx` 不丢姿态。注意「叠到最下」会把
  `--z` 减到负数，`board-grid` 必须保持独立层叠上下文（`isolation: isolate`），
  否则负 z 物件会沉到板面背景之下整枚消失。
- **弧与翻转**：零尺寸锚点摆在选中件外上角（`placeMenu()`），按钮沿 180° 半圆展开
  （`--a` 从 −90° 到 +90°，间隔 180/(n−1)），半径 `--menu-r`；右半圆放不下（物件贴板右边）
  则换到左上角、角度取 `180−a` 翻到左半圆。半径在 CSS 里**必须用 px**（JS 要拿它算翻转）。
- **宿主**：菜单与信息卡片都是 `stamp-board` 的子元素（`stamp-board` 因此有
  `position: relative`），**不能放进 `board-grid`**——那里 `overflow: clip` 会把探出板外
  的按钮/卡片切掉。`z-index`：菜单 30、卡片 31（卡片压菜单）。
- **跟踪**：放大/旋转会改物件外廓且带 0.15s transform 过渡，角点在操作后仍在动，故
  `settleMenu()` 追 300ms 的 `requestAnimationFrame` 把浮层贴回新角点（窗口过后自动停）；
  `resize` 与断点变化直接收浮层和卡片（几何全变，锚点作废）。拿起（`pick()`）、改选
  另一枚、切标签都会先收卡片，不让信息隔物件残留。
- **信息小卡片（`board-card`）**：`role="dialog"`，显示选中件的标题与来源。数据不另养
  一份：标题读物件自身的 `aria-label`（已是当前语言），链接查物件内 `<a[href]>`（徽章）
  或邮票纸面的 `data-href`（渲染自同一条数据的 `href`）。「来源」标签经骨架上的
  `data-source-label` 从 SSR 传入，脚本里没有 i18n 字典。定位：摆在选中件正下方，贴板
  右边时翻到物件左缘对齐，下方放不下翻到上方，四边夹进板内；带关闭钮（焦点回物件）。
  卡片是 `stamp-board` 直接子元素、不在 `board-piece` 内，故来源链接不受拿起态的
  capture 拦截，拿起中也能正常新标签打开。
- **原图预览（`dialog.board-preview`）**：双击一枚邮票（`data-kind="stamp"`）把图里那张
  原图（`.stamp-img`，同一张图未裁切版）整张搬进 dialog 里的玻璃泡下。机制：
  - 骨架是 SSR 的**原生 `<dialog class="board-preview">`**（`hidden` 默认不可见；自
    定义元素名带不来 `showModal`/Esc/焦点陷阱，故不用）；`showModal()` 把它提升到
    浏览器顶层——故它虽住在 `stamp-board` 下、板面 `overflow: clip` 仍关不住它；
    Esc/背景点击/右上角关闭钮都走 `close()`，`close` 事件把焦点还给唤起的那枚物件。
  - 泡是 JS 动态 `createElement("glass-bubble")`（data-src/data-size/data-label 从物件
    与骨架 `data-bubble-label` 取）。注意：Astro **只把渲染过一次的组件脚本带上页面**，
    本页不再渲染 `<GlassBubble>` 组件，注册带不过来，故 Board.astro 的脚本自己调
    `registerGlassBubble()`（`src/lib/glass-bubble-element.ts`，与组件静态用法共用同一
    实现，内部 `customElements.get` 守卫保证两处都加载也只注册一次）。关闭时摘掉泡，
    disconnect 触发组件 `destroy()` 释放 WebGL 上下文（预览期间只挂一块画布）。
  - 画布尺寸按视口取（封顶逻辑 620），球径按盒宽约 29% 随尺寸缩放；过小的盒
    （<280px，对应约 `innerWidth < 328`）不建泡、只显静态原图（降级同 GlassBubble）。
  - 徽章不绑双击：单击会先导航，双击还没成形页面就跳走了。
  - 打开预览前先 `exitPicked()` 放下拿起中的物件，两套 UI 不同屏。
- **边界**：`--x/--y` 夹在 `[0, 1 − 物件尺寸/板尺寸]`，拖不出板外；板 `overflow: clip`
  防横向滚动条。
- **齿孔实现**：`.stamp` 用**构建期生成的 SVG 矢量齿孔轮廓**做 `mask-image`（`Board.astro`
  frontmatter 的 `stampMaskUrl()`：160×208 白矩形减去沿四边/四角排的圆孔，编码成 data URI
  经 `--stamp-mask` 下发）。矢量→任意尺寸都锐利、四角也是真齿孔；`.stamp` 固定
  `aspect-ratio: 160/208` 保证等比缩放不变形，内部图 `object-fit: cover` 填满。内容仍是任意图片。
  （早期用四条 `radial-gradient` 现算齿孔，因 `add` 合成会互相填满、且角对齐很脆，已弃用。）
- **双语**：`/board` 与 `/en/board` 都有语言切换器；`src/components/LanguageSwitch.astro`
  的双语路径白名单需包含 `/board`、`/board/`，否则板页不显示切换器。
- **视图标签**：板面上方的「文件夹分隔标签」（`board-tabs`）——顶部圆角、底边敞开贴合板面、
  标签互相叠压（负左边距 + 左高右低 z-index + 向右阴影），选中项抬到最前、实线描边、饱和底色，
  未选中为虚线描边 + 淡底。点切把 `stamp-board` 的 `data-view` 改为 `all/stamp/badge`，由 CSS 按
  `board-piece[data-kind]` 过滤隐藏。SSR 默认 `data-view="all"`（无 JS 即混排全显）；切换不持久化、
  不改坐标，隐藏件位置保留。切换时 JS 给当前可见件重放 `board-toss` 入场动画（挂 `board-enter`
  类、写 `--enter-delay` 逐枚错峰 70ms）：滑入——从左边板外斜着掠进来、逐渐减速（靠板面
  `overflow:clip` 在板外裁掉），靠惯性冲过静止位一点，末尾再慢慢渗回静止位（余滑停顿，收尾带延迟感）。飞入仅 `≥64rem` 启用（窄屏只读网格不适用绝对坐标位移）；
  动画 `animationend`/`animationcancel` 后自动摘类以便下次重启。物件网格画布为
  `board-grid`（承载齿孔/徽章/背景网格/绝对定位坐标），窄屏切成只读网格。
- **配色**：网格底、齿孔纸面、投影全部走 `light-dark()` 令牌，亮暗两版；纸面 `--paper`
  两主题都偏亮，在暗板上仍读作「纸」。

## 8. 完整示例

```ts
// src/data/board.ts → BOARD_ITEMS 追加一条：
{
  id: "moon-stamp",
  kind: "stamp",
  image: preview2,
  x: 0.55,
  y: 0.4,
  rotate: 3,
  z: 2,
  denomination: { zh: "¥1.20" },
  postmark: { zh: "BEIJING" },
  href: "https://example.com/source", // info 卡片的「来源」
  title: { zh: "登月邮票" },
  alt: { zh: "一枚登月主题邮票" },
}
```

```astro
---
import Layout from "@/layouts/Layout.astro"
import MetaPage from "@/components/MetaPage.astro"
import ListingHead from "@/components/ListingHead.astro"
import Board from "@/components/Board.astro"
import { getBoardViews } from "@/lib/content"

const items = await getBoardViews("zh")
---

<Layout>
  <MetaPage slot="head" title="收藏板" alternates={{ zh: "/board", en: "/en/board" }} />
  <ListingHead kicker={`~/board · ${items.length} 枚`} title="收藏板" desc="…" />
  <Board locale="zh" />
</Layout>
```

## 9. dev 布局编辑器（保存浮条）

`astro dev` 下 `/board`（及 `/en/board`）板下出现「保存布局」浮条（`<board-editor>`，
模式同 [MomentComposer](./README.md)：仅开发环境、生产 HTML 无 markup）。宽屏（≥ 64rem）
里用右键/长按/键盘拿起物件，经缩放、旋转、镜像、拖拽、叠放调整到位后点「保存布局」，
浮条遍历 `board-piece[data-id]` 采集当前 `--x/--y/--rot/--z/--s/--sx`，`POST /api/board/layout`：

- **端点**（`src/lib/board-editor-plugin.ts`，`apply: "serve"`）：`validateLayoutItems` 校验
  （`x/y ∈ [0,1]`、数值有限、`flip` 布尔、`items` 非空），再调 `patchBoardSource` 逐字段改写
  `src/data/board.ts`，片刻后 `full-reload`。写入目标默认 `src/data/board.ts`，可用
  `BOARD_LAYOUT_SOURCE` 覆盖（测试隔离用）。
- **逐字段写回**（`src/lib/board-source-patch.ts`）：按 `id` 锚点定位条目，只改六个几何字段行，
  `image`/`href`/文案与注释逐字保留；默认值（`rotate`/`z` 归 0、`scale` 归 1、`flip` 归 false）
  不落字段；未知 `id` 静默跳过；同值二次保存不写盘、不 reload（幂等）。
- **零生产痕迹**：生产构建既无 `<board-editor>` markup、也无 `/api/board/layout` 路由
  （少量 scoped 死样式残留与 `MomentComposer` 同款，行为无影响）。
- **回归**：`bash scripts/tests/board-source-patch-check.sh`（离线纯字符串，不碰真实文件）；
  `bash scripts/tests/board-layout-check.sh`（校验 + 起停 dev server，写入 `/tmp` fixture 副本）；
  `bash scripts/tests/board-check.sh`（生产 HTML 无编辑条 + piece 带 `data-id`/`--sx`）。
