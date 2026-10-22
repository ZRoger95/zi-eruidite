# 数字光栅卡 `<lenticular-card>`：倾斜与画面切换同源 — 设计规格

- 日期：2026-10-21
- 范围：新增自主定制元素 `lenticular-card` + 新增全局样式 `lenticular.css` + 在 `/board`（含 `/en/board`）板面网格**下方**插入一处展示实例
- 隐喻：一张塑料光栅/全息卡——平放时是画面一，把它倾到位，画面二从抬起的那一侧转过来
- 明确排除：不做真实光栅竖条纹（原始需求第 1 条已指定）

## 1. 目标与非目标

### 目标（原始需求逐条落到机制，详见 §13 验收对照）

- 初始展示图片 1；指针在卡面上移动到不同位置（如右上角）时产生**有物理质感的 3D 倾斜**，同时图片 1 平滑渐变为图片 2。
- 切换进度与倾斜角度**实时联动**：同一个量驱动，不存在「角度到位而图没切完」。
- 有惯性、阻尼、回弹；反向移动平滑反切；指针离开后弹回初始状态。
- 遵循站点「SSR 静态内容 + 客户端激活」范式；无 JS 时两张图都读得到，不承诺不存在的交互。
- 全站无框架基调不破：零新增依赖，原生自定义元素 + Pointer Events + CSS。
- 中英双语、明暗双主题、触屏可用、`prefers-reduced-motion` 可用。

### 非目标

- **不做**真实光栅条纹、脊线、彩虹边（是「倾斜换画面」的卡，不是条纹模拟）。
- **不做**多图（2–5 张）序列切换，只做两张。
- **不做**卡片入板可拖拽：它不进 `board-grid`，不是 `board-piece`，与既有拖拽/右键/双击语义无关。
- **不做**位置持久化、不做用户上传图片、不做 GIF 导出。
- **不改** `BoardItem` 数据模型、`getBoardViews`、dev 布局编辑器与其写回逻辑（见 §4 不变量）。
- **不引入** Three.js / WebGL、vanilla-tilt、motion 等任何依赖（路线 A，见 §2）。

## 2. 方案骨架与四份参考的实际产出

路线 **A：全手写**。参考清单逐个读过，结论如下——它们提供的是**算法语义与驱动结构**，不是依赖。

| 参考 | 读到的事实 | 对本设计的取舍 |
| --- | --- | --- |
| GSAP Vault — Lenticular Card | 页面可见：两张 webp 是**同场景两状态**（`alpine-day`/`alpine-night`），文案 "Tilt to see the other side"，另带 Day/Night 开关。其 JS 源码未能取得，实现细节不作断言 | 采纳其选图标准：光栅卡成立与否取决于两张图是否「同构图、换状态」。本例 `-2` 少年对积雨云作画、`-3` 少年提灯望银河，同角色同姿态族、白昼→星夜，满足 |
| Lenticular Effect Generator（Vue+Three） | shader 做四件事：切 `0.005` 细条、tilt(-1..1)→图序号、相邻图混合、脊线+shimmer+彩虹+视差。README 自记：过度倾斜致浏览器崩溃（v1.3.0 才修）、纹理降到 512px、16ms 节流、2° 死区；iOS 13+ 陀螺仪需手势内授权 | **只取其进度→混合语义**（tilt→`t`→揭示），条纹与脊线按需求删除。剥掉条纹后 shader 只剩昂贵版淡入淡出，且稳定性工程要我们来还 → 否决路线 D |
| Motion — Tilt Card | 用 `animate()` 弹簧 + `frame` 调度 + `transformPerspective`/`preserve-3d`（tutorial 后半为 Motion+ 付费内容，公开部分只到 API 形状） | **采纳其驱动结构**：一个物理量喂多个输出。这是「两个动画同步」的正解形状。不引库（路线 C）——为一条弹簧引动画库不值 |
| VanillaTilt.js 1.8.1 | MIT；自带 `vanilla-tilt.d.ts`；三年前发布；dist 15kb/min 8.5kb 无 tree-shaking；API `init/destroy/getValues/reset` + `tiltChange` 事件。倾斜由 `speed` + `cubic-bezier(.03,.98,.52,.99)` 的 **CSS transition** 驱动，无 stiffness/damping；README 自挂 "weird rendering issues on Safari" | 否决路线 B，两条硬伤：① 无真弹簧，「惯性阻尼回弹」给不了；② `getValues()`/`tiltChange` 只给**目标**角度，当前渲染角度住在浏览器插值器里取不到——而本设计的选择恰恰是「进度由实际角度算出」，用它会与库对着干。它唯一能替写的约 20 行坐标换算不值 8.5kb 依赖 |

