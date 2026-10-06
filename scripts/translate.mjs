#!/usr/bin/env node
// 把中文博客（单篇或系列）翻译为同目录 `.en.md` 译文。
// 用法：npm run translate -- <文件或系列目录> [--to en] [--force] [--dry-run]
// 阶段二：CLI/配置/发现/计划（Task 1）+ 单文件翻译执行与写盘（Task 2）+
// 分块、已译上下文与截断续写（Task 3）+ 系列整组执行与跨文件上下文链
// （Task 4）+ 写盘前结构校验与失败工件（Task 5）+ 失败处理：429/5xx 与
// 网络异常退避重试、401/403 立即失败（Task 6）。

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

const EN_MARKER = ".en"
const USAGE =
  "用法：npm run translate -- <文件或系列目录> [--to en] [--force] [--dry-run]"

const PLAN_LABELS = {
  translate: "将翻译",
  overwrite: "将翻译（覆盖）",
  skip: "跳过（已存在译文）",
}

// 哨兵错误（Ruling 6）：message 即最终用户可见文案——执行循环对其原样
// rethrow，不叠加「翻译失败（<文件>）：」前缀；顶层统一加「错误：」前缀。
// 结构校验失败（Task 5）与 API 失败终局（Task 6：认证失败、重试耗尽、
// 其他 4xx）均使用此机制。
class SentinelError extends Error {
  constructor(message) {
    super(message)
    this.name = "SentinelError"
  }
}

// Ruling 9：兼容非 Error 抛出（字符串等），确保错误消息可读。
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

// ---------- CLI 参数 ----------

function parseArgs(argv) {
  let target = null
  let to = "en"
  let force = false
  let dryRun = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--to") {
      const value = argv[i + 1]
      if (value === undefined) {
        throw new Error(`--to 缺少取值\n${USAGE}`)
      }
      if (value !== "en") {
        throw new Error("暂仅支持 --to en（其他目标语言预留）")
      }
      to = value
      i += 1
    } else if (arg === "--force") {
      force = true
    } else if (arg === "--dry-run") {
      dryRun = true
    } else if (arg.startsWith("--")) {
      throw new Error(`未知参数：${arg}`)
    } else if (target === null) {
      target = arg
    } else {
      throw new Error(`一次只能处理一个路径\n${USAGE}`)
    }
  }

  if (target === null) {
    throw new Error(`缺少路径参数\n${USAGE}`)
  }
  return { target, to, force, dryRun }
}

// ---------- 配置 ----------

function loadConfig(dryRun) {
  if (dryRun) {
    return { baseUrl: "", apiKey: "", model: "" }
  }
  try {
    process.loadEnvFile()
  } catch (error) {
    // 仅「没有 .env」（ENOENT）时忽略：缺项统一在下方报错并给出配置指引。
    // 其他错误（语法/读取失败等）原样上抛（顶层 errorMessage 兜底），
    // 不再降级为「缺少 TRANSLATE_*」掩盖真实原因。
    if (error?.code !== "ENOENT") {
      throw error
    }
  }
  const baseUrl = process.env.TRANSLATE_BASE_URL || ""
  const apiKey = process.env.TRANSLATE_API_KEY || ""
  const model = process.env.TRANSLATE_MODEL || ""
  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      "缺少 TRANSLATE_BASE_URL / TRANSLATE_API_KEY / TRANSLATE_MODEL。请 cp .env.example .env 并填写（见 .env.example 注释）。",
    )
  }
  return { baseUrl, apiKey, model }
}

// ---------- 文件发现 ----------

function relOf(abs) {
  return path.relative(process.cwd(), abs)
}

function sourceEntry(abs) {
  const base = path.basename(abs)
  if (base.startsWith("_")) {
    throw new Error(`拒绝翻译 _ 前缀草稿：${base}`)
  }
  if (base.endsWith(`${EN_MARKER}.md`)) {
    throw new Error(`输入已是英文译文文件：${base}`)
  }
  if (!base.endsWith(".md")) {
    throw new Error(`仅支持 .md 文件：${base}`)
  }
  return { abs, rel: relOf(abs) }
}

function readOrder(abs) {
  const lines = readFileSync(abs, "utf8").split(/\r?\n/)
  if (lines[0] !== "---") {
    return Number.POSITIVE_INFINITY
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      break
    }
    const match = /^order:\s*(\d+)\s*$/.exec(lines[i])
    if (match) {
      return Number(match[1])
    }
  }
  return Number.POSITIVE_INFINITY
}

