# LenticularCard 光栅卡组件

一张会「倾斜换画面」的数字光栅卡：平放时是画面一，把它倾到位，画面二沿倾斜方向被软
边界扫出来。倾斜角度与切换进度由**同一个量**驱动，所以两者永远同步；松手后靠弹簧回弹
退回初始状态。不做真实光栅竖条纹（那是另一回事：这里是「换画面」，不是「分带」）。

设计出处：[spec](../superpowers/specs/2026-10-21-lenticular-card-design.md)（含为何不引
vanilla-tilt / motion / Three.js 的逐条论证）；实施步骤：
[plan](../superpowers/plans/2026-10-21-lenticular-card.md)。

## 文件位置

- 组件：`src/components/LenticularCard.astro`（SSR 出静态卡 + 注册 `<lenticular-card>`）
- 物理：`src/lib/lenticular-spring.ts`（**零 import、零 DOM** 的纯函数：输入映射、固定
  子步弹簧、进度曲线、扫掠方向、键盘目标。能被 `node --experimental-strip-types` 直接
  加载断言，所以别给它加 import）
- 接线：`src/lib/lenticular.ts`（`mountLenticular()`：Pointer/Keyboard 事件、rAF、写
  CSS 变量与 ARIA、`destroy()`）
- 样式：`src/styles/lenticular.css`，已在 `src/layouts/Layout.astro` 中**全局引入**
- 在用它的地方：`/board` 与 `/en/board` 的「光栅卡」小节里（`src/components/LenticularSection.astro`，两张图直接 import，不再经 `getBoardViews`）
- 回归：`scripts/tests/lenticular-check.sh`（构建产物断言）、
  `scripts/tests/lenticular-motion-check.sh`（物理与进度的纯函数离线断言）

## 快速上手

```astro
---
import cloudseaImg from "@/assets/board/DONGLONGDONG-2.jpg"
import galaxyImg from "@/assets/board/DONGLONGDONG-3.jpg"
import LenticularCard from "@/components/LenticularCard.astro"
---

<LenticularCard
  locale="zh"
  srcA={cloudseaImg}
  srcB={galaxyImg}
  altA="一幅横版邮票插画……少年坐在岩石上对着巨大积雨云作画"
  altB="一幅横版邮票插画……少年提着灯仰望银河星空"
/>
```

`altA/altB` 收**已按当前 locale 取好的字符串**。卡不再叠面名文字，所以只需两张图与两段
替代文本；`/board` 上的封装 `LenticularSection.astro` 直接 import 那两枚邮票的原图，与
`getBoardViews` 解耦（这两枚邮票只有 zh 文案，en 本就回落中文）。

## Props

| 名称 | 类型 / 取值 | 默认 | 含义与范围 |
| --- | --- | --- | --- |
| `locale` | `"zh" \| "en"` | 必填 | 决定卡题与提示文案 |
| `srcA` / `srcB` | `ImageMetadata` | 必填 | 画面一 / 画面二，走 Astro 图片优化 |
| `altA` / `altB` | string | 必填 | 静态并列态的图片替代文本；挂载后由 JS 转成 `aria-valuetext` 并清空 `alt`（见「无障碍」） |
| `maxTilt` | number（度） | `14` | 满倾角度。倾到 `0.85 × maxTilt` 即完成切换 |
| `stiffness` | number | `170` | 弹簧刚度。与 `damping` 一起决定阻尼比 |
| `damping` | number | `16` | 阻尼。`16/(2√170) ≈ 0.61` → 过冲约 8.7%，约 500ms 收住 |
| `blend` | `"sweep" \| "fade"` | `"sweep"` | `sweep` = 软边界扫掠（方向跟倾斜符号）；`fade` = 两层 opacity 互补 |
| `class` | string | — | 附加到宿主上，用于外层布局 |

## 模式 / 取值详解

