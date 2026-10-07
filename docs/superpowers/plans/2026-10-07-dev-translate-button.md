# dev 文章页翻译按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `astro dev` 下中文文章页提供「翻译成英文」浮动按钮：点击实时检测译文状态（无/部分/全部），就地给出生成、继续（跳过已有）、全部覆盖、查看动作；经 dev 端点 spawn `scripts/translate.mjs` 执行，进度进终端；生产构建零痕迹。

**Architecture:** 复刻 Moment Composer 的 dev-only 模式——组件 `import.meta.env.PROD` 早退 + Vite 插件 `apply: "serve"` 提供 `GET /api/translate/status` 与 `POST /api/translate` 两个端点（子进程复用 CLI，`translate.mjs` 零改动）+ `src/lib/translate-dev.ts` 纯逻辑模块（id→目标解析、单元统计、命令构造、错误提取）。测试以 `bash scripts/tests/translate-ui-check.sh` 为载体：受控 `.env`、`/tmp` 内容 fixture（`TRANSLATE_DEV_CONTENT_ROOT` 注入）、真实 `astro dev` 起停、复用 API 桩离线回归。

**Tech Stack:** Astro 7（Vite 插件、`import.meta.env`）、Node ≥ 22.12（`node:fs`、`node:path`、`node:child_process`）、Bash 3.2 测试脚本、Biome。

**Spec:** `docs/superpowers/specs/2026-10-07-dev-translate-button-design.md`（执行者需一并阅读；本计划实现其全部「覆盖」项）

## Global Constraints

- 包管理器用 npm（用户偏好）：每个任务结束前 `npm run format:check` 必须通过，并产生一次提交。
- **生产零痕迹**：组件以 `import.meta.env.PROD` 早退；插件 `apply: "serve"`；构建产物不得含 `data-translate-dev` 或 `api/translate`。
- **`scripts/translate.mjs` 与 `package.json` 零改动**（scripts/dependencies 均不动）；零新增依赖，只允许 Node 内置（`node:` 前缀）。
- 新增 `src/` 代码为 TypeScript（`src/lib/*.ts`、`src/components/*.astro`）；插件对 `src/lib/translate-dev.ts` 的 import 走 `./translate-dev` 相对路径（同目录）。`translate-dev.ts` 只 import `node:` 内置模块，可被插件安全加载。
- 端点协议固定（见 Task 1 Interfaces）：`GET /api/translate/status?id=` → `{ ok, kind, total, translated, viewUrl, running }`；`POST /api/translate` body `{ id, force? }` → 200 `{ ok: true, exitCode: 0 }` / 500 `{ ok: false, exitCode, error }` / 400 / 404 / 409。
- 内容根默认 `src/content/blog/`，环境变量 `TRANSLATE_DEV_CONTENT_ROOT` 可覆盖（绝对或相对项目根；测试隔离用）。
- 界面文案逐字固定（Task 2）：按钮「翻译成英文」；面板「尚未翻译。生成译文？」（单篇）/「尚未翻译（本系列共 N 篇）。生成译文？」（系列）/「已有 M/N 篇译文。继续翻译缺失部分？」/「已有译文。」/「已有翻译进行中（可在终端查看）。」/「翻译中…」/「✓ 翻译完成」/「✗ <error>」/「查看英文版」；按钮标签「生成」「继续（跳过已有）」「全部覆盖」「覆盖翻译」「查看」「取消」「关闭」「重试」。
- 测试载体 `scripts/tests/translate-ui-check.sh`：场景全部隔离在 `/tmp/translate-ui-check/`；受控 `.env`（备份 → 写入 → `trap` 恢复）；dev server 固定端口 4399、就绪轮询 ≤60s；桩复用 `scripts/tests/translate-stub.mjs`（本计划为其新增 `--delay <ms>`）。
- Biome：2 空格、80 列、双引号、无分号；CSS 不做格式化（跟随相邻文件风格）。内联 `<script>` 需包 IIFE；`querySelector` 用泛型 + `!`（既有教训，见 `MomentComposer.astro`）。
- macOS bash 3.2：变量名后紧跟中文多字节字符时一律用 `${VAR}` 花括号。
- 提交信息：短祈使句中文，前缀「翻译按钮：」。

## Review Focus