function discoverSeries(dirAbs) {
  const indexPath = path.join(dirAbs, "index.md")
  if (!existsSync(indexPath)) {
    throw new Error(`目录缺少 index.md（系列目录须包含 index.md）：${dirAbs}`)
  }
  const names = readdirSync(dirAbs, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => !name.startsWith("_"))
    .filter((name) => !name.endsWith(`${EN_MARKER}.md`))
    .filter((name) => name !== "index.md")
  const children = names
    .map((name) => ({ name, order: readOrder(path.join(dirAbs, name)) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "en"))
    .map(({ name }) => sourceEntry(path.join(dirAbs, name)))
  return { kind: "series", files: [sourceEntry(indexPath), ...children] }
}

function discover(target) {
  const abs = path.resolve(target)
  let stats
  try {
    stats = statSync(abs)
  } catch {
    throw new Error(`路径不存在：${target}`)
  }
  if (stats.isDirectory()) {
    return discoverSeries(abs)
  }
  return { kind: "single", files: [sourceEntry(abs)] }
}

// ---------- 计划 ----------

function dstPathFor(abs) {
  return `${abs.slice(0, -".md".length)}${EN_MARKER}.md`
}

function planEntries(files, { force }) {
  return files.map((file) => {
    const dst = dstPathFor(file.abs)
    const exists = existsSync(dst)
    const action = exists ? (force ? "overwrite" : "skip") : "translate"
    return {
      src: file.abs,
      dst,
      srcRel: file.rel,
      dstRel: relOf(dst),
      action,
    }
  })
}

function printPlan(entries, dryRun) {
  if (dryRun) {
    console.log("--dry-run：仅列出计划，不调用 API。")
  }
  for (const entry of entries) {
    const label = PLAN_LABELS[entry.action]
    console.log(`${label}  ${entry.srcRel}  →  ${entry.dstRel}`)
  }
}

// ---------- API 调用 ----------

// 重试策略（Task 6）：HTTP 429/5xx 与网络异常（fetch 抛出）退避 500/1000/
// 2000ms 后重试，最多 3 次（合计最多 4 次尝试）；401/403 与其他 4xx 不重试。
// 终局错误以哨兵抛出（Ruling 6）：消息即最终文案、不被「翻译失败（…）」
// 包装，顶层统一加「错误：」前缀。
const RETRY_DELAYS_MS = [500, 1000, 2000]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function authFailedMessage(status) {
  return `API 认证失败（HTTP ${status}）。请检查 .env 中的 TRANSLATE_API_KEY。`
}

async function callChat(config, messages) {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
  const maxRetries = RETRY_DELAYS_MS.length
  for (let attempt = 0; ; attempt += 1) {
    let response = null
    let fetchError = null
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: config.model, messages, stream: false }),
      })
    } catch (error) {
      fetchError = error
    }
    if (fetchError !== null) {
      // fetch 抛出即视为网络类错误（抛错原因各异，不区分）。
      if (attempt < maxRetries) {
        console.error(
          `重试 ${attempt + 1}/${maxRetries}（网络错误），${RETRY_DELAYS_MS[attempt]}ms 后重试…`,
        )
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw new SentinelError("调用翻译接口失败（网络错误）")
    }
    if (response.status === 401 || response.status === 403) {
      throw new SentinelError(authFailedMessage(response.status))
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        console.error(
          `重试 ${attempt + 1}/${maxRetries}（HTTP ${response.status}），${RETRY_DELAYS_MS[attempt]}ms 后重试…`,
        )
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw new SentinelError(`翻译接口持续失败（HTTP ${response.status}）`)
    }
    if (!response.ok) {
      throw new SentinelError(`翻译接口返回 HTTP ${response.status}`)
    }
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error("无法解析翻译服务响应（JSON 解析失败）")
    }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") {
      throw new Error("翻译服务响应缺少 choices[0].message.content")
    }
    return {
      content,
      finishReason: data.choices[0].finish_reason ?? null,
      usage: data.usage ?? {},
    }
  }
}

// ---------- 提示词 ----------