- **驱动量是「倾斜幅度」而不是指针位置**：进度 `--t = smoothstep(clamp((amp − 0.15) /
  0.70))`，其中 `amp = √(rx² + ry²) / maxTilt` 取的是**当前实际渲染角度**。因此任意方向
  倾到位都能切换，反向倾倒自动反切，回弹时画面跟着角度一起回。
- **`blend="sweep"`（默认）**：`mask-image` 的一条羽化边界（`--feather: 9%`）从卡外
  `-f` 推到卡外 `100% + f`；推进方向由 JS 按倾斜主轴符号写成 `--ma`（`90/270/0/180deg`），
  即「抬起哪一侧，哪一侧先转出旧画面」。`amp < 1%` 时沿用上一次方向，避免平放附近每帧翻面。
- **`blend="fade"`**：关掉 mask，两层 opacity 互补。当卡被放得很大或跑在低配设备上时用
  它——实测 mask 每帧重绘不合成，卡面 666×381 时 p95 帧时 34ms（fade 17ms）；出厂尺寸
  512×293 下两者不可辨。数值见 spec §11「实测记录」。
- **`reducedMotion`**：`prefers-reduced-motion: reduce` 时不启 rAF、不做倾斜、不做高光，
  画面切换改由 CSS `transition: --t` 承担（`@property` 注册正是为了让它能被 transition）。

## 无障碍与降级

- **slider 语义由 JS 挂载时才挂**：`mountLenticular` 在写 `data-ready` 的同时补
  `role="slider"`、`tabindex="0"`、`aria-label`（卡题）、`aria-valuemin/max/now`、
  `aria-valuetext`（当前面用该层图的 `alt` 播报），先把两层 `img.alt` 取下来存好再清为空串。
  为什么不能把 `role="slider"` 写在 SSR 里：`slider` 的子树是 presentational 的，静态并列
  态下它会把两张图的 `alt` 从读屏里抹掉——而静态态负责的正是「无 JS 也是完整内容」。
  `aria-valuetext` 已承担播报，因此卡内**不需要** `aria-live` 区域。无 JS 的并列态保留
  完整 `alt`，那里没有 slider 替它说话。
- 键盘：`←/→/↑/↓` 把目标角度按 `0.25 × maxTilt` 一格推进（按 4 下到位，钳在满倾），
  `Enter`/`Space` 在「平放画面一」与「满倾画面二」之间往返，`Home`/`Escape` 归零，
  `End` 推满；这些键都 `preventDefault()`，否则会变成滚页面（注意本站滚动源是
  `<page-scroll>`，验证时读它的 `scrollTop`，`window.scrollY` 恒为 0）。
- 触屏：`pointer: coarse` 下按住拖动（`setPointerCapture`）驱动角度，松手回弹；拖出卡面
  只会钳在 ±maxTilt。不用陀螺仪——iOS 13+ 要在用户手势里申请授权，拒绝后还得再写一套回退。
- 无 JS：SSR 出的是**两张上下并列的图**（各带 `alt`），两张都是完整内容；客户端挂载时写
  `data-ready`，CSS 才把它们叠成一张卡。所以「加载后短暂看到并列两张」是设计态，不是闪屏 bug。
- `:focus-visible` 描边跟全站 `--accent`；明暗双主题下卡的轮廓靠 `lens-stage::after` 那一圈 1px
   rim（纯黑投影叠在近黑板底上等于隐形，画面大面积深色的那面会整张沉进背景）。

## 注意事项

- **渲染契约**：JS 每帧只往宿主写 `--rx`/`--ry`/`--t`（+ 离散 `--ma`，仅变化时写），
  全是**无单位数字**，CSS 侧自己补单位（`calc(var(--rx) * 1deg)`）。想调手感/长相，在
  `lenticular.css` 里改数值即可，不必动 TS；反过来改 TS 的输入映射也不影响 CSS。
