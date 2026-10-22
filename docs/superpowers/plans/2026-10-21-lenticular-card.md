# 数字光栅卡 `<lenticular-card>` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/board` 板面网格下方新增一张会「倾斜换画面」的数字光栅卡：指针/拖拽把卡倾到位，图 1 就沿倾斜方向被软边界扫掠揭示为图 2，倾斜与切换由同一个量驱动。

**Architecture:** 遵循站点「SSR 静态内容 + 客户端激活」范式。零依赖自主定制元素 `lenticular-card`：物理与进度是 `src/lib/lenticular-spring.ts` 里的纯函数（可离线断言），`src/lib/lenticular.ts` 只做 DOM/指针/rAF 接线，**每帧只往宿主写 4 个 CSS 变量**，长相全部是这些变量的纯函数，住在 `src/styles/lenticular.css`。卡不进 `board-grid`，因此不碰收藏板的拖拽/菜单/几何写回任何语义。

**Tech Stack:** Astro 7（Sätteri、无 UI/CSS 框架）、TypeScript、原生 CSS（Utopia 间距 + Radix 色板 + `light-dark()`）、Pointer Events + Web Animations 无关（手写半隐式欧拉弹簧）、Bash 回归脚本、终端 playwright-cli 做真实浏览器测量。

**Spec:** [docs/superpowers/specs/2026-10-21-lenticular-card-design.md](../specs/2026-10-21-lenticular-card-design.md)（四份参考的取舍、否决 vanilla-tilt/motion/Three 的理由、全部锁定数值都在那里；本计划论证自该文件）

## Global Constraints

每个任务的隐含要求，逐条来自 spec，数值照抄：

- 零新增运行时依赖：不装 `vanilla-tilt`、`motion`、`three`。
- 不改 `src/data/board.ts` 的 `BoardItem.kind`、`src/lib/content.ts` 的 `getBoardViews`、`src/lib/board-source-patch.ts`、`board-piece` 几何体系——**只读**现成 view。
- 每帧只写 `--rx`/`--ry`/`--t`（+ 离散 `--ma`，仅变化时写）；不得每帧读 `getBoundingClientRect()`；不得写任何触发布局的属性。
- 锁定数值：`maxTilt 14`（度）、`perspective 900px`、`stiffness 170 / damping 16 / mass 1`、`SUBSTEP 1/60`、`MAX_SUBSTEPS 4`、`T_START 0.15`、`T_FULL 0.85`、`--feather 9%`、两层 `scale(1.04)`、视差 `0.35px/°`、sheen 位移 `3%/°`、sheen opacity `0.35→0.5`、投影偏移 `-0.8px/0.8px+12px`、卡宽 `min(32rem, 100%)`、`aspect-ratio: 1.75`。
- 三个量存**无单位数字**，CSS 侧自己补单位（`calc(var(--rx) * 1deg)`）。
- 不做：真光栅条纹/脊线、≥3 图序列、陀螺仪、hover 放大、`aria-live` 区域、`filter: drop-shadow()`。
- 新增界面文字必须 `ZH_STRINGS` 与 `en` 两份同时补（`UIKey = keyof typeof ZH_STRINGS`，漏一份 TS 报错）。
- 测试脚本一律用 backup/restore `.env` + 受控 `SITE_URL=https://example.com` 的模式（照抄 `anatomy-check.sh:36-52`）。
- 命令按用户当前偏好走 **npm**（`npm run build` / `npm run format:check`），尽管仓库作者偏好 bun。
- 包内既有事实：组件 `<script>` 编译为 `dist/_astro/<Component>.astro_astro_type_script_index_0_lang.<hash>.js`；scoped/全局 CSS 汇入 `dist/_astro/*.css`；对 CSS 内容做断言用 `assert_dir_has dist/_astro '<片段>'`（照 `anatomy-check.sh:83`）。**CSS 会被压缩**，故带空格的公式一律用 `assert_match` 正则而非 `-F` 字面量。

## Review Focus

spec 隐含、但没有任何任务的测试天然覆盖的失效面。每条在后面标注它被钉进哪个任务。

1. **接近平放时扫掠方向抖动**：`amp → 0` 时 `|rx|` 与 `|ry|` 谁大都近乎随机，若照常取主轴符号，边界与高光会每帧翻面（同时让「`--ma` 仅变化时写」这条承诺不成立）。期望行为：`amp < 1%·maxTilt` 时**沿用上一次方向**。→ Task 3 `sweepAngleOf` 的 hold 断言。
2. **卡依赖那两枚邮票的 view**：`cloudsea-stamp` / `galaxy-stamp` 若被改名、标 `draft: true` 或删除，`Board.astro` 取不到。期望行为：**构建期 `throw`**，绝不允许 `?? ""` 静默降级成空标题、空 alt。→ Task 1 的 Step 3 与「故意改名验证失败」的回归步骤。
3. **`@property` 与 JS 都不可用**：老浏览器（Firefox <128、Safari <16.4）不认 `@property`，无 JS 时更是什么脚本都不跑。期望行为：画面落到「图 1 平放」的正确静态态，默认值**不依赖** `initial-value`。→ Task 2 断言「`@property` 注册」与「宿主普通声明 `--rx:0`」**共存**。
4. **View Transitions 重跑 body 脚本**：`customElements.define` 二次调用会抛，未清理的 rAF 会活过它的页面。期望行为：`customElements.get` 守卫 + `disconnectedCallback` 里 `cancelAnimationFrame` 与监听器摘除；空闲后循环自行停摆。→ Task 4 的产物断言 + `destroy()` 后的 rAF 归零实测。
5. **`mask-image` 每帧重绘不进合成层**：约 512×292px 卡面逐帧重绘，成本只能在真浏览器里量出来，spec 留了 `data-blend="fade"` 逃生门但没有任何单测能证明它必要或不必要。期望行为：量出帧时数值并据此决定默认 `blend`。→ Task 6（唯一能覆盖它的手段，写在脚本外是刻意的）。

