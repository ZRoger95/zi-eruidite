# 首页 topbar 模式 Zed 参考线网格重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在中文首页 `src/pages/index.astro` 引入 zed.dev 风格的「蓝图参考线」网格（通高垂直列线 + 全出血水平分隔线 + 交叉菱形节点）并把 hero 换皮为居中斜体 accent 蓝，仅在 `topbar` 布局下生效。

**Architecture:** 全部改动集中在 `index.astro` 一个文件的模板与 scoped `<style>` 内，用 `:root[data-layout="topbar"]` 前缀门控每一条新规则，`sidebar` 与移动端保持像素级不变。垂直线用一个常驻 DOM 的固定框架元素 `<home-rails>`（`position: fixed`）承载 `::before/::after` 两条 1px 竖线；水平线用 in-flow 全出血元素 `<home-rule>`（经典 `width:100vw; margin-left:calc(50% - 50vw)` breakout）承载边界线与菱形节点。竖线固定、横线随内容滚动 → 菱形表现为「沿导轨滑动的节点」。

**Tech Stack:** Astro（scoped `<style>`）、原生 CSS（自定义属性 + `clamp()` Utopia token）、无 UI/CSS 框架、Biome 格式化、bash 回归脚本（沿用 `scripts/tests/*.sh` 的 build-then-grep 约定）。

**Spec:** `docs/superpowers/specs/2026-10-09-homepage-topbar-guide-lines-design.md`

## Global Constraints

- 只改 `src/pages/index.astro`。**不改** `src/styles/home.css`、`src/layouts/Layout.astro`、`src/components/SiteBar.astro`、`src/consts.ts`，不改全局 token，不加 `homeDesign` 构建期开关，不拆 `HomeClassic`/`HomeZed` 组件。
- 每条新增 CSS 选择器一律以 `:root[data-layout="topbar"]` 前缀门控；`sidebar` 模式默认零呈现。窄屏（`width < 64rem`）网格收起：不显示竖线、取消全出血。
- 所有线条/菱形只用现有 token：`--border`、`--background`、`--accent`、`--muted-foreground`；不新增颜色变量，明暗主题自动适配。
- 内容骨架顺序不变：hero（问候 + 简介）→ 最新文章 → 最新动态（若 `SITE.momentsOnHome` 开启）。默认 `SITE.momentsOnHome` 为 `undefined`、`SITE.avatar` 为 `undefined`、`SITE.layout` 为 `"sidebar"`。
- 英文首页 `/en/index.astro` 不纳入本次范围。
- 提交前 `npm run format:check` 与 `npm run build` 必须通过；`bash scripts/tests/i18n-check.sh` 全绿。
- 分支策略：新建独立分支实施，不复用未合并分支 `feat/home-zed-design`（`feat/home-zed-redesign`）。

### 共享常量：参考线 x 公式（贯穿全计划，逐字复用）

内容列（`--topbar-measure = 50rem`）左右缘相对视口的 x 位置，以及右侧滚动条补偿，全部来自 spec §3.1：

```
左缘：  calc((100vw - var(--topbar-measure)) / 2)
右缘：  calc((100vw - var(--topbar-measure)) / 2 - var(--scrollbar-width, 0px))
```

`--topbar-measure` 定义在 `page-shell`（topbar 作用域）上，`home-rails`/`home-rule` 都是其后代可继承；`--scrollbar-width` 由 `Layout.astro` 首帧脚本写入 `:root`（非容器态回退 `0px`）。竖线与菱形必须使用**同一** x 公式，交叉处才能对齐。

---

## Review Focus

（spec 隐含、但每个 task 的自动 grep 断言无法覆盖、最可能咬人的五类输入/条件；每条会在对应 task 追加一条断言或写进该 task 的人工视觉核对清单。）

