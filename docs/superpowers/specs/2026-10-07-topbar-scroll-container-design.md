# 顶栏模式内容区独立滚动设计（滚动条只属于内容区）

日期：2026-10-07
状态：待审阅（对话逐节确认通过：范围 / 结构 / 行为细节 / 适配清单）

## 背景与目标

**现状（2026-10-07 dev 实测基线）：**

- 全站为页面级滚动：`document` 在滚，`html { scrollbar-gutter: stable }`；
- topbar 模式下顶栏 `site-bar` 是 `sticky` 覆盖层。滚动条（轨道 + 滑块）只绘制
  在滚动容器自身的高度范围内，页面级滚动时轨道从视口最顶端贯穿到底——紧贴
  顶栏右侧一路下去，与顶栏的底边线 / 背景"接不上"；
- 占位式滚动条环境（本机实测：滚动条占 15px 布局宽，`innerWidth 1037 −
  clientWidth 1022`）下观感问题明显；overlay（浮动自动隐藏）滚动条不占位，
  问题轻微；
- UA 滚动条无法被页面元素裁剪 / 遮挡——"让滚动条从顶栏下开始"的唯一结构性
  办法是**让滚动容器从顶栏下开始**。

**目标：** 仅 `topbar × ≥64rem` 采用"容器模式"——顶栏为固定行、内容行
（TOC + main + 页脚）成为独立滚动容器，滚动条只属于内容区（从顶栏下缘开始）。
其余组合（sidebar 全断点、topbar `<64rem`）保持现有页面级滚动，行为与视觉
零变化。

## 成功标准

1. topbar ≥64rem：滚动条只出现在内容容器右缘（从顶栏下缘到底部），顶栏行
   右侧不再有滚动条（占位式环境下截图为证）；
2. 功能等价：滚轮 / 触屏 / 键盘翻页（经 skip-link 进入内容后）/ 锚点跳转
   （含带 hash 直开）/ TOC 高亮跟随与自动居中 / 系列文章 URL 同步 / 回顶
   按钮，在容器模式下全部可用；锚点目标相对顶栏的可见性不劣于现状
   （现状实测：点 TOC 链接后目标顶 48px vs 顶栏底 51px，3px 轻微遮挡；
   容器化后目标吸附容器顶 = 顶栏下缘，预期消除）；
3. 零回归：sidebar 全断点、topbar `<64rem` 的滚动与观感与现状一致；overlay
   环境无观感差异（校准量为 0）；
4. 位置连续：跨 64rem 断点 resize、布局切换（topbar ↔ sidebar）时滚动位置
   迁移，不回到顶部；
5. `npm run format:check`、`npm run build`、`bash scripts/tests/layout-check.sh`
   （既有 27 项）、`bash scripts/tests/i18n-check.sh` 全绿。

## 范围

**覆盖：**

- 骨架：`page-shell` 内新增 `page-scroll` 滚动行包装（toc / main / footer）；
- 容器模式 CSS（仅 topbar ≥64rem）：`page-shell` 两行网格、`html` / `body`
  条件化、`page-scroll` 网格与滚动、顶栏去 sticky 与对齐补偿、TOC 参数重算；
- 新 `src/lib/scroll.ts`：活跃滚动源抽象 + 统一监听 + 位置迁移 + 对齐校准；
- 组件适配：`Layout` / `SiteBar` / `ScrollToTop` / `SeriesReader` /
  `TableOfContents`；
- 无障碍顺带修复：`main` 可聚焦（`tabindex="-1"`），skip-link 点击后焦点转移；
- 回归：`scripts/tests/layout-check.sh` 增补断言；
- 文档：`AGENTS.md` 骨架 / 滚动机制描述，`CONTEXT.md` 术语。

**不覆盖（本期）：**

- 滚动条外观自定义（细条 / 配色）——保持系统原生，后续可单开；
- 移动端（`<64rem`）容器化——移动端滚动条为浮层、问题不存在；且内层滚动会
  牺牲 iOS 地址栏自动收起；
- sidebar 模式改动（无"横穿顶栏"问题，保持页面级滚动）；
- 打印样式、auto 隐藏滚动条、伪造滚动条。

## 设计决策（对话已确认）

