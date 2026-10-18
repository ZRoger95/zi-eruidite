# 收藏板 dev 布局编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `astro dev` 下于 `/board`（及 `/en/board`）提供一个「保存布局」浮条：把当前板面各物件经拖拽/缩放/旋转/镜像/叠放得到的几何（`x/y/rotate/z/scale/flip`）经 dev 端点写回 `src/data/board.ts`，生产构建零痕迹。

**Architecture:** 复刻 Moment Composer 的 dev-only 范式——① 数据模型给 `BoardItem` 增可选 `scale/flip`，`getBoardViews` 透传、`Board.astro` SSR 时写进 piece 的 `--s/--sx` 与 `data-id`，实现「渲染即所存」的双向一致；② 纯逻辑模块 `src/lib/board-source-patch.ts` 做按 `id` 定位、逐字段文本改写 `board.ts` 源码（保留注释与非几何字段）；③ Vite 插件 `boardEditorPlugin()`（`apply:"serve"`）注册 `POST /api/board/layout`，读源、调 patch、写回、`full-reload`；④ `BoardEditorBar.astro`（`import.meta.env.PROD` 早退）提供保存钮与客户端收集脚本。`translate-ui-check.sh` 的 dev-server 起停 + `/tmp` fixture 注入模式承载端点回归，`patchBoardSource` 另有纯离线断言脚本（不触碰真实 `board.ts`）。

**Tech Stack:** Astro 7（Vite 插件、`import.meta.env`）、Node ≥ 22.12（`node:fs/promises`、`node:path`）、TypeScript、Bash 3.2 测试脚本、Biome。

**Spec:** 本计划即设计文档；决策来源见对话——用户拍板「直接改写 board.ts」「schema 加 scale/flip 字段」「先写 plan 再实现」。范式对齐 [ADR 0001](../../adr/0001-moment-composer-dev-middleware.md) 与 [dev 翻译按钮计划](./2026-10-07-dev-translate-button.md)。

## Global Constraints

- **包管理/命令**：验证以 `npm run format:check` 与 `npm run build` 为准（项目记忆：本仓库用 npm 替代 bun 构建）。dev server 起停用 `./node_modules/.bin/astro dev --port <n> --ignore-lock --host 127.0.0.1`，并以 `ASTRO_DEV_BACKGROUND=1` 关闭 agent 后台识别（同 translate-ui-check.sh）。
- **Biome 格式**：2 空格缩进、80 列、JS/TS 双引号、允许处省分号。写回 `board.ts` 的字段行必须与既有格式一致（item 缩进 2 空格、其字段缩进 4 空格，如 `    x: 0.15,`）。
- **dev-only 零生产痕迹**：组件 `if (import.meta.env.PROD) return`，端点 `apply: "serve"`——生产产物既无浮条 markup 也无 `/api/board/layout` 路由。
- **i18n 双份**：新增界面词必须同时补 `UI_STRINGS` 的 `zh` 与 `en`（`src/lib/i18n.ts` 是唯一来源）。
- **几何值约定**：`x/y ∈ [0,1]`（相对板面）、`rotate` 度数（SSR/ops 以 `${deg}deg` 存进 `--rot`，parseFloat 取数）、`z` 整数层级、`scale` 缺省 `1`（`--s`，仅非 1 才落字段）、`flip` 缺省 `false`（`--sx === -1`）。写回时数值统一保留至多 4 位小数（`round4`）。
- **测试脚本 `.env` 处理**：先备份 `.env`、写入受控内容（`SITE_URL` 等），`trap` 退出时恢复原文件（同 board-check.sh / translate-ui-check.sh）。

---

## Task 1: 数据模型与 SSR 双向一致

给 `BoardItem` 增可选几何字段，`getBoardViews` 透传，`Board.astro` SSR 时落到 piece 的 `data-id` 与 `--s/--sx`，并让窄屏只读网格回退里 `--sx` 镜像不破坏静态排布。**这是后续所有 Task 的地基：端点写回的字段、编辑器读取的属性，都必须先在这条渲染链上成立。**