- 别在 3D 节点上用 `filter`（会压平 3D 并让节点自成为 containing block），投影走
  `box-shadow`。`scripts/tests/lenticular-check.sh` 里有一条源码级断言守着这点。
- 卡是**单个平面**：只让 `lens-stage` 做一次 3D 变换，两层画面是共面兄弟，**不需要**
  `transform-style: preserve-3d`。
- **轮廓不能靠 `box-shadow: inset` 画**：inset 阴影绘制在后代内容**之下**，会被 1.04
  超尺寸的不透明 `.lens-img` 整圈盖住（实测把 rim 改成 12px 洋红也完全看不见）。
  要画在画面之上就用 `lens-stage::after` 覆盖层（`pointer-events: none` + `z-index`）。
- 卡与 `board-grid` 的上间距用 `--space-s`（≥16px）：实测满倾（rx≈ry≈13.8°）时 3D 包络
  上移 15.2px，14px 仍会咬进网格底边 1.2px。改 `maxTilt` 或 `perspective` 时重算这个值。
- 交互几何取「宿主 rect + `lens-stage` 的 layout 偏移」，不能用
  `stage.getBoundingClientRect()`——那是变换后的包络盒，倾角一变映射坐标系就跟着漂
  （自反馈抖动）。宿主因此必须 `position: relative`。
- 卡的两面图直接 import `src/assets/board/DONGLONGDONG-2.jpg` 与 `-3.jpg`（即板上
  `cloudsea-stamp`/`galaxy-stamp` 的原图），与 `getBoardViews`/`BOARD_ITEMS` 解耦：换图改
  `LenticularSection.astro` 的两行 import 即可，不再依赖板上的物件顺序或 draft 状态。
- 静止后循环会自己停（`will-change` 同时撤掉），下一次输入重新拉起。每个输入事件都走
  `pulse()`：只靠 `pointerenter` 起循环会在「指针本来就搭在卡面上」时永不响应。
- `pointer capture` 对不可信 `pointerId` 会抛 `NotFoundError`，代码里是试探式的（try/catch
  + `hasPointerCapture`）；把它写在 `start()` 之前会让整个 handler 中断、拖拽状态毒化。
- 断言里凡要靠带引号的字符串定位产物，注意 esbuild 会把部分字符串字面量压成**模板字面量**，
  且必须钉到具体文件（`LenticularCard.*.js` / `Layout.*.css`）——`setPointerCapture`、
  `preventDefault`、`prefers-reduced-motion` 在收藏板自己的产物里也存在。
- **尚未在真实 Safari/WebKit 上验证** 3D + mask 叠层（本机起不了 WebKit）；目前靠
  `-webkit-mask-image` 前缀与 CSS 断言兜着，改动这块时请人工开 Safari 看一眼。

## 完整示例

`/board` 上的实际用法在 `src/components/LenticularSection.astro`：直接 import 两张原图、
就地写中文 alt，再交给 `LenticularCard`，与 `getBoardViews` 解耦：

```ts
import cloudseaImg from "@/assets/board/DONGLONGDONG-2.jpg"
import galaxyImg from "@/assets/board/DONGLONGDONG-3.jpg"

const altA =
  "一幅横版邮票插画（@DONGLONGDONG COLOR #106），少年坐在岩石上对着巨大积雨云作画"
const altB =
  "一幅横版邮票插画（@DONGLONGDONG COLOR #97），少年提着灯仰望银河星空"
```

```astro
<LenticularCard
  locale={locale}
  srcA={cloudseaImg}
  srcB={galaxyImg}
  altA={altA}
  altB={altB}
/>
```

`LenticularSection` 渲染在板面的「光栅卡」`ListingHead` 之下（`/board` 与 `/en/board`），
独立于 `board-grid`，**不是** `board-piece`：因此不参与拖拽、右键径向菜单、双击 GlassBubble
预览，也不被 dev「保存布局」写回（倾斜是运行时动画，不是几何）。