| # | 决策点 | 结论 |
| - | - | - |
| 1 | 范围 | 仅 `topbar × ≥64rem` 容器化；sidebar 与 `<64rem` 保持页面级滚动 |
| 2 | 结构方案 | 方案 A：`page-shell` 两行（顶栏行 + 滚动行），新增 `page-scroll` 包 toc/main/footer；未采纳方案 B「只美化滚动条」（解决不了顶栏贯穿） |
| 3 | 元素名 | `page-scroll`（避开 layout-check 黑名单旧名如 `page-content`，与 `page-shell/page-nav/page-toc/page-footer` 系列一致） |
| 4 | 键盘兜底 | `main` 加 `tabindex="-1"` + skip-link 原生聚焦联动；不做全局 keydown 转发（焦点停在顶栏上时翻页无效，作为已知缺口记录） |
| 5 | 对齐校准 | JS 测半条滚动条宽写 `--scrollbar-width`，顶栏内容右缘补偿；overlay 环境为 0、零影响 |
| 6 | 位置迁移 | 跨断点 / 布局切换时迁移到新滚动源（非重置） |
| 7 | 滚动条外观 | 不动（系统原生） |
| 8 | 滚动源抽象 | 统一 helper（`src/lib/scroll.ts`），组件不再直接依赖 `window` 滚动 |

## 术语与约定

- **容器模式（Container Mode）**：`≥64rem` 且 `data-layout=topbar` 时，内容行
  为独立滚动容器的形态；本次唯一新增的滚动形态；
- **页面级滚动（Page Scroll）**：`document` 承担滚动，除容器模式外所有组合的
  形态（现状不变）；
- **活跃滚动源（Active Scroll Target）**：当前承担滚动的对象——容器模式下为
  `page-scroll`，否则为 `window`；
- **内容滚动行**：`page-scroll` 激活时代表的可滚动区域（TOC + main + footer）；
- **校准补偿（Alignment Compensation）**：占位式滚动条下，顶栏内容右缘让出
  半条滚动条宽，使顶栏内容中心与内容列中心一致的修正；
- **占位式 / overlay 滚动条**：经典占位（占布局宽、常显）与浮动自动隐藏两种
  系统滚动条形态。

## 架构设计

### 骨架

```html
<page-shell data-article?>
  <page-nav>  site-bar（品牌 / 导航 / 操作区）  </page-nav>
  <page-scroll>                     ← 默认 display: contents
    <page-toc> …（仅文章页）        </page-toc>
    <main id="main-content" tabindex="-1"> … </main>
    <page-footer> … </page-footer>
  </page-scroll>
</page-shell>
```

- `page-scroll` 默认 `display: contents`：sidebar / `<64rem` 下不产生盒子，
  现有网格（sidebar 12 列）与 flex 列（topbar 移动端）语义原样保留；
- 容器模式下 `page-scroll` 成为 `page-shell` 第 2 行的滚动容器，内部重建现有
  4 列网格（列宽公式不变），TOC 列 / main 列 / footer 行摆位沿用；
- `main` 增加 `tabindex="-1"`（skip-link 目标可聚焦；跳转后的可见反馈由滚动
  变化承担，`main:focus` 不显示焦点轮廓）。

### 激活条件与 CSS 要点

（示意；实现时以现状规则为迁移源）

```css
page-scroll { display: contents; }

@media (width >= 64rem) {
  :root[data-layout="topbar"] {           /* html */
    overflow: hidden;
    scrollbar-gutter: auto;               /* 关闭全局预留，交给容器 */
  }
  :root[data-layout="topbar"] body { overflow: hidden; }

  :root[data-layout="topbar"] page-shell {
    height: 100svh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  :root[data-layout="topbar"] page-scroll {
    display: grid;                        /* 4 列，沿用现状列定义 */
    overflow-y: auto;
    scrollbar-gutter: stable;
    min-height: 0;
  }
  /* TOC / main → 容器第 1 行；footer → 第 2 行；
     main 跨列规则照旧（无 TOC：2 / 4；有 TOC：3） */
}
```

要点：

- 全局 `html { scrollbar-gutter: stable }` 仅在容器模式被覆盖为 `auto`
  （sidebar、`<64rem` 保持）；
- 直接子级选择器梳理：`page-shell:has(> page-toc)` → `page-scroll:has(> page-toc)`
  （TOC 父级变化），其余 `:has` 使用点逐一核对；
- 顶栏（仅该分支）：`position: static`（不再需要 sticky）；右侧 padding 增加
  校准补偿（见下）。`<64rem` 分支的 sticky 保留；