一句话：**抄参考②的算法、抄参考③的驱动结构，不抄参考④的实现。**

## 3. 落位与页面结构

插在 `src/components/Board.astro` 的 `</board-grid>` 与 `<board-hint>` 之间，作为 `stamp-board` 的直接子元素（与 `board-menu`/`board-card`/`board-hint` 同级）：

```astro
</board-grid>
<LenticularCard
  locale={locale}
  srcA={donglongdong2}
  srcB={donglongdong3}
/>
<board-menu …>
```

内部标记（自主定制元素命名，带连字符；除宿主外均**不注册**，仅作 CSS 挂钩，同 `page-grid` 惯例）：

```html
<lenticular-card role="slider" tabindex="0" aria-valuenow="0" aria-valuetext="…" aria-label="…">
  <lens-stage>
    <lens-face data-a="1"><img …></lens-face>
    <lens-face data-b="1"><img …></lens-face>
    <lens-sheen aria-hidden="true"></lens-sheen>
  </lens-stage>
  <lens-caption>…云海写生 / 星夜独行…</lens-caption>
</lenticular-card>
```

- 卡宽 `min(32rem, 100%)`、`aspect-ratio: 1.75`、居中。源图 `690×371`(1.860) 与 `690×408`(1.691)，取 1.75 时两者分别只裁约 6% / 3.4%，是最省裁切的横版落点。
- 无 JS 时 `lens-face` 为**上下并列**（各带面名，两张图都读得到）；`connectedCallback` 写 `data-ready` 后 CSS 改为绝对叠合。这是「SSR 出全部内容 + 客户端只改呈现」的既有范式。
- 不带齿孔：齿孔 mask、揭示 mask、3D 变换三层叠加在 Safari 上脆，且语义上塑料卡不是纸票。
- 透视在宿主：`perspective: 900px`；3D 变换只打在 `lens-stage` 一次。**卡是单个平面，内部两层是共面兄弟，不需要 `transform-style: preserve-3d`**——因此不会踩 preserve-3d 被 `filter`/`mask` 压平那一类坑。
- `< 64rem` 板回退只读网格不影响卡（卡本来就在 grid 外）；窄屏下卡随 `min(32rem,100%)` 自然收窄。

## 4. 接口与文件边界