1. **横向滚动条泄漏**：全出血 `width:100vw`（含滚动条宽）在短内容或 overlay-scrollbar 环境引发 page-scroll 横向滚动条。期望：topbar 桌面与移动均无横向滚动条。→ Task 2 视觉清单 + `home-rule` 仅桌面显示。
2. **竖线与真实内容列错位**：topbar 桌面 `page-scroll` 网格含固定 `14rem`（toc 预留列）+ `scrollbar-gutter: stable`，`(100vw - measure)/2` 公式与 main 实际左缘可能不重合，尤其在经典（非 overlay）滚动条系统上。期望：竖线压在内容列左右缘。→ Task 1 视觉清单（含 Windows 类滚动条留意）。
3. **暗色主题对比**：`--border` 细线与空心菱形在 dark 下过淡或看不见。期望：明暗两态线条/菱形均清晰可见。→ Task 1/2 视觉清单覆盖 `{light, dark}`。
4. **sidebar 像素级回归**：`home-rails`/`home-rule` 常驻 DOM，若在默认 `sidebar` 下意外产生可见盒子或占位间距即破坏零回归。期望：`dist/index.html`（默认 sidebar）视觉上与改动前完全一致。→ Task 4 grep + 视觉对照。
5. **无 moments 边界悬空线**：默认 `momentsOnHome` 关闭时，「最新动态下/页脚前」那条 `home-rule` 不应渲染成悬空分隔线。期望：区块数量与 `momentsOnHome` 一致，不多画线。→ Task 2 条件渲染 + grep 计数。

---

## Task 1: 固定垂直参考线框架 `<home-rails>`

**Files:**
- Modify: `src/pages/index.astro`（模板新增 `<home-rails>` 元素；`<style>` 新增 topbar 门控规则）
- Create: `scripts/tests/home-guide-topbar-check.sh`（本计划复用的 build-then-grep 回归脚本，spec §6 可选项）
- Test: `scripts/tests/home-guide-topbar-check.sh`（断言 `<home-rails` 出现在产物中）

**Interfaces:**
- Consumes: 共享 x 公式（见 Global Constraints）；`--topbar-measure`、`--scrollbar-width`、`--border` token。
- Produces: DOM 中常驻元素 `<home-rails aria-hidden="true">`（首页第一个子节点）；其 CSS 变量约定供 Task 2 菱形复用同一 x 公式。

- [ ] **Step 1: 新建回归脚本骨架并加入会失败的断言**

创建 `scripts/tests/home-guide-topbar-check.sh`，沿用 `i18n-check.sh` 的 `set -euo pipefail` + `assert_has` 风格：先备份 `.env`、临时写受控 `SITE_URL`（trap 退出恢复，使脚本自包含、不依赖本地已配置域名），build 一次，再对产物做标记断言。**注意**：Astro scoped `<style>` 会给模板元素注入 `data-astro-cid-*` 属性，故断言只匹配「开标签前缀」（如 `<home-rails`）或「文本节点」（如 `你好，我是`），绝不匹配闭合形态 `<hero-card>`/`<h1>`：

```bash
#!/usr/bin/env bash
# 首页 topbar 参考线网格回归：临时写受控 .env 后构建，再对 dist/index.html 断言标记元素与内容骨架。
# 自动断言只覆盖「标记前缀 + 文本存在」；像素级对齐/明暗/滚动条由人工视觉核对（见计划 Review Focus）。
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
assert_has() { # $1=文件 $2=片段 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言包含}（缺少 ${1}）"
  grep -qF -- "${2}" "${1}" || fail "${3:-断言包含}（${1} 未找到 ${2}）"
  pass "${3:-${1} 包含 ${2}}"
}

# 受控 .env：备份 → 仅写 SITE_URL → 退出时恢复原文件
ENV_KEEP=/tmp/home-guide-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi
cleanup_restore() {
  if [ -f "$ENV_KEEP" ]; then mv -f "$ENV_KEEP" .env; else rm -f .env; fi
}
trap cleanup_restore EXIT

printf 'SITE_URL=https://example.com\n' > .env
npm run build

# ---------- Task 1：垂直参考线框架 ----------
assert_has dist/index.html '<home-rails' "首页渲染 home-rails 元素"
```

- [ ] **Step 2: 运行脚本确认失败**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: build 通过，但 `assert_has` 失败并 `exit 1`（`dist/index.html 未找到 <home-rails`）。

