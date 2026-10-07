#!/usr/bin/env node
// 离线测试桩：模拟 OpenAI 兼容的 Chat Completions 接口（供
// scripts/tests/translate-check.sh 使用，零依赖）。
// --fail-first / --fail-always / --reject-auth / --corrupt bad-fm 由 Task 2
// 实现；--truncate-at / --truncate-forever（截断续写模拟）由 Task 3 实现；
// corrupt 结构改写模式（Task 5）在 transform（或截断拼接）之后应用：
// drop-fence / drop-callout / drop-image / change-link-url / drop-inline /
// extra-formula / unclose-fence（删除首个闭合围栏行），用于制造译文结构
// 被破坏的失败工件场景；
// --fail-from <n> <status>（Task 6/Ruling 8）：全局序号 ≥ n 的请求一律返回该
// status，模拟系列翻译「中途开始」的持续失败。
// --delay <ms>（翻译按钮 Task 1）：每个请求在响应前统一延迟，供并发/断连
// 场景拉长任务时长。
//
// 每请求追加一行 JSONL 日志：
//   {"n":<序号>,"auth":"<Authorization 头>","model":"<body.model>",
//    "messages":[...请求消息...],
//    "response":{...响应摘要：成功为 role/finish_reason，失败为 error...}}
// 注意：日志只含请求消息与响应摘要（不含响应正文），后续任务用桩日志做
// 「标记出现次数」断言时按「源文 1 次 + 上下文 N 次」计数。

import { appendFileSync, writeFileSync } from "node:fs"
import http from "node:http"
import process from "node:process"

const USAGE =
  "用法：node scripts/tests/translate-stub.mjs --port-file <F> --log <F> " +
  "[--fail-first <status>] [--fail-always <status>] [--fail-from <n> <status>] " +
  "[--reject-auth] [--truncate-at <n>] [--truncate-forever] [--corrupt <mode>] " +
  "[--delay <ms>]"

const USAGE_FIXED = {
  prompt_tokens: 111,
  completion_tokens: 222,
  total_tokens: 333,
}

function parseArgs(argv) {
  const opts = {
    portFile: "",
    log: "",
    failFirst: 0,
    failAlways: 0,
    failFromSeq: 0,
    failFromStatus: 0,
    rejectAuth: false,
    truncateAt: 0,
    truncateForever: false,
    corrupt: "",
    delay: 0,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const take = () => {
      const value = argv[i + 1]
      if (value === undefined) {
        throw new Error(`${arg} 缺少取值\n${USAGE}`)
      }
      i += 1
      return value
    }
    if (arg === "--port-file") {
      opts.portFile = take()
    } else if (arg === "--log") {
      opts.log = take()
    } else if (arg === "--fail-first") {
      opts.failFirst = Number(take())
    } else if (arg === "--fail-always") {
      opts.failAlways = Number(take())
    } else if (arg === "--fail-from") {
      opts.failFromSeq = Number(take())
      opts.failFromStatus = Number(take())
    } else if (arg === "--reject-auth") {
      opts.rejectAuth = true
    } else if (arg === "--truncate-at") {
      opts.truncateAt = Number(take())
    } else if (arg === "--truncate-forever") {
      opts.truncateForever = true
    } else if (arg === "--corrupt") {
      opts.corrupt = take()
    } else if (arg === "--delay") {
      opts.delay = Number(take())
    } else {
      throw new Error(`未知参数：${arg}\n${USAGE}`)
    }
  }
  if (!opts.portFile || !opts.log) {
    throw new Error(`缺少 --port-file / --log\n${USAGE}`)
  }
  return opts
}

// 取最后一条 user 消息中 <<<SOURCE 与 >>>SOURCE 之间的文本（trim）
function extractSource(messages) {
  const users = Array.isArray(messages)
    ? messages.filter((message) => message && message.role === "user")
    : []
  if (users.length === 0) {
    return null
  }
  const text = String(users[users.length - 1].content ?? "")
  const start = text.indexOf("<<<SOURCE")
  const end = text.lastIndexOf(">>>SOURCE")
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  return text.slice(start + "<<<SOURCE".length, end).trim()
}

