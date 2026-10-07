# 运行时布局切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 sidebar / topbar 布局从构建期二选一改为访客可运行时切换：主题、语言按钮旁新增切换按钮，点击即时切换（无刷新），偏好存 `localStorage.layout`，`SITE.layout` 退化为首访默认值；两种布局的现有观感严格保真。

**Architecture:** 方案 A——`Sidebar` + `Topbar` 合并为单一 `SiteBar`，`Layout.astro` 渲染唯一骨架 `page-shell > [page-nav, page-toc, main, page-footer]`；`:root[data-layout="sidebar"|"topbar"]` 作用域 CSS 决定呈现；`MetaHead` 内联脚本首帧前应用保存偏好；`PostChain` 移除构建期 banner 分支（单 DOM + CSS `order`）。

**Tech Stack:** Astro 7（`.astro` 组件、`is:inline` 脚本、组件作用域样式）、原生 CSS（Utopia 变量 + 自主定制元素）、Biome（格式）、Bash 3.2 测试脚本、playwright-cli（保真对比工具）。

**Spec:** `docs/superpowers/specs/2026-10-07-layout-switch-design.md`（执行者必须一并阅读；本计划实现其全部「覆盖」项）

## Global Constraints

- 包管理器用 npm（用户偏好）；每个任务结束前 `npm run format:check` 必须通过；提交信息为短祈使句中文，前缀「布局切换：」。
- 执行于分支 `layout-switch`（Task 0 创建）；不得直接改 `main`；不负责合并（由用户 ff-only 合并）。
- **严格保真**：除新增切换按钮外，两种布局零视觉变化；不得顺手改版式、文案、间距、断点。
- **命名契约（不可偏离）**：
  - 根元素 `<html data-layout={SITE.layout}>` 是布局唯一信号；`localStorage` 键固定为 `layout`；body 上旧 `data-layout` 移除。
  - 统一骨架：`page-shell > [page-nav, page-toc, main#main-content, page-footer]`；外壳组件 `SiteBar.astro`（渲染 `<site-bar>`，内部 `<bar-inner>` / `<bar-brand>` / `<bar-actions>`）。
  - 旧名必须清除（markup 与 CSS 均不得残留）：`page-grid`、`page-header`、`page-content`、`page-content-topbar`、`topbar-article`、`data-article-topbar`、`topbar-inner`、`topbar-brand`、`topbar-actions`、`sidebar-inner`、`sidebar-toggle`、`data-topbar`。
  - 保留名：`page-nav`、`page-toc`、`page-footer`、`data-bar`（仅 TOC 行与移动端条行使用，site-bar 不得带 `data-bar`）。
  - CSS 模式作用域统一为 `:root[data-layout="sidebar"]` / `:root[data-layout="topbar"]`；默认值构建也显式落在作用域内。
- 新增 SVG 图标遵循现有约定：`viewBox="0 0 24 24"`、`fill="currentColor"`、`width/height="1em"`。
- 验证产物（截图/探针 JSON）只写 `/tmp/layout-verify/`，不进仓库；基线 worktree 固定 `/tmp/layout-baseline`。
- macOS bash 3.2：变量后紧跟多字节字符用 `${VAR}`；`sed -i.bak … && rm -f *.bak` 保持 GNU/BSD 兼容。
- dev 下改 `.astro` 内嵌样式后若 CSS 陈旧：`touch src/layouts/Layout.astro` + 刷新（既有教训）。
- 几何探针容差：四舍五入后 ±2px；仅允许「新增按钮」导致的差异，其余超差即视为保真缺陷（停下修复）。

## Review Focus

以下五类为 spec 暗示、但最易翻车的运行行为；对应检查已固定进任务步骤：

1. **运行时（非构建期）文章呈现切换**：`/blog/...` 上把 `data-layout` 改为 `topbar` 后，banner 顺序、文章头显（居中/宽列/正文限宽）必须即时翻转 —— Task 2 步骤。
2. **滚动位置与 TOC 折叠状态保持**：长文中部切换布局不得跳位、不得重建 DOM —— Task 3 步骤。
3. **非法/缺失偏好回落**：`localStorage.layout` 缺失或为非法值（如 `"bogus"`）时静默回落 `SITE.layout` 默认；无 JS 时按默认完整可用 —— Task 3 步骤 + Task 1/3 的 dist 断言。
4. **全宽（fullwidth）互操作**：顶栏文章页开全宽 → 切侧栏（无效果、按钮隐藏）→ 切回顶栏仍全宽；刷新后仍全宽 —— Task 3 步骤。
5. **/en 镜像与 404**：按钮文案本地化（"Toggle layout"）且所有页面可切换 —— Task 3 步骤 + Task 3 的 dist 断言。