**核心不变量（本次改动绝不触碰）**：`BoardItem.kind` 枚举、`getBoardViews()`、`src/lib/board-source-patch.ts`、`board-piece` 几何体系。卡不是内容条目、不是可拖件，因此天然躲开 `dragstart` 拦截、径向菜单、双击 GlassBubble、`data-kind` 分类标签整套语义；dev「保存布局」也不会把 tilt 当几何写回（tilt 是运行时动画）。

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/components/LenticularCard.astro` | 新增 | SSR 两张 `<Image>`（走 Astro 图片优化）+ 宿主标记 + 注册 `lenticular-card`，带 `customElements.get` 守卫（View Transitions 会重跑 body 脚本） |
| `src/lib/lenticular.ts` | 新增 | `mountLenticular(host) → LenticularHandle{ destroy(), attrChanged? }`：Pointer/Keyboard 输入、rAF 弹簧、写 CSS 变量与 ARIA。旋钮读宿主 `data-*` |
| `src/styles/lenticular.css` | 新增 | 全局引入于 `src/layouts/Layout.astro`，与 `eye-tracker.css`、`glass-bubble.css`、`scramble-text.css` 同列 |
| `src/components/Board.astro` | 修改 | 仅插入一处 `<LenticularCard>`（图/题/alt 均取自现成 view，不新增 import） |
| `src/lib/i18n.ts` | 修改 | `UI_STRINGS` 补 zh + en 两份词条（见 §9） |
| `docs/components/lenticular-card.md` | 新增 | AGENTS.md 明文要求：此类组件同步补一篇用法文档，沿用 README 的 8 节顺序 |
| `scripts/tests/lenticular-check.sh` | 新增 | 构建期产物断言（离线） |
| `scripts/tests/lenticular-motion-check.sh` | 新增 | 弹簧与进度纯函数的离线断言（`node --experimental-strip-types`，不起浏览器） |

组件 Props：`locale`（必填）、`srcA`/`srcB`（`ImageMetadata`）、`titleA`/`titleB`、`altA`/`altB`（均为已按当前 locale 取好的字符串，由 `Board.astro` 从 `getBoardViews()` 的现成 view 里取，见 §9）、可选 `maxTilt`、`stiffness`、`damping`、`blend`——后四个落成宿主 `data-*`，缺省即 §6/§7 的锁定值。

两张源图**不另起 import**：`Board.astro` 直接从 `getBoardViews(locale)` 里取 `cloudsea-stamp` / `galaxy-stamp` 两条现成 view，连图（`view.image`，与现有邮票同一套 `as ImageMetadata` 写法）、面名（`view.title`）、描述（`view.alt`）一并传给组件。板上那两枚邮票与本卡用同一份数据、同一次图片优化，不存在重复资源，也不需要为「去重」去改 `src/data/board.ts`。

## 5. 渲染契约：JS 每帧只写 4 个数

这是整份设计的地基——**所有视觉都是这三个（+1 个离散）变量的纯函数**。

| 变量 | 类型 | 含义 | 写入时机 |
| --- | --- | --- | --- |
| `--rx` | `<number>`（无单位，语义为度） | 当前渲染的 X 轴倾角 | 每帧（仅当与上帧不同） |
| `--ry` | `<number>`（无单位，语义为度） | 当前渲染的 Y 轴倾角 | 每帧（仅当与上帧不同） |
| `--t` | `<number>`（0–1） | 切换进度，由 `--rx/--ry` 算出 | 每帧（仅当与上帧不同） |
| `--ma` | `<angle>` | 扫掠方向（`90/270/0/180deg`） | **仅当离散值变化时**写 |

三个量**存的都是无单位数字**，故 CSS 侧必须自己补单位：`transform: rotateX(calc(var(--rx) * 1deg)) rotateY(calc(var(--ry) * 1deg))`，视差与投影则是 `calc(var(--ry) * 0.35px)`。理由：无单位数字在 `calc()` 里能直接参与乘除（百分比、像素、度都是「数字 × 单位」），而若存成 `14deg`，再做「幅度归一化」这类运算时就没法拿它去除以一个度数。

消费方（CSS）：`lens-stage` 的 `transform`、`lens-face[data-b]` 的 `mask-image`、两层的视差 `translate3d`、`lens-sheen` 的高光位置与 `opacity`、`lens-stage` 的 `box-shadow` 偏移。

CSS 变量由此命名的原因：调手感/调长相只在 CSS 里改数值，不动 TS；改 TS 的输入映射不动 CSS；两边可独立读懂。

**`--ma` 的稳定性规则**（否则「仅变化时写」不成立）：`amp < 1%·maxTilt` 时**保持上一次的 `--ma` 不变**——接近平放时 `|rx|` 与 `|ry|` 谁大都近乎随机，若照常取主轴符号会让扫掠方向每帧翻面，边界与高光一起抖。首次进入时 `--ma` 取兜底值 `90deg`。

**`@property` 与兜底（两条腿，缺一不可）**：`--rx/--ry/--t/--ma` 均注册 `@property`（带 `initial-value`）以获得**可 transition** 的能力（reduced-motion 用，见 §8）。但默认值**不依赖** `@property`——宿主上另写一条普通声明 `--rx:0; --ry:0; --t:0; --ma:90deg`，因为 `@property` 在 Firefox 128 / Safari 16.4 之前不支持，无 JS 与老浏览器都得落到图1平放的正确画面。

## 6. 物理模型与驱动量

**驱动量：倾斜幅度**（已与用户确认，符合原始需求「如右上角」的措辞）。因此任意方向倾到位都能完成切换，回弹会拖着画面一起回。

输入 → 目标角度（`getBoundingClientRect()` 在 `pointerenter`/`pointerdown` 时取一次并缓存，`ResizeObserver` 与 `scroll` 时失效重算；**每帧读 rect 会强制 layout**）：

- `pointer: fine`：`pointermove` → `nx, ny ∈ [0,1]` → `targetRy = (nx-0.5)·2·maxTilt`、`targetRx = -(ny-0.5)·2·maxTilt`
- `pointer: coarse`：`pointerdown` + `setPointerCapture`，位移映射 `targetRy = clamp(dx / (width/2), -1, 1)·maxTilt`（纵向同理）
- `pointerleave` / `pointerup` / `pointercancel` → 目标归零，由弹簧自己弹回（不另写归零动画）
- `maxTilt = 14°`

弹簧：**半隐式欧拉 + 固定 `1/60s` 子步**（accumulator，单帧最多 4 子步，避免 120Hz 与掉帧时行为漂移）。`stiffness 170 / damping 16 / mass 1` → 阻尼比 ζ = 16/(2√170) ≈ **0.61**，过冲 `exp(-ζπ/√(1-ζ²))` ≈ **8.7%**，305ms 达峰、约 500ms（2% 判据）收住。落到 14° 上即越过终点约 1.2° 再回来：看得见，不卡通。

进度是**当前实际角度的纯函数**（不是第二个弹簧，这是「同源」的落点）：

```
amp = clamp(sqrt(rx² + ry²) / maxTilt, 0, 1)
u   = clamp((amp - 0.15) / 0.70, 0, 1)      // 0→15% 空转，85% 封顶
t   = u * u * (3 - 2u)                       // smoothstep
```

留空转是因为指针刚贴上就切掉三分之一难看；85% 封顶正好让那 8.7% 的过冲**把 `t` 撞到位**，切换完成的瞬间是「弹到位」而非「淡到位」。

`amp` 取的是弹簧当前值，所以反向移动与回弹期间 `t` 自动反切/回带——原始需求的「平滑反向过渡」不需要额外代码。

## 7. 混合与视觉

**扫掠方向**（离散，跟随倾斜主轴符号——抬起哪一侧，哪一侧先转出旧图，这是实体光栅卡的行为）：

```
ma = |ry| ≥ |rx| ? (ry ≥ 0 ? 90deg : 270deg) : (rx ≥ 0 ? 0deg : 180deg)
```

**揭示（`lens-face[data-b]` 的 mask，`--feather: 9%`）**：边界中心 `C` 从卡外 -f 推进到卡外 100%+f，**起点侧为可见（黑=保留）**：

```css
--c: calc(var(--t) * (100% + 2 * var(--feather)) - var(--feather));
mask-image: linear-gradient(var(--ma), black calc(var(--c) - var(--feather)),
                             transparent calc(var(--c) + var(--feather)));
