# dev 文章页翻译按钮设计（浏览器内触发翻译）

日期：2026-10-07
状态：已批准（2026-10-07，对话逐节确认 + 全文审阅通过）

## 背景与目标

作者工作流：中文写作 → 终端执行 `npm run translate -- <路径>` 生成 `.en.md`
译文 → `git diff` 审校。每次译前都要切终端敲命令，且需自行判断译文是否已存在、
要不要覆盖。

目标：在 `astro dev` 下，中文文章页直接提供「翻译成英文」按钮；点击时实时检测
译文状态（无 / 部分 / 全部），按状态提供生成、继续、覆盖、查看等动作；执行结果
就地反馈，进度在 dev 终端可见。

## 成功标准

1. dev 下中文文章页可见按钮；英文页与生产构建零痕迹（无标记、无端点）；
2. 点击后按译文状态给出正确分支：无译文→生成；部分已译→继续 / 全部覆盖 / 查看；
   全部已译→覆盖 / 查看（独立文章为无→生成、有→覆盖 / 查看）；
3. 翻译经 `scripts/translate.mjs` 执行（该脚本零改动），stdout 进度进 dev 终端，
   完成后页面显示成功（附「查看英文版」）或失败（附错误与重试）；
4. 系列文章页按整组翻译（与脚本系列语义一致）；独立文章按单文件；
5. 并发请求被拒（409）；翻译不因页面刷新而中断；
6. `bash scripts/tests/translate-ui-check.sh` 全绿；translate-check / i18n-check /
   format:check 不回归。

## 范围

**覆盖：**

- dev 端点（状态检测 + 触发翻译）、dev-only 页面组件、纯逻辑模块；
- 中文文章页挂载（`src/pages/blog/[...id].astro`）；
- 测试：新检查脚本 `translate-ui-check.sh`、桩新增 `--delay` 模式、
  i18n-check 追加生产零痕迹断言；
- 文档：`AGENTS.md` i18n 小节补充按钮说明。

**不覆盖（本期）：**

- 生产环境的任何翻译能力（站点保持纯静态）；
- CLI 行为变化（`scripts/translate.mjs`、`package.json` 均不改）；
- 实时流式进度（已选「简单等待」；进度看终端）；
- moments / projects / authors 等其他内容的翻译；
- 翻译质量逻辑（沿用脚本既有分块、校验、重试与失败处理）。

## 设计决策（对话已确认）

| # | 决策点 | 结论 |
| - | - | - |
| 1 | 触发范围 | 仅 dev（`astro dev`）；生产构建零痕迹 |
| 2 | 挂载位置 | 中文文章页（`/blog/...`）；英文页不挂 |
| 3 | 按钮位置 | 右下角固定浮动：桌面右下角；窄屏（<64rem）位于 ScrollToTop 浮钮上方堆叠 |
| 4 | 系列语义 | 按内容单元：系列（index 形态或子文章）→ 整个系列目录；独立文章 → 单文件 |
| 5 | 执行管道 | 子进程复用 CLI：`spawn` `node scripts/translate.mjs <target> [--force]`；`translate.mjs` 零改动 |
| 6 | 交互模式 | 简单等待：面板显示「翻译中…」，进度看终端，完成后就地显示结果 |
| 7 | 状态分支 | 状态检测（GET）与状态分支见「前端交互」 |
| 8 | 「查看」目标 | 系列 → `/en/blog/<系列id>`（英文系列页）；单篇 → `/en/blog/<id>` |
| 9 | 检测时机 | 点击按钮时经 GET 实时检测（不使用页面渲染时的快照） |
| 10 | 并发 | 单任务锁：运行中再请求 → 409；页面刷新/关闭不中断任务 |

## 术语与约定

- **内容根**：翻译源文件所在目录，默认 `src/content/blog/`；可用
  `TRANSLATE_DEV_CONTENT_ROOT` 环境变量覆盖（绝对或相对项目根路径；测试隔离用）。
- **目标（target）**：传给翻译脚本的路径。单篇 = 一个 `.md` 文件；
  系列 = 系列目录（脚本按 `index.md` + 同级子文整组处理）。
- **单元状态**：无（translated = 0）/ 部分（0 < translated < total）/ 全部
  （translated = total）。独立文章 total 恒为 1。
- **id**：内容集合标识（即路由参数），约定与文件名/目录名一致（项目已有
  kebab-case 约定）。

## 架构设计

### 文件与职责

