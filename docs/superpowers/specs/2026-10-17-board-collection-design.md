# 收藏板 `/board`：可拖拽邮票与徽章拼贴板 — 设计规格

- 日期：2026-10-17
- 范围：新增独立路由 `/board`（+ 英文 `/en/board`）、新增内容集合 `board`、新增自主定制元素 `stamp-board`
- 隐喻：一块桌面/收藏板，把邮票（含把任意图装进邮票框的「自定义邮票」）和技术栈徽章混在一起，访客可用鼠标**自由拖拽重新摆放**
- 参考调性：df.fenx.work/llm-things（把 logo 当可摆放的小物件）、marijanapav.com/stamps（数字化邮票收藏墙）

## 1. 目标与非目标

### 目标
- 一面**自由拼贴收藏板**：每枚物件（邮票/徽章）是绝对定位的小纸片，可重叠、可歪斜、随处拖。
- 内容全部由**作者策展**（加一个内容文件＝加一枚物件），访客只能挪动已有物件，不能上传或新增。
- 遵循站点「SSR 静态内容 + 客户端激活」范式：无 JS 时板即作者预设好的那幅拼贴画，可读、可点。
- 全站无框架基调不破：以**原生自定义元素 + Pointer Events** 实现，不引任何 UI 框架。
- 中英双语、明暗双主题、窄屏可读回退。

### 非目标
- **不做**图片上传/放置生成邮票（拖拽仅指移动已有物件）。
- **不做**位置持久化（不写 localStorage；刷新回默认摆法）。
- **不做**键盘方向键微调位置（拖拽是唯一挪动方式）。
- **不做**成熟把手系统（旋转/缩放/吸附/多选）——那是被否决的框架方案 B。
- **不复用** anatomy/hairline 等距插画机制做邮票外壳（方案 C，逆用其设计，已否决）。
- **不改**其余任何页面、全局 token、`Layout.astro` 骨架。

## 2. 方案骨架（方案 A，已与用户确认）

`/board` 新路由 + `board` 内容集合 + 原生 `stamp-board` 自定义元素（SSR 铺默认位、Pointer Events 拖拽、不持久化）；网格底、齿孔邮票、自适应徽章；`< 64rem` 回退只读网格；双语 + 回归脚本兜底。

## 3. 落位与页面结构

新建路由 `src/pages/board/index.astro`（与 `/figures`、`/moments` 平级），骨架沿用现成范式：

```astro
<Layout>
  <MetaPage slot="head" title="收藏板" />
  <ListingHead kicker={`~/board · ${items.length} 枚`} title="收藏板" desc="…" figure=… />
  <stamp-board>
    {items.map(item => <board-piece …>…</board-piece>)}
  </stamp-board>
</Layout>
```

- `stamp-board`、`board-piece` 均为**自主定制元素**（带连字符，符合项目惯例），配 scoped CSS 选择器。
- 导航：`src/consts.ts` 加一项入口。
- 英文孪生路由 `src/pages/en/board/index.astro`，按现有 `/en/*` 模式复用同一渲染逻辑、按 locale 取文案（倾向抽出共享组件，具体取现有 `LanguageSwitch` locale 传递方式，实施时定）。

## 4. 数据模型：内容集合 `board`

在 `src/content.config.ts` 新增 `board` 集合，照 blog/authors 用 `glob` loader + zod schema；base `./src/content/board`，pattern `**/[^_]*.md`（`_` 前缀/`draft:true` 沿用草稿语义）。

每枚物件一个 `.md`（正文可空，信息全在 frontmatter）。字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `kind` | `"stamp" \| "badge"` | 是 | 决定外观外壳（齿孔邮票 vs 徽章） |
| `title` | string | 是 | 名称（技术栈名 / 邮票主题） |
| `image` | `image()` | 是 | 本地图片，走 image() 校验，中英共用（同 blog 封面机制） |
| `alt` | string | 是 | 无障碍替代文本 |
| `x` | number (0–1) | 是 | 默认水平位置，占板宽比例 |
| `y` | number (0–1) | 是 | 默认垂直位置，占板高比例 |
| `rotate` | number (deg) | 否（默认 0） | 默认歪斜角，营造拼贴感 |
| `z` | number | 否（默认按序） | 叠放次序 |
| `denomination` | string | 否 | 仅邮票：面值小字（如「¥1.20」） |
| `postmark` | string | 否 | 仅邮票：邮戳文字/城市 |
| `href` | url | 否 | 徽章可点（链到项目/官网）；stamp 一般无 |
| `draft` | boolean | 否 | 全站草稿语义 |

