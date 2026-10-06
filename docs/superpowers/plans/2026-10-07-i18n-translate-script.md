# 翻译脚本（阶段二）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `scripts/translate.mjs`：一条命令把单篇/系列中文博客翻译为同目录 `.en.md`（frontmatter + 保结构正文），写盘前自动结构校验；校验或接口失败绝不产出半成品。

**Architecture:** 零依赖 Node ESM CLI（全局 `fetch` 调 OpenAI 兼容 Chat Completions；`process.loadEnvFile()` 读 `.env`）。frontmatter 走独立 JSON 请求（title/description），正文按 `##` 边界分块（约 6000 字符阈值）、逐块携带已译上下文，`finish_reason=length` 时自动续写；输出先经结构校验器（代码块/`:::`/公式/行内代码/图片/链接/frontmatter 逐项比对），通过才写内容目录，否则工件落 `.translate/` 并以非 0 退出。离线回归用本地 HTTP 桩 + bash 断言（沿用 `scripts/tests/` 惯例）。

**Tech Stack:** Node ≥ 22.12（本机 v24；`process.loadEnvFile`、全局 `fetch`、`node:http` 桩）、Bash 3.2 测试脚本、Biome。

**Spec:** `docs/superpowers/specs/2026-10-06-i18n-design.md`（执行者需一并阅读；本计划实现其「翻译脚本（阶段二）」章节。阶段一已合并 `main@5c129ae`）

## Global Constraints

- 包管理器用 npm（用户偏好）：每个任务结束前 `npm run format:check` 必须通过并产生一次提交。本计划不修改 `src/`（站点代码与内容），`npm run build` 留给 Task 7 全量验证（经 `i18n-check.sh` 执行）。
- 零新增依赖：`scripts/translate.mjs` 与测试桩只用 Node 内置（`node:` 前缀）与全局 `fetch`；不得改 `package.json` 的 dependencies/devDependencies。
- 脚本 ESM（`.mjs`），不 import `src/`（TS 不可直接加载）；`.en` 标记为脚本内字面量（与 `src/lib/i18n.ts` 的 `MARKER` 重复属有意，零耦合）。
- 终端输出中文；错误统一以 `错误：` 开头写 stderr；失败退出码 1，成功 0。
- `.env` 读取：`process.loadEnvFile()`（try/catch 忽略 `ENOENT`）→ 读 `process.env`。实测 loadEnvFile **不覆盖**已存在变量（环境变量 > `.env`）。`TRANSLATE_*` 为空字符串按缺失处理。
- 配置键固定：`TRANSLATE_BASE_URL` / `TRANSLATE_API_KEY` / `TRANSLATE_MODEL`。请求 URL = `baseUrl` 去尾部 `/` + `/chat/completions`；头 `Authorization: Bearer <key>`、`Content-Type: application/json`；体 `{model, messages, stream:false}`。
- 目标语言当前仅 `en`（`--to en` 为默认；其他值报错，参数位预留）。
- 目标文件 `X.en.md` 与源同目录；失败工件 `.translate/`（cwd 根；`.gitignore` 由 Task 1 加入）。**校验通过前不得写内容目录**；`--force` 也绝不覆盖为半成品。
- 重试：429/5xx/网络错误 → 退避 500ms/1000ms/2000ms、最多 3 次重试（合计最多 4 次尝试）；401/403 立即失败不重试。
- 提示词与消息结构固定（Task 2 定义）：system 规则清单 +「仅输出译文」；user 消息用 `<<<SOURCE` / `>>>SOURCE` 分隔源文；续写 user 消息含「继续输出」。
- 分块：`## ` 行边界；贪心累加，超过 6000 字符（`String.length`）先冲刷；单个 `##` 段超阈值独立成块（不二次切分）。块译文 trim 后以 `\n\n` 拼接。
- 已译上下文：最近译文的**尾部 1500 字符**；同文件内=已拼接译文，跨文件=上一篇译文（跳过文件取盘上既有 `.en.md` 的尾段）。
- 结构校验项（源 vs 译文逐项相等）：代码块数量与语言（围栏信息串多重集）、`:::` 开合数量与指令类型多重集、公式数量（`$$` 成对数 + 行内 `$…$` 数）、行内代码数量、图片引用 URL 集合、链接 URL 集合、frontmatter 必填字段与 `aiTranslated: true`。统计前先剥离围栏代码块与行内代码（防误报）。问题清单类别词固定：`代码块`、`callout`、`公式`、`行内代码`、`图片`、`链接`、`frontmatter`。
- 测试载体 `scripts/tests/translate-check.sh`（风格照 `scripts/tests/deploy-check.sh`、`i18n-check.sh`）：场景隔离于 `/tmp/translate-check/`；受控 `.env`（备份→写→`trap` 恢复）；桩 `scripts/tests/translate-stub.mjs`；fixtures 在 `scripts/tests/fixtures/translate/`（每个场景 `cp -R` 到 /tmp 后操作，绝不写坏仓库文件）；`.translate/` 每场景清理。
- Biome：2 空格、80 列、双引号、无分号（`npm run format` 自动处理，勿手改格式）。
- macOS bash 3.2：变量名后紧跟中文多字节字符时一律用 `${VAR}` 花括号（见 `scripts/deploy.sh` 既有教训）。

## Review Focus

以下五类是 spec 暗示、但最容易翻车的输入/失败模式；每个任务中的对应断言已在本计划固定：