---

## 文件结构

| 文件 | 动作 | 负责什么 |
| --- | --- | --- |
| `src/lib/lenticular-spring.ts` | 新建 | 纯数学：输入映射、固定子步弹簧、进度曲线、扫掠方向、键盘目标。**零 import、零 DOM**——为的是能被 `node --experimental-strip-types` 直接加载断言（同 `board-source-patch.ts` 的约束） |
| `src/lib/lenticular.ts` | 新建 | DOM 接线：rect 缓存、Pointer/Keyboard 事件、rAF 循环、写 4 个变量与 ARIA、`data-ready`、`destroy()` |
| `src/components/LenticularCard.astro` | 新建 | SSR 静态卡（无 JS 时两张图并列）+ 宿主标记与旋钮 `data-*` + 注册自定义元素 |
| `src/styles/lenticular.css` | 新建 | 渲染契约的全部消费：`@property`、兜底声明、`[data-ready]` 叠合、3D 变换、mask 扫掠、视差、sheen、投影、fade 逃生门、`@media (hover)` 文案、`prefers-reduced-motion`、`:focus-visible`、双主题令牌 |
| `src/components/Board.astro` | 修改 | 在 `</board-grid>` 与 `<board-menu>` 之间插一处 `<LenticularCard>`；从 `views` 取两条现成 view 传入 |
| `src/lib/i18n.ts` | 修改 | `UI_STRINGS` 三条新词条（zh + en） |
| `src/layouts/Layout.astro` | 修改 | 在 `scramble-text.css` 之后引入 `@/styles/lenticular.css` |
| `scripts/tests/lenticular-check.sh` | 新建 | 构建期产物断言（HTML/CSS/JS） |
| `scripts/tests/lenticular-motion-check.sh` | 新建 | 纯物理与进度的离线断言（`node --experimental-strip-types`）；**不起浏览器**（spec §11：本仓自动化不驱动浏览器，且本机 playwright-core 与缓存浏览器版本不匹配） |
| `docs/components/lenticular-card.md` | 新建 | 用法文档（AGENTS.md 明文要求） |
| `docs/components/README.md` | 修改 | 索引追加一条 |

---

### Task 1: 词条与静态卡（无 JS 时两张图并列）

**Files:**
- Create: `src/components/LenticularCard.astro`
- Create: `src/styles/lenticular.css`
- Create: `scripts/tests/lenticular-check.sh`
- Modify: `src/lib/i18n.ts`（`ZH_STRINGS` 与 en 对象，紧邻 `boardHint` 之后）
- Modify: `src/layouts/Layout.astro:21`（`scramble-text.css` 那行之后）
- Modify: `src/components/Board.astro`（`</board-grid>` 之后、`<board-menu>` 之前，即现 `131-137` 行之间）

**Interfaces:**
- Consumes: `getBoardViews(locale)` 返回的 `BoardView`（`image: ImageMetadata | string`、`title: string`、`alt: string`）；`Image` from `astro:assets`；`t, Locale` from `@/lib/i18n`；既有板面令牌 `--stamp-unit`、`--paper`。
- Produces:
  ```ts
  // src/components/LenticularCard.astro
  type Props = {
    locale: Locale
    srcA: ImageMetadata
    srcB: ImageMetadata
    titleA: string
    titleB: string
    altA: string
    altB: string
    maxTilt?: number // 默认 14
    stiffness?: number // 默认 170
    damping?: number // 默认 16
    blend?: "sweep" | "fade" // 默认 "sweep"
    class?: string
  }
  ```
  宿主标记（后续任务全靠这些选择器，名字锁定不改）：`<lenticular-card>`（`role="slider" tabindex="0" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-valuetext aria-label` + `data-max-tilt data-stiffness data-damping data-blend data-title-a data-title-b`）、`lens-stage`、`lens-face[data-a="1"]`、`lens-face[data-b="1"]`、`lens-sheen`、`lens-caption`（含两条提示 `<span class="lens-hint" data-hint="pointer|touch">`）。
  UI keys：`boardLensTitle`、`boardLensHintPointer`、`boardLensHintTouch`。

- [ ] **Step 1: 写失败测试 `scripts/tests/lenticular-check.sh`**

照抄 `anatomy-check.sh` 的骨架（`set -euo pipefail`、`root="$(git rev-parse --show-toplevel)"`、`pass/fail/assert_file/assert_has/assert_lacks/assert_dir_has`、`.env` 备份恢复 + `trap restore_env EXIT` + `printf 'SITE_URL=https://example.com\n' >.env`、`npm run build`）。现有 helper 里 **`assert_match` 是文件级的**（`[ -f "$1" ]` 对目录直接 fail）、**没有目录级正则版**，所以本脚本新增两个助手：`assert_count_ge`（见下）与 `assert_dir_match`：

```bash
assert_dir_match() { # $1=目录 $2=正则 $3=说明
  grep -qrE -- "${2}" "${1}" || fail "${3}（${1} 里无 ${2}）"
  pass "${3}"
}
```