**Files:**
- Modify: `src/data/board.ts`（`BoardItem` 类型，`scale?`/`flip?` 字段；在示例 item 上补一处非默认值以驱动断言）
- Modify: `src/lib/content.ts:141-198`（`BoardView` 类型加 `scale?`/`flip?`；`getBoardViews` map 透传）
- Modify: `src/components/Board.astro:70-131`（piece 加 `data-id`、style 追加 `--s`/`--sx`）
- Test: `scripts/tests/board-check.sh`（追加断言）

**Interfaces:**
- Consumes: 无（起点）
- Produces:
  - `BoardItem` 增：`scale?: number`（显示缩放倍率，映射 `--s`）、`flip?: boolean`（水平镜像，映射 `--sx`）
  - `BoardView` 增：`scale: number`（恒有值，缺省 `1`）、`flip: boolean`（恒有值，缺省 `false`）——`Board.astro` 与编辑器脚本按此消费
  - `board-piece` DOM：`data-id="<id>"`、内联 `--s:<num>`、`--sx:<1|-1>`

- [ ] **Step 1: 在 board-check.sh 追加失败断言**

在「板 SSR 静态渲染」段落末尾追加（先让测试红）：

```bash
# ---------- dev 编辑器：几何双向一致的渲染前置 ----------
assert_match dist/board/index.html 'board-piece[^>]*data-id="astro"' "piece 带 data-id（保存配对键）"
assert_match dist/board/index.html 'board-piece[^>]*--sx:' "piece SSR 即写 --sx（镜像可往返）"
```

- [ ] **Step 2: 跑 board-check.sh 确认失败**

运行：`bash scripts/tests/board-check.sh`
Expected: FAIL（`data-id` / `--sx` 未找到）——当前 piece 无 `data-id`，style 仅 `--x/--y/--rot/--z`。

- [ ] **Step 3: 扩展 `BoardItem` 类型**

`src/data/board.ts` 的 `BoardItem`，在 `size?: number` 注释块之后、`href?` 之前补：

```ts
  /** 显示缩放倍率（映射 piece 的 `--s`），缺省 1；仅非 1 才落字段 */
  scale?: number
  /** 水平镜像（映射 piece 的 `--sx`），缺省 false */
  flip?: boolean
```

为驱动 `--sx` 断言，给某件（如 `id: "coastal-stamp"`）补 `flip: true`（该件为占位、可安全改动），并在文件顶部 `L10n` 注释里把几何清单从「`x/y/rotate/z/w/h`」更新为「`x/y/rotate/z/w/h/scale/flip`」。

- [ ] **Step 4: `BoardView` 与 `getBoardViews` 透传**

`src/lib/content.ts`：`BoardView` 在 `size?: number` 下补 `scale: number` 与 `flip: boolean`（必填，恒有值）。`getBoardViews` 的 map 中，`size: item.size,` 之后补：

```ts
      scale: item.scale ?? 1,
      flip: item.flip ?? false,
```

- [ ] **Step 5: Board.astro SSR 写 data-id 与 --s/--sx**

`src/components/Board.astro:71` 把 style 组装改为包含 `--s`、`--sx`，并在 piece 上加 `data-id`：

```ts
      const style = `--x:${v.x}; --y:${v.y}; --rot:${v.rotate}deg; --z:${v.z}; --s:${v.scale}; --sx:${v.flip ? -1 : 1}`
```

```html
        <board-piece
          data-id={v.id}
          data-kind={v.kind}
          style={style}
          role="group"
          aria-label={v.title}
        >
```

`--s`/`--sx` 恒写（值为默认 `1`）不影响现有 transform（`scale(var(--s,1))`、`scaleX(var(--sx,1))` 本就默认 1）；`coastal-stamp` 因 `flip:true` 得 `--sx:-1`，满足断言。

- [ ] **Step 6: 跑 board-check.sh 确认通过 + 构建**

运行：`bash scripts/tests/board-check.sh`（应全绿，含新两条）；再 `npm run build`（`--s/--sx` 不破坏齿孔 mask，`transform` 不含位移故拖拽边界不变）。

- [ ] **Step 7: 提交**

```bash
git add src/data/board.ts src/lib/content.ts src/components/Board.astro scripts/tests/board-check.sh
git commit -m "Board: piece 带 data-id 与 --s/--sx，几何双向一致的地基"
```

---