以下五类是 spec 暗示、但最容易翻车的输入/失败模式；对应断言已在任务中固定：

1. **任务断连**（页面刷新/关标签导致 HTTP 断开）：翻译必须继续跑完、锁最终释放、写盘完整 —— Task 1（A14：断连后轮询 `running` 翻转 + 文件落盘）。
2. **系列增量场景**：系列部分已有译文时，无 `--force` 运行只补翻译缺失篇、绝不重写已有（哨兵内容不变） —— Task 1（A10）。
3. **非法/歧义 id**：路径穿越、`_` 前缀、`.en` 结尾、文件名与 id 不一致（`skewed`）→ 400/404 + 提示、零写盘 —— Task 1（A5–A7、A12、A4 用 skewed）。
4. **前端失败恢复与渲染安全**：POST 失败（500/409/网络错）后按钮应恢复可用、显示可读错误、可重试；`error` 文本来自 stderr 必须以 `textContent` 渲染（无 HTML 注入） —— Task 2（实现约束 + 手动验收清单）。
5. **生产零痕迹**：dist 全目录不得出现组件标记与端点字样 —— Task 3（`assert_dir_lacks` ×2）。

---

### Task 1: dev 翻译端点（解析/统计 + status/POST + 并发与断连语义）

**Files:**
- Create: `src/lib/translate-dev.ts`
- Create: `src/lib/translate-dev-plugin.ts`
- Modify: `astro.config.ts`（`vite.plugins` 数组注册 `translateDevPlugin()`）
- Modify: `scripts/tests/translate-stub.mjs`（新增 `--delay <ms>`）
- Create: `scripts/tests/translate-ui-check.sh`

**Interfaces（Produces，Task 2 与测试消费）:**

`src/lib/translate-dev.ts` 导出：

```ts
export type TargetInfo = { kind: "single" | "series"; target: string; viewUrl: string }
export class TranslateDevError extends Error { readonly status: 400 | 404 }
export function resolveTarget(contentRoot: string, id: unknown): TargetInfo
export function countUnit(info: TargetInfo): { total: number; translated: number }
export function buildTranslateArgs(target: string, force: boolean): string[]
export function extractError(stderr: string): string | undefined
```

- `resolveTarget`：校验失败（非 string / 空 / 段数 >2 / 段为 `.`、`..`、`_` 前缀、`.en` 结尾、含分隔符或 NUL）→ `throw new TranslateDevError(msg, 400)`；探测失败 → `throw new TranslateDevError(msg, 404)`。探测顺序：`C/<id>.md`（1 段→single；2 段→其父目录 series，父目录缺 `index.md` 则 404）→ `C/<id>/index.md`（series）→ 404。`target` 为绝对路径；`viewUrl`：single → `/en/blog/<id>`，series → `/en/blog/<id.split("/")[0]>`。
- `countUnit`：single → `{ total: 1, translated: <target 去 .md>.en.md 存在 ? 1 : 0 }`；series → 按 `discoverSeries` 同规则（`*.md`、非 `_` 前缀、非 `.en.md`、含 `index.md`）计数。
- `buildTranslateArgs`：`["scripts/translate.mjs", target, ...(force ? ["--force"] : [])]`。
- `extractError`：stderr 取尾部 800 字符，取最后一个非空行 trim，截 400 字符；无内容 → `undefined`。

`src/lib/translate-dev-plugin.ts` 导出 `translateDevPlugin(): Plugin`（`name: "astro-erudite:translate-dev"`、`apply: "serve"`、`configureServer` 内分流 `GET .../status` 与 `POST`；并发锁为 `configureServer` 闭包内 `let running = false`；spawn 用 `process.execPath`、`cwd: server.config.root`、`stdio: ["ignore","pipe","pipe"]`；stdout/stderr 原样转发 `process.stdout/stderr` 并缓存 stderr 尾部；`close` 后清锁；响应写入前检查 `res.destroyed || res.writableEnded`；请求断开不 kill 子进程）。

- [ ] **Step 1: 桩新增 `--delay <ms>`**

在 `scripts/tests/translate-stub.mjs` 的 `parseArgs` 加 `delay`（`--delay <ms>`，默认 0），并在请求处理中（`req.on("end")` 内、构造/发送响应前）按 `delay > 0` 延迟一次（如 `await new Promise(r => setTimeout(r, opts.delay))`，回调可改 async）。不改变既有输出格式与日志。用法字符串追加 `[--delay <ms>]`。