首版断言（ZH=dist/board/index.html，EN=dist/en/board/index.html）：

```bash
assert_has "${ZH}" '<lenticular-card' "卡宿主 SSR 出"
assert_has "${ZH}" 'role="slider"' "宿主是 slider"
assert_has "${ZH}" 'data-blend="sweep"' "默认 blend=sweep"
assert_has "${ZH}" '光栅卡' "中文卡题"
assert_has "${ZH}" '倾斜看另一面' "中文 hover 提示"
assert_has "${ZH}" '拖动看另一面' "中文触屏提示"
assert_has "${EN}" 'Lenticular Card' "英文卡题"
assert_has "${EN}" 'Tilt to see the other side' "英文 hover 提示"
assert_lacks "${ZH}" 'aria-live' "不养 aria-live 区域（valuetext 已足够）"
# 图 2 不依赖 JS 也必须被请求到：卡 + 原邮票各一份 ⇒ 各出现 ≥2 次
assert_count_ge "${ZH}" 'DONGLONGDONG-2' 2 "云海图在卡与邮票里各一份"
assert_count_ge "${ZH}" 'DONGLONGDONG-3' 2 "星夜图在卡与邮票里各一份"
```

`assert_count_ge` 是本脚本新增的小助手（其余 helper 从 anatomy-check 复用）：

```bash
assert_count_ge() { # $1=文件 $2=片段 $3=最小次数
  local n; n=$(grep -oF -- "${2}" "${1}" | wc -l | tr -d ' ')
  [ "${n}" -ge "${3}" ] || fail "${4:-计数}（${1} 里 ${2} 出现 ${n} 次 < ${3}）"
  pass "${4:-${1} 里 ${2} ≥ ${3} 次}"
}
```

- [ ] **Step 2: 跑脚本确认失败**

Run: `bash scripts/tests/lenticular-check.sh`
Expected: FAIL（`卡宿主 SSR 出（… 未找到 <lenticular-card）`）。

- [ ] **Step 3: 补三条 UI 词条（zh + en 各一份）**

`ZH_STRINGS`：`boardLensTitle: "光栅卡"`、`boardLensHintPointer: "倾斜看另一面"`、`boardLensHintTouch: "拖动看另一面"`；en 对象对应 `"Lenticular Card"`、`"Tilt to see the other side"`、`"Drag to see the other side"`。键名与顺序在两份里保持一致。

- [ ] **Step 4: 写 `src/components/LenticularCard.astro`**

frontmatter 声明上面的 `Props`，可选值用 `Astro.props` 解构 + 默认值（`maxTilt = 14` 等）。markup 要点：两张图都用 `<Image>`（`width={560}` 覆盖 2× DPR，`height` 由 `aspect-ratio` 推；`loading="lazy"`、`decoding="async"`、`alt={altA}`/`alt={altB}`），外层结构按 Interfaces 里的标记与属性名逐字建。**本任务不写 `<script>`**（Task 4 才加）。`aria-label` 取 `t(locale, "boardLensTitle")`，`aria-valuetext` 取 `titleA`（初始态就是图 1）。caption 里两条 hint `<span>` 都 SSR 出来，由 CSS 二选一显示。

- [ ] **Step 5: 写 `src/styles/lenticular.css` 的静态骨架**

本任务只需要：宿主 `display: block; margin-inline: auto; width: min(32rem, 100%);`、`lens-stage { position: relative; aspect-ratio: 1.75; }`、`lens-face` 为 **`position: static; display: block`**（无 JS 并列态，两张图都可见）、`lens-face img { display: block; width: 100%; height: auto; }`、`lens-caption` 用 `--step--1` + `--muted-foreground`、两条 `.lens-hint` 默认都 `display: none`（Task 2 补 `@media (hover)` 规则，本任务先不让文案裸出两份）。颜色一律 `var(--…)` / `light-dark()`，不写死。

- [ ] **Step 6: 在 `Layout.astro` 引入 CSS，在 `Board.astro` 落位**

`Board.astro` 里取 view 并按 spec §10 风险 6 硬失败：

```ts
const lensA = views.find((v) => v.id === "cloudsea-stamp")
const lensB = views.find((v) => v.id === "galaxy-stamp")
if (!lensA || !lensB) {
  throw new Error(
    "Lenticular card needs board items 'cloudsea-stamp' and 'galaxy-stamp'",
  )
}
```

`<Image src={lensA.image as ImageMetadata}>` 的 cast 写法与现有邮票（现 `Board.astro:89`）同款。

- [ ] **Step 7: 跑脚本确认通过**

Run: `bash scripts/tests/lenticular-check.sh` → Expected: 全 PASS。
Run: `npm run format:check` → Expected: 无差异（CSS 不被 Biome 格式化，注意与邻文件风格一致）。

- [ ] **Step 8: 反向验证「取不到 view 必须构建失败」**

临时 `sed -i '' 's/cloudsea-stamp/cloudsea-stamp-x/' src/data/board.ts`（或直接改 `Board.astro` 里的查找 id）→ `npm run build` Expected: **报错并退出非零**；随后 `git checkout src/data/board.ts` 还原。这一步是 Review Focus #2 的唯一证据，必须留在提交信息或 PR 描述里。

- [ ] **Step 9: Commit**