## Task 2: board.ts 源码逐字段改写（纯函数 + 离线回归）

实现 `patchBoardSource(source, patches)`：按 `id` 定位每个 item 块，只改写 `x/y/rotate/z/scale/flip` 六个几何字段行（缺失且值非默认才插入），其余行（含「占位来源」注释、`title`/`alt` 等）逐字保留。这是整个功能最易碎的一环，用**不触碰真实文件、不启 dev server** 的离线字符串断言钉死格式。

**Files:**
- Create: `src/lib/board-source-patch.ts`
- Test: `scripts/tests/board-source-patch-check.sh`

**Interfaces:**
- Consumes: 无（纯字符串函数）
- Produces:
  - `type BoardLayoutPatch = { id: string; x: number; y: number; rotate: number; z: number; scale: number; flip: boolean }`
  - `function patchBoardSource(source: string, patches: BoardLayoutPatch[]): string`
  - `function round4(n: number): number`（内部，导出供测试可选）

- [ ] **Step 1: 写离线断言脚本（先红）**

`scripts/tests/board-source-patch-check.sh`：以 `node --input-type=module` 内联 import 编译后的函数不可靠（TS 需构建），改为**用 `astro`/`tsx`? 项目无 tsx**——故脚本直接跑一段 `node` ESM，用 `--experimental-strip-types` 读取源文件（Node ≥22.12 支持类型剥离）。脚本骨架：

```bash
#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"; cd "$root"
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
node --experimental-strip-types --no-warnings - <<'EOF' || fail "patchBoardSource 断言未通过"
import assert from "node:assert"
import { patchBoardSource } from "./src/lib/board-source-patch.ts"

const SRC = `export const BOARD_ITEMS = [
  {
    id: "a",
    kind: "badge",
    image: x,
    x: 0.15,
    y: 0.2,
    rotate: -4,
    z: 1,
    href: "https://e.com",
    title: { zh: "A" }, // 行内注释须保留
  },
  {
    id: "b",
    kind: "stamp",
    x: 0.5,
    y: 0.5,
    // 占位来源，后续替换
    href: "https://f.com",
  },
]
`

// a：改 x/y/rotate/z，镜像 flip→新增 --sx 字段
const out = patchBoardSource(SRC, [
  { id: "a", x: 0.3, y: 0.4, rotate: 2, z: 7, scale: 1.5, flip: true },
  // b：rotate/z 缺省(0) 不新增；仅改坐标
  { id: "b", x: 0.1, y: 0.9, rotate: 0, z: 0, scale: 1, flip: false },
])

// 断言 1：a 的 x 行被精确替换为 4 位小数格式
assert.ok(/\n {4}x: 0\.3,\n/.test(out), "a.x 未替换")
assert.ok(/\n {4}y: 0\.4,\n/.test(out), "a.y 未替换")
assert.ok(/\n {4}rotate: 2,\n/.test(out), "a.rotate 未替换")
assert.ok(/\n {4}z: 7,\n/.test(out), "a.z 未替换")
// 断言 2：a 新增 scale/flip（原本无）
assert.ok(/\n {4}scale: 1\.5,\n/.test(out), "a.scale 未新增")
assert.ok(/\n {4}flip: true,\n/.test(out), "a.flip 未新增")
// 断言 3：非几何字段与注释逐字保留
assert.ok(out.includes('href: "https://e.com",'), "a.href 丢失")
assert.ok(out.includes("title: { zh: \"A\" }, // 行内注释须保留"), "行内注释丢失")
assert.ok(out.includes("// 占位来源，后续替换"), "b 整块注释丢失")
// 断言 4：b 仅改坐标，未凭空补 rotate/z/scale/flip
assert.ok(/\n {4}x: 0\.1,\n {4}y: 0\.9,/.test(out), "b 坐标未改")
assert.ok(!out.includes('id: "b"') === false)
const bBlock = out.slice(out.indexOf('id: "b"'), out.indexOf("]", out.indexOf('id: "b"')))
assert.ok(!/rotate:/.test(bBlock), "b 不应新增 rotate（值为 0 默认）")
assert.ok(!/scale:/.test(bBlock), "b 不应新增 scale（值为 1 默认）")
assert.ok(!/flip:/.test(bBlock), "b 不应新增 flip（值 false 默认）")
// 断言 5：未知 id 被安全忽略、不改结构
assert.ok(patchBoardSource(SRC, [{ id: "zzz", x: 0, y: 0, rotate: 0, z: 0, scale: 1, flip: false }]).includes('id: "a"'), "未知 id 破坏了源")
// 断言 6：幂等——对已 patch 结果再 patch 同值，输出不变
assert.strictEqual(patchBoardSource(out, [
  { id: "a", x: 0.3, y: 0.4, rotate: 2, z: 7, scale: 1.5, flip: true },
]), out, "非幂等：二次同值改写改变了源")
console.log("ALL PASS")
EOF
pass "patchBoardSource 全部离线断言"
```

