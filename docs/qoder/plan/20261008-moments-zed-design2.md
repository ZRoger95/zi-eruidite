# /moments/[id] 详情页 Zed 文章排版

## 从 Zed 博客文章页提炼的设计语言（落地要点）
来源 `zed.dev/blog/*`（用户给的 `zed-decoded-wire-protocol` 已 404，模板全站统一，据 `zed-1-0` 提炼）：
- 窄居中阅读栏（约 40–45rem），大量留白。
- 顶部 byline：日期/署名小字、mono、muted 灰，置于正文上方。
- 扁平无盒子：正文区不加卡片边框/背景/内边距，靠留白与分隔线组织。
- 舒适正文节奏：行高 ~1.7，段间距宽松；标题层级分明、紧字距。
- 链接 accent 色、hover 显下划线；行内/块 code mono；blockquote 左侧 accent 竖条；图片满栏圆角。
- 收尾用水平分隔线。

## 落地策略（关键约束）
- 新增 `variant="article"`，与列表页已完成的 `zed`、首页/`/tags` 的 `default` 三者选择器互斥，**列表页像素级不变**。
- 详情页**不**传 `Layout` 的 `article` prop（那会把列宽撑到 80rem），改用页面级窄 `max-width`，保持 Zed 阅读栏。
- 仅用现有 token（`--step-*`/`--space-*`/`--radius-*`/`--border`/`--accent`/`--foreground`/`--muted-foreground`），不新增全局变量，明暗双主题自动适配。

## 1) `src/components/MomentCard.astro`
- `variant` 类型扩展为 `"default" | "zed" | "article"`。
- 把现有「Zed 变体：扁平无盒子」那批 `[data-variant="zed"]` 选择器**泛化**为 `[data-variant="zed"], [data-variant="article"]`（透明背景/去边框/去圆角/去内边距/去阴影/`time` mono）——结果与当前 zed 完全一致，列表页不受影响。
- 追加 `[data-variant="article"]` 专属正文 refine（`.moment-body` 内 `:global(...)`）：
  - 正文 `line-height: 1.75`；段落 `margin-bottom: var(--space-s)`，末段归零。
  - `:global(h2), :global(h3)`：`font-size: var(--step-1)/var(--step-0)`、`font-weight: 610`、`letter-spacing: -0.02em`、上间距 `var(--space-l)`。
  - `:global(blockquote)`：左侧 2px `var(--accent)` 竖条 + `padding-left: var(--space-s)` + `color: var(--muted-foreground)`。
  - `:global(hr)`：`border: 0; border-top: 1px solid var(--border); margin-block: var(--space-l)`。
  - 单图满栏：`:global(img)` `border-radius: var(--radius-md)`（沿用现有 `data-images` 网格逻辑，仅细节圆角统一）。
  - `time` byline 再收紧一档：`letter-spacing: .04em`、`color: var(--muted-foreground)`。

## 2) `src/pages/moments/[...id].astro`
- `<MomentCard ... variant="zed" />` 改为 `variant="article"`。
- 结构调整（Zed 顶部面包屑 + byline + 正文 + 分隔线收尾）：
  - 顶部放 `← ~/moments` mono 面包屑链接（由现 `back-nav` 迁移到卡片上方）。
  - 保留卡片自带 `<time>` 作为 byline（article variant 已 mono 化），不在页面另加日期以免重复。
  - 底部 `back-nav` 分隔线保留作为收尾（或改为一枚「返回动态」文字链，见 i18n）。
- `.moment-detail { max-width: 44rem; margin-inline: auto; }`（原 640px→约 44rem，贴合 Zed 阅读栏）。
- 面包屑/返回链沿用 mono、muted、hover→accent 的既有视觉（与列表页 `timeline-kicker`/`pagination a` 一致），`border-radius: var(--radius-sm)`。

## 3) i18n（`src/lib/i18n.ts`）
- 详情页现有返回文案 `"← 返回动态"` 为硬编码中文，改为经 `t(locale, "backToMoments")`。
- 在 `ZH_STRINGS` 与 `en` 同步新增：`backToMoments: "返回动态"` / `"Back to moments"`（保持键对称，`i18n-check.sh` 的 en 全键校验通过）。
- `~/moments` 为 mono 路径串，语言中立，无需 i18n。

## 测试计划
- `npm run format:check`（Biome 唯一格式化器；CSS 不格式化，`.astro` 内 style 需符合 Biome 对 astro 的处理）。
- `npm run build`（校验内容 schema、路由）。
- `bash scripts/tests/i18n-check.sh`（改了 i18n 键，必须全绿）。
- 本地 dev 手动核对：`/moments/<某条>`（含图/含链接卡/含标签各类 moment）明暗双主题；并回归确认 `/moments` 列表页、首页、`/tags` 外观无变化。

## 假设与范围护栏
- 范围严格限定 `/moments/[id]` 详情页；博客文章布局、全局 prose/token 不动。
- moments 无 `/en` 路由，`localeFromPath` 恒 zh；`backToMoments` 的 en 串仅为满足字典键对称约定，当前不可达但保留。
- 若 moment 正文不含标题/引用/hr，对应 refine 规则为无害兜底，不额外触发。