```bash
git add src/lib/i18n.ts src/components/LenticularCard.astro src/styles/lenticular.css src/layouts/Layout.astro src/components/Board.astro scripts/tests/lenticular-check.sh
git commit -m "feat(lenticular): SSR static lenticular card under the board grid"
```

---

### Task 2: CSS 渲染契约的消费层（叠合态、扫掠、视差、sheen、逃生门）

**Files:**
- Modify: `src/styles/lenticular.css`
- Modify: `scripts/tests/lenticular-check.sh`（追加断言）

**Interfaces:**
- Consumes: Task 1 的宿主标记与 `data-blend`；契约变量名 `--rx`/`--ry`/`--t`/`--ma`/`--feather`/派生 `--c`。
- Produces: CSS 侧契约（Task 4 的 JS 只对这些名字说话）——`lenticular-card[data-ready]` 触发叠合；`lens-stage` 消费 `--rx/--ry`；`lens-face[data-b]` 消费 `--t`/`--ma`/`--feather`。

- [ ] **Step 1: 追加失败断言**

```bash
CSS=dist/_astro
# 注意：dist 里的 CSS 已被压缩，带空格的写法永远抓不到——一律用正则；
# CSS 资产在目录里，故用 assert_dir_match（Task 1 定义），不是文件级的 assert_match
assert_dir_match "${CSS}" '@property\s+--t' "注册 --t 使其可 transition"
assert_dir_match "${CSS}" '@property\s+\-\-rx' "注册 --rx"
assert_dir_match "${CSS}" 'lenticular-card\s*\{[^}]*--rx:\s*0' "兜底声明与 @property 共存（不依赖 initial-value）"
assert_dir_match "${CSS}" 'calc\(var\(--t\)\s*\*\s*\(100%' "mask 边界公式含 100%+2f 外推"
assert_dir_match "${CSS}" '\-webkit-mask-image' "Safari 前缀同写"
assert_dir_match "${CSS}" 'rotateX\(calc\(var\(--rx\)\s*\*\s*1deg\)' "倾角以无单位数字存、CSS 补 deg"
assert_dir_match "${CSS}" 'data-blend=.?fade.?' "fade 逃生门存在（压缩可能去引号）"
assert_dir_match "${CSS}" 'hover:\s*hover' "hover 能力决定提示文案"
assert_dir_match "${CSS}" 'prefers-reduced-motion' "reduced-motion 分支"
assert_dir_match "${CSS}" 'transition:[^;}]*--t' "reduce 下 --t 走 CSS transition"
assert_dir_match "${CSS}" 'isolation:\s*isolate' "sheen 的混合不污染板面"
assert_dir_match "${CSS}" 'mix-blend-mode:\s*soft-light' "sheen 用 soft-light"
# 源码级不变量：3D 节点上不得出现 filter（会压平并改 containing block）
[ -z "$(grep -n 'filter:' src/styles/lenticular.css)" ] || fail "lenticular.css 里出现 filter"
```

Run: `bash scripts/tests/lenticular-check.sh` → Expected: FAIL（`@property --t` 那条最先缺）。

- [ ] **Step 2: 写 `@property` 注册 + 宿主兜底声明**

四条注册（`--rx`/`--ry`/`--t` 为 `<number>`，`--ma` 为 `<angle>`，`inherits: true`，带 `initial-value`），并**同时在 `lenticular-card` 选择器上写普通声明** `--rx: 0; --ry: 0; --t: 0; --ma: 90deg; --feather: 9%;`——注释里写明为什么两份：`@property` 在 Firefox <128 / Safari <16.4 不认，无 JS 时更没脚本，默认值必须靠普通声明兜住；注册只为「可 transition」。

- [ ] **Step 3: 写叠合态与 3D 变换**

`lenticular-card` 上 `perspective: 900px`。`lenticular-card[data-ready] lens-face { position: absolute; inset: 0; }` + `scale(1.04)` 超尺寸（防视差露底）。`lens-stage { transform: rotateX(calc(var(--rx) * 1deg)) rotateY(calc(var(--ry) * 1deg)); isolation: isolate; box-shadow: calc(var(--ry) * -0.8px) calc(var(--rx) * 0.8px + 12px) 28px -6px <主题化阴影>; }`。**不要加 `transform-style: preserve-3d`**（卡是单个平面，两层是共面兄弟，spec §3），也不要 `filter`。

- [ ] **Step 4: 写 mask 扫掠（照 spec §7 已修正的公式）**

`--c: calc(var(--t) * (100% + 2 * var(--feather)) - var(--feather))`，`lens-face[data-b]` 用 `linear-gradient(var(--ma), black calc(var(--c) - var(--feather)), transparent calc(var(--c) + var(--feather)))`，`-webkit-mask-image` 同值再写一遍。注释里保留「起点侧为 black、两侧各留一个 feather 在卡外」的理由，否则下一个人很容易改回错的 `var(--t)*100% ± f`。`--c` **不注册 `@property`**（派生量，插值只发生在 `--t`）。

- [ ] **Step 5: 写视差、sheen、fade、reduce、focus、hover 文案**