运行：`bash scripts/tests/translate-check.sh`（既有 197 断言）→ 全绿。

- [ ] **Step 2: 写检查脚本 `scripts/tests/translate-ui-check.sh`（先失败）**

结构照 `translate-check.sh`（`set -euo pipefail`、`root=$(git rev-parse --show-toplevel)`、`pass/fail/assert_has/assert_lacks` helpers、`unset TRANSLATE_BASE_URL TRANSLATE_API_KEY TRANSLATE_MODEL TRANSLATE_DEV_CONTENT_ROOT`）。控制流：

1. `WORK=/tmp/translate-ui-check`；`rm -rf "$WORK"; mkdir -p "$WORK/content/series"`。
2. 受控 `.env`：备份 → 退出恢复（trap）；先写 `SITE_URL=https://example.com`。
3. fixture（逐字，UTF-8）：

`$WORK/content/one.md`：

```md
---
title: "单篇：按钮测试"
description: "dev 翻译按钮的离线测试单篇。"
date: 2026-10-07
authors:
  - enscribe
---

## 开场

ONE-MARKER 这是单篇测试正文。
```

`$WORK/content/two.md`：同上结构（标题「单篇二」、正文 `TWO-MARKER`）。

`$WORK/content/skewed-file.md`：普通单篇（文件名与其 slug 不一致，用于 404 断言）。

`$WORK/content/series/index.md`：

```md
---
title: "系列：按钮测试"
description: "dev 翻译按钮的离线测试系列。"
date: 2026-10-07
authors:
  - enscribe
---

## 系列开篇

INDEX-MARKER 系列父文章正文。
```

`$WORK/content/series/part-a.md` / `part-b.md`：同上结构（`order: 1` / `order: 2`，正文 `PART-A-MARKER` / `PART-B-MARKER`）。

`$WORK/content/series/index.en.md`：内容仅 `SENTINEL-INDEX-EN`（skip 哨兵）。

4. 桩：`node scripts/tests/translate-stub.mjs --port-file "$WORK/stub.port" --log "$WORK/stub.log" &`；轮询端口文件 ≤5s。
5. `.env` 追加：`TRANSLATE_BASE_URL=http://127.0.0.1:$(cat "$WORK/stub.port")`、`TRANSLATE_API_KEY=test-key`、`TRANSLATE_MODEL=test-model`。
6. dev server：`TRANSLATE_DEV_CONTENT_ROOT="$WORK/content" ./node_modules/.bin/astro dev --port 4399 > "$WORK/dev.log" 2>&1 &`；轮询 `curl -sf -o /dev/null http://127.0.0.1:4399/` ≤60s，超时 `tail -20 "$WORK/dev.log"` 后 fail。
7. 断言（HTTP 状态码用 `curl -s -o body -w '%{http_code}'`；JSON 断言用 `grep -qF` 子串，不依赖字段顺序）：
   - A1 `status?id=one` → 200，含 `"kind":"single"`、`"total":1`、`"translated":0`、`"viewUrl":"/en/blog/one"`、`"running":false`
   - A2 `status?id=series` → 200，含 `"kind":"series"`、`"total":3`、`"translated":1`、`"viewUrl":"/en/blog/series"`
   - A3 `status?id=series/part-a` → 200，含 `"total":3`、`"translated":1`（系列整组语义）
   - A4 `status?id=skewed` → 404（文件存在但与 id 不一致：不猜测）
   - A5 `status?id=../x` → 400；`status?id=%2Fabs` → 400
   - A6 `status?id=_draft` → 400；A7 `status?id=one.en` → 400
   - A8 `POST {"id":"one"}` → 200 含 `"ok":true`；`one.en.md` 存在且含 `[EN]`
   - A9 再 `status?id=one` → `"translated":1`
   - A10 `POST {"id":"series"}` → 200；`part-a.en.md`、`part-b.en.md` 存在且含 `[EN]`；`index.en.md` 仍为 `SENTINEL-INDEX-EN`（skip 未重写）
   - A11 `POST {"id":"series","force":true}` → 200；`index.en.md` 不再含 `SENTINEL-INDEX-EN` 且含 `[EN]`
   - A12 `POST {"id":"../x"}` → 400，且 fixture 目录 `find -name '*.en.md' | wc -l` 不变
   - A13 `POST {"id":"nope"}` → 404