- `kind` 用 `z.enum(["stamp","badge"])`；`x/y` 用 `z.number().min(0).max(1)`。
- stamp 专属字段（`denomination`/`postmark`）在 badge 上误填不报错，仅不渲染（宽松处理，避免 superRefine 过严阻断作者）。
- 图片放 `src/assets/` 或与内容同目录，经 `image()` 引用。

### 数据流
`getCollection("board")` → 排序（`z` 优先、再文件序） → map 成 `board-piece` 子元素，frontmatter 落成内联 CSS 变量 `--x/--y/--rot/--z` + `data-kind` 等属性 → `stamp-board` 脚本读这些属性铺位并接管拖拽。脚本**不回写内容集合**（不持久化）。

## 5. 拖拽与渲染（核心）

### 5.1 静态骨架（SSR，无 JS 也看全）
- `stamp-board`：`position: relative`，流体基准高度（Utopia `clamp()`/`--space` 定，保证各视口铺得开）。
- `board-piece`：`position: absolute; left: calc(var(--x)*100%); top: calc(var(--y)*100%); transform: rotate(var(--rot))`，`--x/--y/--rot/--z` 由 SSR 内联下发。
- 无 JS：板＝作者预设拼贴画；带 `href` 的徽章仍可点。

### 5.2 客户端激活（渐进增强）
- `customElements.define("stamp-board", …)` 注册；挂载时给每枚 piece 绑 pointer 事件。
- **拖拽**：`pointerdown` 记指针起点 + piece 当前 `--x/--y`，`setPointerCapture`；`pointermove` 把像素位移换算回百分比（`dx / boardWidth`）更新 `--x/--y`；`pointerup` 收尾。全程只改内存 CSS 变量。
- **点 vs 拖阈值**：指针移动超过若干像素判为拖，否则判为点（保证徽章链接可正常点击）。
- **置顶**：`pointerdown` 时把该 piece `--z` 抬到当前最大 +1。
- **边界**：`--x/--y` 夹在 `[0, 1]` 减 piece 尺寸范围，拖不出板外。

### 5.3 输入、可访问性与动效
- 用 Pointer Events（鼠标/触屏/笔统一）。**不做键盘调位**。
- piece 保留可聚焦/可点（带 `href` 者走全站 `:focus-visible` 焦点环）；`aria-label` 用 `title` 提供读屏名称。
- **hover-lift**：抓取/悬停时轻微抬起 + 略微放大（质感），`prefers-reduced-motion` 下去掉缓动与放大、仅即时落位。
- 拖拽是用户主动操作，reduced-motion 不禁用其本身。

### 5.4 性能
- 位移只碰 transform/自定义属性（合成层友好）。
- `pointerdown` 时测一次 board 尺寸并缓存，`resize` 使缓存失效；`pointermove` 内不读写布局。

## 6. 外观

贴合站点调性：Radix 令牌 + `light-dark()`、Utopia 流体尺寸、自主定制元素 + CSS 变量、**无 CSS 框架**。

### 6.1 邮票外壳（`kind="stamp"`）
- **齿孔边**：CSS `mask` 沿四边打一排半圆缺口（`radial-gradient` 重复遮罩），纯 CSS、随主题色。
- 内部 = `image()` 图，图四周留一圈白纸边（齿孔之间的纸）。
- 面值 `denomination` 小角标；邮戳 `postmark`：倾斜椭圆描边印章叠角（CSS 画，虚线边 + 旋转，`--font-mono`）。缺字段不画、不留空位。
- 轻投影（`box-shadow`，走 shape.css 既有阴影层级）；拼贴感靠 `rotate` + `z` 叠压。

### 6.2 徽章外壳（`kind="badge"`）
- 与邮票明显区隔；**外形随图标自适应、不统一套圆/方**（按图标本身形状留边）。
- 内容为技术栈图标/品牌标（`image()`）；可 `href` 点击。
- 徽章下方可选一行 `title` 小字（邮票不配底部标签，其名称由邮戳/面值表达）。