- [ ] **Step 2: 跑脚本确认失败**

运行：`bash scripts/tests/board-source-patch-check.sh`
Expected: FAIL（`Cannot find module ... board-source-patch.ts`）。

- [ ] **Step 3: 实现 patchBoardSource**

`src/lib/board-source-patch.ts`。算法（实现者按此写）：

1. `round4(n) = Math.round(n * 1e4) / 1e4`，并处理 `-0 → 0`。
2. 把 `source` 按行切分。识别每个 item 块：块以一行 `^\s*id: "<id>",?$` 为锚，向后直到「下一个 `id:` 锚行」或数组结束（首个 `^\];` 行）为止，得到该 id 管辖的行区间 `[start, end)`。取该区间构造 `blockText`。
3. 对每个 patch：在其块区间内处理六字段——
   - 现值行匹配 `^(\s*)(x|y|rotate|z|scale|flip):\s*([-0-9.]+|true|false),?\s*$`。
   - `x/y`：总是替换为 `round4` 值。
   - `rotate/z`：块内已有对应行→替换；无且 `round4(value)!==0`→在锚点后插入一行；无且值为 0→不插入。
   - `scale`：已有→替换（值为 1 时可保留原行或删行，选择：值≠1 才写入/保留，值=1 且原行存在则删除该行以回默认）；无且值≠1→插入。
   - `flip`：已有→替换；无且 `true`→插入；值为 `false` 时删除已有行回默认。
   - 插入位置：紧跟块内最后一条已存在的几何字段行之后（若块内无任何几何行，则紧跟 `id:` 锚行之后）。缩进沿用锚行缩进（4 空格）。
4. 块内非几何字段行、注释行、`title`/`alt` 内联对象**原样输出**。
5. 返回所有行重新 `join("\n")`，保留原有首尾空行与结尾换行。

注意 `title: { zh: "A" }, // 行内注释须保留` 这类整行内联对象不是几何字段行，正则不匹配，自然保留。`image: x,`、`href: "..."` 同理。几何字段值可能为 `true/false`（flip），故 `bool` 分支要覆盖。

- [ ] **Step 4: 跑脚本确认通过**

运行：`bash scripts/tests/board-source-patch-check.sh`
Expected: `ALL PASS` + `PASS  patchBoardSource 全部离线断言`。

- [ ] **Step 5: 格式检查 + 提交**

运行：`npm run format:check`（对 `src/lib/board-source-patch.ts` 通过）。

```bash
git add src/lib/board-source-patch.ts scripts/tests/board-source-patch-check.sh
git commit -m "Add patchBoardSource: 收藏板布局按 id 逐字段改写 board.ts 源码"
```

---

## Task 3: dev 写入端点（Vite 插件，apply:"serve"）

把 `patchBoardSource` 接到 HTTP：`POST /api/board/layout` 收当前板全部几何，读 `src/data/board.ts`、改写、写回、触发 `full-reload`。含服务端校验（x/y∈[0,1]、rotate/z/scale/flip 类型、未知 id 拒绝）避免脏数据落盘。

**Files:**
- Create: `src/lib/board-editor-plugin.ts`
- Modify: `astro.config.ts:14-33`（import 并注册 `boardEditorPlugin()`）
- Test: `scripts/tests/board-layout-check.sh`