- TOC（仅该分支）：sticky 偏移与 `max-height` 按新容器重算。停留位置以现状为
  基线（现状 `top: calc(var(--space-2xs) + 2rem + var(--space-m))`，即顶栏下缘
  再留 `--space-m − --space-2xs` 量级的间距）；`max-height` 用 `100svh` 减顶栏
  高与偏移、保留原底部缓冲。实现时以新旧截图对比校准；
- 顶栏 `grid-row`、`page-shell:has()` 等选择器在本模式下均需核对（grid 上下文
  从 `page-shell` 移到 `page-scroll`）。

### 活跃滚动源抽象（新 `src/lib/scroll.ts`）

| API | 说明 |
| - | - |
| `activeTarget()` | 容器模式 → `page-scroll`，否则 `window`。判定须同时检查 `display !== "contents"` 与 `overflowY === "auto"`——**实测陷阱：`display: contents` 下 computed `overflowY` 仍为 `auto`**（样式规则仍匹配、只是不生成盒子），只看 overflow 会误判 |
| `top()` / `setTop(v)` | 读 / 写活跃源滚动位置 |
| `viewportHeight()` | `el.clientHeight` / `innerHeight` |
| `atBottom()` | 底部判定（2px 容差），供系列文章 URL 同步 |
| `onScroll(handler)` | 统一监听：**`window`（冒泡）+ `document`（`capture: true`）双挂**——实测：元素滚动只被 `document` 捕获收到；window 滚动**不会**被 `document` 捕获收到（hits=0）。handler 须幂等 |
| 位置迁移 | 维护 `lastTop`（滚动时记录）；`matchMedia("(width >= 64rem)")` 的 `change` + 对 `documentElement` `data-layout` 的 `MutationObserver`，在 `requestAnimationFrame` 内 `setTop(lastTop)`。resize 跨断点与布局切换按钮（`LayoutToggle` 无需改动）两个入口均被覆盖 |
| 对齐校准 | 容器可见时测 `el.offsetWidth − el.clientWidth`（占位式 = 滚动条宽，overlay = 0），写入 `documentElement.style` 的 `--scrollbar-width`；初始化 + 模式变化 + resize 时更新 |

### 对齐校准的数学

- 目标：顶栏内容中心 = 容器内容列中心 `(W − sbw) / 2`（W = 页面宽，sbw = 滚动条宽）；
- 顶栏 `padding-inline` 现状左右对称（`max(var(--grid-gutter), (100% − 50rem)/2
  + var(--grid-gutter))`）。容器模式下右 padding 改为原式 **+ sbw**（左保持原
  值），两侧中心即一致；sbw = 0（overlay）时与现状等价；
- 初始化测量须在首帧前完成（避免顶栏 ~7.5px 横向微移）：由 `Layout.astro`
  尾部 `is:inline` 同步脚本执行最小测量并写变量；后续更新走打包模块。
  无 JS 时补偿缺失（~7.5px 级），可接受；
- 备选（未采用）：`scrollbar-gutter: stable both-edges` 可零 JS 对齐中心，但
  会在容器左侧引入同宽空白带、内容整体偏右，与"内容在可用区居中"的现状
  语义不符。

### 位置迁移

- 场景：跨 64rem resize（窗口拖动、外接显示器变化）；布局切换按钮
  （topbar ↔ sidebar）；
- 语义：迁移（保留阅读位置）；内容高度差异时由浏览器 clamp（best-effort）；
- sidebar ↔ topbar 在 `<64rem` 下同为页面级滚动 → 迁移为无操作，无害。

### 组件适配

| 文件 | 动作 | 要点 |
| - | - | - |
| `src/layouts/Layout.astro` | 修改 | 骨架加 `page-scroll`；`main` 加 `tabindex="-1"`；容器模式 CSS；选择器梳理；尾部 `is:inline` 初始测量 |
| `src/lib/scroll.ts` | 新增 | 活跃滚动源抽象（见上） |
| `src/components/SiteBar.astro` | 修改 | `is-scrolled` 改为活跃源滚动位置判断（去掉 sentinel + IntersectionObserver）；容器分支去 sticky + 右 padding 补偿 |
| `src/components/ScrollToTop.astro` | 修改 | 显示条件与点击滚顶改走活跃源（阈值 `viewportHeight / 2` 语义不变） |
| `src/components/SeriesReader.astro` | 修改 | `atBottom` / `scrollTo({top:0})` / `scroll` 监听改走活跃源；`scrollIntoView` 保留（浏览器自动滚动容器，`scroll-margin` 语义不变） |
| `src/components/TableOfContents.astro` | 修改 | 仅容器分支的 sticky 偏移 / `max-height` 重算；高亮 IntersectionObserver 保留（验证，见风险） |
| `src/styles/layout.css` | 修改 | `html` 的 `scrollbar-gutter` 条件化覆盖；锚点 `scroll-padding` 视实测补充 |
| `scripts/tests/layout-check.sh` | 修改 | 增补断言（见「测试与验收」） |
| `AGENTS.md`、`CONTEXT.md` | 修改 | 骨架与滚动机制描述；术语补充（Container Mode / Active Scroll Target 等，按 CONTEXT.md 英文体例） |