视差：`lens-face[data-a] { translate: calc(var(--ry) * -0.35px) calc(var(--rx) * 0.35px); }`，`[data-b]` 取反号。sheen：`lens-sheen` 绝对铺满、`background: linear-gradient(...)` 中心 `calc(50% + var(--ry) * 3%)`、`opacity: calc(0.35 + var(--t) * 0.15)`、`mix-blend-mode: soft-light`。fade：`lenticular-card[data-blend="fade"] lens-face[data-b] { mask-image: none; opacity: var(--t); }`。reduce：`@media (prefers-reduced-motion: reduce) { lens-stage { transform: none } lens-sheen { display: none } lenticular-card { transition: --t 220ms ease } }`。focus：`:focus-visible { outline: 2px solid var(--focus-ring, currentColor); outline-offset: 3px }`（沿用站内既有 focus 令牌，若有）。hover 文案：`@media (hover: hover) { .lens-hint[data-hint=pointer] { display: inline } }` + `@media (hover: none) { .lens-hint[data-hint=touch] { display: inline } }`。

- [ ] **Step 6: 跑断言 + 构建 + 目视**

Run: `bash scripts/tests/lenticular-check.sh` → 全 PASS；`npm run build` → 绿。dev 服务器里目视 `/board`：静态卡应是**平放的图 1**（`--t:0` 时边界在卡外，图 2 一丝不漏）——这一步能提前抓到 mask 方向写反（症状：卡一开始就是图 2）。

- [ ] **Step 7: Commit**

```bash
git add src/styles/lenticular.css scripts/tests/lenticular-check.sh
git commit -m "feat(lenticular): CSS consumption layer for tilt, sweep mask, sheen"
```

---

### Task 3: `lenticular-spring.ts` 纯物理与进度 + 离线断言脚本

**Files:**
- Create: `src/lib/lenticular-spring.ts`
- Create: `scripts/tests/lenticular-motion-check.sh`（段 A）

**Interfaces:**
- Consumes: 无（本模块零 import，必须能被 `node --experimental-strip-types` 加载——不要 `import` 任何无扩展名模块，`board-layout-check.sh` 的头注已记过这条坑）。
- Produces:

  ```ts
  export type Vec2 = { rx: number; ry: number }
  export type SpringOpts = { stiffness: number; damping: number; mass: number }
  export const DEFAULT_SPRING: SpringOpts // { stiffness: 170, damping: 16, mass: 1 }
  export const T_START = 0.15
  export const T_FULL = 0.85
  export const SUBSTEP = 1 / 60
  export const MAX_SUBSTEPS = 4
  export function targetFromPointer(nx: number, ny: number, maxTilt: number): Vec2
  export function targetFromDrag(dx: number, dy: number, halfW: number, halfH: number, maxTilt: number): Vec2
  export function advanceAxes(cur: Vec2, vel: Vec2, target: Vec2, o: SpringOpts, dt: number): { cur: Vec2; vel: Vec2 }
  export function ampOf(cur: Vec2, maxTilt: number): number
  export function progressOf(cur: Vec2, maxTilt: number): number
  export function sweepAngleOf(cur: Vec2, maxTilt: number, prev: number): number
  export type LensKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | "Enter" | "Escape"
  export function keyTargetFrom(key: LensKey, cur: Vec2, maxTilt: number): Vec2
  ```

- [ ] **Step 1: 写段 A 失败断言**

`scripts/tests/lenticular-motion-check.sh` 起步即 `board-layout-check.sh` 的骨架（`set -euo pipefail`、`pass/fail`、`.env` 备份恢复 + trap），段 A 用 `node --experimental-strip-types --no-warnings - <<'EOF'` 内联 `node:assert`。断言逐条（值全部来自 spec §6/§7）：

```js
// ① 输入映射
eq(targetFromPointer(0.5, 0.5, 14), { rx: 0, ry: 0 })
eq(targetFromPointer(1, 0, 14), { rx: 14, ry: 14 })      // ny=0 顶 → rx 正；nx=1 右 → ry 正
deepEq(targetFromPointer(0.9, 0.1, 0), { rx: 0, ry: 0 }) // reduce 走 maxTilt=0：不倾斜
// ② 阈值与 smoothstep 端点
assert(progressOf({ rx: 0.14 * 14, ry: 0 }, 14) === 0)   // amp=0.14 < T_START
assert(progressOf({ rx: 0.9 * 14, ry: 0 }, 14) === 1)    // amp>0.85 封顶
approx(progressOf({ rx: 7, ry: 0 }, 14), 0.5)            // amp=0.5 → u=0.5 → smoothstep=0.5
// ③ 单调非降（“两个动画同步”的数学形式）：沿 amp 上升方向采样 101 点，t 不得回落
// ④ 回弹真的在数学里：rx 从 14 释放到 0，60 帧内 min(rx) < -0.5（越过零点），末值 |rx| < 0.05
// ⑤ 过冲把 t 撞到位：target = 0.80·maxTilt（稳态 t<1），模拟 40 帧内 max(t) === 1
// ⑥ 固定子步确定性：同一 0.5s 总时长用 dt=1/30 与 1/120 驱动，末值差 < 1e-3
// ⑦ 方向 hold：sweepAngleOf({rx:0.05,ry:0.05}, 14, 270) === 270（amp<1% 沿用 prev）
//    主轴取符号：sweepAngleOf({rx:0,ry:7},14,0)===90、{ry:-7}→270、{rx:7,ry:0}→0、{rx:-7}→180
// ⑧ 键盘：keyTargetFrom("ArrowRight", {0,0}, 14).ry === 3.5；连按 4 次 === 14 且不越过；
//    keyTargetFrom("Home", cur, 14) === {0,0}；"End" → 满；"Enter" 在 {0,0} 与 {rx:0,ry:14} 间往返
// ⑨  ζ 校验（防参数被手滑改）：由 DEFAULT_SPRING 反算 zeta = damping/(2*sqrt(stiffness*mass))，
//    assert(0.60 < zeta < 0.63) 且过冲率 exp(-zeta*PI/hypot(1-zeta*zeta)) 落在 0.08–0.09
```