- [ ] **Step 3: 在模板加入 `<home-rails>` 元素**

`src/pages/index.astro` 中，在 `<Layout>` 内、`<hero-card>` 之前插入首页第一个装饰节点：

```astro
  <home-rails aria-hidden="true"></home-rails>
```

- [ ] **Step 4: 写 topbar 门控的固定框架 CSS**

在 `<style>` 块内追加（默认不产生盒子，仅 topbar 桌面显示；层级用 `z-index: -1`，落在 `page-shell` 透明背景之下、正文文字之上，`body::before` 背景透过透明 `page-shell` 可见；顶栏 `z-index:10` 半透明模糊背景盖于其上，产生「穿过顶栏背后若隐若现」观感）：

```css
  home-rails {
    display: none;
  }

  @media (width >= 64rem) {
    :root[data-layout="topbar"] home-rails {
      display: block;
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
    }

    :root[data-layout="topbar"] home-rails::before,
    :root[data-layout="topbar"] home-rails::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--border);
    }

    :root[data-layout="topbar"] home-rails::before {
      left: calc((100vw - var(--topbar-measure)) / 2);
    }

    :root[data-layout="topbar"] home-rails::after {
      right: calc((100vw - var(--topbar-measure)) / 2 - var(--scrollbar-width, 0px));
    }
  }
```

- [ ] **Step 5: 运行脚本确认通过**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: `PASS 首页渲染 home-rails 元素`，脚本退出码 0。

- [ ] **Step 6: 视觉核对（Review Focus #2、#3）**

Run: `npm run dev`，浏览器打开首页，运行时切到 `topbar`（`localStorage.layout` 切换按钮），在 ≥64rem 桌面 × `{light, dark}` 核对：两条 1px 竖线贯穿视口顶底、压在内容列左右缘、穿过顶栏背后若隐若现；切回 `sidebar` 竖线消失、页面无变化。

- [ ] **Step 7: 提交**

```bash
git checkout -b feat/home-topbar-guide-lines
git add src/pages/index.astro scripts/tests/home-guide-topbar-check.sh
git commit -m "Add fixed vertical guide rails to topbar homepage"
```

---

## Task 2: 全出血水平分隔线 + 菱形节点 `<home-rule>`

**Files:**
- Modify: `src/pages/index.astro`（区块边界插入 `<home-rule>`；`<style>` 追加出血线与菱形规则）
- Test: `scripts/tests/home-guide-topbar-check.sh`（追加 `<home-rule` 断言与内容骨架断言）

**Interfaces:**
- Consumes: Task 1 的共享 x 公式（菱形 `::before/::after` 复用同一 left/right 表达式）；`--border`、`--background` token。
- Produces: DOM 中 `<home-rule>` 边界线元素（每个可见区块之后一个），菱形节点为其绝对定位子伪元素。

- [ ] **Step 1: 追加会失败的断言**

`scripts/tests/home-guide-topbar-check.sh` 末尾追加：

```bash
# ---------- Task 2：全出血水平线与菱形节点 ----------
assert_has dist/index.html '<home-rule' "首页渲染 home-rule 边界线"
assert_has dist/index.html '你好，我是' "hero 文案仍在（内容骨架不变）"
assert_has dist/index.html '最新文章' "最新文章区块仍在"
```

- [ ] **Step 2: 运行脚本确认失败**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: build 通过，`<home-rule` 断言失败（`exit 1`）。

- [ ] **Step 3: 在区块边界插入 `<home-rule>`**

`src/pages/index.astro` 模板：在 `<hero-card>` 之后、每个 `<latest-section>` 之后各插入一个 `<home-rule aria-hidden="true"></home-rule>`。最新动态区块的 `<home-rule>` 放在其条件渲染块内部（`{moments.length > 0 && (...)}` 之内），确保默认无 moments 时不画悬空线（Review Focus #5）。示例（hero 与最新文章边界）：

```astro
  </hero-card>
  <home-rule aria-hidden="true"></home-rule>

  <latest-section>
    ...
  </latest-section>
  <home-rule aria-hidden="true"></home-rule>
```