| 文件 | 动作 | 职责 |
| - | - | - |
| `src/components/TranslateButton.astro` | 新增 | 浮动按钮 + 就地面板 + 前端状态机（`import.meta.env.PROD` 早退） |
| `src/lib/translate-dev-plugin.ts` | 新增 | Vite 插件（`apply: "serve"`）：注册两个 dev 端点、并发锁、spawn 子进程 |
| `src/lib/translate-dev.ts` | 新增 | 纯逻辑：id→目标解析、单元统计、命令构造、stderr 错误提取 |
| `src/pages/blog/[...id].astro` | 修改 | 挂载 `<TranslateButton postId={post.id} />`（zh 文章页） |
| `astro.config.ts` | 修改 | `vite.plugins` 注册 `translateDevPlugin()` |
| `scripts/tests/translate-ui-check.sh` | 新增 | 端点与组件回归（见「测试与验收」） |
| `scripts/tests/translate-stub.mjs` | 修改 | 新增 `--delay <ms>`：每个 API 请求延迟响应（并发场景用） |
| `scripts/tests/i18n-check.sh` | 修改 | 追加 dist 目录级「无翻译按钮标记 / 无端点字样」断言 |
| `AGENTS.md` | 修改 | i18n 小节补充 dev 翻译按钮说明与回归命令 |

### 端点协议

插件挂在 `/api/translate` 前缀，内部分流：

**GET `/api/translate/status?id=<postId>`**

- 200 → `{ ok: true, kind: "single" | "series", total, translated,
  viewUrl, running }`
  - `kind` 供前端文案（如「本系列共 N 篇」）；
  - `running`：当前是否有翻译任务执行中（全局单任务）。
- 400：id 非法（校验失败）；404：内容根内找不到对应源（含「文件名与 id 不一致
  时不猜测」的提示）。

**POST `/api/translate`**，body `{ id: string, force?: boolean }`

- 200 → `{ ok: true, exitCode: 0 }`（翻译成功）；
- 500 → `{ ok: false, exitCode: <n>, error: "<尾部错误>" }`（脚本失败；error 供
  页面显示）；
- 400：body 非法；404：目标不存在；409：`已有翻译进行中`（并发锁拒绝）。

### id → 目标解析（服务端，`translate-dev.ts`）

设内容根为 `C`：

1. **校验**：id 非空；按 `/` 分段后段数 1–2；每段非 `.`/`..`、不以 `_` 开头、
   不以 `.en` 结尾、不含路径分隔符/反斜杠/NUL；解析后断言目标仍在 `C` 内。
2. **候选（按序探测）**：
   - `C/<id>.md` 存在：
     - 1 段 → **单篇**，目标 = 该文件；
     - 2 段 → **系列**，目标 = 目录 `C/<第一段>/`（预检 `index.md` 存在，
       否则 404）；
   - `C/<id>/index.md` 存在 → **系列**，目标 = 目录 `C/<id>/`；
   - 否则 404。
3. 已知约束：文件名必须与 slug 一致（项目 kebab-case 约定）；不一致时报 404，
   不做模糊匹配。`_` 前缀草稿与 `.en` 文件被拒绝（400）。

### 单元统计（status 后端）

- 单篇：`total = 1`；`translated = <name>.en.md 存在 ? 1 : 0`。
- 系列：与脚本 `discoverSeries` 相同规则取源文件集（`*.md`、非 `_` 前缀、
  非 `.en.md` 结尾、含 `index.md`）；`total` = 文件数；`translated` = 对应
  `.en.md` 存在数。
- `viewUrl`：系列 → `/en/blog/<系列id>`；单篇 → `/en/blog/<id>`。

### 执行（POST 后端）

- **并发锁**：模块级 `running` 标志（插件实例内存）；POST 时已运行 → 409；
  子进程 `close` 后清除。任务不随 HTTP 请求断开而取消（页面刷新/关闭不打断）。
- **spawn**：`process.execPath`（当前 node）执行
  `["scripts/translate.mjs", <target>, ...(force ? ["--force"] : [])]`，
  `cwd` = 项目根（Vite root），继承环境（脚本自行 `loadEnvFile` 读 `.env`）。
- **输出**：stdout/stderr 原样转发到 dev 终端（用户可见进度）；同时缓存 stderr
  尾部（上限 800 字符），失败时提取最后非空行（截 400 字符）作为 `error`。
- **等待**：`close` 事件 → `exitCode === 0` 为成功。

### 前端交互（`TranslateButton.astro`）

- 渲染：dev-only（PROD 早退）；根元素带 `data-translate-dev`（测试断言用）；
  浮动按钮文案「翻译成英文」。
- 点击 → `GET status` →
  - `running === true`：显示「已有翻译进行中（可在终端查看）」；
  - 无译文（translated = 0）：「尚未翻译（本系列共 N 篇）。生成译文？」
    ［生成］［取消］；
  - 部分（仅系列）：「已有 M/N 篇译文。继续翻译缺失部分？」
    ［继续（跳过已有）］［全部覆盖］［查看］［取消］；
  - 全部已译：「已有译文。」［覆盖翻译］［查看］［取消］。