function buildSystemPrompt(to) {
  return [
    `你是资深技术译者，负责把中文技术文档翻译为英文（${to}）。`,
    "必须遵守以下规则：",
    "① 仅输出译文本身：不要解释、不要前言后记、不要用代码围栏包裹整段输出；",
    "② 代码块（含围栏与语言标记）与行内代码逐字保留，`{:…}` 行内高亮语法保留；",
    "③ $…$ 与 $$…$$ 公式逐字保留；",
    "④ ::: callout 的指令名与 {closed} 保留，只翻译其中的文本；",
    "⑤ 自定义 HTML 元素保留标签与属性、只翻译文本节点，<style> 内的内容不翻译；",
    "⑥ 链接 URL 与图片引用保持原样，只翻译可见文本与 alt 文本；",
    "⑦ 专有名词保留原文或采用通行译法，同一文档内译名一致；",
    "⑧ 保持 Markdown 结构：标题层级、列表、引用、空行位置一律不动。",
    "",
    "示例（注意 callout 与行内代码的格式服从）：",
    "输入：",
    ":::note[提示]",
    "运行 `npm run build` 即可。",
    ":::",
    "输出：",
    ":::note[Note]",
    "Run `npm run build`.",
    ":::",
  ].join("\n")
}

function buildBodyUser(chunk, context) {
  const head = context
    ? `已译上下文，供术语与语气参考，不要重复输出：\n${context}\n\n`
    : ""
  return `${head}请将下面的 Markdown 片段翻译为英文（en）。只输出译文本身。\n<<<SOURCE\n${chunk}\n>>>SOURCE`
}

function buildFrontmatterUser(fields) {
  const json = JSON.stringify({
    title: fields.title,
    description: fields.description,
  })
  return `请将下面 JSON 中的 title 与 description 翻译为英文（en），其他键不变。只输出 JSON 对象（键：title、description），不要代码围栏：\n<<<SOURCE\n${json}\n>>>SOURCE`
}

// ---------- frontmatter 解析 ----------

const COMPLEX_SCALAR_MESSAGE =
  "frontmatter 的 title/description 使用多行或复杂标量，暂不支持（请改为单行字符串）"

function findLineValue(fmLines, key) {
  const pattern = new RegExp(`^${key}\\s*:(.*)$`)
  for (const line of fmLines) {
    const match = pattern.exec(line)
    if (match) {
      return match[1]
    }
  }
  return ""
}

function parseScalarValue(raw) {
  const value = raw.trim()
  if (value === "" || /^[>|&*]/.test(value)) {
    throw new Error(COMPLEX_SCALAR_MESSAGE)
  }
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === "string") {
        return parsed
      }
    } catch {
      // 落入下方统一报错
    }
    throw new Error(COMPLEX_SCALAR_MESSAGE)
  }
  if (value.startsWith("'")) {
    if (value.length >= 2 && value.endsWith("'")) {
      return value.slice(1, -1).replace(/''/g, "'")
    }
    throw new Error(COMPLEX_SCALAR_MESSAGE)
  }
  return value
}

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0] !== "---") {
    throw new Error("源文件缺少 frontmatter（首行须为 ---）")
  }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      end = i
      break
    }
  }
  if (end === -1) {
    throw new Error("源文件 frontmatter 未闭合（缺少结束的 ---）")
  }
  const fmLines = lines.slice(1, end)
  for (const key of ["title", "description", "date", "authors"]) {
    const pattern = new RegExp(`^${key}\\s*:`)
    if (!fmLines.some((line) => pattern.test(line))) {
      throw new Error("源文件缺少必填 frontmatter 字段")
    }
  }
  return {
    lines: fmLines,
    title: parseScalarValue(findLineValue(fmLines, "title")),
    description: parseScalarValue(findLineValue(fmLines, "description")),
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
  }
}

// 校验 frontmatter 翻译响应：剥可选代码围栏后解析 JSON，title/description 须为非空 string
function parseTranslatedFrontmatter(content) {
  let text = content.trim()
  const fence = /^```(?:json)?[^\n]*\n([\s\S]*?)\n?```$/.exec(text)
  if (fence) {
    text = fence[1].trim()
  }
  try {
    const data = JSON.parse(text)
    if (
      typeof data?.title === "string" &&
      data.title.trim() !== "" &&
      typeof data?.description === "string" &&
      data.description.trim() !== ""
    ) {
      return { title: data.title, description: data.description }
    }
  } catch {
    // 落入下方统一报错
  }
  throw new Error("frontmatter 翻译响应无效")
}