---

### Task 0: 保真基线捕获（改动前，一次性）

**Files:** 无仓库文件改动（产物：`/tmp/layout-verify/`、`/tmp/layout-baseline/`）

**Interfaces:**
- Produces：基线截图与几何探针 JSON（供 Task 5 对比）；`/tmp/layout-verify/capture.sh` 捕获脚本（Task 5 复用）。

- [ ] **Step 1: 建分支与基线 worktree**

```bash
git checkout -b layout-switch
git worktree add --detach /tmp/layout-baseline HEAD
cp .env /tmp/layout-baseline/.env
cd /tmp/layout-baseline && npm ci
```

- [ ] **Step 2: 前置检查与目录**

```bash
command -v npx   # playwright 包装脚本依赖 npx；缺失则停并告知用户
mkdir -p /tmp/layout-verify/baseline/sidebar /tmp/layout-verify/baseline/topbar
```

- [ ] **Step 3: 落盘捕获脚本 `/tmp/layout-verify/capture.sh`（逐字）**

```bash
#!/usr/bin/env bash
# 用法: capture.sh <outdir> <base-url> <bar-selector> [mode]
# mode 为空 = 基线构建（清空 localStorage.layout）；给出 sidebar|topbar = 先写入偏好再逐页加载。
set -euo pipefail
outdir=$1; base=$2; barsel=$3; mode=${4:-}
PWCLI="${PWCLI:-$HOME/.agents/skills/playwright/scripts/playwright_cli.sh}"
pages="home:/ blog:/blog/ intro:/blog/introducing-v2/ v1:/blog/v1-posts/ sub:/blog/v1-posts/rehype-patch/ welcome:/blog/welcome/ tags:/tags/ tag-site:/tags/site/ moments:/moments/ projects:/projects/ authors:/authors/ author-enscribe:/authors/enscribe/ en-home:/en/ en-blog:/en/blog/ en-welcome:/en/blog/welcome/ notfound:/definitely-not-a-page/"
pages_mobile="home:/ blog:/blog/ intro:/blog/introducing-v2/ moments:/moments/ tags:/tags/ en-welcome:/en/blog/welcome/"
if [ -n "$mode" ]; then setjs="localStorage.layout = '$mode'"; else setjs="localStorage.removeItem('layout')"; fi
for vp in "1440 900" "720 900"; do
  set -- $vp; w=$1; h=$2
  if [ "$w" = "1440" ]; then list=$pages; else list=$pages_mobile; fi
  mkdir -p "$outdir/$w"
  "$PWCLI" --session lv open "$base/" >/dev/null
  "$PWCLI" --session lv resize "$w" "$h" >/dev/null
  "$PWCLI" --session lv run-code "() => { $setjs }" >/dev/null
  for entry in $list; do
    slug=${entry%%:*}; path=${entry#*:}
    "$PWCLI" --session lv open "$base$path" >/dev/null
    "$PWCLI" --session lv run-code "await page.waitForTimeout(250)" >/dev/null
    "$PWCLI" --session lv run-code "await page.screenshot({ path: '$outdir/$w/$slug.png' })" >/dev/null
    "$PWCLI" --session lv eval "JSON.stringify((()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};return {main:g('main'),toc:g('page-toc'),footer:g('page-footer'),bar:g('$barsel')}})())" > "$outdir/$w/$slug.json"
  done
done
"$PWCLI" --session lv close >/dev/null 2>&1 || true
```

注：页表中路径若在 `dist/` 不存在，以实际存在的典型页替换（两轮捕获保持一致即可）。

- [ ] **Step 4: 捕获 sidebar 基线**

```bash
cd /tmp/layout-baseline && npm run build
npm run preview -- --port 4322 &   # 后台；用 curl 轮询 http://127.0.0.1:4322/ 直到 200
bash /tmp/layout-verify/capture.sh /tmp/layout-verify/baseline/sidebar http://127.0.0.1:4322 "aside[data-bar]" ""
# 捕获完成后停掉 preview
```