1. **失败零落盘**：结构校验失败、frontmatter 响应无效、API 持续失败时，内容目录零写入；`--force` 场景既有 `X.en.md` 也不得被半成品覆盖（spec「宁可不落盘」核心）—— Task 5。
2. **校验器的双向正确性**：fixture 陷阱（代码块内 `$` 与 `:::`、行内代码内 `$`）不得误报；6 个 corrupt 场景（代码块/`:::`/图片/链接/行内代码/公式各缺一项）必须逐类捕获 —— Task 2（陷阱 fixture）+ Task 5。
3. **系列链正确性**：`order` 排序（非文件名序）、`_` 前缀排除、跳过文件用盘上译文续上下文、失败即停（后续文件零请求） —— Task 4 + Task 5。
4. **截断与重试边界**：`finish_reason=length` 续写拼接完整、每块最多 3 次续写后失败；429/5xx 恰 3 次重试（4 次尝试）、401 单次即败 —— Task 3 + Task 6。
5. **配置与入口边界**：缺 `.env`/缺 `TRANSLATE_*` 给照抄指引；`--dry-run` 无配置可用且**零网络调用**；`.en.md`/`_` 前缀/非 `.md` 输入拒绝（防把译文再翻译） —— Task 1。

---

### Task 1: CLI 骨架、配置加载、文件发现与计划输出

**Files:**
- Create: `scripts/translate.mjs`
- Create: `scripts/tests/translate-check.sh`
- Create: `scripts/tests/fixtures/translate/single.md`、`scripts/tests/fixtures/translate/series/index.md`、`series/alpha.md`、`series/beta.md`、`series/_wip.md`
- Modify: `package.json`（`"translate": "node scripts/translate.mjs"`，紧邻 `"astro"` 脚本）
- Modify: `.env.example`（文件末尾追加 `TRANSLATE_*` 三项说明，见下）
- Modify: `.gitignore`（`.astro/` 之后加一行 `.translate/`）

**Interfaces（Produces，后续任务与测试消费）:**

CLI：`npm run translate -- <路径> [--to en] [--force] [--dry-run]`

- 退出码：成功 0；一切错误 1（错误信息 stderr、`错误：` 前缀）。
- 输出子串（测试断言依赖）：`用法：`；`将翻译`；`将翻译（覆盖）`；`跳过（已存在译文）`；`--dry-run`；`错误：`。
- `--dry-run`：跳过配置校验、零网络调用、零写盘；仅打印计划（每文件一行）。
- 发现规则：路径不存在 → `错误：路径不存在`；非 `.md` → 报错；`_` 前缀文件名 → `错误：拒绝翻译 _ 前缀草稿`；`.en.md` 输入 → `错误：输入已是英文译文文件`；目录且含 `index.md` → 系列（`index.md` + 同级非 `_`、非 `.en.md` 的 `.md` 文件）；目录缺 `index.md` → 报错；多个路径参数 → 报错。
- 系列文件顺序：`index.md` 第一；子文章按 frontmatter `order` 升序（缺 `order` 排最后、同序按文件名）。
- 跳过判定在**读取源文件之前**：目标 `X.en.md` 存在且无 `--force` → 跳过（后续零 API）。
- `parseArgs` 只接受 `--to en`（空格形式）、`--force`、`--dry-run`；未知参数报错；`--to` 缺值或非 `en` → `用法：`/`暂仅支持`。

`.env.example` 追加内容（逐字，含注释；值为空占位，空串在脚本中按缺失处理）：

```bash
# 翻译脚本（scripts/translate.mjs，阶段二）：OpenAI 兼容接口。
# TRANSLATE_BASE_URL：任意 OpenAI 兼容端点的基地址（DeepSeek/OpenAI/…），
#   请求路径为 <BASE_URL>/chat/completions；TRANSLATE_MODEL：模型名。
TRANSLATE_BASE_URL=
TRANSLATE_API_KEY=
TRANSLATE_MODEL=
```

**fixtures（逐字落盘；它们是离线测试输入，不是站点内容）:**

`scripts/tests/fixtures/translate/single.md`（内含校验器陷阱：代码块里有 `$`、`:::` 与链接；行内代码里有 `$`）：

````md
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
````

`scripts/tests/fixtures/translate/series/index.md`：

```md
---
title: "系列示例：上下文传递"
description: "用于验证系列整组翻译与已译上下文传递。"
date: 2026-10-07
authors:
  - enscribe
---

## 系列开篇

INDEX-CONTEXT-MARKER 这是系列父文章，翻译后应作为子文章的已译上下文。
```

`scripts/tests/fixtures/translate/series/alpha.md`（`order: 2`，应先于文件名排序之后处理）：

```md
---
title: "Alpha：排序其二"
description: "order=2，验证按 order 排序。"
date: 2026-10-07
order: 2
authors:
  - enscribe
---

## Alpha 章

ALPHA-CONTEXT-MARKER 这是系列中 order 为 2 的子文章。
```

`scripts/tests/fixtures/translate/series/beta.md`（`order: 1` + `draft: true`，验证排序与「无 draft 门禁、原样复制」）：

```md
---
title: "Beta：排序其一"
description: "order=1 且 draft: true，验证复制而非门禁。"
date: 2026-10-07
order: 1
draft: true
authors:
  - enscribe
---

## Beta 章

BETA-CONTEXT-MARKER 这是系列中 order 为 1 的子文章（draft: true 不设门禁）。
```

`scripts/tests/fixtures/translate/series/_wip.md`（发现与翻译都必须跳过）：

```md
---
title: "草稿（不应被翻译）"
description: "下划线开头，翻译与发现都应跳过。"
date: 2026-10-07
authors:
  - enscribe
---

WIP-MARKER 本文件不应出现在任何请求或产物中。
```

**Steps:**

- [ ] **Step 1: 创建 fixtures（逐字落盘上表五个文件）**

- [ ] **Step 2: 创建 `scripts/tests/translate-check.sh`：骨架 + 场景 S1–S3**

骨架照 `i18n-check.sh`：`set -euo pipefail`、`root="$(git rev-parse --show-toplevel)"`、`pass/fail/assert_file/assert_has/assert_lacks/assert_count` 辅助（直接复制 i18n-check 的实现）；`WORK=/tmp/translate-check`，启动时 `rm -rf "$WORK" .translate`，`trap` 恢复 `.env` 并 `rm -rf "$WORK" .translate`。辅助函数：

