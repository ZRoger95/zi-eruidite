# 运行时布局切换设计（访客可自由切换 sidebar / topbar）

日期：2026-10-07
状态：已批准（2026-10-07，对话逐节确认 + 全文审阅通过）

## 背景与目标

站点现有两种布局，由 `SITE.layout` 在构建期二选一：`sidebar`（当前默认）与
`topbar`。现状实现是**构建期分叉**：`Layout.astro` 按 `SITE.layout` 渲染两套
完全不同的 DOM（`Sidebar` / `Topbar` 外壳、两种内容容器），`PostChain.astro`
的 banner 顺序同样按该值分支。构建后布局固定，访客无法选择。

目标：把布局切换做成**访客可用的运行时功能**——在主题、语言按钮旁新增切换
按钮，点击即时切换（无刷新）；偏好记入浏览器，跨页面、跨访问、跨视口保持；
`SITE.layout` 语义收窄为「首访默认布局」。实现模式参照主题切换：根元素属性 +
防闪烁内联脚本 + `localStorage`。

## 成功标准

1. 所有页面（含 `/en` 镜像与 404）的操作区出现布局切换按钮（主题、语言之后）；
   点击即时切换、无刷新、无网络请求；
2. 偏好经 `localStorage.layout` 持久：跨页面、跨访问、跨视口保持；偏好缺失或
   非法时按 `SITE.layout` 呈现；
3. 防闪烁：已保存偏好在首帧前应用；无 JS 时按默认布局完整可用（切换按钮无
   响应，与主题按钮现状一致）；
4. **严格保真**：除新增按钮外，两种布局的桌面与移动观感、交互与现状一致，以
   「4 组合（2 模式 × 2 断点）× 关键页面」逐页对比为准；
5. `npm run format:check`、`npm run build`、`bash scripts/tests/i18n-check.sh`
   全绿；新增 `bash scripts/tests/layout-check.sh` 全绿。

## 范围

**覆盖：**

- 布局机制：根元素 `data-layout`、防闪烁脚本、`LayoutToggle` 组件、i18n 键
  `layoutToggle`；
- DOM 统一：`Sidebar` + `Topbar` 合并为 `SiteBar`；`Layout.astro` 统一骨架；
  `PostChain` banner 单 DOM；
- CSS：两套样式迁移到 `:root[data-layout="…"]` 作用域（严格保真目标）；
- 测试：新增 `scripts/tests/layout-check.sh`；
- 文档：`README.md` / `README.en.md` / `CONTEXT.md`（`AGENTS.md` 如有新约定）。

**不覆盖（本期）：**

- auto 跟随系统偏好、`?layout=` URL 参数、多于两种布局、打印样式专门优化、
  部署 / CI 变更。

## 设计决策（对话已确认）

| # | 决策点 | 结论 |
| - | - | - |
| 1 | 面向对象 | 访客（公开站点），非 dev-only |
| 2 | 切换方式 | 页面内即时切换（翻转属性 + CSS 重排），无刷新、无网络请求 |
| 3 | 持久化 | `localStorage.layout`；跨页 / 跨访问 / 跨视口保持 |
| 4 | 默认值 | `SITE.layout`（语义 =「首访默认」）；偏好优先于默认，作者改默认不影响已有偏好的访客 |
| 5 | 防闪烁 | `MetaHead` 内联脚本首帧前应用保存值；非法值忽略；同主题脚本模式 |
| 6 | 保真标准 | 严格保真：除新增按钮外零视觉变化；四组合 × 关键页面截图对比 |
| 7 | 移动端 | 全端可用：按钮所有视口显示、偏好跨视口生效 |
| 8 | 实现方案 | 方案 A「统一 DOM，`data-layout` 驱动 CSS」；未采纳方案 B「双外壳渲染 + 显隐」（DOM 重复、脚本多实例化、长期两套代码） |
| 9 | 按钮形态 | `data-icon-button` 图标按钮（2rem，与主题按钮一致）；图标显示**当前**布局状态；排在主题、语言之后 |
| 10 | 全宽按钮 | 维持顶栏文章页专属（侧栏隐藏）；`html[data-fullwidth]` 偏好不清除 |
| 11 | 属性载体 | 根元素 `<html data-layout>`；body 旧属性移除（经核查现无 CSS 消费者） |