- [ ] **Step 4: 写全出血线与菱形 CSS**

在 `<style>` 内追加。默认 `home-rule` 不产生盒子；仅 topbar 桌面画线，窄屏取消出血（Review Focus #1）。菱形尺寸 6px、`--background` 填充 + `--border` 描边、旋转 45°，x 落在 Task 1 同一条竖线公式处，`top:0` 压在水平线上，随横线滚动、沿固定竖线滑动：

```css
  home-rule {
    display: none;
  }

  @media (width >= 64rem) {
    :root[data-layout="topbar"] home-rule {
      display: block;
      position: relative;
      width: 100vw;
      margin-left: calc(50% - 50vw);
      margin-block: var(--space-xl);
      border-block-end: 1px solid var(--border);
    }

    :root[data-layout="topbar"] home-rule::before,
    :root[data-layout="topbar"] home-rule::after {
      content: "";
      position: absolute;
      top: 0;
      width: 6px;
      height: 6px;
      background: var(--background);
      border: 1px solid var(--border);
      transform: translate(-50%, -50%) rotate(45deg);
    }

    :root[data-layout="topbar"] home-rule::before {
      left: calc((100vw - var(--topbar-measure)) / 2);
    }

    :root[data-layout="topbar"] home-rule::after {
      left: calc((100vw - var(--topbar-measure)) / 2 - var(--scrollbar-width, 0px));
    }
  }
```

> 菱形右节点用 `left: calc(... - var(--scrollbar-width, 0px))` 而非 `right:`，与 `home-rails::after` 的视觉位置一致（都落在右缘竖线处）；`::after` 的 `translate(-50%,-50%)` 会把锚点回中到该 x。

- [ ] **Step 5: 运行脚本确认通过**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: 三条断言全部 `PASS`。

- [ ] **Step 6: 视觉核对（Review Focus #1、#2、#3、#5）**

`npm run dev` 首页切 topbar：桌面确认水平线横贯整幅宽度、菱形空心方块正好压在竖线×横线交叉处、随滚动沿线滑动；明暗两态清晰可见；`momentsOnHome` 关闭（默认）时页脚前无多余线；移动端（<64rem）网格与出血全部收起、无横向滚动条。

- [ ] **Step 7: 提交**

```bash
git add src/pages/index.astro scripts/tests/home-guide-topbar-check.sh
git commit -m "Add full-bleed rules and diamond nodes at section boundaries"
```

---

## Task 3: hero 换皮（居中斜体 accent 蓝）

**Files:**
- Modify: `src/pages/index.astro`（`<style>` 追加 topbar 门控的 hero 覆盖，不改 `home.css` 的 `hero-card` 盒子规则）

**Interfaces:**
- Consumes: `--accent`、`--muted-foreground`、`--measure`、`--step-3` token；现有 `hero-card`/`hero-avatar`/`h1`/`p` 结构。
- Produces: 无（纯呈现层覆盖）。

- [ ] **Step 1: 追加 hero 结构断言**

`scripts/tests/home-guide-topbar-check.sh` 末尾追加。hero 标记本就存在且换皮是纯呈现层 CSS（scoped 规则进独立样式文件，产物 `index.html` 看不到），故断言用**文本节点**确认标题与站名内联渲染（勿匹配 `<h1>`/`<hero-card>` 闭合形态，会被 `data-astro-cid-*` 破坏），居中/斜体/去盒由视觉核对：

```bash
# ---------- Task 3：hero 文本内联渲染（换皮为呈现层，视觉核对覆盖） ----------
assert_has dist/index.html '你好，我是 astro-erudite' "hero 标题问候 + 站名内联渲染"
```

- [ ] **Step 2: 运行脚本确认通过（结构未变，应已绿）**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: 全部 `PASS`（hero 标记本就存在）。此步确立基线，随后仅加呈现 CSS。

- [ ] **Step 3: 写 hero 换皮 CSS**

