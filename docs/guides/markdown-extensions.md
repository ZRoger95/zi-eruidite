# Markdown 扩展语法

站点使用 Rust 实现的 [Sätteri](https://satteri.bruits.org/) 处理 Markdown（配置在
`astro.config.ts`）。除标准 Markdown 外，以下扩展由 `src/lib/` 中的自定义插件提供——
如需新增语法，请编写 Sätteri 插件，而不是安装 remark/rehype 插件。

## Callout 指令

使用 [directive](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444)
风格的 `:::` 语法，五种变体：`note`、`tip`、`warning`、`caution`、`important`，
渲染为可折叠的 `<details>` 元素（原生折叠，零 JavaScript）：

```markdown
:::note[自定义标题（可选）]
内容。
:::
```

- 标题可选；不写方括号时使用变体默认标题（如 `Note`）。
- 默认展开；在指令后追加 `{closed}` 可让 callout 默认折叠：
  `:::note[标题]{closed}`。

## 数学公式

- 行内公式：`$inline$`
- 块级公式：`$$display$$`

LaTeX 由 [Temml](https://temml.org/) 在构建时渲染为浏览器原生
[MathML](https://developer.mozilla.org/docs/Web/MathML)，不需要客户端 JS，
也不依赖数学字体网络加载。

## 行内代码高亮

行内代码可以带注解指定语法高亮：

- `` `const x = 1{:ts}` `` —— 按 TypeScript 语法高亮。
- `` `text{:.string}` `` —— 使用主题中对应
  [TextMate scope](https://macromates.com/manual/en/language_grammars) 的颜色
  （如 `.string`、`.comment` 等）。

代码块默认由 [Expressive Code](https://expressive-code.com/) 处理；行内代码高亮由
`src/lib/expressive-code/inline.ts` 插件实现。
