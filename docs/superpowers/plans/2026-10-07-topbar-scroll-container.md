# 顶栏内容区滚动（滚动条只属于内容区）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 topbar 桌面（≥64rem）的滚动条只属于内容区——`page-shell` 变为「固定顶栏行 + 内容滚动行」，TOC/main/页脚在独立滚动容器内，滚动条从顶栏下缘开始；其余组合严格零变化。

**Architecture:** 新骨架元素 `page-scroll`（默认 `display: contents`，零影响）包住 toc/main/footer；容器模式（仅 `topbar × ≥64rem`）下 `html/body` 不滚、`page-scroll` 带 `scrollbar-gutter: stable` 承接滚动并内部重建列网格。新增 `src/lib/scroll.ts` 统一「活跃滚动源」（window ↔ 容器自动切换），组件全部改走该抽象；顶栏用 `--scrollbar-width` 校准对齐，滚动位置跨断点/布局切换迁移。

**Tech Stack:** Astro 7、原生 CSS（Utopia 变量 + 自主定制元素）、原生 JS（模块脚本 + `is:inline`）、Biome、Bash 3.2、playwright-cli（`~/.agents/skills/playwright/scripts/playwright_cli.sh`）。

**Spec:** `docs/superpowers/specs/2026-10-07-topbar-scroll-container-design.md`（执行者必须一并阅读；本计划实现其全部「覆盖」项）

## Global Constraints

- 包管理器用 npm；每个任务结束前 `npm run format:check` 必须通过；提交信息中文短祈使句，前缀「内容区滚动：」。
- 执行于分支 `topbar-scroll`（Task 0 创建）；**不合并 main**（收口时等待用户指示）。
- **范围锁定**：仅 `topbar × ≥64rem` 容器化；sidebar 全断点、topbar `<64rem` 严格零变化（与基线截图对比为准）。
- **命名契约**：新元素 `page-scroll`；新变量 `--scrollbar-width`；不得引入 layout-check 黑名单旧名（`page-content`、`page-grid`、`page-header`、`topbar-*` 等）。
- **滚动源契约**：组件一律经 `src/lib/scroll.ts`；不得直接使用 `window.scrollY / window.scrollTo / addEventListener("scroll"…)`——例外仅两处：TOC 的 `<64rem` 进度环（保留 window，本计划不动）、`scrollIntoView` 调用（浏览器自动跨容器，保留）。
- **三个实测坑（spec 已写明，实现必须遵守）**：① `display: contents` 下 computed `overflowY` 仍为 `auto`——活跃源判定必须同时排除 contents；② window 滚动不会被 `document` 捕获监听收到、元素滚动会——统一监听用 `window` + `document`（capture）双挂；③ 锚点基线：现状点 TOC 链接后目标顶 48px vs 顶栏底 51px（新实现不得劣于此）。
- **键盘约定**：`main` 用 `tabindex="-1"` + skip-link 原生聚焦；不做全局 keydown 转发；焦点停在顶栏上时键盘翻页无效为已知缺口（不修）。
- **对齐补偿**：仅占位式滚动条环境生效；`--scrollbar-width` 在非容器态重置为 `0px`，补偿规则只写在 ≥64rem 媒体内（双保险）。
- **用户工作区有未提交文件**：`src/consts.ts`（背景配置）与 `public/static/bg.jpg`——不得提交、覆盖或清理；所有 `git add` 点名具体文件，**永不 `git add -A`**。
- macOS bash 3.2：变量后紧跟多字节字符用 `${VAR}`；`sed -i.bak … && rm -f *.bak` 兼容写法（脚本本就如此）。
- dev 下改 `.astro` 内嵌样式后若 CSS 陈旧：`touch src/layouts/Layout.astro` + 刷新（既有教训）；**不要 kill 用户的 dev server（4321）**。
- playwright-cli 要点：`run-code` 用函数形式（`() => page.waitForTimeout(250)`）；`eval` 只接受单表达式；`open` 会重开浏览器并发失 localStorage——**逐页切换用 `goto`**；会话会在 cwd 生成 `.playwright-cli/`——统一在 `/tmp/tsc-verify` 下运行；解析输出取 `### Result` / `### Error` 下一行。
- 验证产物只写 `/tmp/tsc-verify/`（baseline / new / probes），不进仓库；基线 worktree 固定 `/tmp/tsc-baseline`。
- 几何容差：四舍五入 ±2px；对齐校准项 ±1px。