在 `<style>` 内追加，仅在 `:root[data-layout="topbar"]` 下覆盖 `home.css` 的盒子：去背景/边框/圆角/内边距，标题居中 + 斜体 + `--accent` + 负字距（`--step-3` 已由 `home.css` 设置），副文案居中并 `--measure` 收窄。`sidebar` 不受影响：

```css
  :root[data-layout="topbar"] hero-card {
    background: none;
    border: 0;
    border-radius: 0;
    padding: 0;
    text-align: center;
  }

  :root[data-layout="topbar"] hero-card h1 {
    font-style: italic;
    color: var(--accent);
    letter-spacing: -0.02em;
  }

  :root[data-layout="topbar"] hero-card p {
    margin-inline: auto;
  }
```

- [ ] **Step 4: 运行脚本 + 构建确认通过**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: 全部 `PASS`，退出码 0。

- [ ] **Step 5: 视觉核对**

`npm run dev` topbar：hero 标题居中、大号斜体 accent 蓝、无圆角盒子，副文案居中灰色收窄；切 sidebar 恢复原盒子。若 `SITE.avatar` 有值则确认头像仍居中于标题上方（默认 undefined，可跳过）。

- [ ] **Step 6: 提交**

```bash
git add src/pages/index.astro scripts/tests/home-guide-topbar-check.sh
git commit -m "Reskin homepage hero for topbar layout"
```

---

## Task 4: 隔离验证与全量回归

**Files:**
- Modify: `scripts/tests/home-guide-topbar-check.sh`（补 sidebar 零回归的内容骨架断言，固化矩阵）
- 无新增源码改动（本 task 只做验证与收尾；若发现问题回到对应 task 修）

**Interfaces:**
- Consumes: Task 1–3 全部产出。
- Produces: 可提交的最终验证脚本 + 通过的全量回归。

- [ ] **Step 1: 补 sidebar 零回归内容骨架断言**

`scripts/tests/home-guide-topbar-check.sh` 末尾追加（默认 `SITE.layout = "sidebar"`，产物为 sidebar 渲染；标记元素常驻 DOM 但不产生可见盒子，可见性由视觉对照保证）：

```bash
# ---------- Task 4：sidebar 默认下内容骨架完整、i18n 未回归 ----------
assert_has dist/index.html 'href="/en/"' "首页语言切换器仍在（未误伤 i18n）"
assert_has dist/index.html 'data-layout="sidebar"' "默认产物为 sidebar 布局（零回归基线）"
```

- [ ] **Step 2: 运行本特性回归脚本**

Run: `bash scripts/tests/home-guide-topbar-check.sh`
Expected: 全部 `PASS`，退出码 0。

- [ ] **Step 3: 运行 i18n 回归**

Run: `bash scripts/tests/i18n-check.sh`
Expected: 全绿（确认路由/SEO/首页内容未回归）。

- [ ] **Step 4: 格式化检查**

Run: `npm run format:check`
Expected: 通过，无待格式化文件（Biome 不管 CSS，`index.astro` 的 `<style>` 与脚本需符合格式）。

- [ ] **Step 5: 生产构建**

Run: `npm run build`
Expected: 成功，无内容 schema 报错。

- [ ] **Step 6: 人工视觉矩阵（spec §6 必须项）**

`npm run dev` 首页，逐格核对并把结论记在 PR 描述：

- topbar × light × ≥64rem：竖线对齐内容列、水平线全出血、菱形在交叉处、hero 居中斜体蓝。
- topbar × dark × ≥64rem：同上，线条/菱形在暗色清晰。
- topbar × ≥64rem × 有滚动条系统（如适用）：无横向滚动条，竖线右缘补偿生效。
- topbar × <64rem（light/dark）：网格收起、无出血线、无横向滚动条。
- sidebar × {light, dark} × {≥64rem, <64rem}：与改动前完全一致。

- [ ] **Step 7: 提交**

```bash
git add scripts/tests/home-guide-topbar-check.sh
git commit -m "Add homepage topbar guide-lines regression checks"
```

---

## Execution Handoff

计划已保存至 `docs/superpowers/plans/2026-10-09-homepage-topbar-guide-lines.md`。
