import type { NextApiRequest, NextApiResponse } from "next"
import type { Block, ExtendedRecordMap } from "notion-types"
import { isFullBlock } from "@notionhq/client"
import { getOfficialNotionClient } from "src/apis/notion-client/notionClient"
import { readContentRecordMap } from "src/libs/content/registry"
import { unwrapBlock } from "src/libs/utils/notion/unwrapBlock"
import { isValidNotionId, normalizeNotionId, isTrustedNotionFileUrl } from "src/libs/utils/security"

const ATTACHMENT_TYPES: Record<string, true> = { file: true, pdf: true, video: true, audio: true, embed: true }

const FETCH_TIMEOUT_MS = 10_000
const MAX_EMBED_BYTES = 5 * 1024 * 1024

const EMBED_BODY_TTL_MS = 5 * 60 * 1000
const MAX_EMBED_CACHE_ENTRIES = 50
const MAX_CACHED_EMBED_BYTES = 1024 * 1024
const embedBodyCache = new Map<string, { body: Buffer; exp: number }>()

function getCachedEmbedBody(key: string): Buffer | null {
  const entry = embedBodyCache.get(key)
  if (!entry) return null
  if (Date.now() >= entry.exp) {
    embedBodyCache.delete(key)
    return null
  }
  return entry.body
}

function setCachedEmbedBody(key: string, body: Buffer): void {
  if (body.byteLength > MAX_CACHED_EMBED_BYTES) return
  embedBodyCache.set(key, { body, exp: Date.now() + EMBED_BODY_TTL_MS })
  while (embedBodyCache.size > MAX_EMBED_CACHE_ENTRIES) {
    const oldest = embedBodyCache.keys().next()
    if (oldest.done) break
    embedBodyCache.delete(oldest.value)
  }
}

export function __clearEmbedBodyCacheForTests(): void {
  embedBodyCache.clear()
}

// S3 serves Notion uploads as binary/octet-stream, which browsers never
// render inside an iframe — so the proxy re-labels known displayable types
// from the filename instead of trusting the upstream content-type.
function inlineEmbedContentType(filename: string | undefined): string {
  switch (filename?.split(".").pop()?.toLowerCase()) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8"
    case "pdf":
      return "application/pdf"
    case "svg":
      return "image/svg+xml"
    case "txt":
    case "text":
      return "text/plain; charset=utf-8"
    default:
      return "application/octet-stream"
  }
}

