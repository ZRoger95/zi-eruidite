# 首页 topbar 模式 Zed 参考线网格重设计 — 设计规格

- 日期：2026-10-09
- 范围文件：`src/pages/index.astro`（中文首页）
- 目标布局：仅 `topbar` 模式（导航在顶部），对齐 zed.dev 主页的「参考线」设计语言
- 分支：新建独立分支实施；**不**参考、**不**复用未合并分支 `feat/home-zed-redesign`

## 1. 目标与非目标

### 目标
- 把 zed.dev 主页标志性的「蓝图参考线」引入本站中文首页，仅在 topbar 模式下生效：
  - **通高垂直列线**（内容列左右缘各一条 1px 细线）
  - **全出血水平分隔线**（区块边界横贯整幅宽度，随内容滚动）
  - **菱形节点**（水平线与垂直线交叉处的空心小菱形）
- 内容骨架保持不变：hero（问候 + 简介）→ 最新文章 → 最新动态（若 `SITE.momentsOnHome` 开启）。
- hero 换皮为 zed 风：居中、大号**斜体**、accent 蓝标题 + 灰色副标题；去掉现有圆角盒子。

### 非目标
- **不改** sidebar 模式的首页外观（保持今日像素级一致）。
- **不改**其他任何页面（/blog、/authors、/moments、/tags、/projects、文章页等）。
- **不改**全局 token、`Layout.astro` 骨架、`SiteBar.astro`、`home.css` 的既有规则。
- **不**新增构建期 `homeDesign` 开关或 `HomeClassic`/`HomeZed` 组件拆分。
- **不**纳入侧边刻度尺（ruler ticks）与 hero 背后的辐射/同心圆图案（本次只要垂直线 + 水平线 + 菱形）。
- **不**处理英文首页 `/en/index.astro`（列为可选后续，见 §7）。

## 2. 设计语言（构图 A，已与用户确认）

| 元素 | 规格 |
| --- | --- |
| 垂直列线 | 1px，`--border` 色；固定框架（见 §3.1），x 对齐内容列（`--topbar-measure` = 50rem）左右缘；从视口顶贯穿到底，穿过顶栏背后 |
| 水平分隔线 | 1px，`--border` 色；位于区块边界（hero 下、最新文章下、最新动态下/页脚前）；全出血至视口两端；随内容滚动 |
| 菱形节点 | ~6–7px 空心方块旋转 45°，`--background` 填充 + `--border` 描边；锚定在每条水平线上、与垂直线 x 相交处；随水平线滚动、沿固定垂直线滑动 |
| hero 标题 | 居中，`font-style: italic`，`color: var(--accent)`，`--step-3` 级字号，负字距 |
| hero 副文案 | 居中，`--muted-foreground`，`max-width: var(--measure)` 收窄 |
| 区块标签 | mono 微标签 eyebrow（`~/ 最新文章` 等）作为区块头（沿用 zed 气质，非强制） |

## 3. 技术方案

### 3.1 垂直线 = 固定框架（决策①）
- 新增装饰元素 `<home-rails aria-hidden="true">`（`position: fixed; inset: 0; pointer-events: none;`），其 `::before`/`::after` 各画一条通高垂直线。
- x 位置：`left: calc((100vw - var(--topbar-measure)) / 2)` 与对称 `right`；因 topbar 容器模式 `page-scroll` 有 `scrollbar-gutter: stable`，内容列中心相对视口左移 `--scrollbar-width/2`，右侧偏移需减去 `var(--scrollbar-width, 0px)`（该变量由 `Layout.astro` 首帧脚本写入 `:root`）。
- 层级：`home-rails` 的 `z-index` 取在「`body::before` 背景（0）之上、内容 `page-shell`（1）之下」，使线条位于正文背后；顶栏（`z-index:10`）的半透明模糊背景会盖在其上，产生线条穿过顶栏背后若隐若现的 zed 观感。
- 固定框架不随滚动移动，内容在其间滚动 → 蓝图感强、对齐最稳。