**Interfaces:**
- Consumes: `patchBoardSource`、`BoardLayoutPatch`（Task 2）
- Produces:
  - `function boardEditorPlugin(): Plugin`（`apply:"serve"`，路由 `POST /api/board/layout`）
  - HTTP 契约：请求体 `{ items: BoardLayoutPatch[] }`；成功 `200 { ok: true, updated: number }`；校验失败 `400 { ok: false, error: string }`；写盘异常 `500 { ok: false, error: string }`
  - `validateLayoutItems(raw: unknown): { ok: true; items: BoardLayoutPatch }[] | { ok: false; error }`（纯函数，导出供测试）

- [ ] **Step 1: 写端点回归脚本（先红）**

`scripts/tests/board-layout-check.sh`：受控 `.env`（SITE_URL）、备份/恢复、以 `--experimental-strip-types` 直接单测 `validateLayoutItems`（不启 dev server，保持轻且确定），并单独起一次 `astro dev`（端口 4398）验证路由存在与 `board.ts` 能被端点安全往返。核心段落：

```bash
# 段 A：validateLayoutItems 纯逻辑
node --experimental-strip-types --no-warnings - <<'EOF' || fail "validateLayoutItems 断言失败"
import assert from "node:assert"
import { validateLayoutItems } from "./src/lib/board-editor-plugin.ts"
assert.ok(validateLayoutItems({ items: [
  { id: "a", x: 0.5, y: 0.5, rotate: 0, z: 1, scale: 1, flip: false },
]}).ok, "合法载荷应通过")
assert.strictEqual(validateLayoutItems({ items: [
  { id: "a", x: 1.5, y: 0.5, rotate: 0, z: 1, scale: 1, flip: false },
]}).ok, false, "x>1 应拒绝")
assert.strictEqual(validateLayoutItems({ items: [] }).ok, false, "空 items 应拒绝")
assert.strictEqual(validateLayoutItems({}).ok, false, "缺 items 应拒绝")
console.log("VALIDATE OK")
EOF
pass "validateLayoutItems 纯逻辑"

# 段 B：dev server 起停，端点存在（HEAD/OPTIONS 或 POST 非法体→400 而非 404）
printf 'SITE_URL=https://example.com\n' > .env
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:4398/; then fail "端口 4398 被占用"; fi
ASTRO_DEV_BACKGROUND=1 ./node_modules/.bin/astro dev --port 4398 --ignore-lock --host 127.0.0.1 > "$WORK/dev.log" 2>&1 &
DEV_PID=$!
wait_dev_ready   # 轮询首页 ≤60s（复用 translate-ui-check.sh 同款函数）
code=$(curl -s -o "$WORK/body.json" -w '%{http_code}' -X POST \
  -H 'content-type: application/json' --data '{}' http://127.0.0.1:4398/api/board/layout)
# 空/非法体：400（说明路由已挂载），绝非 404（未挂载）
assert_code_400() { [ "$code" = "400" ] || fail "非法体应 400，实得 $code"; }
assert_code_400
pass "POST /api/board/layout 已挂载（非法体 400）"
```

`trap` 里 `kill $DEV_PID`、恢复 `.env`、`rm -rf "$WORK"`。脚本另加一段「往返安全」：备份真实 `src/data/board.ts` → 用一份只含现有真实 id 的当前值 POST → 断言文件 `npm run build` 仍通过且 `git diff --quiet src/data/board.ts`（值未变即不改写）→ 无论如何 trap 恢复该文件。

- [ ] **Step 2: 跑脚本确认失败**

运行：`bash scripts/tests/board-layout-check.sh`
Expected: FAIL（import 失败或路由 404）。

- [ ] **Step 3: 实现 plugin + validateLayoutItems**

`src/lib/board-editor-plugin.ts`。复用 translate-dev-plugin / moment-composer-plugin 同款 `readBody`/`sendJson`（小段复制，保持零耦合，项目既有惯例）。

