# HairlineFigure 细线插图组件

一幅等距「细线」插图，会回应指针：抽屉柜被拉开一层、牌阵下的那张立起、衣架被拂过侧让……
适合放在列表页页头或文章里做点睛的技术插画。

封装自 [Hairline](https://hairline.lucasmarkes.com/)（npm 包
[`@lucasmarkes/hairline`](https://www.npmjs.com/package/@lucasmarkes/hairline)）的 vanilla
工厂，按本站惯例只走**非 React** 路线，遵循「SSR 出占位宿主 + 客户端激活」范式。

## 文件位置

- 组件：`src/components/HairlineFigure.astro`（渲染 `<hairline-figure>` 宿主 + 定义元素 + `<style>` 令牌映射）
- 注册表：`src/lib/hairline.ts`（`HAIRLINE_FIGURES` 已接入的图形表 + `HAIRLINE_FIGURE_META` 中/英说明）
- 样式：无独立 CSS 文件，令牌映射写在组件的 `<style>` 里；宿主用带连字符的 `<hairline-figure>` 元素。

## 快速上手

```astro
---
import HairlineFigure from "@/components/HairlineFigure.astro"
---

<HairlineFigure figure="drawer" label="三层抽屉的归档柜" play />
```

## Props

| 名称 | 类型 / 取值 | 默认 | 说明 |
| - | - | - | - |
| `figure` | `HairlineFigureName`（见下表）| 必填 | 选哪幅图形 |
| `label` | `string` | 包内置英文描述 | 无障碍名称，按当前语言传入 |
| `intensity` | 0 – 1 | `0.5` | 指针应答强度（克制 → 强烈）|
| `play` | `boolean` | `false` | 无指针时自行巡回演示；指针/焦点到来即交还控制权 |
| `width` | CSS 长度 | 包内置 | 宿主宽度；**高度按包内置的 5:4 随动，不可改宽高比** |
| `plate` | CSS 颜色 | `--background` | 图形所坐的底色，覆盖 `--hairline-plate`（用于遮挡后方的线，须等于其底色）|

### 已接入的图形（`HAIRLINE_FIGURES`）

| 名字 | 说明 |
| - | - |
| `riffle` | 八张牌组成的牌阵：指针下的那张立起，邻牌依次前倾 |
| `sieve` | 三只叠在底盘上的试验筛：指针高度抽出一只，网眼全空 |
| `phosphor` | 七乘七余辉点阵：静止时自播放循环，指针划过的点像余辉一样渐隐 |
| `drawer` | 三层抽屉的归档柜：指针高度抽出一只，隔板上空空如也 |
| `rail` | 一根衣架杆上七个空衣架：指针拂过依次侧让，最近的最大，随后回正 |
| `settle` | 十二块瓷砖歪斜散落在 hub 周围：指针靠近时滑正成一棵树，连线收拢 |
| `terrain` | 基座上的八十一根立柱绕指针升起：`intensity` 决定升起的范围 |

> 包里共 33 幅可用。想接入新的一幅：在 `src/lib/hairline.ts` 里 `import` 并进 `HAIRLINE_FIGURES`
> 登记（包是 `sideEffects: false` 的 ESM，用不到的会被 tree-shake）。若要在画廊展示，同步补
> `HAIRLINE_FIGURE_META`，漏登记会编译报错。

## 主要模式

- **应答指针**：默认行为，指针进入宿主盒即触发对应动作，`intensity` 控制幅度。
- **`play` 自播**：无指针时自行演示，适合页头这种「不一定有鼠标经过」的位置。
- **页头集成**：列表页统一经 [`ListingHead.astro`](../../src/components/ListingHead.astro)
  的 `figure` / `figureLabel` / `figureWidth` 传入，并内置了各图形的**墨迹光学补偿表**
  `INK_COMPENSATION`（宿主按 5:4 留了大量透明内边距，对齐要按实际墨迹包围盒下挂 + 平移，
  不能按盒边）。新图形进页头时，需在该表补一行实测值。

## 无障碍与降级

- 宿主是无障碍名称承载点：`label` 传入即作为图形名称；不传则用包内置英文描述。
- 交互（应答指针）在客户端激活；SSR 先出占位宿主，脚本加载后由包绘制。
- `prefers-reduced-motion` 由包内部处理，动效自动收敛。

## 注意事项

- **不可改宽高比**：包把指针坐标按宿主矩形线性映射回 400×320 画布，改比例会让应答点错位，
  所以 `width` 只给宽度、高度固定 5:4 随动。
- **`plate` 必须等于图形所坐的底色**（它用来遮挡后方的线），默认取 `--background`；
  图形落在别的底色上时才用 `plate` prop 覆盖。
- **令牌映射**：组件 `<style>` 把包的六个主题变量映射到站点色板，随 `light-dark()` 自动明暗
  ——`--hairline-plate→--background`、`--hairline-hi→--foreground`、`edge/mid/lo→--gray-9/7/6`，
  `--hairline-stroke:1` 对齐站点 1px 细线语言。想改观感改这里。
- **双语孪生页**：在 `/en/` 对应页放同样图形时，`label` 传英文。

## 完整示例（页头插图）

`src/pages/blog/index.astro` 里经 `ListingHead` 挂一幅抽屉柜：

```astro
<ListingHead
  kicker={`~/blog · ${posts.length} posts`}
  title={t("zh", "blogTitle")}
  desc={t("zh", "blogDesc")}
  figure="drawer"
  figureLabel="三层抽屉的归档柜，指针划过哪一层就抽出哪一层"
/>
```

直接在正文里用则：

```astro
<HairlineFigure figure="terrain" intensity={0.7} width="240px" label="绕指针升起的立柱阵" />
```