## 术语与约定

- **布局（Layout）**：`sidebar` 与 `topbar` 两种站点外壳形态；
- **布局偏好（Layout Preference）**：访客经按钮做出的选择，存于
  `localStorage.layout`；
- **默认布局**：`SITE.layout` 值，偏好缺失 / 非法时的兜底；
- **统一骨架**：所有页面唯一的 DOM 结构，四个槽位——nav / toc / main / footer；
- **切换按钮**：`LayoutToggle` 组件渲染的图标按钮。

## 架构设计

### 文件与职责

| 文件 | 动作 | 职责 |
| - | - | - |
| `src/components/SiteBar.astro` | 新增 | 由 `Sidebar`/`Topbar` 合并：品牌 + 导航（含面包屑结构）+ 操作区（主题/语言/布局/全宽/actions），两模式共用 |
| `src/components/LayoutToggle.astro` | 新增 | 切换按钮（`id="layout-toggle"`）：翻转根元素 `data-layout` + 写 `localStorage` |
| `src/components/Sidebar.astro`、`Topbar.astro` | 删除 | 逻辑并入 `SiteBar` |
| `src/layouts/Layout.astro` | 修改 | 统一骨架 `page-shell > [page-nav, page-toc, main, page-footer]`；移除构建期分支 |
| `src/components/PostChain.astro` | 修改 | banner 单 DOM（`order` 摆位）；`data-article-topbar` → `data-article`；移除 `SITE.layout` 分支 |
| `src/components/MetaHead.astro` | 修改 | 防闪烁内联脚本（读 `localStorage.layout` → 根元素属性） |
| `src/assets/icons/layout-sidebar.svg`、`layout-topbar.svg` | 新增 | 状态图标（左侧栏 / 顶部栏） |
| `src/lib/i18n.ts` | 修改 | `UI_STRINGS` 新增键 `layoutToggle`：zh「切换布局」/ en "Toggle layout" |
| `src/consts.ts` | 修改 | `layout` 注释更新（默认布局语义） |
| `src/styles/layout.css`、`bar.css` 等 | 修改 | 样式迁移到 `:root[data-layout="…"]` 作用域 |
| `scripts/tests/layout-check.sh` | 新增 | dist 层断言（见「测试与验收」） |
| `README.md`、`README.en.md`、`CONTEXT.md`、`AGENTS.md` | 修改 | README 双语：`layout` 说明改为「默认布局，访客可切换」；CONTEXT.md 补术语「布局偏好」；AGENTS.md 补一句布局机制（`data-layout` 为唯一布局信号） |

### 切换机制与数据流

1. **服务端**：`<html data-layout={SITE.layout}>` 输出默认值；
2. **首帧前**：`MetaHead` 内联脚本读 `localStorage.layout`，值合法
   （`"sidebar"` / `"topbar"`）则覆盖根元素属性：

   ```js
   const layout = localStorage.layout
   if (layout === "sidebar" || layout === "topbar")
     document.documentElement.dataset.layout = layout
   ```

3. **点击切换**：翻转根元素属性 + 写入 `localStorage.layout`；
4. **呈现**：CSS 按 `:root[data-layout="…"]` 切模式；无 DOM 重建、无异步、
   无竞态；切换保留滚动位置与 TOC 折叠状态。

### 统一骨架与分模式摆位

```
<page-shell>
  <page-nav>  site-bar（品牌 / 导航 / 操作区）  </page-nav>
  <page-toc> …（仅文章页，一个实例） </page-toc>
  <main id="main-content"> … </main>
  <page-footer> … </page-footer>
</page-shell>
```