```ts
import { readFile, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { Plugin } from "vite"
import { type BoardLayoutPatch, patchBoardSource } from "./board-source-patch"

type ValidationResult =
  | { ok: true; items: BoardLayoutPatch[] }
  | { ok: false; error: string }

export function validateLayoutItems(raw: unknown): ValidationResult {
  // raw.items 必须为非空数组；每项 id 非空 string、x/y 数字且∈[0,1]、
  // rotate/z/scale 有限数、flip 布尔。任一不满足→{ok:false,error:"..."}
}

export function boardEditorPlugin(): Plugin {
  return {
    name: "astro-erudite:board-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/board/layout", async (req, res, next) => {
        if (req.method !== "POST") { next(); return }
        // readBody → JSON.parse（失败 400）→ validateLayoutItems（失败 400）
        // → 读 path.resolve(server.config.root, "src/data/board.ts")
        // → patched = patchBoardSource(text, items)
        // → 若 patched === text 直接回 200 {updated:0}（不写盘、不 reload）
        // → 否则 writeFile，setTimeout(150) full-reload，回 200 {updated:items.length}
        // → catch 500 { error: "写入失败，请查看终端日志" } 并 console.error
      })
    },
  }
}
```

校验细节：`x`/`y` 越界（<0 或 >1）、`NaN`、`typeof` 不符分别给可辨识 `error` 文案；`items` 为空数组拒绝（防「一键清空」误写）。

- [ ] **Step 4: 注册插件**

`astro.config.ts`：在 `translateDevPlugin` import 之后加 `import { boardEditorPlugin } from "./src/lib/board-editor-plugin"`，并把 `vite.plugins` 改为 `[momentComposerPlugin(), translateDevPlugin(), boardEditorPlugin()]`。

- [ ] **Step 5: 跑端点脚本至全绿**

运行：`bash scripts/tests/board-layout-check.sh`
Expected: 全部 PASS（含往返段：对真实 board.ts 用其当前值 POST 不产生 diff）。若 dev server 未就绪，查 `$WORK/dev.log`。

- [ ] **Step 6: 格式检查 + 提交**

```bash
git add src/lib/board-editor-plugin.ts astro.config.ts scripts/tests/board-layout-check.sh
git commit -m "收藏板布局端点：dev-only POST /api/board/layout 写回 board.ts"
```

---

## Task 4: dev 编辑器浮条 UI + 保存逻辑 + i18n

`astro dev` 下 `/board` 板下出现「保存布局」浮条（模式同 MomentComposer：仅 dev、仅该页），点击收集所有 `board-piece` 的当前几何 POST 到端点，状态回报「保存中/已保存 N 枚/失败」。生产构建零痕迹。

**Files:**
- Create: `src/components/BoardEditorBar.astro`
- Modify: `src/components/Board.astro:47-48`（`PROD` 早退处引入）、`src/components/Board.astro` 脚本段（把 piece 几何收集封装成可被浮条调用的方式）
- Modify: `src/lib/i18n.ts:78-96`（新增 `boardSave*` 界面词，zh+en）
- Test: `scripts/tests/board-check.sh`（追加「生产无编辑条」断言）

**Interfaces:**
- Consumes: `stamp-board` 的 `board-piece[data-id]` 与内联 `--x/--y/--rot/--z/--s/--sx`（Task 1）；`POST /api/board/layout`（Task 3）；`t(locale, key)`
- Produces: `<board-editor>` 元素（仅 dev 渲染），内含保存钮 `.board-save-btn` 与 `role="status"` 状态区

- [ ] **Step 1: 追加生产缺失断言（先红）**

`board-check.sh` 追加：

```bash
# ---------- dev 编辑器生产零痕迹 ----------
assert_lacks dist/board/index.html "<board-editor" "生产产物无编辑条"
```

- [ ] **Step 2: 跑确认失败/基线**

当前尚无 `<board-editor>`，`assert_lacks` 天然通过——此步为锁定「不得泄漏」契约（真正的红/绿由 dev 手动验证 Step 6 覆盖）。运行：`bash scripts/tests/board-check.sh`，Expected: 全绿（含新断言）。

- [ ] **Step 3: 补 i18n 界面词**

字典结构（`src/lib/i18n.ts`）：zh 是唯一键源 `const ZH_STRINGS = { ... }`（`boardInfoClose` 在其内），`UI_STRINGS: Record<Locale, Record<UIKey, string>> = { zh: ZH_STRINGS, en: { ... } }` 中 `en` 为内联对象、须与 zh 键一一对应。故须在**两处**各加四个 key。

`ZH_STRINGS` 的 `boardInfoClose: "关闭信息",` 之后加：