## Review Focus

以下五类为 spec 暗示、最易翻车的行为；对应检查已固定进任务步骤：

1. **无 JS 环境**：容器模式为纯 CSS——不执行任何 JS 时 topbar 桌面仍可滚动、可阅读，顶栏固定（Task 3 步骤；pwcli 不便禁 JS 时以 CSS 产物断言 + 人工冒烟交用户）。
2. **内容短于容器的页面**（404 等）：容器不滚、无异常滚动条、布局不破（Task 3 步骤）。
3. **overlay 滚动条环境**（`--scrollbar-width` = 0）：补偿归零、与现状等价、无副作用（Task 4 步骤，注入 `scrollbar-width: none` 模拟）。
4. **64rem 边界（1023 ↔ 1024px）**：容器激活/去激活切换干净，滚动位置迁移不丢（Task 5 步骤）。
5. **带 hash 直开与系列文章 URL 同步**：容器模式下锚点定位到正确位置（浏览器 fragment 算法跨容器）；系列长文滚动时地址栏仍更新（Task 3 步骤）。

---

### Task 0: 基线捕获（改动前，一次性）

**Files:** 无仓库改动（产物：`/tmp/tsc-verify/`、`/tmp/tsc-baseline/`）

**Interfaces:**
- Produces：基线截图 + 探针 JSON（供 Task 3/4/7 对比）；`/tmp/tsc-verify/capture.sh` 捕获脚本（Task 3/7 复用）。

- [ ] **Step 1: 建分支与基线 worktree**

```bash
git checkout -b topbar-scroll
git worktree add --detach /tmp/tsc-baseline HEAD
cp .env /tmp/tsc-baseline/.env
cd /tmp/tsc-baseline && npm ci
```

- [ ] **Step 2: 落盘捕获脚本 `/tmp/tsc-verify/capture.sh`**

参照 `docs/superpowers/plans/2026-10-07-layout-switch.md` 的 capture.sh 骨架，但按本计划约束调整：

- 逐页用 `goto`（保持会话与 localStorage；勿用 `open`）；
- `run-code` 用函数形式；输出目录含 `w<视口>`；截图两张：`-top.png`（加载后）与 `-scrolled.png`（滚动视口高后）；每次导航后 `waitForTimeout(350)` 再截；
- 探针 `eval` 输出 JSON（单表达式，`JSON.stringify`）：

```js
JSON.stringify((() => {
  const g = (s) => { const e = document.querySelector(s);
    if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y),
             w: Math.round(b.width), h: Math.round(b.height) } };
  const col = document.querySelector("main article, main");
  const toc = document.querySelector("page-toc nav");
  return {
    htmlCW: document.documentElement.clientWidth,
    innerW: innerWidth,
    docScrollable: document.documentElement.scrollHeight > innerHeight,
    scrollY: Math.round(scrollY),
    pscrollTop: document.querySelector("page-scroll")
      ? (document.querySelector("page-scroll").scrollTop | 0) : null,
    pscrollOverflow: document.querySelector("page-scroll")
      ? getComputedStyle(document.querySelector("page-scroll")).overflowY : null,
    bar: g("site-bar"),
    col: g("main article, main"),
    toc: toc ? { ...g("page-toc nav"),
      stickyTop: getComputedStyle(toc).top } : null,
  };
})())
```

调用形态：`capture.sh <outdir> <base-url> <mode: topbar|sidebar|default>`；脚本实现要点：先 `goto <base-url>`，再设 `localStorage.layout = '<mode>'`（mode=default 则 removeItem），然后逐页 `goto`（同实例会话保持、偏好跨页生效）。
页表：`home:/ intro:/blog/introducing-v2/ series:/blog/v1-posts/ notfound:/definitely-not-a-page/`；视口：`1440 900` 与 `1000 900`。