- [ ] **Step 5: 捕获 topbar 基线**

```bash
cd /tmp/layout-baseline
sed -i.bak 's/layout: "sidebar"/layout: "topbar"/' src/consts.ts && rm -f src/consts.ts.bak
npm run build
npm run preview -- --port 4322 &   # 同上轮询
bash /tmp/layout-verify/capture.sh /tmp/layout-verify/baseline/topbar http://127.0.0.1:4322 "header[data-topbar]" ""
# 捕获完成后停掉 preview
```

- [ ] **Step 6: 校验产物并抽查**

```bash
find /tmp/layout-verify/baseline -name '*.png' | wc -l      # sidebar: 16+6=22，topbar: 22，合计 44
find /tmp/layout-verify/baseline -name '*.json' | wc -l     # 同样 44
```

任选 2 张（如 `sidebar/1440/home.png` 与 `topbar/1440/home.png`）用图像查看工具确认：侧栏=左栏导航，顶栏=顶部居中导航。记录基线 CSS 体积：`find /tmp/layout-baseline/dist -name '*.css' | xargs cat | wc -c > /tmp/layout-verify/baseline-css-bytes.txt`。

- [ ] **Step 7: 本任务无提交**（分支创建与产物均为临时状态；worktree 保留至 Task 5 结束）

---

### Task 1: 统一骨架与 SiteBar（双模式 CSS 迁移）+ layout-check 种子

**Files:**
- Create: `src/components/SiteBar.astro`
- Modify: `src/layouts/Layout.astro`
- Delete: `src/components/Sidebar.astro`、`src/components/Topbar.astro`
- Create: `scripts/tests/layout-check.sh`
- Unchanged: `src/styles/bar.css`（仅验证 TOC 行样式仍生效）

**Interfaces:**
- Produces：`SiteBar.astro` props `{ crumbs?: { label: string; href: string }[] }`，渲染 `site-bar > bar-inner > [bar-brand, nav, bar-actions]`，`<slot name="actions" />` 落在 `bar-actions` 内；`Layout.astro` props 不变（`crumbs?`、`article?`），渲染统一骨架并把 `article` 映射为 `page-shell[data-article]`。
- Produces：`layout-check.sh` 断言契约（Task 3 追加）：默认构建 `<html data-layout="<默认值>">`、骨架标记存在、旧名不存在、翻转默认值再构建仍同骨架。

**实现要点（决策已锁定，按此执行）：**

1. **Layout.astro 骨架**（原构建期三目分支整体删除）：

```html
<html lang={…} dir={SITE.dir} data-layout={SITE.layout}>
  <body>  <!-- 不再有 data-layout -->
    <a class="skip-link" …>…</a>
    <page-shell data-article={article || undefined}>
      <page-nav><SiteBar crumbs={crumbs}><slot name="actions" slot="actions" /></SiteBar></page-nav>
      {Astro.slots.has("toc") && <page-toc><slot name="toc" /></page-toc>}
      <main id="main-content"><slot /></main>
      <page-footer><Footer /></page-footer>
    </page-shell>
  </body>
</html>
```

2. **旧选择器 → 新选择器映射**（样式按此搬移，声明值一字不改，只换选择器与作用域）：

| 旧（现在的位置） | 新 |
| - | - |
| `page-grid`（Layout） | `:root[data-layout="sidebar"] page-shell`（≥64 网格；`position/z-index/isolation` 保留） |
| `page-header`（Layout） | 删除；<64 的吸顶职责移到 `:root[data-layout="sidebar"]` 下的 `page-nav`（sticky、top 0、z-10、负 margin 全出血） |
| `page-nav` / `page-toc`（Layout） | 同名元素 + 双模式作用域 |
| `page-content`（Layout） | `main`（列位 3/10、`margin-block-start: -0.1em`、`min-width: 0`）+ `page-footer`（列位 3/10、`margin-block-start: var(--space-xl)`） |
| `page-content-topbar`（Layout） | `:root[data-layout="topbar"] page-shell`（4 列网格，见 3） |
| `topbar-article`（Layout） | 并入顶栏网格：toc = 第 2 列，main = 第 3 列 |
| `aside`（Sidebar） | `:root[data-layout="sidebar"] site-bar` |
| `sidebar-inner`（Sidebar） | `bar-inner` |
| `sidebar-toggle`（Sidebar） | `bar-actions` |
| `header` / `topbar-inner`（Topbar） | `:root[data-layout="topbar"] site-bar` / `bar-inner` |
| `topbar-brand`（Topbar） | `bar-brand` |
| `topbar-actions`（Topbar） | `bar-actions` |