- `write_env [base_url]`：写受控 `.env`（`SITE_URL=https://example.com` + 可选 `TRANSLATE_BASE_URL/TRANSLATE_API_KEY=test-key/TRANSLATE_MODEL=test-model`）。
- `run(...)`：`npm run translate -- "$@" > "$LOG" 2>&1; rc=$?`（用 `rc=0 … || rc=$?` 形态避开 `set -e`）。

场景与断言（`LOG` 为该场景输出日志）：

S1a dry-run 单篇（零网络证明）：`write_env "http://127.0.0.1:9/"`（关闭端口——若实现误发请求将重试约 3.5s 后失败）；`cp -R scripts/tests/fixtures/translate "$WORK/s1"`；`run "$WORK/s1/single.md" --dry-run` → rc 0；`assert_has "$LOG" "将翻译"`、`assert_has "$LOG" "single.en.md"`、`assert_lacks "$LOG" "重试"`；`[ ! -e "$WORK/s1/single.en.md" ]`。
S1b dry-run 系列：`run "$WORK/s1/series" --dry-run` → rc 0；含 `index.en.md`、`beta.en.md`、`alpha.en.md`；`assert_lacks "$LOG" "_wip"`。
S1c 跳过与覆盖的计划显示：`printf 'sentinel\n' > "$WORK/s1/single.en.md"`；`run "$WORK/s1/single.md" --dry-run` → rc 0、含 `跳过`；`run "$WORK/s1/single.md" --dry-run --force` → rc 0、含 `将翻译（覆盖）`。
S2 缺配置：`printf 'SITE_URL=https://example.com\n' > .env`；`run "$WORK/s1/single.md"` → rc 非 0；含 `TRANSLATE_BASE_URL`、`TRANSLATE_API_KEY`、`TRANSLATE_MODEL`、`.env.example`。
S3 参数错误（每次独立 `run`，皆 rc 非 0 + `错误：`）：
- `$WORK/s1/_draft.md`（先 `touch` 该文件）→ 含 `_`；
- `$WORK/s1/single.en.md`（先创建）→ 含 `已是`；
- `$WORK/s1/nope.md` → 含 `不存在`；
- 一个 `.txt` 文件 → 含 `.md`；
- `"$WORK/s1/series" --to fr` → 含 `仅支持`；`--to`（无值）→ 含 `用法`；
- `--bogus` → 含 `未知参数`；
- 两个路径参数 → 含 `用法`；
- 无位置参数 → 含 `用法`；
- 目录无 index.md（`mkdir -p $WORK/s3/nodir`）→ 含 `index.md`。

- [ ] **Step 3: 运行，期望失败**

Run: `bash scripts/tests/translate-check.sh`
Expected: 失败（`npm run translate` 报 Missing script: translate 或 `scripts/translate.mjs` 不存在）。

- [ ] **Step 4: 实现**

`package.json`、`.env.example`、`.gitignore` 按 Files 修改。`scripts/translate.mjs` 落地骨架（函数名与职责固定，后续任务在此扩展）：

```js
// 结构：parseArgs(argv) → {target, to, force, dryRun}
//       并导出/内部保留：
//       loadConfig(dryRun) → {baseUrl, apiKey, model}
//       discover(target) → {kind:"single"|"series", files:[{abs, rel}]}
//       planEntries(files, {force}) → [{src, dst, action:"translate"|"overwrite"|"skip"}]
//       main() 顶层编排
```

实现要点：

- `parseArgs`：扫描 argv；`--force`/`--dry-run` 置位；`--to` 取下一参数（缺失报用法错误；值 ≠ `en` → `错误：暂仅支持 --to en（其他目标语言预留）`）；`--` 开头未知 → `错误：未知参数`；位置参数超过 1 个 → 用法错误；缺位置参数 → 打印 `用法：npm run translate -- <文件或系列目录> [--to en] [--force] [--dry-run]` 后退出 1。
- `loadConfig(dryRun)`：dryRun 直接返回占位；否则 `try { process.loadEnvFile() } catch {}`，三项任一为空/falsy → `错误：缺少 TRANSLATE_BASE_URL / TRANSLATE_API_KEY / TRANSLATE_MODEL。请 cp .env.example .env 并填写（见 .env.example 注释）。` 退出 1。
- `discover`：按 Interfaces 的发现规则；系列子文章排序 = `order` 缺失置 `Number.POSITIVE_INFINITY`、同序按文件名 `localeCompare("en")`；`rel` = `path.relative(process.cwd(), abs)`。
- `planEntries`：`dst` = 源路径插入 `.en`（`x.md → x.en.md`）；目标存在且 `!force` → `skip`；存在且 `force` → `overwrite`；否则 `translate`。
- 输出：dry-run 先打印 `--dry-run：仅列出计划，不调用 API。`，每文件一行 `将翻译  <rel>  → <dst rel>` / `将翻译（覆盖）  …` / `跳过（已存在译文）  …`；`console.log` 正常信息。
- 非 dry-run 的计划打印同样先输出计划行；随后执行阶段在 Task 1 暂为显式占位：`throw new Error("翻译执行管线将在后续任务实现")`（Task 2 移除；不写测试断言此临时行为）。

- [ ] **Step 5: 运行，期望全部 PASS**

Run: `bash scripts/tests/translate-check.sh`

- [ ] **Step 6: 格式检查与提交**

Run: `npm run format:check`

```bash
git add scripts/translate.mjs scripts/tests/translate-check.sh scripts/tests/fixtures/translate package.json .env.example .gitignore
git commit -m "i18n：翻译脚本 CLI、配置与文件发现"
```

---

### Task 2: 测试桩 + 单文件端到端（frontmatter、正文单块、写盘）

**Files:**
- Create: `scripts/tests/translate-stub.mjs`
- Modify: `scripts/translate.mjs`
- Modify: `scripts/tests/translate-check.sh`

**Interfaces（Produces）:**

桩（测试基建，后续任务扩展 flags）：