- [ ] **Step 3: 构建并捕获基线**

```bash
cd /tmp/tsc-baseline && npm run build
npm run preview -- --port 4324 &   # 轮询 http://127.0.0.1:4324/ 至 200
mkdir -p /tmp/tsc-verify/baseline
bash /tmp/tsc-verify/capture.sh /tmp/tsc-verify/baseline/topbar  http://127.0.0.1:4324 topbar
bash /tmp/tsc-verify/capture.sh /tmp/tsc-verify/baseline/sidebar http://127.0.0.1:4324 sidebar
# 停掉 preview
```

- [ ] **Step 4: 校验与记录**

```bash
find /tmp/tsc-verify/baseline -name '*.png' | wc -l   # 期望 2 模式 × 2 视口 × 5 页 × 2 张 = 40
find /tmp/tsc-verify/baseline -name '*.json' | wc -l  # 期望 20
```

抽查 `baseline/topbar/w1440/intro-scrolled.png`：确认现状问题（滚动条从视口顶端贯穿、贴顶栏右侧）与锚点基线（可另用交互探针复核 48/51）。记录：`intro` 页 topbar 1440 的 `bar`、`col`、`toc` 探针值（Task 3 对齐/停靠校准要用）。

- [ ] **Step 5: 本任务无提交**（worktree 保留至 Task 7 收口）

---

### Task 1: 骨架 `page-scroll` + `main` 可聚焦（零行为变化）

**Files:**
- Modify: `src/layouts/Layout.astro`
- Modify: `scripts/tests/layout-check.sh`（骨架断言区）
- Test: 同上脚本 + Playwright 手测（本任务无独立测试文件；仓库惯例为 dist 断言 + 浏览器验证）

**Interfaces:**
- Produces（后续任务依赖）：DOM `page-shell > [page-nav, page-scroll > [page-toc, main#main-content[tabindex="-1"], page-footer]]`；默认样式 `page-scroll { display: contents }`（放 `Layout.astro` 的 `<style>`）；`main:focus { outline: none }`。

- [ ] **Step 1: 断言先行（layout-check.sh 增加两条）**

在既有 `<page-shell` / `<site-bar` 断言之后追加：

```bash
assert_has dist/index.html '<page-scroll' "统一骨架 page-scroll"
assert_match dist/index.html '<main[^>]*id="main-content"[^>]*tabindex="-1"' "main 可聚焦（skip-link 目标）"
```

（Step 4 若实际输出属性顺序不同，以产物为准微调正则。）

- [ ] **Step 2: 跑脚本确认 FAIL**

```bash
bash scripts/tests/layout-check.sh
```

期望：FAIL 于新增「统一骨架 page-scroll」断言（此时元素尚不存在）；既有断言不受影响。注：脚本含 3 次 `npm run build`，需要几分钟。

- [ ] **Step 3: 实现**

`Layout.astro` 模板：

```html
<page-shell data-article={article || undefined}>
  <page-nav>
    <SiteBar crumbs={crumbs}>…</SiteBar>
  </page-nav>
  <page-scroll>
    {Astro.slots.has("toc") && (<page-toc><slot name="toc" /></page-toc>)}
    <main id="main-content" tabindex="-1"><slot /></main>
    <page-footer><Footer /></page-footer>
  </page-scroll>
</page-shell>
```

`<style>` 顶部（或文件内合适处）加默认规则与焦点处理：

```css
/* 默认不产生盒子：sidebar 与移动端布局语义零变化 */
page-scroll {
  display: contents;
}

main:focus {
  outline: none; /* skip-link 跳转的可见反馈由滚动/视口变化承担 */
}
```

- [ ] **Step 4: 跑脚本确认 PASS**

```bash
npm run format:check && bash scripts/tests/layout-check.sh
```

期望：全绿（含新增两条）。

- [ ] **Step 5: 浏览器验证（零视觉变化 + skip-link 新行为）**