```

`t=0` → `--c = -f` → 卡内全为 `transparent`，图2 完全不露；`t=1` → `--c = 100%+f` → 卡内全为 `black`，图2 完全上台。**两侧各留一个羽化宽度在卡外**是必要的：若把 stop 简单写成 `var(--t)*100% ± f`，`t=0` 时卡左缘会落在羽化带中间而露出半透明的图2。`--c` 刻意保持**未注册**（不写 `@property`）：它是 `--t` 的派生量，插值只发生在 `--t` 上，`--c` 每帧由 CSS 自行重算，避免两个量各处一套时间曲线。

**视差**：两层沿角度反向偏移，`0.35px/°`（14° 时约 5px）；`B` 层与 `--ry` 同号、`A` 层反号（抬起侧的图往后走）。两张是**不同构图**，没有视差时擦除感会盖过「同一张卡换了画面」。为防偏移露底，两层各 `scale(1.04)` 超尺寸。符号若目视觉得反了，翻转即可，不影响结构。

**高光 sheen**：`lens-sheen` 线性高光，中心随角度线性位移（约 `calc(50% + var(--ry) * 3%)`），`opacity` 随 `--t` 由 0.35 升到 0.5，`mix-blend-mode: soft-light`。**这是「塑料卡」区别于「淡入淡出」的关键一层**。因 `mix-blend-mode` 会创建层叠上下文并与板面 `light-dark` 底色互相污染，`lens-stage` 上 `isolation: isolate`（与板面 `isolation: isolate` 同一课：负 z/混合会掉到背景之下）。

**投影**：直接给 `lens-stage` 自身带 `box-shadow`，偏移量由角度算出（`calc(var(--ry) * -0.8px)` / `calc(var(--rx) * 0.8px + 12px)`）。⚠️ **不要用 `filter: drop-shadow()`**——`filter` 压平 `preserve-3d` 并让节点自成为 containing block；`box-shadow` 无此问题。

**不做 hover 放大**：Motion/GSAP 那类卡常配 `scale(1.02)`。这里不加——`perspective` 已经随倾角给了尺寸感，再加缩放会让超尺寸裁切的边界（`scale(1.04)` 那层）与视差偏移互相顶，收益小、耦合大。

**逃生门**：宿主 `data-blend="sweep" | "fade"`。默认 `sweep`；若 mask 每帧重绘在中低端机上不划算，一个属性切到 `fade`（两层 `opacity` 互补，走合成，无 mask），**不改 TS**。

**性能约束**：每帧只写 `transform`/`opacity`/`mask-image`/`box-shadow`，无布局属性；rect 缓存；`will-change: transform` 只在 `pointerenter`→`pointerleave` 期间挂着，进出加/撤（常驻会白占层）。

## 8. 降级、无障碍与动效偏好

| 情形 | 表现 | 机制 |
| --- | --- | --- |
| 无 JS | 两张图上下并列、各带面名；无倾斜、无卡 | `lens-face` 默认 `position: static`，`data-ready` 才叠合。与 `board-hint` 只在 `stamp-board[data-interactive]` 出现同理——不承诺不存在的交互 |
| `prefers-reduced-motion: reduce` | **不启 rAF、不做 tilt、不做 sheen 位移**；`data-blend` 强制 `fade`；`--t` 由 JS 直接写目标值，平滑交给 CSS `transition`（故 §5 的 `@property` 注册是这条路的前提） | `matchMedia` 判定；进度仍可被 `Enter` 改变，内容不丢 |
| 触屏（`pointer: coarse`） | 拖拽捻卡：按住横向拖动驱动角度与进度，松手弹回。零权限、零弹窗 | 与 hover 路径共用同一套 Pointer Events 与同一个弹簧。⚠️ 不用陀螺仪——iOS 13+ 需用户手势内授权，还得再做拒绝回退（参考②踩过） |
| 键盘 | 宿主 `role="slider" tabindex="0"`：`←/→` 与 `↑/↓` 把**目标角度**沿该方向步进 `0.25·maxTilt`（即按 4 下到位，重复按不越过满倾），`Enter`/`Space` 在「平放图1」与「满倾图2」间切面，`Home`/`End` 目标归零/推满，`Escape` 归零 | 见下方 ARIA 说明 |
| 焦点可见 | `:focus-visible` 给描边，随主题 | CSS |
| 双主题 | 卡边/阴影/高光全部取 `color.css` 令牌与 `light-dark()`，不写死色 | CSS |

提示文案不能假定有鼠标：SSR 同时输出「倾斜看另一面」与「拖动看另一面」两条，CSS 用 `@media (hover: hover)` / `(hover: none)` 二选一显示，**零 JS 参与**。

**ARIA 与「读两遍」，以及 slider 语义只能挂载后才有**：激活态（`data-ready`）下语义由宿主一处收口——`role="slider" tabindex="0"`、`aria-label` = 卡题、`aria-valuenow` = `t*100`、`aria-valuetext` = 当前面名（**面名播报由 `valuetext` 承担，因此不需要额外 `aria-live` 区域**，比 AnatomyFigure 的 `.iso-live` 更省）。代价是宿主里两张 `<img>` 的 `alt` 会与 `valuetext` 重复朗读，所以 `mountLenticular` 在置 `data-ready` 的同时把两层 `img.alt` 清为空串（面名已由各自图层的可见文字给出）。**但 `role="slider"` 绝不能写在 SSR 里**：`slider` 的子树是 presentational 的，静态并列态下它会把两张图的 `alt` 与面名一并从读屏里抹掉，而那一态负责的正是「无 JS 也是完整内容」。因此 slider 语义（role / tabindex / aria-*）全部由 JS 在 `data-ready` 那一刻补上，两态各自成立。这与站内已踩过的那类坑同源：同一句话若在 DOM 里真存两份（哪怕一份只用来撑布局），读屏就会把它读两遍；正解是只留一份真内容，呈现层的重复交给 `::before` 之类的生成内容。

## 9. i18n

两张源图中英共用，不复制。

**面名与 alt 不在这里定义**——它们已经在 `src/data/board.ts` 的 `BOARD_ITEMS` 里（`cloudsea-stamp` 与 `galaxy-stamp` 的 `title`/`alt`，已带 `pick()` 的 zh 回落、已跟主题）。`Board.astro` 从 `getBoardViews(locale)` 的现成 view 里取那两条，以字符串传给 `LenticularCard`。在 `UI_STRINGS` 再存一份「云海写生」会造出重复文案：改一枚邮票名得改两处，且新增的英文补译不会自动流到卡上。**只读不改**，所以 §4 的数据模型不变量仍然成立（将来若把那两枚邮票标 `draft: true`，卡会取不到 view——那是一条真实的风险，故 §10 补一条应对：取不到即构建报错，不允许静默降级为空字串）。

只有卡题与两条提示是界面文字，进 `src/lib/i18n.ts` 的 `UI_STRINGS`，zh/en 各一份：

| key | zh | en |
| --- | --- | --- |
| `boardLensTitle` | 光栅卡 | Lenticular Card |
| `boardLensHintPointer` | 倾斜看另一面 | Tilt to see the other side |
| `boardLensHintTouch` | 拖动看另一面 | Drag to see the other side |

`/en/board` 渲染同一个 `<Board locale="en" />`（现状已如此），词条自动生效。

## 10. 风险与对策

1. **`mask-image` 位置变化不进合成层，每帧重绘卡面**（约 512×292px）。对策：动效回归里量一次帧时；不达标即走 `data-blend="fade"` 逃生门（§7），不改结构。
2. **Safari 的 3D + mask 叠层**（vanilla-tilt README 自挂同类 known issue）。对策：`-webkit-mask-image` 前缀同写；明暗两主题 + 真机/Safari 目视一次。
3. **`mix-blend-mode` 污染板面底色**。对策：`lens-stage` 上 `isolation: isolate`（与板面负 z 沉底同一课）。
4. **View Transitions 重跑 body 脚本**。对策：`customElements.get` 守卫 + `disconnectedCallback` 里 `destroy()`（撤 rAF、撤监听），绝不让循环活过它的页面。
5. **`@property` 老浏览器不支持**。对策：默认值不靠 `initial-value`，靠宿主上的普通声明（§5）。
6. **卡依赖那两枚邮票的 view**（§9：面名与 alt 从 `BOARD_ITEMS` 只读）。若它们被改名、标 `draft` 或删除，`Board.astro` 会取不到。对策：用 `find` 取 view 后**取不到即 `throw`**（构建期报错），不允许 `?? ""` 静默降级为空标题。

## 11. 测试与验证

- **硬闸**：`bun run format:check`（或 npm 等价）+ `bun run build` 全绿。
- **`scripts/tests/lenticular-check.sh`（离线，构建期）**：沿用既有约定——备份/恢复 `.env` 并写入受控 `SITE_URL=https://example.com`，`npm run build`，然后断言 `dist/board/index.html` 与 `dist/en/board/index.html`：
  - 含 `<lenticular-card`，且宿主带 `role="slider"`；
  - **两张图的优化产物都出现在 HTML 里**（证明图2 不依赖 JS 也被请求到）；
  - 含 `customElements.define("lenticular-card"`；
  - CSS 里出现 `@property --t`（或等价注册名）与 `--feather`；
  - en 页出现英文词条、zh 页出现中文词条。