```
node scripts/tests/translate-stub.mjs --port-file <F> --log <F> \
  [--fail-first <status>] [--fail-always <status>] [--reject-auth] \
  [--truncate-at <n>] [--truncate-forever] [--corrupt <mode>]
```

（本任务实现 `--fail-first/--fail-always/--reject-auth/--corrupt bad-fm`；`--truncate-*` 与其余 corrupt 模式分别由 Task 3、Task 5 实现。）

- 启动后 `listen(0)`，把实际端口写入 `--port-file`；启动即创建（截断）`--log` 文件；每请求追加一行 JSONL：`{"n":<序号>,"auth":"<Authorization 头>","model":"<body.model>","messages":[...]}`；行内另附**不含正文**的响应摘要 `"response":{"role":"assistant","finish_reason":…}`（Ruling 3：S4 的 `"role":"assistant"` 断言需要它；且不得记录响应正文，以免污染 S8/S11/S12 的标记计数）。
- 仅接受路径以 `/chat/completions` 结尾的 POST，其余 → 404。
- 判定顺序：`--reject-auth` → 401；`--fail-first`（仅第 1 个请求）→ 该 status；`--fail-always` → 该 status（每次）；响应体统一 `{"error":{"message":"stub <status>"}}`。
- 源文提取：最后一条 user 消息中 `<<<SOURCE` 与 `>>>SOURCE` 之间（trim 后）的文本。
- frontmatter 请求（提取源可 `JSON.parse` 且 title/description 为 string）→ 200，content = `JSON.stringify({title:"[EN] "+t, description:"[EN] "+d})`，`finish_reason:"stop"`。
- 正文请求 → 200，content = transform(源)（规则见下），`finish_reason:"stop"`；`--corrupt` 在 transform 后应用。
- 所有响应 `usage` 固定 `{prompt_tokens:111, completion_tokens:222, total_tokens:333}`；响应形状 `{"choices":[{"message":{"role":"assistant","content":…},"finish_reason":…}],"usage":…}`。
- transform（行级、结构保持）：
  - 围栏内（行以 ```` ``` ```` 开头切换开关）、`$$` 块内（整行 `$$` 开关）、行以 `:::` 开头的行 → 逐字复制；
  - 行匹配 `^(#{1,6}\s+)(.*)$` → `$1[EN] $2`；空行复制；其余 → `[EN] ` + 行。
  - corrupt 模式：`drop-fence`（删除第一个围栏块含围栏）、`drop-callout`（删除第一行以 `:::` 开头的行）、`drop-image`（删除第一个 `![…](…)` 所在行）、`change-link-url`（首个 `](https://example.com/docs)` → `](https://example.com/CHANGED)`）、`drop-inline`（首个 `` `const x = 1{:ts}` `` 去反引号）、`extra-formula`（输出末尾追加一行 `EXTRA-FORMULA $z+1$`）、`bad-fm`（frontmatter 请求 → content `不是 JSON`，仍 stop）。

脚本（本任务实现；Rest 属于 Task 3+）：

- `callChat(config, messages) → {content, finishReason, usage}`：POST 请求如 Global Constraints；HTTP 非 2xx → 抛错（本任务不重试）；JSON 解析失败、`choices[0].message.content` 缺失 → 抛错。
- 提示词（固定内容要求）：
  - system（`buildSystemPrompt(to)`，to 目前恒 `en`，文案称「英文（en）」）：① 仅输出译文本身：不要解释、不要代码围栏包裹；② 代码块（含围栏与语言标记）与行内代码原样保留、`{:…}` 行内高亮语法保留；③ `$…$`、`$$…$$` 公式原样保留；④ `:::` callout 指令名与 `{closed}` 保留、只译文本；⑤ 自定义 HTML 元素保留标签与属性、只译文本节点，`<style>` 不译；⑥ 链接 URL 与图片引用原样、只译可见文本与 alt；⑦ 专有名词保留原文或通行译法、同一文档内译名一致；⑧ 保持 Markdown 结构（标题层级、列表、引用、空行位置）。
  - system 末尾附一个短示例，示范 callout 与行内代码的格式服从（示例源与译文中都出现字面 `:::note`）。
  - 正文 user 消息：`（可选）已译上下文，供术语与语气参考，不要重复输出：\n<context>\n\n请将下面的 Markdown 片段翻译为英文（en）。只输出译文本身。\n<<<SOURCE\n<chunk>\n>>>SOURCE`。
  - frontmatter user 消息：`请将下面 JSON 中的 title 与 description 翻译为英文（en），其他键不变。只输出 JSON 对象（键：title、description），不要代码围栏：\n<<<SOURCE\n<json>\n>>>SOURCE`。
- frontmatter 处理：`parseFrontmatter(text)` —— 首行必须为 `---`，找下一行 `---` 之间为 frontmatter；`title`/`description` 必须存在且为**单行标量**（裸值、双引号（用 `JSON.parse` 解）或单引号）；值为空或以 `>`/`|`/`&`/`*` 开头 → `错误：frontmatter 的 title/description 使用多行或复杂标量，暂不支持（请改为单行字符串）`；缺 `title`/`description`/`date`/`authors` 行 → `错误：源文件缺少必填 frontmatter 字段`。正文 = frontmatter 之后的文本 `trim()`。
- frontmatter 翻译：单独 `callChat`（无上下文）→ 响应 trim 后剥离可选的 ```` ```json ````/```` ``` ```` 围栏 → `JSON.parse` → 校验 title/description 为非空 string；失败 → `错误：frontmatter 翻译响应无效` 退出 1（不落盘、无工件）。
- 正文翻译：本任务整段一块，直接 `callChat`；块文本 `trim()`。
- 组装写盘：

```
---
<原 frontmatter 行，title/description 行替换为 title: <JSON.stringify(值)>、description: <JSON.stringify(值)>，删除既有 aiTranslated: 行，末尾追加 aiTranslated: true>
---
<空行>
<正文译文>
```

即以 `---\n` + 行（`\n` join）+ `\n---\n\n` + 正文 + `\n` 写出。

- 输出：每文件完成后 `✓ 写入 <rel>`；跳过时 `－ 跳过（已存在译文） <rel>`；文件完成打印 `token 用量（本篇）：<prompt> + <completion> = <total>`（汇总该文件全部请求）；运行结束打印 `token 用量（本次合计）：<total>` 与 `审校提示：用 git diff 查看译文差异；确认后提交。`。
- 跳过分支：`skip` 计划项零 API、不得修改目标文件（Task 4 将补充：读取目标尾段作上下文；读取不改变上述断言）。

**Steps:**

- [ ] **Step 1: 追加场景 S4–S6b 断言**

新增辅助：`stub_start [flags…]`（先 `stub_stop`（若存活）再后台启动 `node scripts/tests/translate-stub.mjs --port-file "$WORK/stub.port" --log "$WORK/stub.log" "$@"`；轮询端口文件 ≤5s：`i=0; while [ ! -s "$WORK/stub.port" ] && [ "$i" -lt 50 ]; do i=$((i+1)); sleep 0.1; done`）；`stub_stop`（kill 后台 pid、`wait … || true`、清端口文件）；并把 trap 扩展为先 `stub_stop` 再恢复 `.env`。场景目录每次新建并 `cp -R scripts/tests/fixtures/translate "$WORK/sN"`。

S4 单文件 happy path：`stub_start`；`write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"`；`run "$WORK/s4/single.md"` → rc 0；断言：
- `assert_file "$WORK/s4/single.en.md"`；`assert_has "$WORK/s4/single.en.md" 'title: "[EN] 单篇示例：结构校验的陷阱"'`；`assert_has "$WORK/s4/single.en.md" 'aiTranslated: true'`；
- 原样复制：`date: 2026-10-07` 行与源一致（`grep -qF "$(grep '^date:' 源)" 目标`）；`tags:` 行一致；
- 围栏内内容逐字保留：`assert_has "$WORK/s4/single.en.md" 'const price = "$100"'`；行内代码保留：断言目标含 `` `const x = 1{:ts}` ``（含反引号本身；实现时注意 shell 引号转义）。
- 桩日志（`L=$WORK/stub.log`）：`assert_count "$L" '"n":' 2`（frontmatter + 正文各 1）；`assert_has "$L" 'Bearer test-key'`；`assert_has "$L" '"model":"test-model"'`；`assert_has "$L" '<<<SOURCE'`；`assert_has "$L" '"role":"system"'`；`assert_has "$L" '"role":"assistant"'`；系统提示词 `assert_has "$L" '仅输出'`、`assert_has "$L" ':::note'`；
- 脚本日志：`assert_has "$LOG" 'token 用量（本篇）：222 + 444 = 666'`、`assert_has "$LOG" '✓ 写入'`、`assert_has "$LOG" 'git diff'`、`assert_has "$LOG" 'token 用量（本次合计）：666'`。

S5 跳过：`cp` 后再 `printf 'SKIP-SENTINEL\n' > "$WORK/s5/single.en.md"`；`stub_start`；`write_env …`；`run …` → rc 0；目标仍是 `SKIP-SENTINEL`（`assert_has`）；脚本日志 `跳过`；`[ ! -s "$WORK/stub.log" ]`（零请求）。
S6 覆盖：接 S5 用 `run … --force` → rc 0；`assert_lacks` SKIP-SENTINEL、`assert_has '[EN] SINGLE-START'`；桩日志 2 行。
S6b bad-fm：`stub_start --corrupt bad-fm`；`run "$WORK/s6b/single.md"` → rc 非 0；脚本日志含 `frontmatter`；`[ ! -e "$WORK/s6b/single.en.md" ]`；桩日志 1 行。

- [ ] **Step 2: 运行，期望失败**

Run: `bash scripts/tests/translate-check.sh`
Expected: S4 失败（翻译执行管线未实现）。

- [ ] **Step 3: 实现桩与脚本**（按 Interfaces；替换 Task 1 的占位分支）

- [ ] **Step 4: 运行，期望全部 PASS**

Run: `bash scripts/tests/translate-check.sh`

- [ ] **Step 5: 格式检查与提交**

Run: `npm run format:check`

```bash
git add scripts/translate.mjs scripts/tests/translate-stub.mjs scripts/tests/translate-check.sh
git commit -m "i18n：翻译脚本单文件翻译与离线测试桩"
```

---

### Task 3: 分块、已译上下文与截断续写

**Files:**
- Create: `scripts/tests/fixtures/translate/long.md`
- Modify: `scripts/translate.mjs`
- Modify: `scripts/tests/translate-stub.mjs`
- Modify: `scripts/tests/translate-check.sh`

**Interfaces（Produces）:**

- `chunkBody(body) → string[]`：按行扫描，切点为行匹配 `/^## /`；贪心累加，加入下一段后 `String.length > 6000` 先冲刷；单段超阈值独立成块；空 body → `[]` → 正文空串。（修正轮 Ruling 12：扫行时维护围栏 ``` 与公式 `$$` 行状态，状态内 `## ` 不作切点。）
- 上下文：`context` 为字符串；每次正文 `callChat` 的 user 消息携带（非空时）；上下文更新 = 完成块/文件后取**译文尾部 1500 字符**（`slice(-1500)`）。
- 续写：`finish_reason === "length"` → 追加消息：assistant（本轮 content 原文，不 trim）+ user（`请从中断处继续输出剩余译文，不要重复已输出内容，不要任何解释。`）继续 `callChat`，把新 content **直接拼接**（不 trim）；每块最多 3 次续写，仍为 `length` → `错误：翻译失败（<rel>）：输出反复截断（已续写 3 次）` 退出 1（修正轮同步：经文件级包装、含定位路径）。`finish_reason` 为 `stop`/`null` → 完成；其他值 → 报错。
- 块拼接：各块译文 `trim()` 后用 `\n\n` join 为正文字。

**fixtures（落盘约束，非逐字）：**

`scripts/tests/fixtures/translate/long.md`：frontmatter（title/description/date/authors，同 single 风格）+ 正文三段：
1. 引言段（≤300 字符，含记号 `LONG-INTRO-MARKER`）；
2. `## 第一节`，3500–4500 字符，段首记号 `LONG-SECTION-ONE-MARKER`，节尾一行记号 `LONG-SECTION-ONE-TAIL`，其余为重复填充段落（每段 ≥40 字符，用中文句子填充）；
3. `## 第二节`，3500–4500 字符，段首记号 `LONG-SECTION-TWO-MARKER`。

落盘后用 `wc -m` 核对两节长度在区间内（此区间下分块必为 2 块：引言+第一节 < 6000；再加第二节 > 6000）。（修正轮 Ruling 12 新增：`fence-trap.md`——第一节末尾含围栏陷阱（行首 `## ` 在围栏内）、第一节总长 > 6000；场景 S22 断言两标记落在同一请求。）

**Steps:**

- [ ] **Step 1: 创建 `long.md` 并核对长度**

Run: `wc -m scripts/tests/fixtures/translate/long.md`（与分节核对；不新增依赖）

- [ ] **Step 2: 追加桩与场景断言**

桩新增：`--truncate-at <n>`（第一个正文请求 → `content = full.slice(0, n)`、`finish_reason:"length"`，记住 `pending`；遇到下一条 user 消息含 `继续输出` 的请求 → content = 剩余部分、`stop`）；`--truncate-forever`（首个正文请求 → `slice(0,10)` + `length`；此后每条含 `继续输出` 的请求 → 再取接下来 10 字符 + `length`，永久推进）。

S8 分块：`stub_start`；`run "$WORK/s8/long.md"` → rc 0；桩日志（`L=$WORK/stub.log`）3 行（1 frontmatter + 2 块）；`assert_has "$L" 'LONG-SECTION-TWO-MARKER'`（第二块请求）；`assert_count "$L" 'LONG-SECTION-ONE-TAIL' 2`（源 1 + 第二块请求的已译上下文 1）；`assert_count "$L" 'LONG-SECTION-TWO-MARKER' 1`；目标文件存在。
S9 截断续写：`stub_start --truncate-at 150`；`run "$WORK/s9/single.md"` → rc 0；桩日志 3 行（frontmatter + 正文 + 续写）；续写请求的最后一条消息含 `继续输出`（`assert_has`）；目标文件含 `[EN] CALLOUT-BODY`（150 字符之后的内容，证明拼接完整）与 `E = mc^2`。
S10 续写超限：`stub_start --truncate-forever`；`run "$WORK/s10/single.md"` → rc 非 0；脚本日志含 `截断`；桩日志 5 行（frontmatter + 首次 + 3 次续写）；无目标文件。

- [ ] **Step 3: 运行，期望失败**

Run: `bash scripts/tests/translate-check.sh`
Expected: S8/S9/S10 失败（当前整段单块、无续写）。

- [ ] **Step 4: 实现**（按 Interfaces 改 `translate.mjs`；`--truncate-*` 两个桩 flag）

- [ ] **Step 5: 运行，期望全部 PASS**

- [ ] **Step 6: 格式检查与提交**

Run: `npm run format:check`

```bash
git add scripts/translate.mjs scripts/tests/translate-stub.mjs scripts/tests/translate-check.sh scripts/tests/fixtures/translate/long.md
git commit -m "i18n：翻译脚本分块、已译上下文与截断续写"
```

---

### Task 4: 系列整组执行与跨文件上下文链

**Files:**
- Modify: `scripts/translate.mjs`
- Modify: `scripts/tests/translate-check.sh`

**Interfaces（Produces）:**

- 执行循环：对 `discover` 出的文件按序处理；每个文件的初始 `context` = 上一文件对本站点输出的尾 1500 字符：
  - 上一文件 `translate`/`overwrite` → 用刚写入的译文；
  - 上一文件 `skip` → 读取盘上既有 `.en.md`（只读尾段供上下文；不校验、不发请求）；
  - 系列第一个文件（index）→ 空上下文。
- 失败即停：任一文件失败 → 打印 `错误：…`（含文件路径）后立即退出 1；后续文件零请求、零写入；已成功写入的文件保留。

**Steps:**

- [ ] **Step 1: 追加场景 S11–S12 断言**

S11 系列整组：`stub_start`；`run "$WORK/s11/series"` → rc 0；断言：
- 目标：`index.en.md`、`beta.en.md`、`alpha.en.md` 存在；`[ ! -e _wip.en.md ]`；
- `beta.en.md` 含 `draft: true`（原样复制、无门禁）；
- 桩日志 6 行；`assert_count "$WORK/stub.log" 'INDEX-CONTEXT-MARKER' 2`（index 源 1 + beta 请求上下文 1）；`assert_count 'BETA-CONTEXT-MARKER' 2`（beta 源 1 + alpha 请求上下文 1）；`assert_count 'ALPHA-CONTEXT-MARKER' 1`；`assert_count 'WIP-MARKER' 0`。
- 说明：若排序错误（先 alpha 后 beta），上面三组计数变为 (2,1,2)，断言会失败——这正是排序证据。
S12 跳过的盘上上下文：`cp` 后预写 `beta.en.md` 内容含 `BETA-ONDISK-MARKER`；`stub_start`；`run "$WORK/s12/series"` → rc 0；桩日志 4 行（index 2 + alpha 2，beta 零请求）；`assert_count "$WORK/stub.log" 'BETA-ONDISK-MARKER' 1`（仅出现在 alpha 的上下文中）；`beta.en.md` 保持原样。

- [ ] **Step 2: 运行，期望失败**（S11/S12 失败：当前执行只处理首个文件或不循环）

- [ ] **Step 3: 实现**（按 Interfaces；`translateFile` 接受初始 context 并返回新 context；`skip` 分支读取目标尾段）

- [ ] **Step 4: 运行，期望全部 PASS**

- [ ] **Step 5: 格式检查与提交**

Run: `npm run format:check`

```bash
git add scripts/translate.mjs scripts/tests/translate-check.sh
git commit -m "i18n：翻译脚本系列整组与上下文链"
```

---

### Task 5: 结构校验与失败工件

**Files:**
- Create: `scripts/tests/fixtures/translate/bad-source.md`
- Modify: `scripts/translate.mjs`
- Modify: `scripts/tests/translate-stub.mjs`（新增 corrupt 模式）
- Modify: `scripts/tests/translate-check.sh`

**Interfaces（Produces）:**

- `validateStructure(source, output) → problems: string[]`（source/output 均为 `{fmLines, fmFields, body}`；空数组=通过）。规则：
  - 统计前预处理：剥离围栏代码块（含围栏行）与行内代码 span（`` /`[^`\n]+`/g ``）得到“净文本”。
  - 代码块：扫描源文本收集围栏信息串（`/^```(\S*)/` 至 `/^```\s*$/` 闭合）多重集，source 与 output 排序后相等，否则 `代码块：源 N / 译 M`（或语言差异明细）。修正轮 Ruling 12 补充：另比围栏行（`/^```/`）计数——源=译 且各自为偶数，否则 `代码块：围栏未平衡（源 N / 译 M）`。
  - `:::`：开行 `/^:::\s*(\w*)/` 收集类型多重集 + 闭行 `/^:::\s*$/` 计数，逐项相等，否则 `callout：源 … / 译 …`。
  - 公式：净文本中 `$$` 出现次数除以 2 后数值比较（Ruling 10：不独立检查奇偶；spec 只要求数量相等）+ 行内 `/(?<!\$)\$[^$\n]+\$(?!\$)/g` 计数，相等，否则 `公式：源 … / 译 …`。
  - 行内代码：剥围栏后 `/`[^`\n]+`/g` 计数相等，否则 `行内代码：源 … / 译 …`。
  - 图片：净文本 `!/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g` 的 URL 集合相等，否则 `图片：…`；链接：同式非 `!` 前缀 URL 集合相等，否则 `链接：…`（缺失/多余分别列出）。
  - frontmatter：output 含非空 `title`/`description`、`date`、`authors` 行与 `aiTranslated: true`，否则 `frontmatter：…`。
- 流程：正文翻译完成后先 `validateStructure`；`problems.length === 0` 才写目标；否则写工件并退出 1：
  - `.translate/<sanitize(译文相对路径)>`（完整译文，文件名与正常译文一致，如 `single.en.md`）、`.translate/<sanitize(译文相对路径)>.problems.txt`（问题逐行 + 末尾换行；Ruling 10——S13 的 `find -name 'single.en.md'` 为可执行契约）；
  - `sanitize`：`path.relative(cwd, abs)` 删掉全部前导 `../` 与 `/`；目录名用 `fs.mkdirSync(…, {recursive:true})`；
  - 错误消息：`错误：结构校验未通过（<n> 项）：<rel>（详见 .translate/…）`。
- 源 frontmatter 必填检查（缺 `title`/`description`/`date`/`authors`）在**任何 API 调用前**失败：`错误：源文件缺少必填 frontmatter 字段`。

**fixtures（逐字）：** `scripts/tests/fixtures/translate/bad-source.md`

```md
---
title: "缺少 description 的源文件"
date: 2026-10-07
authors:
  - enscribe
---

BAD-SOURCE-MARKER 缺少 description，应在调用 API 前报错。
```

桩新增 corrupt 模式：`drop-image`、`drop-inline`、`extra-formula`（规则见 Task 2 Interfaces 的 corrupt 列表）。

**Steps:**

- [ ] **Step 1: 创建 `bad-source.md`；追加场景 S13–S16 断言**

S13 七类 corrupt 各一场景（循环 `for mode in drop-fence drop-callout drop-image change-link-url drop-inline extra-formula unclose-fence`；每轮独立目录 `s13-$mode`、`rm -rf .translate`、`stub_start --corrupt "$mode"`、`run "$WORK/s13-$mode/single.md"`）→ 每轮断言：rc 非 0；`[ ! -e …/single.en.md ]`；`find .translate -name 'single.en.md' -print -quit` 非空；`find .translate -name '*.problems.txt'` 对应文件含类别词（`drop-fence`→`代码块`；`drop-callout`→`callout`；`drop-image`→`图片`；`change-link-url`→`链接`；`drop-inline`→`行内代码`；`extra-formula`→`公式`；`unclose-fence`→`代码块`）。
S14 force 不覆盖：预置 `single.en.md` 含 `KEEP-SENTINEL`；`stub_start --corrupt drop-fence`；`run … --force` → rc 非 0；目标仍为 `KEEP-SENTINEL`。
S15 失败即停：`stub_start --corrupt extra-formula`（对任何文件都生效；series fixtures 无围栏，不能用 drop-fence）；`run "$WORK/s15/series"` → rc 非 0；桩日志 2 行（index 的 frontmatter + 正文后即败）；`[ ! -e index.en.md ]`、`[ ! -e beta.en.md ]`、`[ ! -e alpha.en.md ]`。
S16 源缺字段：`stub_start`；`run "$WORK/s16/bad-source.md"` → rc 非 0；脚本日志含 `必填`；`[ ! -s "$WORK/stub.log" ]`（API 前失败）；无目标。

- [ ] **Step 2: 运行，期望失败**（S13 起：当前无校验，半成品会被写入）

- [ ] **Step 3: 实现**（校验器、工件、失败即停、源字段检查）

- [ ] **Step 4: 运行，期望全部 PASS**

- [ ] **Step 5: 格式检查与提交**

Run: `npm run format:check`

```bash
git add scripts/translate.mjs scripts/tests/translate-stub.mjs scripts/tests/translate-check.sh scripts/tests/fixtures/translate/bad-source.md
git commit -m "i18n：翻译脚本结构校验与失败工件"
```

---

### Task 6: 失败处理（重试、认证、网络）

**Files:**
- Modify: `scripts/translate.mjs`
- Modify: `scripts/tests/translate-check.sh`

**Interfaces（Produces）:**

- `callChat` 包装重试：HTTP 429/5xx 或网络异常（`fetch` 抛出）→ 退避 500/1000/2000ms 后重试，最多 3 次；每次打印 `重试 1/3（HTTP 429）…` 形态消息（含 `重试`）。4 次尝试后仍失败 → 网络异常：`错误：调用翻译接口失败（网络错误）`；429/5xx：`错误：翻译接口持续失败（HTTP <status>）`。两者退出码 1。
- 401/403 → 不重试，立即 `错误：API 认证失败（HTTP 401）。请检查 .env 中的 TRANSLATE_API_KEY。`（403 同文案、404 按普通错误处理不重试）。其他 4xx → 不重试，`错误：翻译接口返回 HTTP <status>`。

**Steps:**

- [ ] **Step 1: 追加场景 S17–S20 断言**

S17 429 后成功：`stub_start --fail-first 429`；`run "$WORK/s17/single.md"` → rc 0；桩日志 3 行（fm 失败 1 + 重试成功 1 + 正文 1）；脚本日志含 `重试`。
S18 持续 5xx：`stub_start --fail-always 503`；`run "$WORK/s18/single.md"` → rc 非 0；桩日志恰 4 行；脚本日志含 `重试 3/3`。
S19 认证失败：`stub_start --reject-auth`；`run "$WORK/s19/single.md"` → rc 非 0；桩日志 1 行（不重试）；脚本日志含 `401`、`TRANSLATE_API_KEY`。
S20 网络错误：`write_env "http://127.0.0.1:9/"`（不启动桩）；`run "$WORK/s20/single.md"` → rc 非 0；脚本日志含 `网络`。

- [ ] **Step 2: 运行，期望失败**（S17 起：无重试，首个 429 即失败）

- [ ] **Step 3: 实现**（把重试放进 `callChat`，frontmatter 与正文共用）

- [ ] **Step 4: 运行，期望全部 PASS**（全套件含退避等待，预计 < 30s）

- [ ] **Step 5: 格式检查与提交**

Run: `npm run format:check`

```bash
git add scripts/translate.mjs scripts/tests/translate-check.sh
git commit -m "i18n：翻译脚本失败处理（重试与认证）"
```

---

### Task 7: 文档与全量验证

**Files:**
- Modify: `AGENTS.md`

**Steps:**

- [ ] **Step 1: 更新 `AGENTS.md`**

- 「构建、测试与本地开发命令」：Bun 与 npm 两个列表各加一行 `translate`（如 `npm run translate -- <路径>`：翻译单篇/系列并写入 `.en.md`，见「i18n」小节；需 `.env` 的 `TRANSLATE_*`）。
- 「i18n（中英双语）约定」：把末尾「阶段二的翻译脚本……为后续独立工作，当前尚未实现」整句替换为简短的「翻译工作流」说明：`npm run translate -- <文件或系列目录> [--to en] [--force] [--dry-run]`；`.env` 的 `TRANSLATE_*`（模板见 `.env.example`）；保结构翻译 + 写盘前结构校验、失败译文与差异清单落 `.translate/`（gitignore）；无 draft 门禁，`git diff` 即审校；译文自动标 `aiTranslated: true`；手写 `.en.md` 仍然有效。
- 「测试与验证指南」：加一句 `bash scripts/tests/translate-check.sh`（离线桩校验翻译脚本：发现/分块/校验/重试，无需真实 API key）。

- [ ] **Step 2: 全量验证**

Run: `bash scripts/tests/translate-check.sh && bash scripts/tests/i18n-check.sh && npm run format:check`
Expected: translate-check 全 PASS（S1–S20）；i18n-check 全 PASS 且 build 成功；format:check 通过。

- [ ] **Step 3: 提交**

```bash
git add AGENTS.md
git commit -m "i18n：翻译脚本文档与全量验证"
```

- [ ] **Step 4: 手动验收清单（写入任务报告，交控制方/用户执行）**

本机 `.env` 当前无 `TRANSLATE_*`（实测 0 项），真实 API 验证无法由代理执行。清单：
1. 在 `.env` 填入 `TRANSLATE_BASE_URL/API_KEY/MODEL`（任一 OpenAI 兼容端点）；
2. 选一篇覆盖 callout/代码块/公式/图片/链接的短文：`npm run translate -- src/content/blog/<路径>.md`；
3. `git diff` 审校译名与结构，必要时 `--force` 重跑；
4. `npm run dev` 目测英文页（`/en/blog/<id>`）与「AI 翻译」徽章；`npm run build` 通过；
5. 满意则保留译文并按需提交；不满意可删除译文重来。

---

## Self-Review 记录

- **Spec 覆盖**：命令/选项（T1/T2/T4）、系列识别（T1/T4）、配置与 `.env.example`（T1）、frontmatter 规则与 `aiTranslated`（T2）、保结构规则与提示词（T2）、分块/上下文/截断（T3）、结构校验七项与失败工件（T5）、失败处理（T6）、测试脚本与手动验证（全程 harness + T7）、文档（T7）。
- **类型/命名一致性**：`callChat/chunkBody/validateStructure/parseFrontmatter/planEntries` 在任务间同名同义；桩 flag 表在 T2 定义、T3/T5/T6 追加；`<<<SOURCE`/`继续输出` 等字面串任务间一致。
- **Review Focus 落点**：见各任务 S2/S13–16（失败零落盘）、S4/S13（校验器双向）、S11/S12/S15（系列链）、S9/S10/S17–19（截断与重试）、S1/S2/S3（配置与入口）。
- **已知取舍**：真实 API 翻译质量验证为手动步骤（T7 Step 4）；`long.md` 长度约束用 `wc -m` 人工核对而非脚本断言（阈值两侧余量 1200+ 字符，稳定）。