8. **断连场景**（重起桩带延迟：kill 旧桩、`--delay 1500` 重起）：`curl -s --max-time 0.8 -X POST -d '{"id":"two"}' ...`（预期超时退出，忽略退出码）→ 立即 `status?id=two` 断言含 `"running":true` → 轮询 `status?id=two` 直到 `"running":false`（≤30s）→ 断言 `two.en.md` 存在且含 `[EN]`（A14）。
9. **并发场景**（delay 桩仍在）：后台 `curl ... -d '{"id":"series","force":true}' > "$WORK/bg.json" &` → `sleep 1` → 前台 `POST {"id":"one"}` → 409（A15a）→ `wait` 后台后断言 `bg.json` 含 `"ok":true`（A15b）。
10. **失败路径**：`.env` 去掉三行 `TRANSLATE_*` → `POST {"id":"one","force":true}` → 500 且响应含 `缺少 TRANSLATE_`（A16）→ 恢复 `.env` 内容。
11. trap 清理：kill dev server 与桩、`rm -rf "$WORK"`、恢复 `.env`；输出 `PASS` 计数。

运行：`bash scripts/tests/translate-ui-check.sh` → 预期大面积 FAIL（端点不存在，dev 页无组件标记不在本任务范围内）。

- [ ] **Step 3: 实现 `src/lib/translate-dev.ts`**

按 Interfaces 实现（`node:fs` 的 `existsSync/readdirSync/statSync` 与 `node:path`；`TranslateDevError` 带 `status` 字段；类型上 `id: unknown` 先做 `typeof id === "string"` 判定）。注意：段校验拒绝空段、`.`/`..`、`_` 前缀、`.en` 结尾（段尾或整串）、含 `/`（段内不可能）、`\`、`\0`；`path.resolve` 后断言目标以 `path.resolve(contentRoot) + path.sep` 开头（防穿越，404 兜底）。

- [ ] **Step 4: 实现 `src/lib/translate-dev-plugin.ts` 并在 `astro.config.ts` 注册**

插件骨架照 `moment-composer-plugin.ts`（`readBody`、`sendJson` 复制该文件模式）。分流逻辑：`req.method === "GET"` 且 url 路径为 `/status` → status；`req.method === "POST"` 且路径为 `/` 或空 → run；其余 `next()`。status：`resolveTarget` + `countUnit` → 200；`TranslateDevError` → 对应 status + `{ ok: false, error }`。run：读 body（JSON 失败 400）→ 校验 `id` 存在、`force` 为可选 boolean（否则 400）→ `running` 时 409 `{ ok: false, error: "已有翻译进行中" }` → `resolveTarget`（400/404）→ 置锁 → `spawn(process.execPath, buildTranslateArgs(info.target, force), { cwd: server.config.root, stdio: ["ignore", "pipe", "pipe"] })` → 数据转发 + stderr 尾部缓存 → `close` 清锁、按 `exitCode` 回 200/500（500 附 `exitCode` 与 `extractError(stderr)`）。`astro.config.ts`：`vite.plugins: [momentComposerPlugin(), translateDevPlugin()]`。

- [ ] **Step 5: 跑端点检查脚本至全绿**

运行：`bash scripts/tests/translate-ui-check.sh` → 全部 PASS（重点：A10 skip 哨兵、A14 断连、A15 并发、A16 失败）。若 dev server 未就绪/端口冲突，检查 `$WORK/dev.log` 后调整。

- [ ] **Step 6: 格式检查 + 提交**

运行：`npm run format:check`、`bash scripts/tests/translate-check.sh`（桩改动回归）→ 均通过。

```bash
git add src/lib/translate-dev.ts src/lib/translate-dev-plugin.ts astro.config.ts scripts/tests/translate-stub.mjs scripts/tests/translate-ui-check.sh
git commit -m "翻译按钮：dev 端点（解析/统计 + status/POST + 并发与断连语义）"
```

---

### Task 2: 前端按钮组件与挂载

**Files:**
- Create: `src/components/TranslateButton.astro`
- Modify: `src/pages/blog/[...id].astro`（Layout 内挂载）
- Modify: `scripts/tests/translate-ui-check.sh`（追加组件断言）

**Interfaces（Consumes）:**

- Task 1 端点协议（见 Global Constraints）。
- 组件 props：`{ postId: string }`；根元素固定 `data-translate-dev` 与 `data-post-id`（测试断言消费）。

**Interfaces（Produces）:**

- `/blog/<id>` 的 dev HTML 含 `data-translate-dev`；`/en/blog/<id>` 不含。

- [ ] **Step 1: 追加组件断言（先失败）**

在 `translate-ui-check.sh` 断言区追加：`curl -s http://127.0.0.1:4399/blog/introducing-v2/` → 含 `data-translate-dev`；`curl -s http://127.0.0.1:4399/en/blog/welcome/` → 不含。运行脚本 → 这两条 FAIL。