### 6.3 板背景（收藏板的「桌面」）
- `stamp-board` 一层**极淡网格**背景（贴合 Utopia 12 列网格调性），用主题令牌调，亮暗两版，不抢物件。
- 板四周留呼吸内边距，默认坐标不贴死边。

### 6.4 窄屏回退（桌面优先，窄屏从简）
- `@media (width < 64rem)`（对齐站点既有布局/TOC 断点惯例）：`stamp-board` 切成**自动堆叠网格**——忽略 `x/y/rotate`，按 `z`/顺序排成 CSS `grid`，拖拽停用、只读陈列；`≥ 64rem` 恢复自由拼贴。
- 保证 328px 最小视口下不重叠、不溢出、可读。

### 6.5 双主题
齿孔/徽章/投影/网格全部经 `light-dark()` 令牌，亮暗各验一遍。

## 7. i18n

- 路由：中文 `/board`（默认），英文 `/en/board`。
- 界面词：`src/lib/i18n.ts` 的 `UI_STRINGS` 补 `navBoard`（zh/en 双份，唯一来源）；导航加该项。最终措辞实施时定稿（暂定 zh「收藏板」/ en「Board」）。
- 内容双语：物件 `title`/`alt`/`postmark`/`denomination` 走同目录孪生 `.en.md`（同 blog）；未翻译物件在板上照常显示中文原标题，**不**在拼贴视觉里塞「Not translated」徽章（破坏画面）。
- 图片中英共用。
- SEO/meta：`MetaPage` + canonical，进 sitemap/RSS，与其余列表页一致。

## 8. 涉及文件
- `src/content.config.ts`：新增 `board` 集合与 schema。
- `src/content/board/*.md`：各枚物件内容文件（含 `.en.md` 孪生）。
- `src/pages/board/index.astro`（新）：页面 + `stamp-board` 渲染 + scoped 样式。
- `src/pages/en/board/index.astro`（新）：英文路由（或共享组件按 locale）。
- `stamp-board` 激活脚本：内联 `<script>` 或 `src/lib/` 模块（实施时择一，倾向就近内联保持自包含，如同其它自主定制元素范式）。
- `src/consts.ts`：导航入口项。
- `src/lib/i18n.ts`：`navBoard` 界面词。
- 外观相关样式：归入对应职责 CSS 或 scoped `<style>`（齿孔/网格/徽章）。

## 9. 测试与验证
1. **构建/格式闸（硬）**：`npm run format:check` + `npm run build` 全绿（含 `board` schema 校验，每张 `.md` 的 `kind`/`image()` 过 zod）。
2. **i18n 回归**：并入 `scripts/tests/i18n-check.sh`——`/board` 与 `/en/board` 均产出、导航项双语在、未翻译物件按规则呈现。
3. **新脚本 `scripts/tests/board-check.sh`（建议）**：构建后 grep `dist/` 断言——
   - `stamp-board` 静态 HTML 里每枚 `board-piece` 带默认 `--x/--y/--rot`（无 JS 也铺好）；
   - stamp 与 badge 两类都渲染、齿孔/网格类名存在；
   - `/board`、`/en/board` 均产出。
   - 遵循既有约定：脚本用 backup/restore `.env` 模式 + 受控 `SITE_URL`。
4. **浏览器手动核验（必须）**：dev 服务器下 `playwright` 截图验四组合——桌面/窄屏 × 亮/暗；实拖一枚确认置顶生效、边界夹紧、hover-lift、点 vs 拖阈值正常。

## 10. 后续可选项（不在本次范围）
- 若要位置持久化（localStorage 记忆访客摆法）作为增强，后补。
- 若要旋转/缩放把手、吸附网格等高级交互，届时评估框架 island（/labs 路由）。

## 11. 已锁定决策回顾
- 交互：**移动已有物件、自由重新摆放**（绝对坐标拼贴）；非上传、非添加。
- 结构：**全部一块板**（邮票 + 自定义邮票 + 徽章混排）。
- 持久化：**不做**，刷新回默认。
- 键盘调位：**不做**，拖拽唯一。
- 内容来源：**新建内容集合 `board`**。
- 板背景：**极淡网格**。
- 徽章外形：**随图标自适应、不统一**。
- 窄屏：**桌面优先，`< 64rem` 回退只读网格**。
- 技术方案：**A（原生 Web Component）**，否决 B（框架 island）与 C（复用等距插画）。