// frontmatter 请求：源文可 JSON.parse 且 title/description 为 string
function parseFrontmatterSource(source) {
  if (source === null) {
    return null
  }
  try {
    const data = JSON.parse(source)
    if (
      data &&
      typeof data.title === "string" &&
      typeof data.description === "string"
    ) {
      return data
    }
  } catch {
    // 非 JSON → 视为正文请求
  }
  return null
}

// 行级、结构保持的机械化翻译：围栏 / $$ 块 / ::: 行逐字复制，
// 标题行前缀加在标题文本前，其余行整体加前缀，空行复制。
function transform(text) {
  const out = []
  let inFence = false
  let inMath = false
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence
      out.push(line)
    } else if (inFence) {
      out.push(line)
    } else if (line.trim() === "$$") {
      inMath = !inMath
      out.push(line)
    } else if (inMath) {
      out.push(line)
    } else if (line.startsWith(":::")) {
      out.push(line)
    } else if (line === "") {
      out.push(line)
    } else {
      const heading = /^(#{1,6}\s+)(.*)$/.exec(line)
      if (heading) {
        out.push(`${heading[1]}[EN] ${heading[2]}`)
      } else {
        out.push(`[EN] ${line}`)
      }
    }
  }
  return out.join("\n")
}

// 删除第一行满足 predicate 的行（drop-callout / drop-image 共用）。
function dropFirstLine(text, predicate) {
  const lines = text.split("\n")
  const index = lines.findIndex(predicate)
  if (index === -1) {
    return text
  }
  lines.splice(index, 1)
  return lines.join("\n")
}