- [ ] **Step 2: 跑段 A 确认失败**

Run: `bash scripts/tests/lenticular-motion-check.sh`
Expected: FAIL（`Cannot find module .../lenticular-spring.ts` 或等价的模块不存在错误）。

- [ ] **Step 3: 实现 `src/lib/lenticular-spring.ts`**

要点只在签名与算法上，公式 spec 已锁定：`advanceAxes` 用半隐式欧拉 + accumulator 固定 `SUBSTEP`，单帧最多 `MAX_SUBSTEPS` 子步，余量丢弃（掉帧不追帧）；`ampOf` 返回 `Math.hypot(rx, ry) / maxTilt`（`maxTilt === 0` 时直接返回 0，避免除零）；`progressOf` 按 §6 的 `u = clamp((amp - T_START) / (T_FULL - T_START), 0, 1)` 再 `u*u*(3-2u)`；`sweepAngleOf` 先做 1% hold 再取主轴符号；`keyTargetFrom` 步进 `0.25 * maxTilt` 并 `clamp` 到 `±maxTilt`。

- [ ] **Step 4: 跑段 A 确认通过**

Run: `bash scripts/tests/lenticular-motion-check.sh` → Expected: 段 A 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/lenticular-spring.ts scripts/tests/lenticular-motion-check.sh
git commit -m "feat(lenticular): spring and progress model as pure, tested module"
```

---

### Task 4: `mountLenticular` + 自定义元素注册（把三个数写进 CSS）

**Files:**
- Create: `src/lib/lenticular.ts`
- Modify: `src/components/LenticularCard.astro`（补 `<script>`）
- Modify: `scripts/tests/lenticular-check.sh`（追加产物断言）

**Interfaces:**
- Consumes: Task 3 的全部导出；Task 2 的 CSS 契约（变量名、`[data-ready]`）；宿主 `data-max-tilt/-stiffness/-damping`。
- Produces:
  ```ts
  export type LenticularHandle = { destroy(): void }
  export function mountLenticular(host: HTMLElement): LenticularHandle
  ```
  并在 `LenticularCard.astro` 的 `<script>` 内注册 `customElements.define("lenticular-card", …)`，带 `if (!customElements.get("lenticular-card"))` 守卫，`connectedCallback` 里 `this.#handle ??= mountLenticular(this)`，`disconnectedCallback` 里 `this.#handle?.destroy(); this.#handle = null`（照 `EyeTracker.astro:103-148` 的形状）。

- [ ] **Step 1: 追加失败断言**

```bash
assert_dir_has dist/_astro 'customElements.define("lenticular-card"' "元素注册入产物"
assert_dir_has dist/_astro 'setPointerCapture' "触屏走 Pointer Capture"
assert_dir_has dist/_astro 'cancelAnimationFrame' "destroy 撤掉 rAF"
assert_dir_has dist/_astro 'ResizeObserver' "rect 随尺寸失效"
assert_dir_has dist/_astro 'will-change' "will-change 由 JS 经 setProperty 开关"
```

不包 Task 5 的东西（`prefers-reduced-motion`、`keydown`）——那两条是 Task 5 的失败起点，现在放进来的话 Task 5 就没有红可翻。

Run: `bash scripts/tests/lenticular-check.sh` → Expected: FAIL（JS 资产里还没有 `lenticular-card`）。

- [ ] **Step 2: 实现 `mountLenticular`**

按 spec §6/§7 与 Global Constraints 接线，逐条不可省：旋钮从 `dataset` 读（缺省用 spec 值）；`pointerenter`/`pointerdown` 时取 rect 存 `#rect`，`ResizeObserver` 与 `scroll`（`{ passive: true }`，且经 `src/lib/scroll.ts` 的活跃滚动源，站规）里失效；`pointermove` 只在 `#rect` 存在时算 `nx/ny` → `targetFromPointer`；`pointer: coarse` 用 `pointerdown` + `setPointerCapture` + `targetFromDrag`；`pointerleave`/`pointerup`/`pointercancel` → target 归零；单条 rAF 循环调 `advanceAxes` → `progressOf` → `sweepAngleOf`；写值走 `host.style.setProperty`，**与上一次写出的字符串比对后才写**（`--ma` 同理，天然是离散缓存）；同一帧里同步 `aria-valuenow = Math.round(t*100)` 与 `aria-valuetext`（`t < 0.5` 用 `data-title-a`，否则 `data-title-b`）。

两个生命周期开关必须在 `destroy()` 里全部撤销：`cancelAnimationFrame`、摘全部监听器、`ResizeObserver.disconnect()`。

- [ ] **Step 3: 激活态与 alt 清空**

`connectedCallback` 挂载即写 `data-ready`（CSS 于是从并列切到叠合），**同时**把两层 `lens-face img` 的 `alt` 置为 `""`（spec §8：面名由 caption 可见文字与 `valuetext` 承担，留着 alt 会被读两遍）。`will-change: transform` 在 `pointerenter`/`pointerdown` 加、`pointerleave`/`pointerup` 撤。

rAF **不得常驻**：当 `target` 为 0、`|cur|` 与 `|vel|` 都小于 `0.01` 且 `t === 0` 时写出终值并停掉循环，下次输入再启动（省电，也让 Review Focus #4「循环活过页面」无从发生）。