- **`scripts/tests/lenticular-motion-check.sh`（纯离线，不起浏览器）**：
  - **段 A —— 纯逻辑（`node --experimental-strip-types`，仿 `board-layout-check.sh` 既有的用法）**：物理与进度住在零依赖的 `src/lib/lenticular-spring.ts`，直接对函数断言：① `progressOf` 在 `amp` 上升段**单调非降**（「两个动画同步」的数学形式）；② 阈值 0.15/0.85 与 smoothstep 端点值；③ 从满倾释放到 0 的模拟里越过零点再收敛（回弹真的存在于数学里，不是 CSS transition 的单调衰减）；④ 固定子步的确定性：同一总时长用 1/30 与 1/120 的帧长驱动，结果差 < 1e-3；⑤ `sweepAngleOf` 在 `amp < 1%·maxTilt` 时返回上一个值；⑥ 由 `DEFAULT_SPRING` 反算的 ζ 与过冲率仍在 0.61/8.7% 附近（防参数被手滑改掉）。
  - **原计划的段 B（起 dev server 用 `curl` 复查 CSS/JS 产物契约）已取消**：`lenticular-check.sh` 已经在 `npm run build` 后对 `dist/` 逐条断言同一批契约，对 dev 中间态再查一遍是重复劳动。
  ⚠️ **本仓库的自动化测试不驱动浏览器**（`scripts/tests/` 里无一处）。实施期实测：`playwright-core@1.64` 直接 `chromium.launch()` 会失败（它要 `chromium_headless_shell-1248`，缓存里只有 `chromium-1208`），但**给定 `executablePath` 指到缓存里的 Chromium 就能起**——需要 `emulateMedia` 之类的真引擎验证时可以走一次性探针（依赖本机路径，因此不进 `scripts/tests/`）。`webkit-2248` 则根本起不起来（launch 立即关闭）。
