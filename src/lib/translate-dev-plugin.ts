import { spawn } from "node:child_process"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { Plugin } from "vite"
import {
  TranslateDevError,
  type TargetInfo,
  buildTranslateArgs,
  countUnit,
  extractError,
  resolveTarget,
} from "./translate-dev"

// readBody / sendJson 与 moment-composer-plugin.ts 为同款小段复制（有意为之：
// 两个 dev 插件保持零耦合，不为复用打扰既有无测试保护的代码）。
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.end(JSON.stringify(payload))
}

/**
 * dev 翻译端点插件，挂在 `/api/translate` 前缀：
 * - GET /api/translate/status?id=<postId>：解析 + 统计 + 并发状态；
 * - POST /api/translate（body `{ id, force? }`）：spawn 子进程复用
 *   scripts/translate.mjs（零改动）执行翻译。
 *
 * 只在 dev server 生效（apply: "serve"），构建期完全不存在；内容根默认
 * `src/content/blog`，可用 TRANSLATE_DEV_CONTENT_ROOT 覆盖（测试隔离用）。
 * stdout/stderr 原样转发到 dev 终端；请求断开（页面刷新/关标签）不 kill
 * 子进程，任务照常跑完。
 */
export function translateDevPlugin(): Plugin {
  return {
    name: "astro-erudite:translate-dev",
    apply: "serve",
    configureServer(server) {
      const contentRoot = path.resolve(
        server.config.root,
        process.env.TRANSLATE_DEV_CONTENT_ROOT ?? "src/content/blog",
      )
      // 全局单任务锁：configureServer 闭包内内存态；子进程 close 后清锁。
      let running = false

      /** spawn 翻译子进程；按退出码回写 200/500，失败附 stderr 尾部错误。 */
      function startTranslate(
        target: string,
        force: boolean,
        res: ServerResponse,
      ): void {
        let stderrTail = ""
        const child = spawn(
          process.execPath,
          buildTranslateArgs(target, force),
          {
            cwd: server.config.root,
            stdio: ["ignore", "pipe", "pipe"],
          },
        )
        child.stdout?.on("data", (chunk) => {
          process.stdout.write(chunk)
        })
        child.stderr?.on("data", (chunk) => {
          process.stderr.write(chunk)
          stderrTail = `${stderrTail}${String(chunk)}`.slice(-800)
        })
        child.on("error", (error) => {
          running = false
          console.error("[translate-dev] 子进程异常:", error)
          // 请求可能已断开：任务结果无法送达，控制台已有日志。
          if (res.destroyed || res.writableEnded) return
          sendJson(res, 500, {
            ok: false,
            exitCode: -1,
            error: "子进程启动失败",
          })
        })
        child.on("close", (code) => {
          running = false
          // 请求断开（页面刷新/关标签）不 kill 子进程；此处仅跳过写响应。
          if (res.destroyed || res.writableEnded) return
          if (code === 0) {
            sendJson(res, 200, { ok: true, exitCode: 0 })
            return
          }
          sendJson(res, 500, {
            ok: false,
            exitCode: code ?? -1,
            error: extractError(stderrTail),
          })
        })
      }

      server.middlewares.use("/api/translate", async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost")

        if (req.method === "GET" && url.pathname === "/status") {
          try {
            const info = resolveTarget(contentRoot, url.searchParams.get("id"))
            const { total, translated } = countUnit(info)
            sendJson(res, 200, {
              ok: true,
              kind: info.kind,
              total,
              translated,
              viewUrl: info.viewUrl,
              running,
            })
          } catch (err) {
            if (err instanceof TranslateDevError) {
              sendJson(res, err.status, { ok: false, error: err.message })
              return
            }
            console.error("[translate-dev] 状态查询异常:", err)
            sendJson(res, 500, { ok: false, error: "状态查询失败" })
          }
          return
        }

        if (
          req.method === "POST" &&
          (url.pathname === "/" || url.pathname === "")
        ) {
          let payload: { id?: unknown; force?: unknown }
          try {
            payload = JSON.parse(await readBody(req)) as {
              id?: unknown
              force?: unknown
            }
          } catch {
            sendJson(res, 400, { ok: false, error: "请求格式错误" })
            return
          }

          // 合法 JSON 但非对象（null / 字符串 / 数字等）：显式 400，先于读取
          // payload.id，避免 TypeError 逃逸为 unhandled rejection。
          if (payload === null || typeof payload !== "object") {
            sendJson(res, 400, { ok: false, error: "请求格式错误" })
            return
          }

          if (payload.id === undefined) {
            sendJson(res, 400, { ok: false, error: "缺少 id" })
            return
          }
          if (
            payload.force !== undefined &&
            typeof payload.force !== "boolean"
          ) {
            sendJson(res, 400, { ok: false, error: "force 须为布尔值" })
            return
          }
          // 并发锁先于目标解析：运行中一律拒绝（前端按 409 显示「已有翻译进行中」）。
          if (running) {
            sendJson(res, 409, { ok: false, error: "已有翻译进行中" })
            return
          }

          let info: TargetInfo
          try {
            info = resolveTarget(contentRoot, payload.id)
          } catch (err) {
            if (err instanceof TranslateDevError) {
              sendJson(res, err.status, { ok: false, error: err.message })
              return
            }
            console.error("[translate-dev] 目标解析异常:", err)
            sendJson(res, 500, { ok: false, error: "目标解析失败" })
            return
          }

          running = true
          startTranslate(info.target, payload.force === true, res)
          return
        }

        next()
      })
    },
  }
}