// 删除第一个围栏块（含开、闭围栏行与其中的内容行）。
function dropFirstFence(text) {
  const out = []
  let inFence = false
  let dropped = false
  for (const line of text.split("\n")) {
    if (dropped) {
      out.push(line)
    } else if (inFence) {
      if (/^```\s*$/.test(line)) {
        inFence = false
        dropped = true
      }
    } else if (/^```/.test(line)) {
      inFence = true
    } else {
      out.push(line)
    }
  }
  return out.join("\n")
}

// 删除第一个闭合围栏行（首个开围栏之后、匹配 /^```\s*$/ 的首行），制造
// 「围栏开闭失衡」的译文（unclose-fence）。
function uncloseFirstFence(text) {
  const lines = text.split("\n")
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (inFence) {
      if (/^```\s*$/.test(line)) {
        lines.splice(i, 1)
        return lines.join("\n")
      }
    } else if (/^```/.test(line)) {
      inFence = true
    }
  }
  return text
}

// --corrupt：在 transform 之后应用，制造结构破坏的译文；bad-fm 属
// frontmatter 请求分支，不在此列（其余未知模式原样放行）。
function applyCorrupt(content, mode) {
  if (mode === "drop-fence") {
    return dropFirstFence(content)
  }
  if (mode === "unclose-fence") {
    return uncloseFirstFence(content)
  }
  if (mode === "drop-callout") {
    return dropFirstLine(content, (line) => line.startsWith(":::"))
  }
  if (mode === "drop-image") {
    return dropFirstLine(content, (line) => /!\[[^\]]*\]\([^)\s]+/.test(line))
  }
  if (mode === "change-link-url") {
    return content.replace(
      "](https://example.com/docs)",
      "](https://example.com/CHANGED)",
    )
  }
  if (mode === "drop-inline") {
    return content.replace("`const x = 1{:ts}`", "const x = 1{:ts}")
  }
  if (mode === "extra-formula") {
    return `${content}\nEXTRA-FORMULA $z+1$`
  }
  return content
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  })
  res.end(payload)
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  writeFileSync(opts.log, "")
  let seq = 0
  let truncateState = null

  // --truncate-*：模拟输出截断（finish_reason="length"）与续写推进。
  // 「续写请求」= 最后一条 user 消息含 继续输出；frontmatter 请求不受影响。
  function truncateReply(source, messages) {
    const users = Array.isArray(messages)
      ? messages.filter((message) => message && message.role === "user")
      : []
    const lastUser =
      users.length > 0 ? String(users[users.length - 1].content ?? "") : ""
    const isContinue = lastUser.includes("继续输出")
    if (opts.truncateAt > 0 && truncateState === null && !isContinue) {
      const full = transform(source ?? "")
      truncateState = { mode: "at", full, offset: opts.truncateAt }
      return { content: full.slice(0, opts.truncateAt), finishReason: "length" }
    }
    if (truncateState !== null && truncateState.mode === "at" && isContinue) {
      return {
        content: truncateState.full.slice(truncateState.offset),
        finishReason: "stop",
      }
    }
    if (opts.truncateForever && truncateState === null && !isContinue) {
      const full = transform(source ?? "")
      truncateState = { mode: "forever", full, offset: 10 }
      return { content: full.slice(0, 10), finishReason: "length" }
    }
    if (
      truncateState !== null &&
      truncateState.mode === "forever" &&
      isContinue
    ) {
      const { full, offset } = truncateState
      truncateState.offset += 10
      return {
        content: full.slice(offset, offset + 10),
        finishReason: "length",
      }
    }
    return { content: transform(source ?? ""), finishReason: "stop" }
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? ""
    if (req.method !== "POST" || !url.endsWith("/chat/completions")) {
      sendJson(res, 404, { error: { message: "stub 404" } })
      return
    }
    let raw = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      raw += chunk
    })
    req.on("end", async () => {
      // --delay：响应前统一延迟一次（并发/断连场景拉长任务时长用）。
      if (opts.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, opts.delay))
      }
      seq += 1
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        sendJson(res, 400, { error: { message: "stub 400（请求体非 JSON）" } })
        return
      }
      const messages = Array.isArray(body.messages) ? body.messages : []
      const entry = {
        n: seq,
        auth: req.headers.authorization ?? "",
        model: body.model,
        messages,
        response: null,
      }

      // 判定顺序：reject-auth → fail-first（仅首个）→ fail-always →
      // fail-from（全局序号 ≥ n 一律失败）
      let failStatus = 0
      if (opts.rejectAuth) {
        failStatus = 401
      } else if (opts.failFirst && seq === 1) {
        failStatus = opts.failFirst
      } else if (opts.failAlways) {
        failStatus = opts.failAlways
      } else if (opts.failFromSeq > 0 && seq >= opts.failFromSeq) {
        failStatus = opts.failFromStatus
      }

      let replyStatus = 200
      let replyBody
      if (failStatus !== 0) {
        entry.response = { error: `stub ${failStatus}` }
        replyStatus = failStatus
        replyBody = { error: { message: `stub ${failStatus}` } }
      } else {
        const source = extractSource(messages)
        const fmData = parseFrontmatterSource(source)
        let content
        let finishReason = "stop"
        if (fmData) {
          content =
            opts.corrupt === "bad-fm"
              ? "不是 JSON"
              : JSON.stringify({
                  title: `[EN] ${fmData.title}`,
                  description: `[EN] ${fmData.description}`,
                })
        } else {
          const reply = truncateReply(source, messages)
          content = applyCorrupt(reply.content, opts.corrupt)
          finishReason = reply.finishReason
        }
        entry.response = { role: "assistant", finish_reason: finishReason }
        replyBody = {
          choices: [
            {
              message: { role: "assistant", content },
              finish_reason: finishReason,
            },
          ],
          usage: USAGE_FIXED,
        }
      }

      appendFileSync(opts.log, `${JSON.stringify(entry)}\n`)
      sendJson(res, replyStatus, replyBody)
    })
  })

  server.listen(0, "127.0.0.1", () => {
    writeFileSync(opts.portFile, String(server.address().port))
  })
}

try {
  main()
} catch (error) {
  console.error(`错误：${error.message}`)
  process.exit(1)
}