对 dev（`http://localhost:4321`，`touch src/layouts/Layout.astro` 后刷新；或用 preview `4323`）四个组合（sidebar/topbar × 1440/1000）抽查 `intro` 页与 `home`：

- 探针对比基线同名 JSON：`bar/col/toc` 各字段 ±2px（这是"零变化"的直接证据）；
- skip-link 新行为：`eval` 聚焦验证——键盘 `Tab` → `Enter` 后 `document.activeElement.id === "main-content"`。

- [ ] **Step 6: Commit**

```bash
git add src/layouts/Layout.astro scripts/tests/layout-check.sh
git commit -m "内容区滚动：骨架新增 page-scroll 包装 + main 可聚焦（skip-link 焦点修复）"
```

---

### Task 2: 滚动源抽象 `src/lib/scroll.ts` + 组件适配（零行为变化）

**Files:**
- Create: `src/lib/scroll.ts`
- Modify: `src/components/ScrollToTop.astro`
- Modify: `src/components/SeriesReader.astro`
- Modify: `src/components/SiteBar.astro`（`is-scrolled` 段）
- Test: Playwright 手测（行为与基线一致）

**Interfaces:**
- Produces（后续任务扩展/消费的精确契约）：

```ts
export type ScrollTarget = Window | HTMLElement;
export function activeTarget(): ScrollTarget; // 容器模式 → page-scroll；否则 window
export function top(): number;                // 活跃源滚动位置
export function setTop(value: number): void;  // 立即（非平滑）滚动
export function viewportHeight(): number;     // el.clientHeight / innerHeight
export function atBottom(): boolean;          // 2px 容差
export function onScroll(handler: () => void): void; // window + document(capture) 双挂
```

- Task 4 将在此文件追加 `syncScrollbarWidth()` 与 `initScroll()`；Task 5 扩展 `initScroll()`。本任务**不**实现它们。

- [ ] **Step 1: 创建 `src/lib/scroll.ts`**

实现要点（决策已锁定）：

- `activeTarget()`：`const el = document.querySelector<HTMLElement>("page-scroll")`；存在且 `getComputedStyle(el).display !== "contents"` 且 `overflowY === "auto"` → 返回 `el`；否则 `window`。（**必须排除 contents：实测其 computed overflowY 仍为 auto。**）
- `top()` / `setTop(v)`：容器 → `el.scrollTop` / `el.scrollTo({ top: v })`；window → `scrollY` / `window.scrollTo({ top: v })`。
- `viewportHeight()`：容器 → `el.clientHeight`；window → `innerHeight`。
- `atBottom()`：`top() + viewportHeight() >= scrollHeight - 2`（容器用 `el.scrollHeight`；window 用 `document.documentElement.scrollHeight`）。
- `onScroll(handler)`：`window.addEventListener("scroll", handler, { passive: true })` + `document.addEventListener("scroll", handler, { capture: true, passive: true })`；handler 须幂等（本计划各消费者都是幂等更新）。

- [ ] **Step 2: 适配三个组件**

- `ScrollToTop.astro`：`const past = top() > viewportHeight() * 0.5`；监听改 `onScroll(update)`；点击改 `setTop(0)`。
- `SeriesReader.astro`：`atBottom()`（helper）替换本地实现；点击系列第一篇的 `scrollTo({ top: 0 })` 改 `setTop(0)`；`addEventListener("scroll", update, …)` 改 `onScroll(update)`；`scrollIntoView` 两处**保留**。
- `SiteBar.astro`：删除 sentinel + IntersectionObserver 块；改为 `const update = () => bar.classList.toggle("is-scrolled", top() > 0); onScroll(update); update()`。

- [ ] **Step 3: 验证（行为与基线一致，此刻仍为页面级滚动）**

用 preview 或 dev，topbar 1440：