function renderFrontmatter(fmLines, { title, description }) {
  const out = []
  for (const line of fmLines) {
    if (/^title\s*:/.test(line)) {
      out.push(`title: ${JSON.stringify(title)}`)
    } else if (/^description\s*:/.test(line)) {
      out.push(`description: ${JSON.stringify(description)}`)
    } else if (!/^aiTranslated\s*:/.test(line)) {
      out.push(line)
    }
  }
  out.push("aiTranslated: true")
  return out
}

// ---------- 正文分块与续写 ----------

const CHUNK_LIMIT = 6000
const CONTEXT_TAIL = 1500
const MAX_CONTINUATIONS = 3
const CONTINUE_PROMPT =
  "请从中断处继续输出剩余译文，不要重复已输出内容，不要任何解释。"

// 按行扫描：行匹配 /^## / 处切段（该行归入后段），首个 ## 前为独立段；
// 空段跳过；贪心累加，current 非空且接上该段会超过 CHUNK_LIMIT 时先冲刷。
// 状态机（与桩的 transform 一致）：围栏行（/^```/，开/闭均翻转）优先，
// 围栏内的 $$ 行不再翻转公式状态；围栏或 $$ 公式块内出现的 ## 行不构成
// 切点——分块不得切进代码块或公式块内部。
function chunkBody(body) {
  const segments = []
  let lines = []
  let inFence = false
  let inMath = false
  for (const line of body.split("\n")) {
    if (!inFence && !inMath && /^## /.test(line) && lines.length > 0) {
      segments.push(lines.join("\n"))
      lines = []
    }
    if (/^```/.test(line)) {
      inFence = !inFence
    } else if (!inFence && line.trim() === "$$") {
      inMath = !inMath
    }
    lines.push(line)
  }
  segments.push(lines.join("\n"))

  const chunks = []
  let current = ""
  for (const segment of segments) {
    if (segment.trim() === "") {
      continue
    }
    if (current !== "" && current.length + segment.length > CHUNK_LIMIT) {
      chunks.push(current)
      current = ""
    }
    current = current === "" ? segment : `${current}\n${segment}`
  }
  if (current !== "") {
    chunks.push(current)
  }
  return chunks
}

function checkFinishReason(finishReason) {
  if (
    finishReason !== "length" &&
    finishReason !== "stop" &&
    finishReason !== null
  ) {
    throw new Error(`翻译服务返回异常的 finish_reason：${finishReason}`)
  }
}

// 通用续写助手（frontmatter 与正文共用）：finish_reason=length 时追加
// assistant（本轮 content 原文）+ 续写指令后重试，新 content 直接拼接
// （不 trim）；每次调用最多续写 MAX_CONTINUATIONS 次。
async function chatWithContinuation(config, messages, stats) {
  let result = await callChat(config, messages)
  accumulateUsage(stats, result.usage)
  checkFinishReason(result.finishReason)
  let content = result.content
  let continuations = 0
  while (result.finishReason === "length") {
    if (continuations >= MAX_CONTINUATIONS) {
      throw new Error("输出反复截断（已续写 3 次）")
    }
    continuations += 1
    messages.push({ role: "assistant", content: result.content })
    messages.push({ role: "user", content: CONTINUE_PROMPT })
    result = await callChat(config, messages)
    accumulateUsage(stats, result.usage)
    checkFinishReason(result.finishReason)
    content += result.content
  }
  return content
}

// 逐块翻译：块译文 trim 后以空行拼接；每块完成后以已拼接译文尾部作上下文。
async function translateBodyChunks(chunks, { config, system, stats, context }) {
  let translated = ""
  for (const chunk of chunks) {
    const content = await chatWithContinuation(
      config,
      [
        { role: "system", content: system },
        { role: "user", content: buildBodyUser(chunk, context) },
      ],
      stats,
    )
    const trimmed = content.trim()
    translated = translated === "" ? trimmed : `${translated}\n\n${trimmed}`
    context = translated.slice(-CONTEXT_TAIL)
  }
  return { body: translated, context: translated.slice(-CONTEXT_TAIL) }
}

// ---------- 结构校验与失败工件（写盘前） ----------

const FENCE_OPEN_RE = /^```(\S*)/
const FENCE_CLOSE_RE = /^```\s*$/
// 围栏行计数用（任意以 ``` 开头的行都算：开行与闭行都会翻转状态）。
const FENCE_LINE_RE = /^```/gm
const CALLOUT_OPEN_RE = /^:::\s*(\w*)/
const CALLOUT_CLOSE_RE = /^:::\s*$/
const INLINE_CODE_RE = /`[^`\n]+`/g
const INLINE_FORMULA_RE = /(?<!\$)\$[^$\n]+\$(?!\$)/g
const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
// 链接 = 同式但 `[` 前无 `!`（负向后行断言排除图片引用）。
const LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

const ARTIFACT_DIR = ".translate"

// 剥离围栏代码块（含围栏行与其内容行），其余文本逐字保留。
function stripFencedBlocks(text) {
  const out = []
  let inFence = false
  for (const line of text.split("\n")) {
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) {
        inFence = false
      }
    } else if (/^```/.test(line)) {
      inFence = true
    } else {
      out.push(line)
    }
  }
  return out.join("\n")
}

// 净文本：剥围栏 + 剥行内代码 span，供公式 / 图片 / 链接统计。
function netText(body) {
  return stripFencedBlocks(body).replace(INLINE_CODE_RE, "")
}

// 围栏信息串多重集（空串 = 无语言标记）。
function fenceInfos(text) {
  const infos = []
  let inFence = false
  for (const line of text.split("\n")) {
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) {
        inFence = false
      }
    } else {
      const match = FENCE_OPEN_RE.exec(line)
      if (match) {
        infos.push(match[1])
        inFence = true
      }
    }
  }
  return infos
}

// callout 开行类型多重集 + 闭行计数（裸 ::: 行计为闭行，不入开行类型）。
function calloutCounts(text) {
  const opens = []
  let closes = 0
  for (const line of text.split("\n")) {
    if (CALLOUT_CLOSE_RE.test(line)) {
      closes += 1
    } else {
      const match = CALLOUT_OPEN_RE.exec(line)
      if (match) {
        opens.push(match[1])
      }
    }
  }
  return { opens, closes }
}

function sameMultiset(a, b) {
  if (a.length !== b.length) {
    return false
  }
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

function sameSet(a, b) {
  if (a.size !== b.size) {
    return false
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }
  return true
}

function countMatches(text, pattern) {
  return (text.match(pattern) ?? []).length
}

function collectUrls(text, pattern) {
  const urls = new Set()
  for (const match of text.matchAll(pattern)) {
    urls.add(match[1])
  }
  return urls
}

function showValues(values, emptyLabel) {
  if (values.length === 0) {
    return "无"
  }
  return values
    .map((value) => value || emptyLabel)
    .sort()
    .join("、")
}

function showUrlDiff(label, sourceUrls, outputUrls) {
  const missing = [...sourceUrls].filter((url) => !outputUrls.has(url))
  const extra = [...outputUrls].filter((url) => !sourceUrls.has(url))
  const details = []
  if (missing.length > 0) {
    details.push(`缺失：${missing.join("、")}`)
  }
  if (extra.length > 0) {
    details.push(`多余：${extra.join("、")}`)
  }
  return `${label}：源 ${sourceUrls.size} 个 / 译 ${outputUrls.size} 个；${details.join("；")}`
}

// 写盘前结构校验：逐类比较源文与译文，返回问题数组（空数组 = 通过）。
// source / output 均为 { fmLines, fmFields, body }；body 为已 trim 的正文。
function validateStructure(source, output) {
  const problems = []
  const sourceNet = netText(source.body)
  const outputNet = netText(output.body)

  // 代码块：围栏信息串多重集排序后逐项相等。
  const sourceFences = fenceInfos(source.body)
  const outputFences = fenceInfos(output.body)
  if (!sameMultiset(sourceFences, outputFences)) {
    problems.push(
      `代码块：源 ${sourceFences.length} 个（${showValues(sourceFences, "（无语言标记）")}）` +
        ` / 译 ${outputFences.length} 个（${showValues(outputFences, "（无语言标记）")}）`,
    )
  }

  // 代码块补强：仅比信息串会漏掉「删除闭围栏」这类开闭失衡（已收集的
  // 信息串不变），故再数围栏行：源与译必须相等且各自为偶数（开=闭）。
  const sourceFenceLines = countMatches(source.body, FENCE_LINE_RE)
  const outputFenceLines = countMatches(output.body, FENCE_LINE_RE)
  if (
    sourceFenceLines !== outputFenceLines ||
    sourceFenceLines % 2 !== 0 ||
    outputFenceLines % 2 !== 0
  ) {
    problems.push(
      `代码块：围栏未平衡（源 ${sourceFenceLines} / 译 ${outputFenceLines}）`,
    )
  }

  // callout：开行类型多重集 + 闭行计数逐项相等。
  const sourceCallouts = calloutCounts(source.body)
  const outputCallouts = calloutCounts(output.body)
  if (
    !sameMultiset(sourceCallouts.opens, outputCallouts.opens) ||
    sourceCallouts.closes !== outputCallouts.closes
  ) {
    problems.push(
      `callout：源 开 ${sourceCallouts.opens.length}（${showValues(sourceCallouts.opens, "（无类型）")}）` +
        ` / 闭 ${sourceCallouts.closes}；译 开 ${outputCallouts.opens.length}` +
        `（${showValues(outputCallouts.opens, "（无类型）")}） / 闭 ${outputCallouts.closes}`,
    )
  }

  // 公式：净文本中 $$ 出现次数 / 2（块）与行内 $…$ 计数。
  const sourceBlockMath = countMatches(sourceNet, /\$\$/g) / 2
  const outputBlockMath = countMatches(outputNet, /\$\$/g) / 2
  const sourceInlineMath = countMatches(sourceNet, INLINE_FORMULA_RE)
  const outputInlineMath = countMatches(outputNet, INLINE_FORMULA_RE)
  if (
    sourceBlockMath !== outputBlockMath ||
    sourceInlineMath !== outputInlineMath
  ) {
    problems.push(
      `公式：源 块 ${sourceBlockMath} / 行内 ${sourceInlineMath}；` +
        `译 块 ${outputBlockMath} / 行内 ${outputInlineMath}`,
    )
  }

  // 行内代码：剥围栏后 `…` span 计数相等。
  const sourceInlineCodes = countMatches(
    stripFencedBlocks(source.body),
    INLINE_CODE_RE,
  )
  const outputInlineCodes = countMatches(
    stripFencedBlocks(output.body),
    INLINE_CODE_RE,
  )
  if (sourceInlineCodes !== outputInlineCodes) {
    problems.push(`行内代码：源 ${sourceInlineCodes} / 译 ${outputInlineCodes}`)
  }

  // 图片 / 链接：净文本中 URL 集合相等。
  const sourceImages = collectUrls(sourceNet, IMAGE_RE)
  const outputImages = collectUrls(outputNet, IMAGE_RE)
  if (!sameSet(sourceImages, outputImages)) {
    problems.push(showUrlDiff("图片", sourceImages, outputImages))
  }
  const sourceLinks = collectUrls(sourceNet, LINK_RE)
  const outputLinks = collectUrls(outputNet, LINK_RE)
  if (!sameSet(sourceLinks, outputLinks)) {
    problems.push(showUrlDiff("链接", sourceLinks, outputLinks))
  }

  // frontmatter：译文须有非空 title/description、date、authors 行与
  // aiTranslated: true。
  const fmProblems = []
  const fields = output.fmFields ?? {}
  if (typeof fields.title !== "string" || fields.title.trim() === "") {
    fmProblems.push("title 为空")
  }
  if (
    typeof fields.description !== "string" ||
    fields.description.trim() === ""
  ) {
    fmProblems.push("description 为空")
  }
  if (!output.fmLines.some((line) => /^date\s*:\s*\S/.test(line))) {
    fmProblems.push("缺少 date")
  }
  if (!output.fmLines.some((line) => /^authors\s*:/.test(line))) {
    fmProblems.push("缺少 authors")
  }
  if (
    !output.fmLines.some((line) => /^aiTranslated\s*:\s*true\s*$/.test(line))
  ) {
    fmProblems.push("缺少 aiTranslated: true")
  }
  if (fmProblems.length > 0) {
    problems.push(`frontmatter：${fmProblems.join("；")}`)
  }

  return problems
}

// 失败工件路径：.translate/<sanitize(译文相对路径)>（文件名与正常译文一致，
// 如 …/single.en.md）+ 同名 .problems.txt。sanitize = path.relative(cwd, abs)
// 去掉全部前导 ../ 与 /：测试源在 /tmp 下时 rel 含多级 ../，不能让工件逃出
// 工作区。
function artifactPathsFor(entry) {
  const rel = path
    .relative(process.cwd(), entry.dst)
    .replace(/^(?:\.\.[/\\]|[/\\])+/, "")
  const artifactRel = path.join(ARTIFACT_DIR, rel)
  return { artifactRel, problemsRel: `${artifactRel}.problems.txt` }
}

// 校验失败时写出工件：完整译文 + 问题清单（逐行 + 末尾换行）。
function writeArtifacts(entry, output, problems) {
  const paths = artifactPathsFor(entry)
  const artifactAbs = path.join(process.cwd(), paths.artifactRel)
  mkdirSync(path.dirname(artifactAbs), { recursive: true })
  writeFileSync(artifactAbs, output)
  writeFileSync(
    path.join(process.cwd(), paths.problemsRel),
    `${problems.join("\n")}\n`,
  )
  return paths
}

// ---------- 单文件翻译 ----------

function accumulateUsage(stats, usage) {
  stats.prompt += usage.prompt_tokens ?? 0
  stats.completion += usage.completion_tokens ?? 0
  stats.total += usage.total_tokens ?? 0
}

// 接受初始 context（跨文件链由执行循环传入），返回 { stats, context }；
// context = 本文件译文尾部 CONTEXT_TAIL 字符，供下一文件使用。
async function translateFile(entry, { config, system }, context = "") {
  const fm = parseFrontmatter(readFileSync(entry.src, "utf8"))
  const stats = { prompt: 0, completion: 0, total: 0 }

  const fmContent = await chatWithContinuation(
    config,
    [
      { role: "system", content: system },
      { role: "user", content: buildFrontmatterUser(fm) },
    ],
    stats,
  )
  const fields = parseTranslatedFrontmatter(fmContent)

  const { body, context: nextContext } = await translateBodyChunks(
    chunkBody(fm.body),
    { config, system, stats, context },
  )

  // 正文译完后先在内存校验；通过才写目标，否则只写 .translate/ 工件并抛
  // 哨兵错误（消息为最终文案，不被「翻译失败（…）」包装，Ruling 6）。
  const fmLines = renderFrontmatter(fm.lines, fields)
  const output = `---\n${fmLines.join("\n")}\n---\n\n${body}\n`
  const problems = validateStructure(
    {
      fmLines: fm.lines,
      fmFields: { title: fm.title, description: fm.description },
      body: fm.body,
    },
    { fmLines, fmFields: fields, body },
  )
  if (problems.length > 0) {
    const { problemsRel } = writeArtifacts(entry, output, problems)
    throw new SentinelError(
      `结构校验未通过（${problems.length} 项）：${entry.srcRel}（详见 ${problemsRel}）`,
    )
  }
  writeFileSync(entry.dst, output)
  return { stats, context: nextContext }
}

// ---------- 顶层编排 ----------

async function main() {
  const { target, to, force, dryRun } = parseArgs(process.argv.slice(2))
  const { files } = discover(target)
  const config = loadConfig(dryRun)
  const entries = planEntries(files, { force })
  printPlan(entries, dryRun)
  if (dryRun) {
    return
  }
  if (entries.every((entry) => entry.action === "skip")) {
    return
  }

  const system = buildSystemPrompt(to)
  // 按发现顺序逐文件处理；context 为跨文件链：上一文件被翻译 → 其译文尾段；
  // 上一文件跳过 → 盘上既有译文尾段（只读）；首文件为空。任一文件抛错即停止
  // （错误含文件路径），后续文件零请求、零写入，已写入文件保留。
  let context = ""
  let grandTotal = 0
  for (const entry of entries) {
    if (entry.action === "skip") {
      console.log(`－ 跳过（已存在译文） ${entry.dstRel}`)
      context = readFileSync(entry.dst, "utf8").slice(-CONTEXT_TAIL)
      continue
    }
    let result
    try {
      result = await translateFile(entry, { config, system }, context)
    } catch (error) {
      // 哨兵错误原样上抛（消息已是最终文案）；其余包装为「翻译失败」。
      if (error instanceof SentinelError) {
        throw error
      }
      throw new Error(`翻译失败（${entry.srcRel}）：${errorMessage(error)}`, {
        cause: error,
      })
    }
    const { stats } = result
    context = result.context
    console.log(`✓ 写入 ${entry.dstRel}`)
    console.log(
      `token 用量（本篇）：${stats.prompt} + ${stats.completion} = ${stats.total}`,
    )
    grandTotal += stats.total
  }
  console.log(`token 用量（本次合计）：${grandTotal}`)
  console.log("审校提示：用 git diff 查看译文差异；确认后提交。")
}

main().catch((error) => {
  console.error(`错误：${errorMessage(error)}`)
  process.exitCode = 1
})