| 槽位 | 侧栏 ≥64rem | 侧栏 <64rem | 顶栏 ≥64rem | 顶栏 <64rem |
| - | - | - | - | - |
| nav | 左侧固定栏（竖排，含面包屑） | 吸顶条（横排一级导航 + 操作区） | 吸顶顶栏（仅 logo、居中横排） | 同左 |
| toc | 右侧固定栏（10–13 列） | 吸顶条下折叠行，随条吸顶 | 内容列内左侧粘性栏，粘性范围限定于正文区域 | 正文流内、全宽静态 |
| main | 3–10 列 | `--measure` 限宽居中 | 居中列：50rem；文章 80rem；全宽 100% | 同列宽 |
| footer | 3–10 列、贴底 | 同左 | 居中列宽、正文之下 | 同左 |

要点：

- 面包屑：统一渲染（侧栏结构），顶栏模式隐藏子级列表；
- 品牌文字：顶栏模式隐藏（仅 logo）；
- 全宽按钮：顶栏模式显示（文章页）、侧栏隐藏；`html[data-fullwidth]` 宽度规则
  增加 `:root[data-layout="topbar"]` 限定；
- 滚动描边（`is-scrolled`）：保留，样式限定顶栏模式；
- **TOC 摆位是最大保真风险点**：侧栏移动端以「两条独立 sticky 叠放」复现现
  「同一吸顶块」效果；顶栏保持粘性限定正文区域（避免页尾超驻留）；以像素级
  对比验收。

### `PostChain` 单一 DOM

- 渲染顺序固定 `[banner, header, prose]`，banner 只出现一次；侧栏模式经 `order`
  摆到 header 之后（顶栏即默认顺序）；
- `data-article-topbar` 改为中性 `data-article`；顶栏专属样式（居中 header、
  `prose-content` 限 `--measure` 等）挂 `:root[data-layout="topbar"]` 作用域；
- 系列子文章（`data-embedded`）与未翻译占位（`untranslated-section`）行为不变。

### 边界情形与降级

- `localStorage` 不可用 / 值非法 → 静默回退默认（与主题脚本同策略）；
- 无 JS → 默认布局完整可用；切换按钮存在但无响应（与主题按钮现状一致）；
- 全宽偏好在顶栏文章页保存；切到侧栏再切回仍保留（不互清）；
- 偏好优先于默认：作者改 `SITE.layout` 对新访客生效、不影响已有偏好的访客。

## 测试与验收

**回归必跑**：`npm run format:check`、`npm run build`、
`bash scripts/tests/i18n-check.sh`（已核查：脚本断言与 layout / topbar 无耦合，
新增根元素属性不破坏其断言）。

**新增 `scripts/tests/layout-check.sh`**（临时改参构建、`trap` 恢复原文件，
模式参照 `deploy-check.sh`）：

1. 默认构建：`dist` 的 `<html>` 含 `data-layout` 默认值；`<head>` 含防闪烁
   脚本；页面含切换按钮（zh 页 aria-label「切换布局」、en 页 "Toggle layout"）；
2. 以另一默认值（临时把 `SITE.layout` 改为 `"topbar"`）再构建：同一组断言
   成立，且骨架元素（`page-shell`、`site-bar` 等）存在——同一份 DOM，仅属性
   不同；
3. 断言 dist 不再出现旧构建期分支的容器名（如 `page-content-topbar`）。

**保真验收（核心）**：以当前 `main` 为基线（基线构建分别以
`SITE.layout = "sidebar"` / `"topbar"` 产出两组截图），对新实现产出 4 组合
（2 模式 × 2 断点）× 页面清单——首页、`/blog`、文章 / 系列 / 带 TOC 文章、
`/tags`、`/moments`、`/projects`、`/authors`、404、`/en` 首页与文章；新旧逐张
对比，**只允许新增按钮这一处差异**；sticky / 模糊 / 边框接缝在 Safari + Chrome
抽查。

**手工冒烟**：点击即时生效；刷新与跨页保持；404 与 `/en` 可用；禁用 JS 时按
默认布局完整呈现。

## 风险与对策

| 风险 | 对策 |
| - | - |
| TOC 四组合摆位保真（最大风险） | 像素级对比 + Safari/Chrome 实机抽查 |
| sticky 叠放接缝（侧栏移动端） | 对比中专项检查边框 / 模糊接缝 |
| 两模式样式同包发布（相对现状的 CSS 增量） | 增量小、接受；构建产物体积纳入验收观察 |
