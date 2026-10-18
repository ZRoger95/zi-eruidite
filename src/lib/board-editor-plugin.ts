import { readFile, writeFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { Plugin } from "vite"
import { patchBoardSource, validateLayoutItems } from "./board-source-patch"

// readBody / sendJson 与 moment-composer-plugin.ts / translate-dev-plugin.ts 为
// 同款小段复制（有意为之：dev 插件保持零耦合，不为复用打扰既有无测试保护的代码）。
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
 * 收藏板布局保存专用的 dev 中间件插件。
 * 只在 dev server 生效（apply: "serve"），构建时完全不存在，
 * 因此生产环境既无编辑条也无 `/api/board/layout` 端点。
 *
 * 写入目标默认 `src/data/board.ts`，可用 `BOARD_LAYOUT_SOURCE` 覆盖（测试隔离用，
 * 模式同 translate 的 `TRANSLATE_DEV_CONTENT_ROOT`）。
 */
export function boardEditorPlugin(): Plugin {
  return {
    name: "astro-erudite:board-editor",
    apply: "serve",
    configureServer(server) {
      const target = path.resolve(
        server.config.root,
        process.env.BOARD_LAYOUT_SOURCE ?? "src/data/board.ts",
      )
      server.middlewares.use("/api/board/layout", async (req, res, next) => {
        if (req.method !== "POST") {
          next()
          return
        }

        let payload: unknown
        try {
          payload = JSON.parse(await readBody(req))
        } catch {
          sendJson(res, 400, { ok: false, error: "请求格式错误" })
          return
        }

        const validated = validateLayoutItems(payload)
        if (!validated.ok) {
          sendJson(res, 400, { ok: false, error: validated.error })
          return
        }

        try {
          const source = await readFile(target, "utf8")
          const layout = patchBoardSource(source, validated.items)
          // 无变化：不写盘、不 reload（幂等，避免每次点保存都搅动工作区）
          if (layout.source === source) {
            sendJson(res, 200, {
              ok: true,
              updated: 0,
              skipped: layout.skipped,
            })
            return
          }
          await writeFile(target, layout.source, "utf8")
          // 延迟片刻再全量刷新，给 Astro 内容/模块层留出拾取新文件的时间
          setTimeout(() => {
            server.ws.send({ type: "full-reload" })
          }, 150)
          sendJson(res, 200, {
            ok: true,
            updated: layout.updated,
            skipped: layout.skipped,
          })
        } catch (err) {
          console.error("[board-editor] 写回布局失败:", err)
          sendJson(res, 500, { ok: false, error: "写入失败，请查看终端日志" })
        }
      })
    },
  }
}
