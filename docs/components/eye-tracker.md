# EyeTracker 眼球跟随组件

一只带两只眼睛的小球：眼睛会注视你的指针，并在指针离开时回正、时不时自己眨眨眼。
点击它会从右下角弹出一个小气泡、逐字打出一句话。适合做页面里俏皮的视觉点缀或站点标记。

移植自 [Bencho](https://bencho.dev) 的 React 组件
「[Eye tracker](https://bencho.dev/blocks/eye-tracker?c=eye-tracker&theme=light)」（
[MIT 授权](https://bencho.dev/licence)），按本站惯例改写为**原生自主定制元素**（不引入 React），
遵循「SSR 出静态脸 + 客户端激活交互」范式。

## 文件位置

- 组件：`src/components/EyeTracker.astro`（SSR 出静态 SVG 脸 + 定义 `<eye-tracker>` 元素）
- 逻辑：`src/lib/eye-tracker.ts`（弹簧跟随、眨眼、点击气泡、形状变形，及构建期烘脸用的助手）
- 样式：`src/styles/eye-tracker.css`，已在 `src/layouts/Layout.astro` 中**全局引入**，
  用的时候无需再管 CSS。

## 快速上手

```astro
---
import EyeTracker from "@/components/EyeTracker.astro"
---

<EyeTracker />
```

放在任意 `.astro` 页面里即可，样式与交互脚本会被 Astro 自动打包随页加载。
开发验证：`npm run dev`；提交前：`npm run format`（只格式化改动文件）+ `npm run build`。

## Props

全部可选，均有默认值。数值型 `follow/bounce/size` 会做区间约束。

| 名称 | 类型 / 取值 | 默认 | 说明 |
| - | - | - | - |
| `shape` | `Ball` \| `Circle` \| `Cube` \| `Pill` \| `Hexagon` \| `"Hex flat"` | `Cube` | 小球身体的轮廓；运行期改 `data-shape` 会做「变形」而非硬切 |
| `eyes` | `Slant` \| `Dots` \| `Squares` | `Slant` | 眼型（两只同尺寸的圆角矩形，仅宽高/圆角不同） |
| `size` | 16 – 180 | `100` | 小球直径（px）。外层框固定 200×200，能容纳最大球且不会因尺寸重排 |
| `follow` | 0 – 100 | `60` | 朝指针转向的幅度 |
| `bounce` | 0 – 100 | `30` | 转向的回弹/过冲强度 |
| `eyeScale` | 倍数 | `1` | 眼睛整体大小（相对身体）；小球建议放大眼睛才看得清 |
| `eyeWidth` | 倍数 | `1` | 眼睛宽度（更细或更粗的笔画） |
| `eyeHeight` | 倍数 | `1` | 眼睛高度 |
| `eyeRound` | 0 – 1 | `1` | 眼睛圆角；1 全圆，<1 逐渐变方 |
| `idle` | `boolean` | `false` | 徽标模式：不跟指针，正视前方，每 5 秒张望一次、每 2 秒眨一次 |
| `logo` | `boolean` | `false` | logo 变体：体=墨、眼=底色（画成站点标记本身，而非玩具） |
| `label` | `string` | `"A ball with two eyes that follows the cursor"` | 无障碍名称（`role="img"` 的 `aria-label`） |

> `idle` 与 `logo` 是两种互斥气质：默认是「跟随指针的玩具」（可点击冒气泡），
> `idle` 是「自播的徽标」，`logo` 是「按主题反色的标记」。`idle` 模式下不渲染点击气泡。

## 跟随范围（默认只在球自己的框内）

小球只在指针进入**它所在的那块卡片**时才跟随、离开即回正——避免「满屏小球都追着
光标转」的噪音。默认这块卡片就是小球自身的 200×200 盒。想让它在更大范围内跟随，
给某个祖先元素加 `data-eyt-frame`：

```astro
<div data-eyt-frame>
  <EyeTracker />
  <!-- 指针在此区域内都会让小球注视 -->
</div>
```

## 无障碍与降级

- `role="img"` + `aria-label`：读屏能听到这是「会跟随指针的两眼小球」。
- **无 JS 也有脸**：构建期就把「正视、双眼居中」烘进 HTML，无脚本 / 首屏 / 截图都成立。
- **`prefers-reduced-motion`**：命中时取消弹簧与变形，直接落位，不做多余动画。

## 注意事项

- **双语孪生页**：`/blog` 这类页面有 `/en/` 孪生文件。两版都放时，各自 import 并渲染，
  英文页记得传英文 `label`（`label` 是组件属性，不走 `t()` 字典）。
- **配色 / 令牌**：CSS 不使用 Bencho 原本的设计令牌，而是映射到本站语义令牌——
  身体 = `--muted`（表面色）、眼睛 = `--foreground`（墨色）、logo 变体的镂空 = `--background`，
  UI 字体 = `--font-sans`。因为 `--muted`/`--foreground` 自带 `light-dark()`，明暗自动跟随
  `<html data-theme>`。想改小球观感，改这些映射即可（见 `src/styles/eye-tracker.css` 顶部注释）。
- **命名元素**：宿主是自定义元素 `<eye-tracker>`（带连字符，合法命名），不是 `<div>`。

## 完整示例（放在 /blog 列表页）

在 [`src/pages/blog/index.astro`](../../src/pages/blog/index.astro) 里，作为列表上方的一处点缀：

```astro
---
import EyeTracker from "@/components/EyeTracker.astro"
// … 其余 import 不变
---

<Layout>
  <!-- MetaPage / ListingHead 之后、列表 <ul> 之前插入 -->
  <div data-eyt-frame style="display:flex; justify-content:center;">
    <EyeTracker shape="Cube" eyes="Slant" label="一只跟着你目光的小球" />
  </div>
  <ul>
    {posts.map((post) => <BlogCard post={post} />)}
  </ul>
</Layout>
```

英文孪生页 [`src/pages/en/blog/index.astro`](../../src/pages/en/blog/index.astro) 若要同样呈现，
补上同样的 `<EyeTracker>` 并把 `label` 换成英文。