- **真实浏览器测量清单（终端 playwright-cli 驱动，逐项记录数值）**：
  1. `mouse.move()` 分步移到卡右上角，逐帧读宿主 computed `--t` 与 `--ry` → 二者**单调同向**；
  2. 指针反向移回中心 → `--t` 跟着回落（可逆过渡）；
  3. `mouse.leave` 后采样 → `--t → 0`，且过程中出现过高于终值的峰值（回弹在渲染层也真发生）；
  4. `emulateMedia({ reducedMotion: "reduce" })` 下按 `Enter` → `--ry` 恒 0 而 `--t` 变到 1；
  5. 键盘 `Tab` 聚焦 + 方向键 → `aria-valuenow` 变化；
  6. 帧时：连续 60 帧的 rAF 间隔与 `mask-image` 重绘成本（超 16.7ms 即触发 §7 的 `fade` 逃生门评估）；
  7. **WebKit 引擎跑一次 1–3**（缓存里有 `webkit-2248`，可经 playwright-cli 指定）——这是 §10 风险 2「Safari 3D+mask 叠层」的实测入口，不能只靠目视。
- **手动核验（AGENTS.md 要求）**：dev 服务器下明/暗 × 宽/窄四组合目视；确认板面拖拽、右键径向菜单、双击 GlassBubble、分类标签、dev 保存布局全部不受影响（这是 §4 不变量的经验性反证）。
- **i18n 回归**：`bash scripts/tests/i18n-check.sh` 须仍全绿（动了 `UI_STRINGS`）。