- [ ] **Step 2: 实现 `src/components/TranslateButton.astro`**

frontmatter：`type Props = { postId: string }`；`if (import.meta.env.PROD) return`。

markup：

```astro
<div class="translate-dev" data-translate-dev data-post-id={postId}>
  <div class="panel" hidden>
    <p class="message" role="status" aria-live="polite"></p>
    <div class="actions"></div>
  </div>
  <button type="button" class="trigger">翻译成英文</button>
</div>
```

样式（跟随 ScrollToTop 浮钮语言；可直接采用）：根容器 `position: fixed; inset-block-end/inset-inline-end: var(--grid-gutter); z-index: 10;` 列向 flex、`align-items: flex-end; gap: var(--space-3xs);`；`@media (width < 64rem)` 时 `inset-block-end: calc(var(--grid-gutter) + 2.5rem + var(--space-2xs))`（错开 ScrollToTop）；触发器与面板用 `var(--background)`/`color-mix`/`--border`/`--radius-md`/`--blur-sm`/`--step--1`（与浮钮一致的观感）；面板 `--radius-xl`、`padding: var(--space-xs)`、最大宽度 `min(22rem, calc(100vw - 2 * var(--grid-gutter)))`。

`<script>`（IIFE、泛型 `querySelector` + `!`）行为固定：

1. 点击触发器 → `check()`：`fetch(\`/api/translate/status?id=${encodeURIComponent(postId)}\`)`；存 `viewUrl`。
   - 非 2xx → 面板显示 `data.error ?? "状态检测失败"` + ［关闭］；
   - `running === true` → 「已有翻译进行中（可在终端查看）。」+ ［关闭］；
   - `translated === 0`：`kind === "series"` → 「尚未翻译（本系列共 N 篇）。生成译文？」，否则「尚未翻译。生成译文？」；按钮 ［生成］→ `run(false)`、［取消］；
   - `0 < translated < total`：「已有 M/N 篇译文。继续翻译缺失部分？」；［继续（跳过已有）］→ `run(false)`、［全部覆盖］→ `run(true)`、［查看］链接 `viewUrl`、［取消］；
   - 其余（全有）：「已有译文。」；［覆盖翻译］→ `run(true)`、［查看］、［取消］。
2. `run(force)`：记录 `lastForce`；消息「翻译中…」、清空动作、禁用触发器；`POST /api/translate` JSON `{ id, force }`；
   - 成功（2xx 且 `ok`）→ 「✓ 翻译完成」+ 「查看英文版」链接；失败（含 409/500/网络错）→ `✗ ${data.error ?? "翻译失败"}` + ［重试］（重放 `run(lastForce)`）；
   - 无论成败：恢复触发器可用。
3. 关闭：［取消］/［关闭］、`Escape`、点击组件根之外（`closest("[data-translate-dev]")` 判定）。
4. 所有动态文本一律 `textContent`；链接用 `createElement("a")` + `href`；按钮用 `createElement("button")`。

- [ ] **Step 3: 挂载到中文文章页**

`src/pages/blog/[...id].astro`：顶部 import `TranslateButton`，`Layout` 内加
`<TranslateButton postId={post.id} />`（组件自身在 PROD 早退、且该页面只有 zh
路由，`/en/` 不挂载）。

- [ ] **Step 4: 跑检查脚本至全绿**