```ts
  boardSave: "保存布局",
  boardSaving: "保存中…",
  boardSaved: "已保存布局",
  boardSaveError: "保存失败",
```

`UI_STRINGS` 内 `en` 对象的 `boardInfoClose: "Close info",` 之后加：

```ts
  boardSave: "Save layout",
  boardSaving: "Saving…",
  boardSaved: "Layout saved",
  boardSaveError: "Save failed",
```

（两侧键不齐会破坏 `en` 的 full key parity 检查，构建报错兜住。）

- [ ] **Step 4: Board.astro 内联几何收集**

在 `stamp-board` 的 `connectedCallback` 内，`ops` 定义附近补一个收集函数并挂到元素上供浮条调用（或直接由浮条脚本自行读取 DOM——**选择后者以保持组件边界清晰**：浮条自带脚本，遍历 `board-piece` 读属性，不侵入 `stamp-board`）。因此本步仅在模板层放置编辑条占位，收集逻辑落在 BoardEditorBar.astro。`Board.astro` frontmatter 顶部（`if (import.meta.env.PROD) return` 不适用，因整页需渲染）改为条件渲染：在 `</stamp-board>` 之前加：

```html
  {import.meta.env.PROD ? null : <BoardEditorBar locale={locale} />}
```

并在文件顶部 import：`import BoardEditorBar from "./BoardEditorBar.astro"`。

- [ ] **Step 5: 实现 BoardEditorBar.astro**

新组件，`---` 首行 `if (import.meta.env.PROD) return`（同 MomentComposer.astro 第 4 行）。模板：

```html
<board-editor>
  <button type="button" class="board-save-btn">{t(locale, "boardSave")}</button>
  <span class="board-save-status" role="status" aria-live="polite"></span>
</board-editor>
```

`<script>`：绑定保存钮 `click`：

```ts
;(() => {
  const bar = document.querySelector("board-editor")
  if (!bar) return
  const btn = bar.querySelector<HTMLButtonElement>(".board-save-btn")!
  const status = bar.querySelector<HTMLElement>(".board-save-status")!
  const S = { saving: /* t 注入 */, saved: /* ... */, error: /* ... */ }
  const num = (el: HTMLElement, name: string, def = 0) => {
    const v = parseFloat(el.style.getPropertyValue(name))
    return Number.isFinite(v) ? v : def
  }
  btn.addEventListener("click", async () => {
    const items = [...document.querySelectorAll<HTMLElement>("board-piece")].map(
      (p) => ({
        id: p.dataset.id!,
        x: num(p, "--x"),
        y: num(p, "--y"),
        rotate: num(p, "--rot"),
        z: num(p, "--z"),
        scale: num(p, "--s", 1),
        flip: num(p, "--sx", 1) === -1,
      }),
    )
    btn.disabled = true
    status.textContent = S.saving
    try {
      const res = await fetch("/api/board/layout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "bad")
      status.textContent = `${S.saved}（${data.updated}）`
    } catch {
      status.textContent = S.error
    } finally {
      btn.disabled = false
    }
  })
})()
```

界面词经 frontmatter 注入：`<script is:inline define:vars={{ S: { saving: t(locale,"boardSaving"), saved: t(locale,"boardSaved"), error: t(locale,"boardSaveError") } }}>`（或用 `data-*` 属性把文案交给脚本，二选一，遵循项目内 MomentComposer 的实际做法）。

`<style>`：编辑条低调摆在板下提示行之后，`display:flex; gap; margin-top; font-family: var(--font-mono); font-size: var(--step--1)`；保存钮用 Radix border/accent，圆角 `var(--radius-sm)`（呼应 Zed 利落感，同 docs/qoder 里 MomentComposer 规格）。

- [ ] **Step 6: dev 手动验证**

`npm run dev` 打开 `/board`：拖动/缩放/旋转/镜像/叠放几枚物件 → 点「保存布局」→ 状态显示「已保存布局（N）」、终端无错、页面 reload 后位置保持（因已写回 board.ts）。`/en/board` 同样可用。检查暗/亮主题、窄屏（编辑条可隐藏或保留，取项目窄屏惯例）。

- [ ] **Step 7: 构建 + 提交**