- `scrollTo(0, 800)` 后：`site-bar` 含 `is-scrolled`；回顶按钮含 `data-visible`；点击回顶后 `scrollY === 0`；
- `intro` 页滚动后与基线 `-scrolled.png` 视觉一致；
- `series` 页：滚动至第二篇区域后 `location.pathname` 变更为子文章 URL（与基线行为对照）；
- sidebar 1440、topbar 1000 抽查同项。

- [ ] **Step 4: Commit**

```bash
git add src/lib/scroll.ts src/components/ScrollToTop.astro src/components/SeriesReader.astro src/components/SiteBar.astro
git commit -m "内容区滚动：滚动源抽象（lib/scroll.ts）与组件适配（行为不变）"
```

---

### Task 3: 容器模式激活（CSS）+ TOC 参数重算

**Files:**
- Modify: `src/layouts/Layout.astro`（topbar ≥64rem CSS 块）
- Modify: `src/styles/layout.css`（`html` 的 `scrollbar-gutter` 条件化）
- Modify: `src/components/SiteBar.astro`（≥64rem 分支去 sticky）
- Modify: `src/components/TableOfContents.astro`（容器分支 sticky 偏移 /max-height）
- Modify: `scripts/tests/layout-check.sh`（CSS 产物断言）
- Test: 同上 + 大轮 Playwright 验证（本任务为核心行为切换）

**Interfaces:**
- Consumes: `activeTarget()` 等（Task 2）——激活后组件自动切到容器源，无需再改组件。
- Produces: 容器模式 CSS（`topbar × ≥64rem`）；`page-scroll` 内部 4 列网格（列公式与现状一致）。

- [ ] **Step 1: 断言先行（layout-check.sh 增加 CSS 产物断言）**

```bash
# CSS 产物：page-scroll 默认 contents + 容器滚动规则 + gutter 迁移（压缩形态以实际产物微调）
if grep -rqE -- 'page-scroll[^{}]*\{[^{}]*display:contents' dist/_astro/*.css &&
   grep -rqE -- 'page-scroll[^{}]*\{[^{}]*overflow-y:auto' dist/_astro/*.css &&
   grep -rqF -- 'scrollbar-gutter:stable' dist/_astro/*.css &&
   grep -rqF -- 'scrollbar-gutter:auto' dist/_astro/*.css; then
  pass "容器模式 CSS 产物齐备"
else
  fail "容器模式 CSS 产物缺失（page-scroll contents/滚动 或 gutter 迁移）"
fi
```

- [ ] **Step 2: 跑脚本确认 FAIL**

```bash
bash scripts/tests/layout-check.sh
```

期望：新增「容器模式 CSS 产物」断言 FAIL（`overflow-y:auto` 与 `scrollbar-gutter:auto` 尚不存在）。

- [ ] **Step 3: 实现容器模式 CSS**

`Layout.astro`（示意，以现状规则为迁移源，栅格数值不变）：

```css
@media (width >= 64rem) {
  :root[data-layout="topbar"] {
    overflow: hidden;          /* html */
    scrollbar-gutter: auto;    /* 关闭全局 gutter，交给容器 */
  }
  :root[data-layout="topbar"] body { overflow: hidden; }

  :root[data-layout="topbar"] page-shell {
    height: 100svh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  :root[data-layout="topbar"] page-scroll {
    display: grid;
    grid-template-columns: /* 与现状 page-shell topbar 列定义逐字一致 */;
    column-gap: var(--space-l);
    overflow-y: auto;
    scrollbar-gutter: stable;
    min-height: 0;
  }
  /* TOC/main → 容器第 1 行（原第 2 行值减 1）；footer → 第 2 行（原第 3 行）。
     有 TOC 时 main 跨列 3 的规则：把 page-shell:has(> page-toc) 改为
     page-scroll:has(> page-toc)（其 <64rem 分支同样迁移，保持一处真理）。 */
}
```

`layout.css`：`html { scrollbar-gutter: stable }` 保持；新增仅容器模式的覆盖（选择器 `:root[data-layout="topbar"]`，`≥64rem` 媒体内）。

`SiteBar.astro`：在 ≥64rem 的 `:root[data-layout="topbar"] site-bar` 分支加 `position: static`（不再 sticky；`<64rem` 分支保留 sticky）。