### 3.2 水平线 = in-flow 全出血（决策 A）
- 在各 `<section>` 边界用带 `border-block-end` 的块，或用独立 `<home-rule>` 细线元素。
- 全出血技法：出血元素 `width: 100vw; margin-left: calc(50% - 50vw);`（经典 breakout），并在首页内容根容器上加 `overflow-x: clip` 防止 `100vw`（含滚动条宽）引发横向滚动条。
- 菱形节点作为出血水平线上的绝对定位子元素（`::before`/`::after`），x 落在垂直线所在比例处；因垂直线固定、水平线滚动，菱形表现为「沿导轨滑动的节点」。

### 3.3 hero 换皮
- 复用现有 `hero-card` 结构（`h1` + `p` + 可选 `hero-avatar`），仅在 topbar 作用域下覆盖为居中、斜体、accent 蓝、去盒子（`background: none; border: 0; border-radius: 0; padding: 0`）。
- 现有 `home.css` 的 `hero-card` 盒子规则**不改**，由 `index.astro` scoped 样式在 `:root[data-layout="topbar"]` 下覆盖，确保 sidebar 零回归。

### 3.4 窄屏（<64rem，决策②）
- `@media (width < 64rem)`：`home-rails { display: none; }`，取消全出血，区块仅保留朴素列内分隔线（或无线），保证移动端干净。

### 3.5 主题（明暗）
- 所有线条/菱形仅用 `--border`、`--background`、`--accent` token，自动适配明暗，无需额外分支。

## 4. 作用域与隔离（最关键约束）
- `index.astro` 内新增的所有选择器一律以 `:root[data-layout="topbar"]` 前缀门控。
- `<home-rails>` 在 sidebar 下 `display: none`；`overflow-x: clip` 与出血仅 topbar 生效。
- 验证「sidebar 零回归」的硬标准：`dist/index.html` 在 sidebar 默认下不含任何 topbar-only 呈现（见 §6）。
- 因 Astro scoped `<style>` 会把样式打进页面，`home-rails` 元素虽常驻 DOM，但 sidebar 下不产生可见盒子；可接受（约几十字节 DOM + 少量 dead CSS，像素中性）。

## 5. 涉及文件
- `src/pages/index.astro`：新增 `<home-rails>` 装饰元素、区块边界出血水平线与菱形、hero 换皮；scoped `<style>` 内以 `:root[data-layout="topbar"]` 门控全部新规则。
- （不改）`src/styles/home.css`、`src/layouts/Layout.astro`、`src/components/SiteBar.astro`、`src/consts.ts`。

## 6. 测试与验证
- `npm run format:check` 与 `npm run build` 必须通过。
- `bash scripts/tests/i18n-check.sh` 全绿（确认未回归 i18n 路由/SEO）。
- 构建产物断言（grep `dist/index.html`）：
  - 含新增参考线标记元素（如 `<home-rails`）；
  - hero 文案/最新文章/最新动态内容仍在。
- **人工视觉核对（必须）**：dev 服务器下，topbar × {light, dark} × {≥64rem, <64rem} 与 sidebar 对照，确认：
  - topbar 桌面：垂直线对齐内容列、水平线全出血、菱形在交叉处、hero 居中斜体蓝；
  - topbar 移动：网格收起、无横向滚动条；
  - sidebar：与改动前完全一致。
- 若引入可复用回归脚本，命名 `scripts/tests/home-guide-topbar-check.sh`（可选，非阻塞）。

## 7. 后续可选项（不在本次范围）
- 英文首页 `/en/index.astro` 同步该 topbar 参考线外观。
- 视情况把「参考线」沉淀为可复用设计 token，供其它 topbar 页面使用。

## 8. 已锁定决策回顾
- 构图：**A**（全出血水平线 + 菱形节点）。
- ① 垂直线：**固定框架**（通高、穿过顶栏背后、内容其间滚动）。
- ② 窄屏：**收起网格**。
- ③ hero：**居中斜体 accent 蓝**。
- 分支策略：新建分支、直接改 `index.astro`、不复用旧分支、不加构建期开关。