3. **顶栏网格（≥64rem）**：`page-nav { display: contents }`；`page-shell`：

```css
:root[data-layout="topbar"] page-shell {
  --topbar-measure: 50rem;
  display: grid;
  grid-template-columns:
    minmax(var(--grid-gutter), 1fr) 14rem
    minmax(0, calc(min(var(--topbar-measure), 100% - 2 * var(--grid-gutter)) - 14rem - var(--space-l)))
    minmax(var(--grid-gutter), 1fr);
  column-gap: var(--space-l);
  grid-template-rows: auto auto;
  padding-block-start: var(--space-xl);
}
:root[data-layout="topbar"] page-shell[data-article] { --topbar-measure: 80rem; }
:root[data-layout="topbar"][data-fullwidth] page-shell[data-article] { --topbar-measure: 100%; }
:root[data-layout="topbar"] main { grid-column: 2 / 4; grid-row: 1; min-width: 0; }
:root[data-layout="topbar"] page-shell:has(> page-toc) main { grid-column: 3; }
:root[data-layout="topbar"] page-toc { grid-column: 2; grid-row: 1; align-self: start; /* + 现 topbar-article 内 toc 的 sticky/宽/高/溢出声明 */ }
:root[data-layout="topbar"] page-footer { grid-column: 2 / 4; grid-row: 2; margin-block-start: var(--space-xl); }
```

4. **顶栏 <64rem**：`page-shell` 改 block（保留 `padding-block-start: var(--space-xl)`）；`page-toc / main / page-footer` 各自 `max-width: 50rem; margin-inline: auto; padding-inline: var(--grid-gutter)`；toc 还原为静态（`position: static; width: auto; max-height: none; overflow: visible`）并加 `margin-block-end: var(--space-l)`（对应原 flex column 的 gap）。

5. **侧栏模式**：≥64rem 即原 `page-grid` 规则（12 列网格、`--page-offset-top` padding、导航/目录 fixed、`page-nav` 1/3 列、`page-toc` 10/13 列）+ 行定义 `grid-template-rows: 1fr auto`（main 行 1、footer 行 2，等效原 `page-content` 内 `main{flex:1}` 贴底）；<64rem 单列 `auto auto 1fr auto`，`page-nav` 吸顶全出血、`page-toc` 吸顶 `top: var(--bar-nav-height)` 全出血（`z-index` 略低于条）、`main` 与 `page-footer` `max-inline-size: var(--measure); margin-inline: auto; width: 100%`。

6. **SiteBar 内部**（两套组件样式合并，逐个切到模式作用域）：`site-bar` 在侧栏 = 原 `aside` 列布局（含 `<64` 行布局与 `margin-inline-start: -0.5rem` 等）；在顶栏 = 原 `header`（sticky、模糊底、透明边框、`.is-scrolled` 描边）+ `bar-inner` = 原 `topbar-inner`（flex、50rem 居中）。品牌：侧栏显示文字（<26rem 隐藏）；顶栏恒隐藏文字。导航：侧栏竖排列表 + 面包屑；顶栏横排 + `:root[data-layout="topbar"] nav ul ul { display: none }`。`bar-actions`：侧栏底部组（`margin-block-start: auto` 贴底）、顶栏右上组（gap 2xs）；全宽按钮样式随迁，并加 `:root[data-layout="sidebar"] #fullwidth-toggle { display: none }`。
7. **侧栏移动端条底色**：把 `bar.css` 中 `[data-bar] @media (<64rem)` 的声明（padding、背景混合、模糊、2px 边框 + `--bar-border-image`）复制进 SiteBar 侧栏作用域样式；**site-bar 不加 `data-bar` 属性**。
8. **脚本**：Topbar 的两个 `<script>`（滚动描边 sentinel/observer、全宽按钮恢复与点击）原样迁入 `SiteBar.astro`，选择器从 `[data-topbar]` 改为 `site-bar`。

**Steps:**

- [ ] **Step 1: 写 `scripts/tests/layout-check.sh`（种子，先失败）**