- [ ] **Step 4: 跑脚本 + 构建**

Run: `bash scripts/tests/lenticular-check.sh` → 全 PASS；`npm run build` → 绿；`npm run format:check` → 无差异。

- [ ] **Step 5: 真实浏览器测量（终端 playwright-cli，覆盖 Review Focus #4）**

dev server + 终端 playwright-cli（**不要**用 `playwright-core` 的 `launch()`：本机 `playwright-core@1.64` 要 `chromium_headless_shell-1248`，缓存里只有 `chromium-1208`）。跑 spec §11 的测量项 1–3，逐帧采样宿主的 computed `--t` 与 `--ry`，验收：

1. 分步移到右上角：`--t` 与 `--ry` 同向单调（列出采样表，至少 8 个点）；
2. 反向移回中心：`--t` 回落；
3. `mouse.leave` 后：`--t → 0`，且过程中出现高于终值的峰值（回弹到达渲染层）；
4. 空闲后 rAF 停摆：静置 2s，断言 `getAnimationFrames` 采不到新帧 / `--t` 写入不再变化。

把四组数值写进提交信息（`.playwright-cli/` 已 gitignore，截图不入仓）。任一不成立 → 停下按 systematic-debugging 查，不许改阈值凑数。

- [ ] **Step 6: Commit**

```bash
git add src/lib/lenticular.ts src/components/LenticularCard.astro scripts/tests/lenticular-check.sh
git commit -m "feat(lenticular): mount drives tilt and blend from one spring value"
```

---

### Task 5: reduced-motion 与键盘路径、ARIA 收口

**Files:**
- Modify: `src/lib/lenticular.ts`
- Modify: `src/styles/lenticular.css`
- Modify: `scripts/tests/lenticular-check.sh`（Step 1 的三条产物断言）
- Modify: `scripts/tests/lenticular-motion-check.sh`（Step 1b 的段 A 边界用例）

**Interfaces:**
- Consumes: Task 3 的 `keyTargetFrom`、`targetFromPointer(nx, ny, 0)` 恒为 0 的性质；Task 4 的 mount 骨架。
- Produces: `mountLenticular` 内部的 reduce 分支与键盘分支（对外接口不变）。

- [ ] **Step 1: 先加会真的失败的产物断言（`lenticular-check.sh`）**

```bash
assert_dir_has dist/_astro 'prefers-reduced-motion' "JS 里读 reduced-motion"
assert_dir_has dist/_astro 'matchMedia' "媒体查询入口"
assert_dir_has dist/_astro 'keydown' "键盘驱动路径"
```

Run: `bash scripts/tests/lenticular-check.sh` → Expected: FAIL（Task 4 的 JS 里没有这三个串）。

- [ ] **Step 1b: 段 A 追加纯函数边界用例（回归锁，不是红灯）**

`keyTargetFrom("ArrowDown", {rx:12, ry:0}, 14)` → `rx === 14`（clamp 生效，不越过满倾）；`keyTargetFrom("Escape", …)` 与 `("Home", …)` 同值 `{0,0}`；`targetFromDrag(9999, 0, 256, 146, 14)` → `{rx:0, ry:14}`（拖出卡外不放大角度）。

这批断言写完就应当直接 PASS（函数住 Task 3，本任务只接线）——这是刻意的：它们的作用是钉住 mount 即将依赖的 clamp 行为，若此刻就 FAIL，说明 Task 3 漏了分支，**先回 Task 3 修函数再往下接线**。

- [ ] **Step 2: 接 reduce 分支**

`matchMedia("(prefers-reduced-motion: reduce)")` 为真时：不启 rAF、`maxTilt` 视作 0（于是 `targetFromPointer(_,_,0)` 与 `progressOf` 的 tilt 部分都自然归零，不需要新代码路径），改为**直接** `setProperty("--t", String(target))`，平滑交给 Task 2 CSS 里那条 `transition: --t 220ms`；`data-blend` 强制按 `fade` 呈现（CSS 侧用 reduce 块覆盖 mask）。监听该 mediaquery 的 `change` 事件，切换时重建分支，`destroy()` 里摘掉。

- [ ] **Step 3: 接键盘分支**

`keydown` → `keyTargetFrom(event.key, currentTargetAsVec, maxTilt)` 更新 target；命中上述按键 `event.preventDefault()`（方向键否则滚页）。reduce 态下方向键仍然只改 `--t`（等价把 `maxTilt` 当 0），`Enter`/`Escape` 可用——**reduced-motion 不能夺走内容**，spec §8。`aria-valuenow`/`aria-valuetext` 的同步复用 Task 4 已有的那处写入点，不重复实现。

- [ ] **Step 4: 跑段 A + 产物断言 + 构建**

Run: `bash scripts/tests/lenticular-check.sh`（含 Step 1 那三条，现应全 PASS）、`bash scripts/tests/lenticular-motion-check.sh`（全 PASS）、`npm run build`（绿）。

- [ ] **Step 5: 真实浏览器测量（测量项 4–5）**

1. `emulateMedia({ reducedMotion: "reduce" })` + 聚焦 + `Enter`：`--ry` 全程 `0`，`--t` 变到 `1`，`aria-valuetext` 变成图 2 面名；
2. `Tab` 聚焦 + 4 次 `ArrowRight`：`aria-valuenow` 单调上升到 `100`；`Escape` 回 `0`；
3. 读屏语义自查：`page.accessibility.snapshot()` 里卡只出现**一个** `slider` 节点、`alt` 已清空、无重复文本（Review Focus 里的「读两遍」防线）。