`TableOfContents.astro`：`≥64rem` 分支的 `top` 与 `max-height` 重算：

- 初值 `top: calc(var(--space-m) - var(--space-2xs))`（≈现状"栏底再留白"）；对照基线校准——目标：滚动后 `toc` 的视口 `y` 与基线 `-scrolled` 探针值差异 ≤1px（基线值在 Task 0 Step 4 记录）；
- `max-height` 在现状公式基础上减小约一个顶栏高（`2rem + 2 * var(--space-2xs) + 1px`），以 TOC 不溢出容器、不贴底为准。

- [ ] **Step 4: 跑脚本确认 PASS**

```bash
npm run format:check && bash scripts/tests/layout-check.sh
```

期望：全绿。

- [ ] **Step 5: 核心行为验证（Playwright；用 preview 构建产物，端口 4323）**

`topbar 1440`（intro 页）：

- html 不可滚：探针 `docScrollable === false` 且 `scrollY === 0`（html 的 scrollHeight 不超视口）；
- 容器可滚：对 `page-scroll` `scrollTo(0, 800)` 后 `scrollTop === 800`；滚轮（`page.mouse.wheel`）同样生效；
- 滚动条位置：`-scrolled.png` 截图对比基线——滚动条从顶栏下缘开始、顶栏右侧无滚动条（★本功能核心验收）；
- 锚点：点击 TOC 第一个链接后，目标 `rect.top` ≈ 容器顶（顶栏底），**遮挡不劣于基线的 3px**；再验 `hash 直开`：直接 `goto /blog/introducing-v2/#<某章节 id>`，目标在容器视口内；
- 键盘：`Tab`→`Enter`（skip-link）后 `document.activeElement.id === "main-content"`；`PageDown` 后容器 `scrollTop` 增加；
- 系列页：滚动容器至第二篇区域 → `location.pathname` 更新（URL 同步）；
- TOC 高亮跟随与自动居中：滚动容器到中部 → 对应章节链接 `data-active` 切换、列表自动居中（与基线同行为）；
- 回顶按钮：容器滚动后出现、点击后 `scrollTop === 0`。

短页（404）：容器无滚动、截图与基线一致。

回归（零变化）：`sidebar × 1440/1000`、`topbar × 1000`——`docScrollable === true`（仍页面级滚动）、`page-scroll` 计算 `display === "contents"`；截图抽查与基线一致。

TOC 停靠：滚动后 `toc` 的 `y` 对比 Task 0 记录值（±1px）。

无 JS：`page-scroll` 容器模式为纯 CSS——优先用 pwcli 关 JS 冒烟（若不可行，以"CSS 产物断言 + 交用户的禁用 JS 清单"替代，记录所选方式）。

- [ ] **Step 6: Commit**

```bash
git add src/layouts/Layout.astro src/styles/layout.css src/components/SiteBar.astro src/components/TableOfContents.astro scripts/tests/layout-check.sh
git commit -m "内容区滚动：topbar 桌面容器模式激活（页面滚动收进内容容器）"
```

---

### Task 4: 对齐校准（`--scrollbar-width` + 顶栏补偿）

**Files:**
- Modify: `src/lib/scroll.ts`（追加 `syncScrollbarWidth()`、`initScroll()` 初版）
- Modify: `src/layouts/Layout.astro`（尾部 `is:inline` 首帧测量 + 挂载 `initScroll()` 的模块脚本）
- Modify: `src/components/SiteBar.astro`（padding 补偿）
- Modify: `scripts/tests/layout-check.sh`（`--scrollbar-width` 断言）
- Test: 同上 + 几何对齐探针

**Interfaces:**
- Produces（Task 5 将扩展 `initScroll()`，不改变签名）：

```ts
export function syncScrollbarWidth(): void; // 测 offsetWidth−clientWidth → 写/重置 --scrollbar-width
export function initScroll(): void;         // 幂等；本任务职责：初始同步 + resize/mq-change 时更新 sbw
```