复制 `i18n-check.sh` 的 helper（`pass/fail/assert_has/assert_match/assert_dir_lacks`）。骨架：

```bash
default=$(grep -oE 'layout: "[a-z]+"' src/consts.ts | head -1 | sed -E 's/.*"(.*)"/\1/')
# 备份 consts.ts（trap 恢复）+ 默认构建
npm run build
assert_match dist/index.html "data-layout=\"$default\"" "根元素输出默认布局属性"
assert_has  dist/index.html '<page-shell' "统一骨架 page-shell"
assert_has  dist/index.html '<site-bar'   "统一骨架 site-bar"
for old in page-grid page-header page-content page-content-topbar topbar-article topbar-inner topbar-brand topbar-actions sidebar-inner sidebar-toggle data-topbar; do
  assert_dir_lacks dist "$old" "旧名已清除（$old）"
done
# 注：data-article-topbar 的清除断言在 Task 2（PostChain 改造）追加
other=$([ "$default" = sidebar ] && echo topbar || echo sidebar)
sed -i.bak "s/layout: \"$default\"/layout: \"$other\"/" src/consts.ts && rm -f src/consts.ts.bak
npm run build
assert_match dist/index.html "data-layout=\"$other\"" "翻转默认值后属性跟随"
assert_has  dist/index.html '<page-shell' "翻转默认值后同骨架（仅属性不同）"
# 恢复 consts.ts 并再构建默认，保持 dist 一致
```

- [ ] **Step 2: 运行，期望失败**

Run: `bash scripts/tests/layout-check.sh`
Expected: FAIL「根元素输出默认布局属性」（当前属性在 body 上）。

- [ ] **Step 3: 实现统一骨架与 SiteBar**

新建 `SiteBar.astro`；改 `Layout.astro`；`git rm src/components/Sidebar.astro src/components/Topbar.astro`。按「实现要点」1–8 执行。

- [ ] **Step 4: 运行，期望通过**

Run: `npm run format:check && npm run build && bash scripts/tests/layout-check.sh`
Expected: 全绿（含旧名清除断言）。

- [ ] **Step 5: 与基线对比（4 组合抽查）**

`npm run dev` 起 dev server（4321）。用 PWCLI：

```bash
export PWCLI="$HOME/.agents/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" open http://localhost:4321/ && "$PWCLI" resize 1440 900
"$PWCLI" run-code "await page.screenshot({ path: '/tmp/layout-verify/t1-sidebar-home.png' })"
"$PWCLI" run-code "() => { document.documentElement.dataset.layout = 'topbar' }"
"$PWCLI" run-code "await page.screenshot({ path: '/tmp/layout-verify/t1-topbar-home.png' })"
```

对 `/`、`/blog/introducing-v2/`、`/en/blog/welcome/` 各做「侧栏/顶栏 × 1440/720」四组合截图，与基线同名页逐对目视对比（重点：导航形态、品牌、TOC 位置、内容列宽、页脚位置、吸顶/条底纹）。dev 下 CSS 陈旧时 `touch src/layouts/Layout.astro` 后刷新。

- [ ] **Step 6: 提交**

```bash
git add -A src scripts/tests/layout-check.sh
git commit -m "布局切换：统一骨架与 SiteBar（双模式样式迁移 + layout-check 种子）"
```

---

### Task 2: PostChain 单 DOM（banner 顺序与顶栏作用域）

**Files:**
- Modify: `src/components/PostChain.astro`

**Interfaces:**
- Consumes：`page-shell[data-article]`（Layout 已提供）；`:root[data-layout]` 作用域。
- Produces：`article` 元素携带中性 `data-article`；banner 单实例；侧栏模式视觉顺序 = header → banner → prose（顶栏 = banner → header → prose）。

- [ ] **Step 1: 改造 PostChain**

- 删除 `import { SITE }` 与 `isTopbar`；`data-article-topbar={…}` → `data-article={true}`；
- banner 只渲染一次：DOM 固定 `[post-banner, header, prose-content]`（banner 仍仅在 `view.data.image` 时渲染，`priority` 逻辑不变）；
- `article { display: flex; flex-direction: column; }`；侧栏作用域补 `post-banner { order: 1 } prose-content { order: 2 }`（header/`untranslated-section` 默认 0）；
- 原 `[data-article-topbar]` 样式块选择器改为 `:root[data-layout="topbar"] article[data-article]`；`html[data-fullwidth] [data-article-topbar] prose-content` 改为 `:root[data-layout="topbar"][data-fullwidth] article[data-article] prose-content`；
- `data-embedded`、`untranslated-section`、ai 徽章、post-meta 等样式不动。

