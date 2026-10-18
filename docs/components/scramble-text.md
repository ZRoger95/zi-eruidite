# ScrambleText 解码文字组件

一行乱码从左到右逐字锁回真文本的「解码」效果（scramble / decode text）。适合页头、
小标题、提示词这类短文本：读者先看到一片翻动的符号，看着它停成自己要读的那句话。

参考实现是 [kinetics.colorion.co](https://kinetics.colorion.co/#library) 的一个 React
hook（`useState` + `setInterval` 逐帧换字）。那个 state 只是组件早已知道的那个字符串
的一份复制，所以框架在这里本来就是多余的一层：本站改写为**原生自主定制元素**
`<scramble-text>`，遵循「SSR 出最终文本 + 客户端激活动画」范式，并顺手补掉了原片段
的四个毛病（见下「它替你做掉的四件事」）。

## 文件位置

- 组件：`src/components/ScrambleText.astro`（SSR 出一份真文本 + 注册 `<scramble-text>`）
- 逻辑：`src/lib/scramble-text.ts`（帧时钟、逐字锁定、`play()` / `destroy()`）
- 样式：`src/styles/scramble-text.css`，已在 `src/layouts/Layout.astro` 中**全局引入**，
  用的时候无需再管 CSS。
- 在用它的地方：主页页头的站名（`src/pages/index.astro` 与 `src/pages/en/index.astro`，
  `face="inherit"`）。

## 快速上手

```astro
---
import ScrambleText from "@/components/ScrambleText.astro"
---

<h1><ScrambleText text="KINETICS" /></h1>
```

## Props

| 名称 | 类型 / 取值 | 默认 | 说明 |
| - | - | - | - |
| `text` | `string` | — | 要解码的那段文字。**只收纯文本**：逐码点替换，塞富文本会塌 |
| `trigger` | `load` \| `hover` \| `manual` | `load` | 何时开演 |
| `speed` | `number`（毫秒，下限 1） | `35` | 一帧毫秒数。这是**节奏**不是刷新率：帧数按已流过的时间算 |
| `stagger` | `number`（帧） | `1.2` | 右边相邻字符比左边晚锁定几帧 |
| `settle` | `number`（帧） | `14.4` | 单个字符持续乱码多少帧后锁定 |
| `delay` | `number`（毫秒，下限 0） | `0` | 开演前等多少毫秒（进帧时钟当领跑，不另开 timer） |
| `pool` | `string` | `!<>-_/[]{}=+*^?#` | 乱码符号池 |
| `face` | `mono` \| `inherit` | `mono` | 乱码用什么字面。`inherit` 连字距一起继承，标题解码完仍是那行标题 |
| `class` | `string` | — | 追加到宿主，用来从外面定位它（见「注意事项」的 `id`） |

只有 `speed`（下限 1）与 `delay`（下限 0）在代码里兜了底，其余旋钮照单全收——调坏了
也就是难看，不会崩。整段时长 ≈ `(settle + (字数 − 1) × stagger) × speed` 毫秒；默认
节奏下 8 个字符约 0.8s，25 个字符约 1.5s。

## 三种触发

- **`load`** —— 挂载即演一次（页面停留期间只此一次）。首屏页头用这个，可配 `delay`
  让几行文字错开落定。
- **`hover`** —— 指针每次进入宿主都重演一遍。触屏上等价于一次点按落点。
- **`manual`** —— 挂载时不演（显示的就是最终文本），由外部调元素上的 `play()`：

```ts
const el = document.querySelector("scramble-text.hero") as
  | (HTMLElement & { play(): void })
  | null
el?.play()
```

`play()` 对三种 trigger 都可用（`hover` 的元素也能被程序重演），并且**总是赢过它打断
的那一跑**：先 `cancelAnimationFrame` 再开新表，不会出现两套帧循环抢着写终态。

## 它替你做掉的四件事

1. **宽度不抖**。随机符号未必和原字符等宽，逐帧换下去整行会左右蠕动。这里盒子由宿主
   自己的 `::before`（`content: attr(data-text)`，`visibility: hidden`）撑住，乱码层
   绝对定位铺在同一个盒子里——换多宽的符号都推不动这一行，而 DOM 里只有**一份**真文本。
   宿主另带 `overflow: clip`：万一某帧乱码真比盒子宽（非等宽字面下换行点漂了），
   宁可裁掉，也不把宿主撑大或盖到下面的正文上。
2. **码点而非代码单元**。`text.split("")` 会把一个 emoji 劈成两半各自翻动；这里用
   `[...text]`，`🚀` 永远是一个槽位。
3. **后台标签页不结巴**。`setInterval` 在隐藏页被节流到 1s 一次，回到前台就变成慢速
   打字机。这里跑 `requestAnimationFrame`，帧号 = 已流过时间 ÷ `speed`，暂停就原地停。
4. **重入安全**。View Transitions 重跑 body 脚本时有 `customElements.get()` 守卫；
   断开时 `destroy()` 掐帧并把文本写回终态，不把半截乱码留给下一次挂载。

空格（`\s`）永不参与替换——它是行可以断的地方，被换成符号会让整行重排。随机数恰好
抽到该字符自己时会沿池子往后挪一格，避免「提前锁定」的错觉。

## 无障碍与降级

- **DOM 里只有一份真文本**（`.sct-live`）。撑盒子的那层是 `::before` 生成的内容，
   `visibility: hidden` 只不出像素、照样占位，既不进无障碍树也不进正文抽取——所以
   拿它去包页头 `<h1>` 里的站名，爬虫与读屏看到的仍是一遍标题，不是两遍。
- **无 JS 也读得到**：SSR 写进去的就是最终文本，乱码层本来就住在它身上；没脚本时
   一个帧都不演，屏幕上是一句干净的话。
- **动画期间**：被换符号的正是那份真文本，所以那一刻读屏朗读、用户选中复制拿到的
   是乱码（约 1s 内落定）。这是「让文字自己演」的固有代价，组件把它限制在
   一个文本节点里；要避开就把 `trigger` 设为 `manual`，只在用户主动要它时演。
- **`prefers-reduced-motion: reduce`**：`play()` 直接把终态写上去，一帧乱码都不演。
- 颜色、字号全部继承上下文，组件自己不定义任何调色令牌；字面由 `face` 定。

## 注意事项

- **`id` 传不进去**。Astro 把 `id` 保留给 scoped style 机制，`<ScrambleText id="x">`
  会被吞掉。要定位它就用 `class`（`class:list` 已接好），再 `querySelector`。
- **只演纯文本**。`text` 里不能带 HTML；需要「解码 + 强调」就在外面包 `<em>`，
  组件只负责自己那一层。
- **`pool` 要等宽**。默认池在 `--font-mono` 下逐格等宽。中文里 ASCII 符号只有汉字一半
  宽，动画期间会挤出行内空隙——想纹丝不动就传全角池（如 `※§◇∈∮⊕`）。
- **`face="inherit"` 也是行内会呼吸**。非等宽字面下符号宽窄不一，外层盒子仍不动，
  但字与字的间距会跳；主页页头要的就是这个（斜体标题不该突然变等宽字），得认。
- **别演长段落**。这是给标题/提示词用的；整段文字逐字解码既读不了也白烧帧。
- **双语孪生页**：英文页放英文那份 `text`，别把中文原句复制进 `.en.md` 的演示里。
- **文章正文里用**：Markdown 不经 Astro 编译，正文内联的 `<script>` 解析不了
  `@/lib/...` 的 import。要么在文章布局里 import 本组件把脚本带出去，要么照
  `introducing-v2` 里 `click-counter` 的办法把逻辑整段内联、自带注册。

## 完整示例

就是主页页头现在在用的一处（`src/pages/index.astro`，英文主页同构）：只让站名解码，
问候语不动；`face="inherit"` 让站名跟着 h1 的斜体、accent 色与负字距走，解码完了
就是一行普通的标题。

```astro
---
import ScrambleText from "@/components/ScrambleText.astro"
import { SITE } from "@/consts"
import { t, type Locale } from "@/lib/i18n"

const locale: Locale = "zh"
---

<h1>
  {t(locale, "heroGreeting")}
  <ScrambleText text={SITE.title} face="inherit" />
</h1>
```

其余三种取值（悬停重演、手动、全角池的中文）：

```astro
<h1><ScrambleText text="KINETICS" /></h1>
<p>
  悬停重演：<ScrambleText text="Press and hold the pointer" trigger="hover" />
</p>
<p>
  手动：<ScrambleText class="manual" text="Decode on demand" trigger="manual" />
  <button type="button" id="again">replay</button>
</p>
<p>
  中文：<ScrambleText text="解码" pool="※§◇∈∮⊕" delay={200} />
</p>

<script>
  document.getElementById("again")?.addEventListener("click", () => {
    const el = document.querySelector("scramble-text.manual") as
      | (HTMLElement & { play(): void })
      | null
    el?.play()
  })
</script>
```