- [ ] **Step 1: 断言先行（layout-check.sh 追加）**

```bash
grep -rqF -- '--scrollbar-width' dist/_astro/*.css || fail "CSS 缺少 --scrollbar-width 补偿引用"
grep -rqF -- '--scrollbar-width' dist/_astro/*.js  || fail "JS 缺少 --scrollbar-width 写入"
pass "--scrollbar-width 校准机制存在"
```

- [ ] **Step 2: 跑脚本确认 FAIL**（当前无该变量）

- [ ] **Step 3: 实现**

- `scroll.ts`：`syncScrollbarWidth()`——取 `page-scroll`，若不存在/非容器态 → `root.style.setProperty("--scrollbar-width", "0px")`；否则测 `el.offsetWidth - el.clientWidth`，写入 `documentElement.style`。`initScroll()`——调用一次 `syncScrollbarWidth()`；挂 `matchMedia("(width >= 64rem)")` 的 `change` 与 `resize` 监听再调；用模块级 flag 保证幂等。
- `Layout.astro`：① 模板尾部（`</body>` 前）`is:inline` 同步脚本做首帧测量（自包含 ~8 行：取 `page-scroll`，非容器态直接 return，否则写 `--scrollbar-width`；**不可 import，纯 JS**）；② `<script>` 模块脚本 `import { initScroll } from "@/lib/scroll"; initScroll()`。
- `SiteBar.astro`：≥64rem 分支的 `padding-inline` 拆为 `padding-inline-start`（原式）与 `padding-inline-end`（原式 **+ `var(--scrollbar-width, 0px)`**）。（原式 = `max(var(--grid-gutter), (100% - 50rem) / 2 + var(--grid-gutter))`。）

- [ ] **Step 4: 跑脚本确认 PASS**

- [ ] **Step 5: 几何验证**

- 占位环境（本机即占位）：`--scrollbar-width` 计算值 `"15px"`；对齐探针——`site-bar` 内内容中心与内容列中心差 ≤1px（量法：`site-bar` 的 padding-box 中心 vs `main article` 的 rect 中心，或品牌左缘 `brand.left` 与 `col.left` 差 ≤1px，取基线的同口径对比）；
- overlay 模拟：注入 `page-scroll { scrollbar-width: none }` + 将 `--scrollbar-width` 重置为 `0px`，重复对齐探针——仍 ≤1px（补偿归零、无副作用）；
- 快照对比：占地环境补偿前后各截一张 `bar` 区域图，确认半条滚动条宽的偏移被修正。

- [ ] **Step 6: Commit**

```bash
git add src/lib/scroll.ts src/layouts/Layout.astro src/components/SiteBar.astro scripts/tests/layout-check.sh
git commit -m "内容区滚动：顶栏对齐校准（--scrollbar-width 补偿，overlay 环境归零）"
```

---

### Task 5: 位置迁移（跨断点 / 布局切换）

**Files:**
- Modify: `src/lib/scroll.ts`（扩展 `initScroll()`）
- Test: Playwright 手测

**Interfaces:**
- Consumes: Task 4 的 `initScroll()`（同一函数扩展，签名不变）。
- Produces: 行为——模式变化时滚动位置迁移（`lastTop` 记录 + `rAF` 应用）。

- [ ] **Step 1: 扩展 `initScroll()`**

- 模块级 `lastTop`；内部挂一次 `onScroll(() => { lastTop = top(); })`；
- `schedule()`：`requestAnimationFrame(() => setTop(lastTop))`；
- 触发源：`matchMedia("(width >= 64rem)")` 的 `change`、以及 `MutationObserver`（`documentElement`，`attributeFilter: ["data-layout"]`）。

- [ ] **Step 2: 验证（Playwright）**

- topbar 1440：容器 `scrollTo(0, 1500)` → 点击 `#layout-toggle` → `window.scrollY` ≈ 1500（±2）；再点回 → 容器 `scrollTop` ≈ 1500；
- 跨断点：容器 1500 → `resize` 至 1000 → `scrollY` ≈ 1500；回到 1440 → 容器 ≈ 1500；
- 边界：1023 ↔ 1024 两档各做一次，无跳变异常（clamp 可接受）；
- `<64rem` 内 800 → 900：位置不变（同为页面级，迁移为无操作）。