- [ ] **Step 2: 追加断言并构建**

在布局脚本的默认构建断言区追加：

```bash
assert_has dist/blog/welcome/index.html 'data-article' "文章元素带中性 data-article"
assert_dir_lacks dist 'data-article-topbar' "旧属性名已清除（data-article-topbar）"
```

Run: `npm run format:check && npm run build && bash scripts/tests/layout-check.sh`
Expected: 全绿。

- [ ] **Step 3: 双模式文章页验证（运行时翻转，非重构建）**

PWCLI 打开 `/blog/introducing-v2/`（1440）：

```bash
"$PWCLI" eval "JSON.stringify([...document.querySelector('article').children].map(e => [e.tagName, getComputedStyle(e).order]))"
```

Expected（侧栏，数组按 DOM 顺序输出）：`[["POST-BANNER","1"],["HEADER","0"],["PROSE-CONTENT","2"]]`（视觉顺序 header → banner → prose）；
再 `run-code "() => { document.documentElement.dataset.layout = 'topbar' }"`，

```bash
"$PWCLI" eval "JSON.stringify([...document.querySelector('article').children].map(e => [e.tagName, getComputedStyle(e).order]))"
```

Expected（顶栏）：`[["POST-BANNER","0"],["HEADER","0"],["PROSE-CONTENT","0"]]` 且视觉 banner 在标题上方、标题居中、正文限宽。
对 `/blog/welcome/`、`/blog/v1-posts/`（系列、含嵌入子文）、`/en/blog/v1-posts/`（未翻译占位）各做「侧栏/顶栏」截图，与基线对应页对比（banner 位置、标题对齐、正文宽度、嵌入分节分隔线）。

- [ ] **Step 4: 提交**

```bash
git add src/components/PostChain.astro && git commit -m "布局切换：PostChain 单 DOM（banner 顺序与模式作用域）"
```

---

### Task 3: 运行时机制（防闪烁脚本 + 切换按钮 + 图标 + 文案）+ layout-check 追加

**Files:**
- Modify: `src/components/MetaHead.astro`、`src/components/SiteBar.astro`、`src/lib/i18n.ts`、`src/consts.ts`
- Create: `src/components/LayoutToggle.astro`、`src/assets/icons/layout-sidebar.svg`、`src/assets/icons/layout-topbar.svg`
- Modify: `scripts/tests/layout-check.sh`

**Interfaces:**
- Produces：`localStorage.layout`（`"sidebar"` / `"topbar"`）契约；`#layout-toggle` 按钮（`data-icon-button`，`aria-label` 本地化）；`UIKey` 新键 `layoutToggle`；`site-bar` 内操作区顺序 `[ThemeToggle, LanguageSwitch, LayoutToggle, (fullwidth), slot]`。

- [ ] **Step 1: layout-check 追加断言（先失败）**

在默认构建断言区追加：

```bash
assert_has dist/index.html      'localStorage.layout'      "防闪烁脚本存在"
assert_has dist/index.html      'id="layout-toggle"'       "切换按钮存在"
assert_has dist/index.html      'aria-label="切换布局"'     "中文按钮文案"
assert_has dist/en/index.html   'aria-label="Toggle layout"' "英文按钮文案"
```

Run: `bash scripts/tests/layout-check.sh`
Expected: FAIL「防闪烁脚本存在」。

- [ ] **Step 2: 实现**

- `MetaHead.astro`：主题脚本后追加：

```html
<script is:inline>
  const layout = localStorage.layout
  if (layout === "sidebar" || layout === "topbar")
    document.documentElement.dataset.layout = layout
</script>
```

- `src/lib/i18n.ts`：`ZH_STRINGS` 加 `layoutToggle: "切换布局"`；`UI_STRINGS.en` 加 `layoutToggle: "Toggle layout"`（两处必须同键）。
- 图标（24 视框、currentColor、1em；区域实心/描边对比表达形态，可微调路径但风格须一致）：
  - `layout-sidebar.svg`：外框圆角矩形，左列实心、右侧描边（示例：左列 `M5 3h3v18H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z` + 右侧 evenodd 环 `M10 3h9a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-9zm2 2h7a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7z`）；
  - `layout-topbar.svg`：顶部横条实心、下方描边（示例：`M6 3h12a3 3 0 0 1 3 3v3H3V6a3 3 0 0 1 3-3z` + 环 `M3 11h18v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zm2 2v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5z`）。