数值写进提交信息。

- [ ] **Step 6: Commit**

```bash
git add src/lib/lenticular.ts src/styles/lenticular.css scripts/tests/lenticular-check.sh scripts/tests/lenticular-motion-check.sh
git commit -m "feat(lenticular): reduced-motion and keyboard paths, single slider node"
```

---

### Task 6: 帧时实测与 `fade` 决策（Review Focus #5）

**Files:**
- Modify: `docs/superpowers/specs/2026-10-21-lenticular-card-design.md`（把实测数值追到 §11 末尾）
- Modify: `src/components/LenticularCard.astro`（仅当默认 `blend` 需要改时）
- Modify: `src/styles/lenticular.css`（同上）

**Interfaces:**
- Consumes: Task 4/5 的成品卡。
- Produces: 一个有据可依的默认 `data-blend` 值 + 写回 spec §11 的实测数值（Task 7 的文档引用它）。`.playwright-cli/` 已被 gitignore，所以**数值必须落进文档**，不能只留在截图里。

- [ ] **Step 1: 量帧时（Chromium）**

dev server，终端 playwright-cli：指针在卡面上做连续移动（每帧一个新点，共 120 帧），采集 rAF 间隔与每帧的 `mask-image` 重绘耗时；同时对照 `data-blend="fade"` 的同一测量。记录：`sweep` 的 p95 帧时、`fade` 的 p95 帧时。

- [ ] **Step 2: WebKit 跑一次交互与叠层**

缓存里有 `webkit-2248`，用同一份脚本切 `webkit` 引擎跑 Task 4 Step 5 的测量项 1–3 + 截图。验收：无「图 2 一直半透」「齿孔式锯齿边界」「卡消失」等 3D+mask 叠层症状（spec §10 风险 2 的实测入口，不允许只靠目视通过）。

- [ ] **Step 3: 决策并落地**

`sweep` 的 p95 ≤ 16.7ms → 保持默认 `sweep`。否则：默认改 `fade`（`LenticularCard.astro` 的 `blend` 默认值一行），并在 `docs/components/lenticular-card.md` 写明「为何默认走 fade、如何显式要 sweep」。

- [ ] **Step 4: 把数值写回 spec §11 末尾**

追加一个小节（标题就叫「实测记录」），逐项列出：sweep/fade 各自 p95 帧时、WebKit 下测量项 1–3 的结论、最终选定的默认 `blend` 与理由。没这一节，Task 7 的文档只能写愿望而不是写实测。

- [ ] **Step 5: 全闸复跑**

Run: `bash scripts/tests/lenticular-check.sh && bash scripts/tests/lenticular-motion-check.sh && npm run build && npm run format:check` → 全绿。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "perf(lenticular): measure sweep vs fade frame cost, record in spec"
```

---

### Task 7: 用法文档与全套回归

**Files:**
- Create: `docs/components/lenticular-card.md`
- Modify: `docs/components/README.md`（索引追加一行）

**Interfaces:**
- Consumes: 前六个任务的全部产物与实测数值。
- Produces: 无代码接口。

- [ ] **Step 1: 写 `docs/components/lenticular-card.md`**

严格沿用 `docs/components/README.md` 的 8 节顺序（一句话说明 / 文件位置 / 快速上手 / Props 表 / 模式取值详解 / 无障碍与降级 / 注意事项 / 完整示例）。Props 表从 Task 1 的 `Props` 逐行抄（含默认值与范围）。「无障碍与降级」写实测到的行为，不写愿望；「注意事项」必须包含：每帧只写 4 个变量这条契约、`--ma` 的 hold 规则、`filter` 禁令、`@property` 与兜底声明为何两份、卡只读 `cloudsea-stamp`/`galaxy-stamp` 两枚邮票的 view（改名/`draft`/删除会构建失败）、以及 Task 6 的帧时数值与 `fade` 用法。

- [ ] **Step 2: 追加索引条目**

`docs/components/README.md` 索引末尾加一行：`- [LenticularCard 光栅卡组件](lenticular-card.md) —— 倾斜到位就把画面换成另一张的数字光栅卡（手写弹簧 + CSS mask 扫掠，零依赖）。`

- [ ] **Step 3: 全闸（AGENTS.md 的提交前要求 + 涉及 i18n 的回归）**

```bash
npm run format:check
npm run build
bash scripts/tests/i18n-check.sh        # 动了 UI_STRINGS，必须全绿
bash scripts/tests/board-check.sh       # 收藏板未受影响
bash scripts/tests/lenticular-check.sh
bash scripts/tests/lenticular-motion-check.sh
```

Expected: 六条全部通过，任一失败先修再提交。

- [ ] **Step 4: 手动核验（AGENTS.md 要求，不可跳过）**

dev 服务器下明/暗 × 宽/窄四组合目视截图；逐项确认**不受影响**：拖拽一枚邮票、右键开径向菜单、双击邮票开 GlassBubble、切分类标签、dev「保存布局」写回 `board.ts`（写回内容里不得出现 tilt 字段）。窄屏（<64rem）确认板回退只读网格时光栅卡仍可用拖拽驱动。

- [ ] **Step 5: Commit**

```bash
git add docs/components/lenticular-card.md docs/components/README.md
git commit -m "docs(components): Add LenticularCard usage guide"
```
