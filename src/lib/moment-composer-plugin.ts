import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"
import {
  MAX_MOMENT_LENGTH,
  listMomentSlugs,
  nextMomentSlug,
  serializeMoment,
  validateMomentContent,
  writeMomentFile,
} from "./moment-composer"

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
 * 写入动态文件；若文件名已存在（并发写入冲突），按当日序号 +1 重试一次。
 * 返回最终写入的 slug。
 */
async function writeMomentWithRetry(
  date: Date,
  text: string,
  existing: string[],
): Promise<string> {
  let slug = nextMomentSlug(date, existing)
  try {
    await writeMomentFile(slug, text)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
    // 并发写入导致文件名冲突：取更大的序号重试一次
    slug = nextMomentSlug(date, [...existing, slug])
    await writeMomentFile(slug, text)
  }
  return slug
}

/**
 * 动态发布器专用的 dev 中间件插件。
 * 只在 dev server 生效（apply: "serve"），构建时完全不存在，
 * 因此生产环境既没有组件也没有写入端点。
 */
export function momentComposerPlugin(): Plugin {
  return {
    name: "astro-erudite:moment-composer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/moments", async (req, res, next) => {
        if (req.method !== "POST") {
          next()
          return
        }

        let payload: { content?: unknown }
        try {
          payload = JSON.parse(await readBody(req)) as { content?: unknown }
        } catch {
          sendJson(res, 400, { ok: false, error: "请求格式错误" })
          return
        }

        const error = validateMomentContent(payload.content)
        if (error) {
          sendJson(res, 400, { ok: false, error })
          return
        }

        try {
          const now = new Date()
          const existing = await listMomentSlugs()
          const text = serializeMoment(now, payload.content as string)
          const slug = await writeMomentWithRetry(now, text, existing)

          // 延迟片刻再全量刷新，给 Astro 内容层留出拾取新文件的时间
          setTimeout(() => {
            server.ws.send({ type: "full-reload" })
          }, 150)

          sendJson(res, 201, { ok: true, id: slug })
        } catch (err) {
          console.error("[moment-composer] 写入动态失败:", err)
          sendJson(res, 500, { ok: false, error: "写入失败，请查看终端日志" })
        }
      })
    },
  }
}