- `LayoutToggle.astro`（形态对齐 ThemeToggle）：

```astro
<button id="layout-toggle" data-icon-button aria-label={t(locale, "layoutToggle")}>
  <sidebar-icon><SidebarIcon /></sidebar-icon>
  <topbar-icon><TopbarIcon /></topbar-icon>
</button>
```

可见性（组件作用域样式即可）：`:root[data-layout="sidebar"] topbar-icon { display: none }`、`:root[data-layout="topbar"] sidebar-icon { display: none }`；点击脚本：

```js
const button = document.getElementById("layout-toggle")
if (button)
  button.onclick = () => {
    const root = document.documentElement
    const next = root.dataset.layout === "topbar" ? "sidebar" : "topbar"
    root.dataset.layout = next
    localStorage.layout = next
  }
```

- `SiteBar.astro`：`bar-actions` 内 `<LanguageSwitch />` 之后挂 `<LayoutToggle />`。
- `src/consts.ts` 注释：`/** Default layout: "sidebar" (two-column with sidebar) or "topbar" (top navigation, centered content). Visitors can switch at runtime; this is the first-visit default. */`

- [ ] **Step 3: 构建与脚本验收**

Run: `npm run format:check && npm run build && bash scripts/tests/layout-check.sh`
Expected: 全绿。

- [ ] **Step 4: 运行时行为清单（dev server 上逐条验证并记录结果）**

1. 清偏好回落：`localStorage.removeItem('layout')` + reload → `eval "document.documentElement.dataset.layout"` = 默认值；
2. 点击切换：`#layout-toggle` 点击后 attr = `topbar` 且 `localStorage.layout === 'topbar'`；
3. 刷新保持 + 目视首帧无闪动（防闪烁）；跨页保持（导航到 `/blog/` 再查 attr）；
4. 滚动保持（Review Focus 2）：长文页 `scrollTo(0, 1200)` 后点击按钮，`eval "scrollY"` 仍 ≈1200；
5. 非法值回落（Review Focus 3）：`localStorage.layout='bogus'` + reload → attr = 默认；
6. 全宽互操作（Review Focus 4）：顶栏文章页开全宽 → 切侧栏（`#fullwidth-toggle` 计算样式 `display:none` 且正文不受 `html[data-fullwidth]` 影响）→ 切回顶栏仍全宽 → reload 仍全宽；
7. /en 与 404（Review Focus 5）：`/en/blog/welcome/` 按钮 `aria-label` 为 "Toggle layout" 且可切换；`/definitely-not-a-page/` 可切换。

- [ ] **Step 5: 提交**

```bash
git add src/components/MetaHead.astro src/components/LayoutToggle.astro src/assets/icons/layout-sidebar.svg src/assets/icons/layout-topbar.svg src/lib/i18n.ts src/consts.ts src/components/SiteBar.astro scripts/tests/layout-check.sh
git commit -m "布局切换：切换按钮与防闪烁脚本（含图标与双语文案）"
```

---

### Task 4: 文档更新

**Files:**
- Modify: `README.md`、`README.en.md`、`CONTEXT.md`、`AGENTS.md`

- [ ] **Step 1: README.md 布局段**

把「**布局**：`layout: "topbar"` 把导航移到顶部居中的导航栏，各页面使用居中阅读列；默认 `"sidebar"` 为两栏 + 侧边栏。」改为：
「**布局**：`layout` 是默认布局——`"sidebar"`（两栏 + 侧边栏）或 `"topbar"`（顶栏居中阅读列）；站点在主题/语言按钮旁提供**布局切换按钮**，访客可随时切换，偏好存于浏览器，首次访问使用该默认值。」

- [ ] **Step 2: README.en.md 对应段**

「- **Layout**: `layout` sets the default site layout — `"sidebar"` (two-column with sidebar) or `"topbar"` (centered reading column with a top bar). Visitors can switch layouts anytime via the toggle next to the theme/language buttons; the choice is stored in the browser, and this config is the first-visit default.」

- [ ] **Step 3: CONTEXT.md 术语**