运行：`bash scripts/tests/translate-ui-check.sh` → 全部 PASS（新增两条组件断言在 dev 下应通过；生产断言在 Task 3）。

- [ ] **Step 5: 手动浏览器验收**

`npm run dev` 后打开任一中文文章页：浮动按钮可见（不与 ScrollToTop 重叠）；点击依次验证——无译文分支（生成 → 「翻译中…」→ 终端出现脚本输出 → 成功 + 「查看英文版」可跳转）、已有译文分支（覆盖 / 查看）、面板 Esc 与外点关闭。`.env` 未配 `TRANSLATE_*` 时验证失败分支显示「缺少 TRANSLATE_」类错误且可重试。

- [ ] **Step 6: 格式检查 + 提交**

运行：`npm run format:check` → 通过。

```bash
git add src/components/TranslateButton.astro src/pages/blog/'[...id].astro' scripts/tests/translate-ui-check.sh
git commit -m "翻译按钮：前端组件与挂载"
```

---

### Task 3: 生产零痕迹断言、文档与全量验证

**Files:**
- Modify: `scripts/tests/i18n-check.sh`（目录级断言）
- Modify: `AGENTS.md`（i18n 小节补充）

**Interfaces（Consumes）:**

- Task 1/2 的构建产物行为（PROD 早退 + `apply: "serve"`）。

- [ ] **Step 1: i18n-check 追加目录级断言**

在 helpers 区新增：

```bash
assert_dir_lacks() { # $1=目录 $2=片段 [$3=说明]
  if grep -rqF -- "${2}" "${1}"; then
    fail "${3:-断言目录不包含}（${1} 出现 ${2}）"
  fi
  pass "${3:-${1} 不含 ${2}}"
}
```

在断言区追加：

```bash
assert_dir_lacks dist 'data-translate-dev' "dist 无翻译按钮标记（生产零痕迹）"
assert_dir_lacks dist 'api/translate' "dist 无翻译端点字样（生产零痕迹）"
```

运行：`bash scripts/tests/i18n-check.sh` → 全绿（若红：检查组件早退与插件 `apply`）。

- [ ] **Step 2: AGENTS.md 补充说明**

在 `## i18n（中英双语）约定` 小节末尾（「翻译工作流」段之后）追加：

```markdown
### dev 翻译按钮

`astro dev` 下中文文章页右下角有「翻译成英文」浮动按钮（模式同 Moment
Composer，生产构建零痕迹）：点击实时检测译文状态——无译文给「生成」，
已有译文给「继续（跳过已有）」「全部覆盖」「查看」；系列按整组、独立文章按
单篇。经 dev 端点 spawn `scripts/translate.mjs` 执行，进度在终端可见。
内容根默认 `src/content/blog/`，可用 `TRANSLATE_DEV_CONTENT_ROOT` 覆盖
（测试隔离用）。回归：`bash scripts/tests/translate-ui-check.sh`。
```

- [ ] **Step 3: 全量验证**

运行并全部通过：

```bash
npm run format:check
bash scripts/tests/translate-check.sh
bash scripts/tests/i18n-check.sh
bash scripts/tests/translate-ui-check.sh
```

（真实 API 的手动验收不属于自动化：`.env` 配好 `TRANSLATE_*` 后在真实单篇/系列页走查生成/继续/覆盖/查看四类路径，确认译文与 `git diff` 预期一致——留给控制方执行。）

- [ ] **Step 4: 提交**

```bash
git add scripts/tests/i18n-check.sh AGENTS.md
git commit -m "翻译按钮：生产零痕迹断言与文档"
```

---

## 手动验收清单（控制方/用户）

1. `npm run dev`，打开一篇已有译文与一篇无译文的真实中文文章，各点一次按钮：分支文案正确；
2. 真 API 翻一篇（等待期间终端可见逐文件进度）；完成后「查看英文版」跳转正确；
3. 系列页点击「继续」：仅缺失篇被翻译、已有译文未被重写（`git diff` 验证）；
4. 翻译中刷新页面：任务在终端继续至完成；再次点击显示「已有翻译进行中」；
5. `npm run build` 后 `grep -r "data-translate-dev\|api/translate" dist` 无输出（与 i18n-check 断言一致，可选复核）。
