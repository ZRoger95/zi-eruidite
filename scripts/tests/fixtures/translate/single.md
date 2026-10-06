---
title: "单篇示例：结构校验的陷阱"
description: "这篇短文用于离线桩测试：代码块含 $ 与 :::，行内代码含公式记号。"
date: 2026-10-07
authors:
  - enscribe
tags:
  - test
---

## 开场

SINGLE-START 这是一段普通正文，包含行内代码 `const x = 1{:ts}` 与行内公式 $a+b$。

价格写法示例：`$100` 不应被计为公式。

```ts
// 围栏内出现 $ 与 ::: 与 [链接](https://inside.example.com) 都不参与统计
const price = "$100"
```

:::note[标题也要翻译]
CALLOUT-BODY 提示文本里有一个 [外部链接](https://example.com/docs) 与图片 ![示意图](./pic.png)。
:::

$$
E = mc^2
$$
