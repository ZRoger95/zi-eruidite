# /moments 页面 Zed 风格重设计

## 目标与约束
- 采用 Zed 完整设计语言:虚线时间轴脊柱、菱形"电路"节点、等宽(mono)微标签、1px 细边框、2–4px 小圆角、无阴影、单一 accent 蓝。
- 页面级作用域:仅 `/moments` 与其详情页变化;首页 [src/pages/index.astro](file:///Users/rogerz/workspace/zi-eruidite/src/pages/index.astro) 与标签页 [src/pages/tags/[...id].astro](file:///Users/rogerz/workspace/zi-eruidite/src/pages/tags/%5B...id%5D.astro) 使用的 MomentCard 外观保持不变。
- 不修改全局 token([color.css](file:///Users/rogerz/workspace/zi-eruidite/src/styles/color.css)/[shape.css](file:///Users/rogerz/workspace/zi-eruidite/src/styles/shape.css)/typography)。复用现有 `--accent`、`--border`、`--muted`、`--font-mono`、`--radius-sm`。
- 保留 `light-dark()` 双主题;所有新增颜色走现有 token,暗色自动适配。

## 1. MomentCard 增加 variant 开关 — [src/components/MomentCard.astro](file:///Users/rogerz/workspace/zi-eruidite/src/components/MomentCard.astro)
- Props 增加 `variant?: "default" | "zed"`,默认 `"default"`(现有样式与 markup 完全不变,保证首页/标签页零回归)。
- 根元素加 `data-variant={variant}`。新增仅在 `[data-variant="zed"]` 下生效的样式覆盖:
  - `border-radius: var(--radius-sm)`(4px,替代 `--radius-xl`);`border: 1px solid var(--border)`(实色,去掉当前 color-mix 半透明)。
  - 移除 `box-shadow` 与 hover `transform`;hover 仅改 `border-color: color-mix(in oklab, var(--accent) 45%, var(--border))` + 轻微背景变化(呼应 Zed 卡片 hover 变蓝边)。
  - `background`:浅色下用极微暖调 `light-dark(color-mix(in oklab, #faf9f5 55%, var(--background)), color-mix(in oklab, var(--muted) 40%, transparent))`,营造 Zed 奶油纸感(仅卡片表面,不做整页底色,避免出现"色块盒子")。
  - `<time>` 与 `.moment-tags a` 字体改 `var(--font-mono)`;日期字号收到 `calc(var(--step--1) - 1px)`,加 `letter-spacing: 0.02em`。
  - `.moment-tags a` 圆角改 `var(--radius-sm)`,1px 细边框,mono 字体。
  - 正文内的图片网格/链接卡片逻辑保持不变(仅圆角收敛到 `--radius-sm`/`--radius-md`)。

## 2. 时间线页面结构 — [src/pages/moments/index.astro](file:///Users/rogerz/workspace/zi-eruidite/src/pages/moments/index.astro)
- 页头:标题上方加 mono "eyebrow" kicker(如 `~/moments · {allMoments.length} entries`),H1 改用 `color: var(--accent)` + `letter-spacing: -0.03em`;页头下方加 1px `var(--border)` 分隔线(Zed 面板感)。
- 时间轴脊柱:`.timeline { position: relative; padding-left: 28px }`;`.timeline::before` 为绝对定位 1px 竖线,`left: 9px`,背景 `repeating-linear-gradient(to bottom, var(--border) 0 4px, transparent 4px 8px)`(Zed 虚线母题),`top/bottom` 各留 4px。
- 每个日期组 `.date-group { position: relative }`:
  - `.date-head` 内含 `.date-node`(菱形节点)与 `.date-label`。
  - `.date-node`:绝对定位于脊柱上(中心对齐 `left: 9px`),`width/height: 9px; transform: rotate(45deg); background: var(--background); border: 1px solid var(--accent)`,视觉上线穿过节点。
  - `.date-label`:改 mono 字体、`text-transform: uppercase`、`letter-spacing: 0.08em`、`font-size: calc(var(--step--1) - 1px)`、`color: var(--muted-foreground)`。
  - 组内 MomentCard 传 `variant="zed"`。
- 移动端(`@media (width < 480px)`):`padding-left: 20px`、脊柱 `left: 5px`、节点相应左移,保证不溢出。
- 分页 `.pagination`:改为 Zed 按钮样式——`<a>` 与页码用 mono 字体、1px `var(--border)`、`border-radius: var(--radius-sm)`、紧凑 padding;hover 边框转 accent。箭头沿用 `←/→`。
- ActivityGraph 传入不变;其容器区域外观在第 3 步统一。

## 3. ActivityGraph 匹配 Zed 质感 — [src/components/ActivityGraph.astro](file:///Users/rogerz/workspace/zi-eruidite/src/components/ActivityGraph.astro)
- 仅在 moments 页使用,可直接改。保持网格/交互/tooltip 逻辑与数据不变。
- `.activity-caption`、`.activity-legend-label`、月份/星期标签统一 `var(--font-mono)`,字号收到 `calc(var(--step--1) - 1px)`。
- `.activity-year-label select`:`border-radius: var(--radius-sm)`、1px `var(--border)`、mono 字体。
- 单元格圆角保持 2px(已符合 Zed 利落感);整体外层加 1px `var(--border)` 细边框 + `var(--radius-sm)`(可选,轻量包裹为"面板"),padding `var(--space-xs)`。

## 4. MomentComposer(dev-only)统一 — [src/components/MomentComposer.astro](file:///Users/rogerz/workspace/zi-eruidite/src/components/MomentComposer.astro)
- 仅 dev、仅 moments 页。`.compose-bar` 圆角 `--radius-xl` → `var(--radius-sm)`,边框保持 1px 实色。
- `.compose-hint`(⌘⏎ 发布)与 `.compose-status` 改 mono 字体。
- `.compose-submit` 圆角 `--radius-full` → `var(--radius-sm)`,呼应 Zed 4px 方按钮。

## 5. 详情页 — [src/pages/moments/[...id].astro](file:///Users/rogerz/workspace/zi-eruidite/src/pages/moments/%5B...id%5D.astro)
- `<MomentCard>` 传 `variant="zed"`,与列表页一致。
- `.back-nav a` 改 mono 字体、1px 细边框按钮化(与分页按钮同款),hover 转 accent;顶部 `border-top` 保留为 1px `var(--border)`。

## 测试计划
- 包管理器按用户偏好(仓库默认 Bun):`bun run format:check` 与 `bun run build` 均通过。
- 手动核查(dev server):
  - `/moments`:脊柱+菱形节点对齐、日期 mono 标签、卡片细边框/4px 圆角/无阴影、hover 变蓝边、分页按钮、ActivityGraph 面板;浅色与暗色两套均正常。
  - `/moments/<某id>`:详情页卡片为 Zed variant、返回按钮样式。
  - 回归:首页与 `/tags/<tag>` 上的 MomentCard 外观与改动前一致(default variant 未受影响)。
  - 移动端(<480px):脊柱/节点不溢出,排版正常。
- 无需 i18n 回归(moments 为中文、无 `/en/moments` 路由);日期标签沿用现有 zh-CN 逻辑。

## 假设
- "完整 Zed 语言"以结构母题(虚线脊柱、菱形节点、mono 微标签、细边框、小圆角、去阴影、单 accent)为准;因需保持页面级作用域与双主题,不引入 Zed 的整页奶油底色,改以卡片表面的极微暖调体现纸感。
- 首页/标签页的 moment 卡片维持现状(不改观感),如需一并 Zed 化可后续单独提出。