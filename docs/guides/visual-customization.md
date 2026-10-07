# 外观定制

## 配色

色彩定义在 `src/styles/color.css`，使用 [Radix Colors](https://www.radix-ui.com/colors)
色阶。每一级都用 [`light-dark()`](https://developer.mozilla.org/docs/Web/CSS/color_value/light-dark)
同时给出明暗两套值，语义 token 指向色阶：

```css
:root {
  --gray-1:  light-dark(#fcfcfc, #111111);
  /* ... */
  --gray-12: light-dark(#202020, #eeeeee);

  --background:       var(--gray-1);
  --foreground:       var(--gray-12);
  --muted-foreground: var(--gray-11);
  --border:           var(--gray-6);
  /* ... */

  color-scheme: light dark;
}
```

- 站点默认跟随系统明暗偏好；右上角主题切换只存储一次覆盖，不改写系统设置。
- 改配色时优先替换色阶值（`--gray-n` 等），语义 token 会自动跟随；需要新增语义色时
  在 `:root` 中追加并复用 `light-dark()` 写法。

样式系统其余内容（Utopia 流体字号/间距、12 列网格、按职责拆分的各 CSS 文件）见
[AGENTS.md](../../AGENTS.md) 的「样式系统」小节。字体资源在 `src/assets/fonts/`，
加载规则在 `src/styles/fonts.css`。

## Favicon

favicon 文件由 [RealFaviconGenerator](https://realfavicongenerator.net/) 生成，放在
`public/` 下。替换时保持文件名不变即可自动生效；如果文件名或数量有变化，需要同步
更新 `src/components/MetaHead.astro` 中的引用：

```html
<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="shortcut icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

`public/site.webmanifest` 中的名称与图标引用同样需要随之调整。