### 实测记录（实施期，Chromium 1208 + dev server，2026-10-22）

帧时（每帧派发一个新指针位置，160 帧；单位 ms）：

| 条件 | sweep p50/p95/p99/max | fade p50/p95/p99/max |
| --- | --- | --- |
| DPR 1，卡 512×293（出厂尺寸） | 16.7 / 66.2 / 1566 / 2283（含一次外部停顿，见下） | 16.7 / 16.8 / 17.6 / 17.6 |
| DPR 1，卡拉宽到 666×381 | 16.7 / 34.3 / 183 / 183 | 16.7 / 17.4 / 33.3 / 33.4 |
| DPR 2，卡 512×293 | 16.7 / 17.7 / 183 / 200 | 16.7 / 17.0 / 17.5 / 17.6 |
| DPR 2，卡 666×381 | 16.7 / 34.1 / 183 / 183.5 | 16.7 / 32.8 / 33.5 / 34.4 |
| 终端 playwright 侧独立复测（DPR 1，512×293，各 3 轮） | p50 16.7 / **p95 17.60** / max 18.5 / longtask 0 | p50 16.7 / **p95 17.67** / max 19.97 / longtask 0 |

**结论与决策：默认保持 `sweep`。** 支撑它的只有两条：① 在**实际发布尺寸**（512×293）上两模式无可辨差异（DPR 2 下 17.7 vs 17.0；终端侧独立复测各 3 轮：sweep p95 17.60 / fade p95 17.67，longtask 均为 0），而第一行 sweep 的 p99=1566ms 是一次外部停顿（HMR/加载）污染，不能算进成本；② `fade` 逃生门保留且**只需改一个属性**即可切换，低配设备或放大版式时用得上。

原判据「从未出现 ≈33ms 的整帧丢失」**已删除**：它被同一张表格的 sweep 666×381 行（p95 34.3 / 34.1）正面推翻，而 fade 在同一尺寸也读到 32.8。同理，计划里「sweep p95 ≤ 16.7ms 才保持 sweep」这个阈值本身不成立——两模式 p50 都恰好等于 vsync 的 16.7ms，谁都不达标。

测量方法学上还有一处**未分离的归因**：`applyPointer` 每次 `pointermove` 都读 `stage` 的四个 layout 属性（`offsetLeft/Top/Width/Height`），而上一帧 rAF 刚写过宿主内联样式 → 强制 style+layout。这项成本与 blend 模式无关（fade 一样写 `--t`、一样读那四个数），所以 666×381 那组尾部差异不能干净地归给「mask 每帧重绘」；要重新归因，先把四个偏移随 rect 一起缓存再测。

**reduced-motion 的真渲染验证**（Chromium 的 `reducedMotion: "reduce"` 上下文，这条是浏览器交互工具翻转不了媒体查询而欠下的证据）：挂载后 `lens-stage` computed `transform: none`、`lens-sheen` `display: none`、`lens-face[data-b]` `mask-image: none` 且 `opacity: 0`（= 初始显示图一 ✓）；`Enter` 之后 `--t` = 1、`opacity` = 1、`aria-valuenow` = 100、`aria-valuetext` = 星夜独行，`transform` 仍为 `none`。挂载前的静态并列期 `opacity` 读起来是 1，那是 `[data-ready]` 尚未成立的设计态，不是缺陷。