运行：`bash scripts/tests/board-check.sh`（生产无编辑条断言绿）、`npm run build`。

```bash
git add src/components/BoardEditorBar.astro src/components/Board.astro src/lib/i18n.ts scripts/tests/board-check.sh
git commit -m "收藏板 dev 保存浮条：收集 piece 几何 POST 端点，生产零痕迹"
```

---

## Task 5: 文档、AGENTS 同步与全站回归

补齐组件用法文档与仓库指引，跑全量回归确认 i18n/board/translate 各检查与构建互不破坏。

**Files:**
- Modify: `docs/components/board.md`（追加「dev 布局编辑器」小节）
- Modify: `AGENTS.md`（测试段落列出新脚本；dev 编辑器一句）
- Test: 全量 `board-check.sh`、`board-source-patch-check.sh`、`board-layout-check.sh`、`i18n-check.sh`、`npm run build`

**Interfaces:**
- Consumes: Task 1–4 全部产物
- Produces: 文档与验证记录（无代码接口）

- [ ] **Step 1: board.md 追加 dev 编辑器小节**

在 `docs/components/board.md` 末尾补一段：说明 `/board` 在 `astro dev` 下有「保存布局」浮条，几何经 `POST /api/board/layout` 逐字段写回 `src/data/board.ts`（保留注释/文案），生产无痕迹；配对键为 `board-piece[data-id]`，字段 `x/y/rotate/z/scale/flip`。用法与端点契约、离线测试脚本名列出。

- [ ] **Step 2: AGENTS.md 同步**

「测试与验证指南」列出新增两脚本 `board-source-patch-check.sh`（离线，无需 API key/dev server 之外的东西）与 `board-layout-check.sh`（起停 dev server）。在 dev 翻译按钮小节后补「### dev 收藏板布局编辑器」一句：模式同 Moment Composer，`import.meta.env.PROD` 零痕迹。

- [ ] **Step 3: 全量回归**

依次运行并确认全绿：
```bash
bash scripts/tests/board-source-patch-check.sh
bash scripts/tests/board-layout-check.sh
bash scripts/tests/board-check.sh
bash scripts/tests/i18n-check.sh
npm run format:check
npm run build
```
Expected: 各检查 `PASS`/`ALL PASS` 无 FAIL；`format:check` 无 diff；`build` 成功且 `dist/board/index.html` 无 `<board-editor`。

- [ ] **Step 4: 提交**

```bash
git add docs/components/board.md AGENTS.md
git commit -m "文档：收藏板 dev 布局编辑器用法与回归脚本说明"
```

---

## Review Focus

计划覆盖的既定需求之外，以下输入/失效模式最可能在交付后伤人，各自的钉死测试已并入对应 Task：

- **未知/畸形 id 不得破坏 board.ts**：编辑器可能发送被删/改名物件的陈旧 id。`patchBoardSource` 对未知 id 静默跳过、不改结构（Task 2 Step 1 断言 5）；端点 `validateLayoutItems` 拒绝空 `items`（Task 3）。
- **逐字段改写必须保留注释与非几何字段**：`board.ts` 含「占位来源」整行注释、行内 `// 注释`、内联 `title/alt` 对象。`patchBoardSource` 只动六几何字段行（Task 2 Step 1 断言 3、4）。
- **幂等与「无变化不写盘」**：同值二次保存不得产生 diff、不得触发 reload（Task 2 断言 6 + Task 3 段 B 往返 `git diff --quiet`）。避免每次点保存都搅动工作区。
- **默认值回写策略**：`scale===1`/`flip===false`/`rotate===0`/`z===0` 时删除或省略对应字段行，回默认而非留 `scale: 1` 噪声（Task 2 Step 1 断言 4）。
- **生产零痕迹**：编辑条 markup 与 `/api/board/layout` 路由都不得进产物（Task 4 Step 1 `assert_lacks "<board-editor"` + `apply:"serve"`）。
- **窄屏只读网格**：`<64rem` 时 piece 为 `position:static`、无浮层；保存仍按 `data-id` 读 `--x/--y` 写回（值来自 SSR 默认，不改即保持）——手动验证需覆盖窄屏不误清空坐标（Task 4 Step 6）。