function sanitizeFilename(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const base = raw.split("/").pop()?.split("\\").pop()?.trim().slice(0, 120)
  if (!base || base === "." || base === "..") return undefined
  const clean = base.replace(/["\r\n]/g, "")
  return clean || undefined
}

function embedContentDisposition(filename: string | undefined): string | undefined {
  if (!filename) return undefined
  if (/^[\x20-\x7E]+$/.test(filename)) return `inline; filename="${filename}"`
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_") || "download"
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

async function fetchEmbedBody(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Unexpected embed status: ${response.status}`)
    }
    const declared = response.headers.get("content-length")
    if (declared && Number(declared) > MAX_EMBED_BYTES) {
      throw new Error(`Embed response too large (${declared} bytes)`)
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.byteLength === 0 || body.byteLength > MAX_EMBED_BYTES) {
      throw new Error(`Embed response too large (${body.byteLength} bytes)`)
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

function sendEmbedBody(res: NextApiResponse, req: NextApiRequest, body: Buffer): void {
  const filename = sanitizeFilename(req.query.filename)
  res.setHeader("Content-Type", inlineEmbedContentType(filename))
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "no-referrer")
  const disposition = embedContentDisposition(filename)
  if (disposition) res.setHeader("Content-Disposition", disposition)
  res.setHeader("Content-Length", String(body.byteLength))
  res.setHeader("Cache-Control", "public, max-age=300")
  res.status(200)
  if (req.method === "HEAD") res.end()
  else res.send(body)
}

// Presence in block alone is not authority: linked-page stubs and detached
// blocks can also be in a recordMap. Walk only the published root's content.
function publishedAttachment(map: ExtendedRecordMap, pageId: string, blockId: string): Block | undefined {
  const blocks = new Map(Object.entries(map.block).map(([id, boxed]) => [normalizeNotionId(id), unwrapBlock(boxed)]))
  const root = blocks.get(pageId)
  if (root?.type !== "page" || root.alive === false) return undefined
  const pending = [...(root.content || [])]
  const visited = new Set<string>([pageId])
  while (pending.length) {
    const id = normalizeNotionId(pending.pop()!)
    if (visited.has(id)) continue
    visited.add(id)
    const block = blocks.get(id)
    if (!block || block.alive === false) continue
    if (id === blockId) return Object.hasOwn(ATTACHMENT_TYPES, block.type) ? block : undefined
    // A child page is a link, not part of this page's live body.
    if (block.type !== "page") pending.push(...(block.content || []))
  }
  return undefined
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store")
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD")
    res.status(405).end()
    return
  }
  const { pageId: rawPageId, blockId: rawBlockId } = req.query
  if (typeof rawPageId !== "string" || typeof rawBlockId !== "string"
    || !isValidNotionId(rawPageId) || !isValidNotionId(rawBlockId)) {
    res.status(404).end()
    return
  }
  const pageId = normalizeNotionId(rawPageId)
  const blockId = normalizeNotionId(rawBlockId)
  try {
    const map = await readContentRecordMap(pageId)
    const published = map && publishedAttachment(map, pageId, blockId)
    if (!published) {
      res.status(404).end()
      return
    }
    const embedCacheKey = published.type === "embed" ? `${pageId}:${blockId}` : null
    if (embedCacheKey) {
      const cached = getCachedEmbedBody(embedCacheKey)
      if (cached) {
        sendEmbedBody(res, req, cached)
        return
      }
    }
    const block = await getOfficialNotionClient().blocks.retrieve({ block_id: blockId })
    if (!isFullBlock(block)) {
      res.status(503).end()
      return
    }
    const parentId = block.parent.type === "block_id" ? block.parent.block_id
      : block.parent.type === "page_id" ? block.parent.page_id : undefined
    // A Notion-hosted file pasted as link_preview is translated to `embed`
    // (same iframe path as an explicit Embed block), so accept both live
    // shapes for a published embed.
    const typeMatches = block.type === published.type
      || (published.type === "embed" && (block.type === "embed" || block.type === "link_preview"))
    if (block.archived || block.in_trash || normalizeNotionId(block.id) !== blockId
      || !typeMatches || !parentId
      || normalizeNotionId(parentId) !== normalizeNotionId(published.parent_id)) {
      res.status(404).end()
      return
    }
    const data = block.type === "file" ? block.file : block.type === "pdf" ? block.pdf
      : block.type === "video" ? block.video : block.type === "audio" ? block.audio : undefined
    // Embed/link_preview blocks carry no file/external wrapper: an uploaded
    // file is just a Notion-hosted `url`. Re-resolve it live like other
    // attachments so the iframe never serves an expired signed URL.
    const target = block.type === "embed" ? block.embed?.url
      : block.type === "link_preview" ? block.link_preview?.url
      : data?.type === "file" ? data.file.url : undefined
    if (typeof target !== "string") {
      res.status(404).end()
      return
    }
    if (!isTrustedNotionFileUrl(target)) {
      res.status(503).end()
      return
    }
    if (block.type !== "embed" && block.type !== "link_preview") {
      res.setHeader("Location", target)
      res.status(307).end()
      return
    }
    // Proxy the bytes: a 307 to S3 never renders inline because Notion
    // uploads are served as binary/octet-stream. Served from our origin but
    // sandboxed to an opaque origin — embedded scripts run, yet cannot touch
    // blog storage, cookies, or the parent frame.
    let embedBody: Buffer
    try {
      embedBody = await fetchEmbedBody(target)
    } catch {
      res.status(503).end()
      return
    }
    if (embedCacheKey) setCachedEmbedBody(embedCacheKey, embedBody)
    sendEmbedBody(res, req, embedBody)
  } catch (error) {
    // A removed/inaccessible block is not an upstream outage. Neither case
    // changes the durable body, and failures must never cache a stale redirect.
    const notFound = typeof error === "object" && error !== null && "code" in error && error.code === "object_not_found"
    res.status(notFound ? 404 : 503).end()
  }
}