该项清单初次验证时**漏读了 `translate`**，因而漏过一个真实缺陷：`lens-face{translate:none}` 的特异度输给基础规则 `lens-face[data-a]{translate:…}`，reduce 下两层仍以 ±4.9px 互相滑过（终审时发现并已修：逐层选 `[data-a]`/`[data-b]`，同时补上产物断言）。清单从此补一项 `translate`。

**仍缺的引擎**：本机 WebKit 无法启动（`webkit-2248` 与 `playwright-core@1.64` 期望版本不匹配，launch 立刻关闭），所以 §10 风险 2「Safari 3D + mask 叠层」**只由 Chromium 侧的 `-webkit-mask-image` 前缀与 CSS 断言覆盖，未在真实 Safari 上验过**——需要人工在 Safari/iOS 上目视一次。

## 12. 交付顺序（供 writing-plans 细化）

1. `lenticular.css` + `LenticularCard.astro`：SSR 并列态与 `data-ready` 叠合态、`@property` 与兜底声明、`--ma/--feather` 骨架。
2. `i18n.ts` 词条 + 双份提示的 `@media (hover)` 呈现。
3. `Board.astro` 落位（grid 下、hint 上），先静态不带动效。
4. `lenticular.ts`：rect 缓存 + Pointer 输入映射 + 弹簧 + 写 4 个数。
5. mask 扫掠 / 视差 / sheen / 投影 的 CSS 消费，与 `data-blend` 逃生门。
6. reduced-motion 分支与键盘路径 + ARIA。
7. `lenticular-check.sh`、`lenticular-motion-check.sh`，随后 `docs/components/lenticular-card.md`。

## 13. 验收对照（原始需求 → 落点）

| 原始需求 | 机制落点 |
| --- | --- |
| 初始展示图片 1 | `--rx/--ry/--t` 兜底声明 0 → 边界在卡外，图2 不露（§5/§7） |
| 移到不同位置（如右上角）产生 3D 倾斜 | `pointermove` → `targetRx/Ry`，`maxTilt 14°`，`perspective 900px`（§6） |
| 图1 平滑渐变为图2 | mask 软边界扫掠 + 9% 羽化（§7） |
| 切换进度与倾斜实时联动、两动画同步 | `--t` 是 `--rx/--ry` 的纯函数，同一个弹簧（§6） |
| 持续过渡、到位完成 | smoothstep + amp 归一化（§6） |
| 自然惯性、阻尼、回弹 | ζ≈0.61、过冲 8.7%、约 500ms 收住（§6） |
| 反向移动平滑反切 | `t(amp)` 单调，反向即反切（§6） |
| 离开恢复初始 | 目标归零 + 弹簧回弹（§6） |
| 不需要真实竖线 | 无条纹、无脊线（§1 非目标） |
| 优先 `transform`/`opacity`、避免布局、合成友好 | §7 性能约束：每帧 4 个变量、无布局属性、`will-change` 生命周期、rect 缓存 |
| 兼顾触屏设备 | `pointer: coarse` 拖拽捻卡，零权限（§8） |
| `prefers-reduced-motion` | 不启 rAF、无 tilt、`fade` + CSS transition（§8） |
| Astro 集成：优先原生 JS + CSS，保持静态渲染 | 路线 A：零依赖、自主定制元素、SSR 出全部内容（§2/§3/§5） |
| 若简单混合不够再上 Three.js | 判定不成立：剥掉条纹后 shader 只剩昂贵淡入淡出，且稳定性债由我们背；逃生门是 CSS 的 `fade`，不是 WebGL（§2/§7） |

## 14. 已锁定决策回顾

- 路线：**A 全手写**；否决 B（vanilla-tilt：无真弹簧 + 取不到当前渲染角度）、C（motion：为一条弹簧引库）、D（Three.js：成本花在拆条纹与稳住 GL 上）。
- 落位：`/board` 板面网格**下方**，不进 `board-grid`，不是 `board-piece`。
- 数据模型：**不改** `BoardItem`/`getBoardViews`/写回逻辑。
- 驱动量：**倾斜幅度**（任意方向倾到位都切换；回弹拖画面一起回）。
- 混合：**软边界扫掠，方向跟随倾斜主轴符号**；附带轻微视差 + sheen。
- 形态：横版 `min(32rem,100%)` × `aspect-ratio 1.75`，无齿孔，居中。
- 触屏：**拖拽捻卡**，不用陀螺仪。
- 素材：`DONGLONGDONG-2.jpg`（云海写生）→ `DONGLONGDONG-3.jpg`（星夜独行），同角色同姿态族、白昼→星夜，符合光栅卡的「同构图换状态」选图标准。