- [ ] **Step 3: Commit**

```bash
git add src/lib/scroll.ts
git commit -m "内容区滚动：跨断点/布局切换的滚动位置迁移"
```

---

### Task 6: 文档与回归收口

**Files:**
- Modify: `AGENTS.md`（骨架句 + 布局/滚动机制说明）
- Modify: `CONTEXT.md`（Layout 节术语）
- Modify: `scripts/tests/layout-check.sh`（注释与断言定稿核对）
- Test: 四脚本全绿

- [ ] **Step 1: 文档**

- `AGENTS.md`：统一骨架描述更新为 `page-shell > [page-nav, page-scroll > [page-toc, main, page-footer]]`；补一句滚动机制：「topbar × ≥64rem 内容区独立滚动（`page-scroll`），其余组合页面级滚动；组件统一经 `src/lib/scroll.ts` 活跃滚动源」。
- `CONTEXT.md`（Layout 节，英文体例）：补 `Container Mode` / `Active Scroll Target` 两条术语（一句话定义 + 触发条件）。

- [ ] **Step 2: 全量回归**

```bash
npm run format:check && npm run build
bash scripts/tests/layout-check.sh
bash scripts/tests/i18n-check.sh
```

期望：全部通过（layout-check 既有断言 + 本计划新增断言全绿；i18n-check 不受影响）。

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md CONTEXT.md scripts/tests/layout-check.sh
git commit -m "内容区滚动：文档与回归断言收口"
```

---

### Task 7: 全量验收与收口

**Files:** 无仓库改动（发现缺陷则修复并补提交）

- [ ] **Step 1: 新实现捕获**

```bash
cd <仓库根> && npm run build
npm run preview -- --port 4323 &   # 轮询就绪
bash /tmp/tsc-verify/capture.sh /tmp/tsc-verify/new/topbar  http://127.0.0.1:4323 topbar
bash /tmp/tsc-verify/capture.sh /tmp/tsc-verify/new/sidebar http://127.0.0.1:4323 sidebar
# 停 preview
```

- [ ] **Step 2: 对照 spec「成功标准」逐项核验**

- 滚动条位置（topbar 桌面核心验收）：`new/topbar/w1440/intro-scrolled.png` vs 基线——滚动条起点在顶栏下缘、顶栏右侧无滚动条；
- 零回归：`new/sidebar/*`、`new/topbar/w1000/*` vs 基线——除 `--scrollbar-width` 相关（sidebar 无影响）外逐张一致（±2px 探针）；
- 对齐与 TOC 停靠：探针值 vs Task 0 记录（±1px）；
- 404、系列、hash 直开、键盘、回顶、URL 同步：以 Task 3/5 已执行步骤的清单复跑抽查（每项 1 次）；
- `/en/` 路由抽查 1 页（`/en/blog/welcome`）：容器模式同样生效、无异常。

- [ ] **Step 3: Safari 人工抽查（交用户执行）**

清单：① topbar 桌面滚动条起点与顶栏右侧（占位滚动条环境）；② overlay 环境观感（触控板默认）；③ 滚轮 / 触控板 / 键盘（skip-link → PageDown / 空格）；④ TOC 点击定位与高亮跟随；⑤ 回顶按钮；⑥ 布局切换时位置保持；⑦ 禁用 JavaScript 打开 topbar 桌面首页——仍可滚动可读（预期：增强失效、滚动形态不变）。

- [ ] **Step 4: 收口**

```bash
git worktree remove --force /tmp/tsc-baseline     # 产物保留在 /tmp/tsc-verify
git --no-pager log --oneline main..topbar-scroll
git status --short                                # 应只剩用户未提交的 consts.ts / bg.jpg
```

交付说明：分支 `topbar-scroll` 就绪，等待用户指示（合并 / 压合）。