在 `## Layout` 小节追加：
「- **Layout Preference（布局偏好）** — 访客通过切换按钮选择的布局（`sidebar` / `topbar`），存于浏览器 `localStorage.layout`；优先于 `SITE.layout`（后者仅为默认值）。」

- [ ] **Step 4: AGENTS.md**

在「组件与样式模式」小节追加一条：
「- **布局（Layout）**：`<html data-layout>` 是布局的唯一信号（`sidebar`/`topbar`）；两种布局共用一份统一骨架（`page-shell > [page-nav, page-toc, main, page-footer]`），由 `:root[data-layout=…]` 作用域 CSS 呈现；访客经切换按钮运行时切换（`localStorage.layout`，见 `docs/superpowers/specs/2026-10-07-layout-switch-design.md`）。」

- [ ] **Step 5: 校验与提交**

Run: `npm run format:check && npm run build`
Expected: 通过。

```bash
git add README.md README.en.md CONTEXT.md AGENTS.md && git commit -m "布局切换：文档更新"
```

---

### Task 5: 严格保真验收与收口

**Files:** 无仓库文件改动（发现问题则修复并补提交）

- [ ] **Step 1: 捕获新实现 4 组合产物**

```bash
cd <仓库根> && npm run build
npm run preview -- --port 4323 &   # 轮询就绪
bash /tmp/layout-verify/capture.sh /tmp/layout-verify/new/sidebar  http://127.0.0.1:4323 "site-bar" sidebar
bash /tmp/layout-verify/capture.sh /tmp/layout-verify/new/topbar   http://127.0.0.1:4323 "site-bar" topbar
# 停 preview
```

- [ ] **Step 2: 截图逐对对比**

按目录对拼穷举：`baseline/<mode>/<vp>/<slug>.png` ↔ `new/<mode>/<vp>/<slug>.png`。核心 6 页（home、blog、intro、moments、tags、en-welcome）两视口必查；扩展页（v1、sub、welcome、tag-site、projects、authors、author-enscribe、en-home、en-blog、notfound）1440 抽查。
验收标准：**唯一允许的差异 = 新增切换按钮**；其他任何差异（间距、对齐、宽度、吸顶、边框、模糊）即缺陷 → 修复后回到 Step 1。

- [ ] **Step 3: 吸顶滚动专查**

对 `/blog/introducing-v2/` 与 `/`，两模式 ×1440：先 `run-code "await page.evaluate(() => scrollTo(0, 800))"` 再截图（新增 `-scrolled.png` 变体），与基线同法对比：侧栏移动端条 + TOC 行衔接、顶栏描边出现时机、TOC 粘性与页尾解除。

- [ ] **Step 4: 几何探针数值对比**

对 4 组合的 6 个核心页，读取 `new` 与 `baseline` 同名 JSON，逐字段（`main/toc/footer` 的 `x/y/w`）对比：四舍五入 ±2px 内视为一致；`bar` 字段仅目视（按钮引入必然变化）。任一超差定位到具体选择器修复。

- [ ] **Step 5: 全量回归套件**

```bash
npm run format:check
npm run build
bash scripts/tests/i18n-check.sh     # 既有 i18n 回归必须全绿
bash scripts/tests/layout-check.sh   # 新增布局回归全绿
```

CSS 体积观察项：`find dist -name '*.css' | xargs cat | wc -c` 与 `/tmp/layout-verify/baseline-css-bytes.txt` 对比，报告差值（不作门槛）。

- [ ] **Step 6: Safari 人工抽查（交用户执行）**

给用户的清单（Safari 打开 preview 地址）：① 侧栏桌面 TOC 固定不滚；② 顶栏移动条吸顶 + 模糊底、滚动描边出现/消失；③ 侧栏移动端「条 + TOC 折叠行」吸顶衔接无缝；④ 顶栏文章页全宽开关；⑤ 两模式切换即时、刷新保持；⑥ 临时禁用 JavaScript 打开首页 → 默认布局完整呈现（按钮无响应属预期）。

- [ ] **Step 7: 收口**

```bash
git worktree remove --force /tmp/layout-baseline   # 基线产物保留在 /tmp/layout-verify
git --no-pager log --oneline main..layout-switch
git status --short   # 应为空
```

交付说明：分支 `layout-switch` 就绪，等待用户确认后 ff-only 合并（不自行合并）。