### 边界情形与降级

- **无 JS**：容器模式仍成立（纯 CSS）；迁移 / 校准 / 回顶等增强失效，页面仍可
  滚动与阅读（与现状的无 JS 能力对齐）；
- **内容短于容器**（如 404）：容器不滚、布局正常、页脚随内容流；
- **初始带 hash 直开**：fragment 定位由浏览器滚动到最近可滚祖先（验证项）；
- **系列文章初始定位脚本**（`scrollIntoView({behavior:"instant"})`）：保留，
  浏览器自动跨滚动容器；
- **锚点基线**：现状点 TOC 链接后目标顶 48px vs 顶栏底 51px（实测）；容器化后
  目标吸附容器顶（顶栏下缘），预期不劣于现状；如需要，在容器上补
  `scroll-padding-block-start` 留白；
- **dev 缓存提醒**：改动 `.astro` 内嵌样式后如 dev 供旧 CSS，
  `touch src/layouts/Layout.astro` 后刷新（既有经验）。

## 测试与验收

**回归必跑**：`npm run format:check`、`npm run build`、
`bash scripts/tests/layout-check.sh`（既有 27 项全绿）、
`bash scripts/tests/i18n-check.sh`。

**`layout-check.sh` 增补断言（方向示例，实现时定稿）：**

- dist HTML 含 `<page-scroll`（骨架）与 `<main ... id="main-content" ...
  tabindex="-1"`（skip-link 目标可聚焦）；
- CSS 产物含：`page-scroll` 的 `display:contents` 默认规则；容器分支
  `scrollbar-gutter` 迁移（`html` 的 `auto` 覆盖、容器的 `stable`）；
  `--scrollbar-width` 补偿引用；
- JS 产物含 `--scrollbar-width` 与 `page-scroll` 选择器字面量；
- 既有「旧名清除」断言保持通过（命名已避开黑名单）。

**手测矩阵：**

| 维度 | 项 |
| - | - |
| 页面 | 文章页（含 TOC）/ 系列文章 / 首页 / 列表 / 404（topbar 桌面） |
| 滚动源 | 滚轮、触控板、键盘（skip-link → PageDown）、滚动条拖拽 |
| 锚点 | 点 TOC 链接、点标题锚点、带 hash 直开 URL、系列内跳转 |
| 组件 | TOC 高亮跟随与自动居中、回顶按钮、顶栏底边线、全宽开关、布局切换按钮 |
| 迁移 | 跨 64rem resize、topbar ↔ sidebar 切换（位置保留） |
| 环境 | 占位式与 overlay 两种滚动条（`--scrollbar-width` 15 / 0）；Chrome 主测 + Safari 抽查 |
| 回归 | sidebar 桌面 / 移动、topbar 移动的滚动与观感与现状一致 |

**截图对照**：滚动条起点（顶栏下缘）/ 顶栏右侧无滚动条 / 顶栏内容与内容列
中心线对齐（占位式环境下补偿前后对比）。

## 风险与对策

| 风险 | 对策 |
| - | - |
| TOC 高亮 IntersectionObserver 在容器裁剪下的语义偏差 | 手测滚动跟随；如偏差明显，备选按模式动态创建 observer（root = 容器） |
| 首帧顶栏微移（校准变量晚于首帧写入） | `is:inline` 同步测量（首帧前）；慢速节流复测确认不可见 |
| 键盘缺口（焦点在顶栏上时翻页无效） | 记录在案；skip-link 路径已覆盖主要键盘用户 |
| 位置迁移在内容高度差异下的偏差 | best-effort（浏览器 clamp）；迁移后位置可继续手动滚动 |
| dev CSS 陈旧假象 | `touch Layout.astro` 后复测（既有经验） |
| 占位式 / overlay 双环境验证成本 | `--scrollbar-width` 探针 + 两种会话抽查 |