- 动作语义：生成/继续 = 不带 `--force`（已有译文自动跳过）；覆盖 = `--force`
  （全量重写）；查看 = 链接到 `viewUrl`。
- 执行中：面板替换为「翻译中…」单行状态（动作按钮消失）；触发按钮禁用
  （防重复）。
- status 请求失败（400/404/网络错）：面板显示对应错误信息与［关闭］。
- 成功：「✓ 翻译完成」+［查看英文版］（`viewUrl`）；失败：「✗ <error>」+［重试］
  （重放上次动作）。不自动跳转、不触发整页 reload（避免打断提示）。
- 面板：就地浮出；Esc 与点击面板外关闭；文案与按钮用 `textContent` 构建
  （不拼接 innerHTML）。

### 生产零痕迹

- 组件 `import.meta.env.PROD` 早退（无标记、无脚本）；插件 `apply: "serve"`
  （构建期完全不存在）；`translate.mjs` 与 `package.json` 不变。
- 自动断言：i18n-check 对 `dist/` 目录级 `grep -r`：不含 `data-translate-dev`、
  不含 `api/translate`。

## 测试与验收

### `scripts/tests/translate-ui-check.sh`（新增，复刻 translate-check 模式）

- **受控环境**：临时 `.env`（`SITE_URL` + `TRANSLATE_*` 指向本地桩）；
  `TRANSLATE_DEV_CONTENT_ROOT` 指向 /tmp fixture；trap 恢复 `.env`、终止
  dev server 与桩、清理 /tmp。
- **fixture**（临时生成）：
  `one.md`；`series/index.md`、`series/part-a.md`、`series/part-b.md`、
  `series/index.en.md`（哨兵内容，用于 skip 断言）。
- **dev server**：`astro dev --port 4399`，轮询就绪（≤60s）。
- **断言（草案）**：
  1. 组件可见性：`/blog/introducing-v2` HTML 含 `data-translate-dev`；
     `/en/blog/welcome` 不含；
  2. status：`id=one` → `1/0`；`id=series` → `3/1`；`id=series/part-a` → `3/1`
     （系列整组语义）；`viewUrl` 为 `/en/blog/series`；
  3. status：未知 id → 404；非法 id（`../x` 等）→ 400；
  4. POST：`one` → 200 成功；`one.en.md` 写出且含桩特征 `[EN]`；再 status →
     `1/1`；
  5. POST：`series`（无 force）→ `part-a.en.md`、`part-b.en.md` 写出；
     `index.en.md` 保持哨兵内容（skip 语义）；
  6. POST：`series` + `force` → `index.en.md` 被重写（含 `[EN]`）；
  7. POST 非法 id → 400 且 fixture 无新文件；未知 id → 404；
  8. 并发：`--delay` 桩下面台 POST 一个任务 → 第二次 POST → 409；期间
     status 的 `running === true`；等待首个任务完成后恢复；
  9. 失败路径：`.env` 去除 `TRANSLATE_*` → POST → 500 且 `error` 含
     「缺少 TRANSLATE_」；
  10. 退出清理：.env 恢复、无残留进程/文件。
- 桩扩展：`translate-stub.mjs` 新增 `--delay <ms>`（每个 API 响应前延迟；
  并发场景专用，不影响既有套件）。

### `i18n-check.sh` 追加

- 目录级断言 ×2：`dist/` 不含 `data-translate-dev`、不含 `api/translate`
  （新增 `assert_dir_lacks` 辅助或等价写法）。

### 手动验收（真实环境）

- `.env` 配好 `TRANSLATE_*` 后：在真实单篇与系列文章页走查生成 / 继续 / 覆盖 /
  查看四类路径；观察终端进度输出；确认译文文件与 `git diff` 预期一致。
- 提交前常规：`npm run format:check`、`npm run build`。

## 风险与遗留

- **id 与文件名不一致**（大小写、空格等非常规命名）→ 404 并提示，不做模糊匹配；
  项目已约定 kebab-case，风险低。
- **简单等待的固有体验**：超长系列（10 分钟+）等待期间页面无进度（终端可见）；
  管道保留 stdout 流，未来可低成本升级为实时输出。
- **运行中刷新页面**：任务继续、终端可见，但页面不再显示进度；再次点击会看到
  「已有翻译进行中」。
- **单实例内存锁**：dev server 重启即清空；无跨进程/持久化防护（dev 工具，可接受）。
- `TRANSLATE_DEV_CONTENT_ROOT` 兼作测试注入点，日常开发保持默认值即可。
