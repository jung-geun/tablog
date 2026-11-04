/**
 * @jest-environment node
 */
import type { NextApiRequest, NextApiResponse } from "next"
import type { ExtendedRecordMap } from "notion-types"

const retrieveBlock = jest.fn()
const listChildren = jest.fn()
const retrievePage = jest.fn()
let cached: ExtendedRecordMap | null = null
const fetchMock = jest.fn()
jest.mock("src/apis/notion-client/notionClient", () => ({
  getOfficialNotionClient: () => ({
    pages: { retrieve: retrievePage },
    blocks: { retrieve: retrieveBlock, children: { list: listChildren } },
  }),
}))
jest.mock("src/libs/content/storage", () => ({ readStoredContent: jest.fn() }))
jest.mock("src/libs/cache", () => ({
  keys: { recordMap: (id: string, edited: string) => `${id}:${edited}` },
  cacheStore: { get: jest.fn(async () => cached), set: jest.fn(async (_key: string, value: ExtendedRecordMap) => { cached = value }) },
}))
jest.mock("site.config", () => ({ CONFIG: { link: "https://blog.example.com", revalidateTime: 3600 } }))
jest.mock("src/libs/utils/logger", () => ({ debugLog: jest.fn() }))
jest.mock("src/libs/utils/notion/fetchOgMetadata", () => ({ getOgMetadata: jest.fn(async () => null) }))

import { getRecordMap } from "src/apis/notion-client/getRecordMap"
import handler, { __clearEmbedBodyCacheForTests } from "src/pages/api/attachment"
import { readStoredContent } from "src/libs/content/storage"
import { readContentRecordMap } from "src/libs/content/registry"
import { unwrapBlock } from "src/libs/utils/notion/unwrapBlock"

const PAGE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const BLOCK = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const CONTAINER = "cccccccc-cccc-cccc-cccc-cccccccccccc"
const FOREIGN = "dddddddd-dddd-dddd-dddd-dddddddddddd"
const EDITED = "2026-06-01T12:00:00.000Z"
const normalized = (id: string) => id.replace(/-/g, "")
const signed = (signature: string, filename = "report.pdf") =>
  `https://prod-files-secure.s3.us-west-2.amazonaws.com/bucket/${filename}?X-Amz-Signature=${signature}&X-Amz-Expires=60`
function s3Body(text: string, init: { status?: number; contentLength?: string } = {}): Response {
  const headers: Record<string, string> = { "content-type": "binary/octet-stream" }
  if (init.contentLength !== undefined) headers["content-length"] = init.contentLength
  return new Response(text, { status: init.status ?? 200, headers })
}
type AttachmentType = "file" | "pdf" | "video" | "audio"
type BlockFixture = {
  object: string
  id: string
  type: string
  archived: boolean
  in_trash: boolean
  has_children: boolean
  parent: { type: string; page_id?: string; block_id?: string }
  created_time: string
  last_edited_time: string
  [key: string]: unknown
}
function upload(type: AttachmentType = "file", overrides: Record<string, unknown> = {}): BlockFixture {
  return {
    object: "block", id: BLOCK, type, archived: false, in_trash: false, has_children: false,
    parent: { type: "page_id", page_id: PAGE }, created_time: EDITED, last_edited_time: EDITED,
    [type]: { type: "file", file: { url: signed("expired"), expiry_time: EDITED }, name: "report.pdf", caption: [] },
    ...overrides,
  }
}
type FileEmbedType = "embed" | "link_preview"
function fileEmbed(type: FileEmbedType = "embed", url = signed("expired", "diagram.html"), overrides: Record<string, unknown> = {}): BlockFixture {
  return {
    object: "block", id: BLOCK, type, archived: false, in_trash: false, has_children: false,
    parent: { type: "page_id", page_id: PAGE }, created_time: EDITED, last_edited_time: EDITED,
    [type]: type === "embed" ? { url, caption: [] } : { url },
    ...overrides,
  }
}
async function body(blocks: BlockFixture[] = [upload()]): Promise<ExtendedRecordMap> {
  listChildren.mockResolvedValueOnce({ results: blocks, has_more: false })
  const map = await getRecordMap(PAGE, undefined, { bypassCache: true, lastEditedTime: EDITED })
  if (!map) throw new Error("Fixture body not returned")
  return map
}
function publish(map: ExtendedRecordMap) {
  ;(readStoredContent as jest.Mock).mockResolvedValue({
    initialized: true, entries: { [normalized(PAGE)]: { post: { id: PAGE }, recordMap: JSON.parse(JSON.stringify(map)) } },
  })
}
async function request(query: Record<string, string | string[]> = { pageId: PAGE, blockId: BLOCK }, method = "GET") {
  const response = {
    statusCode: 200, headers: {} as Record<string, string>, ended: false, sent: undefined as unknown,
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; return this },
    status(code: number) { this.statusCode = code; return this },
    end() { this.ended = true; return this },
    send(payload: unknown) { this.sent = payload; this.ended = true; return this },
  }
  await handler({ method, query } as unknown as NextApiRequest, response as unknown as NextApiResponse)
  return response
}

beforeEach(() => {
  jest.clearAllMocks()
  retrieveBlock.mockReset()
  listChildren.mockReset()
  retrievePage.mockReset()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  ;(readStoredContent as jest.Mock).mockReset()
  __clearEmbedBodyCacheForTests()
  cached = null
  retrievePage.mockResolvedValue({
    object: "page", id: PAGE, archived: false, in_trash: false, created_time: EDITED, last_edited_time: EDITED,
    url: `https://www.notion.so/${normalized(PAGE)}`,
    created_by: { id: FOREIGN }, last_edited_by: { id: FOREIGN }, properties: {},
  })
  retrieveBlock.mockResolvedValue(upload("file", { file: { type: "file", file: { url: signed("fresh") } } }))
})

test.each<AttachmentType>(["file", "pdf", "video", "audio"])("an unchanged published %s refreshes expired signed URLs for GET and HEAD", async (type) => {
  const map = await body([upload(type)])
  publish(map)
  const source = unwrapBlock(map.block[BLOCK])?.properties?.source?.[0]?.[0]
  const url = new URL(source!)
  expect(url.origin).toBe("https://blog.example.com")
  expect(url.pathname).toBe("/api/attachment")
  expect(url.searchParams.get("filename")).toBe("report.pdf")
  expect(source).not.toContain("expired")
  if (type === "file") expect(unwrapBlock(map.block[BLOCK])?.properties?.title).toEqual([["report.pdf"]])
  if (type === "audio") expect(unwrapBlock(map.block[BLOCK])?.format?.display_source).toBe(source)
  const before = JSON.stringify(await readContentRecordMap(PAGE))
  for (const [method, signature] of [["GET", "fresh"], ["HEAD", "refreshed-again"]]) {
    retrieveBlock.mockResolvedValueOnce(upload(type, { [type]: { type: "file", file: { url: signed(signature) } } }))
    const res = await request(Object.fromEntries(url.searchParams), method)
    expect(res.statusCode).toBe(307)
    expect(res.headers.location).toBe(signed(signature))
    expect(res.headers["cache-control"]).toBe("no-store")
    expect(res.ended).toBe(true)
  }
  expect(JSON.stringify(await readContentRecordMap(PAGE))).toBe(before)
})

test.each<AttachmentType>(["file", "pdf", "video", "audio"])("external %s remains external, including S3 URLs", async (type) => {
  const external = "https://example.s3.amazonaws.com/media.mp4?X-Amz-Signature=external"
  const map = await body([upload(type, { [type]: { type: "external", external: { url: external }, caption: [] } })])
  expect(unwrapBlock(map.block[BLOCK])?.properties?.source).toEqual([[external]])
})

test("nested attachments use the published page ID and partial descendants never replace its complete cached body", async () => {
  const nested = upload("file", { parent: { type: "block_id", block_id: CONTAINER } })
  const container = { ...upload(), id: CONTAINER, type: "toggle", toggle: { rich_text: [] }, has_children: true }
  listChildren.mockResolvedValueOnce({ results: [container], has_more: false })
  listChildren.mockResolvedValueOnce({ results: [nested], has_more: false })
  const map = await getRecordMap(PAGE, undefined, { bypassCache: true, lastEditedTime: EDITED })
  if (!map) throw new Error("Missing nested body")
  const source = unwrapBlock(map.block[BLOCK])?.properties?.source?.[0]?.[0]
  expect(new URL(source!).searchParams.get("pageId")).toBe(PAGE)
  publish(map)
  retrieveBlock.mockResolvedValueOnce({ ...nested, file: { type: "file", file: { url: signed("fresh") } } })
  expect((await request()).statusCode).toBe(307)
  listChildren.mockResolvedValueOnce({ results: [container], has_more: false })
  listChildren.mockResolvedValueOnce({ results: [{ object: "block", id: BLOCK }], has_more: false })
  await expect(getRecordMap(PAGE, undefined, { bypassCache: true, lastEditedTime: EDITED })).rejects.toThrow("incomplete child blocks")
  expect(await getRecordMap(PAGE, undefined, { lastEditedTime: EDITED })).toEqual(map)
})

test("private pages, foreign IDs and detached or removed blocks are not authorized by integration access", async () => {
  const map = await body()
  publish(map)
  expect((await request({ pageId: FOREIGN, blockId: BLOCK })).statusCode).toBe(404)
  expect((await request({ pageId: PAGE, blockId: FOREIGN })).statusCode).toBe(404)
  const root = unwrapBlock(map.block[PAGE])!
  root.content = []
  publish(map)
  expect((await request()).statusCode).toBe(404)
  ;(readStoredContent as jest.Mock).mockResolvedValue({ initialized: true, entries: {} })
  expect((await request()).statusCode).toBe(404)
  expect(retrieveBlock).not.toHaveBeenCalled()
})

test("non-attachment published blocks never reveal an integration file", async () => {
  const map = await body()
  unwrapBlock(map.block[BLOCK])!.type = "image"
  publish(map)
  expect((await request()).statusCode).toBe(404)
  expect(retrieveBlock).not.toHaveBeenCalled()
})

test.each([
  { archived: true }, { in_trash: true },
  { type: "image" }, { parent: { type: "page_id", page_id: FOREIGN } },
  { file: { type: "external", external: { url: "https://example.com/file" } } },
])("rejects an attachment that is no longer a live official upload: %j", async (change) => {
  publish(await body())
  retrieveBlock.mockResolvedValueOnce(upload("file", change))
  const res = await request()
  expect(res.statusCode).toBe(404)
  expect(res.headers.location).toBeUndefined()
})

const authenticatedTarget = new URL("https://secure.notion-static.com/file.pdf")
authenticatedTarget.username = "example-user"
authenticatedTarget.password = "example-password"

test.each([
  "http://prod-files-secure.s3.us-west-2.amazonaws.com/file.pdf",
  "https://prod-files-secure.s3.us-west-2.amazonaws.com.evil.test/file.pdf",
  "https://unrelated.s3.amazonaws.com/file.pdf",
  authenticatedTarget.toString(),
])("fails closed for an untrusted redirect target: %s", async (url) => {
  publish(await body())
  retrieveBlock.mockResolvedValueOnce(upload("file", { file: { type: "file", file: { url } } }))
  const res = await request()
  expect(res.statusCode).toBe(503)
  expect(res.headers.location).toBeUndefined()
  expect(res.headers["cache-control"]).toBe("no-store")
})

test("upstream outages and partial SDK responses fail 503 without mutating the published body", async () => {
  publish(await body())
  const before = JSON.stringify(await readContentRecordMap(PAGE))
  retrieveBlock.mockRejectedValueOnce(new Error("Notion unavailable"))
  expect((await request()).statusCode).toBe(503)
  retrieveBlock.mockResolvedValueOnce({ object: "block", id: BLOCK })
  expect((await request()).statusCode).toBe(503)
  expect(JSON.stringify(await readContentRecordMap(PAGE))).toBe(before)
  retrieveBlock.mockRejectedValueOnce({ code: "object_not_found" })
  expect((await request()).statusCode).toBe(404)
})

test.each<FileEmbedType>(["embed", "link_preview"])("a Notion-hosted file %s renders as a proxied iframe with filename caption", async (type) => {
  const map = await body([fileEmbed(type, signed("expired", "openstack-compute-removal-flow.html"))])
  const value = unwrapBlock(map.block[BLOCK])!
  expect(value.type).toBe("embed")
  const source = value.properties?.source?.[0]?.[0]
  const url = new URL(source!)
  expect(url.origin).toBe("https://blog.example.com")
  expect(url.pathname).toBe("/api/attachment")
  expect(url.searchParams.get("pageId")).toBe(PAGE)
  expect(url.searchParams.get("blockId")).toBe(BLOCK)
  expect(url.searchParams.get("filename")).toBe("openstack-compute-removal-flow.html")
  expect(source).not.toContain("expired")
  expect(value.format?.display_source).toBe(source)
  expect(value.format?.block_height).toBe(480)
  expect(value.properties?.caption).toEqual([["openstack-compute-removal-flow.html"]])
})

test("an explicit file-embed caption wins over the filename fallback", async () => {
  const caption = [{ type: "text", text: { content: "Custom caption" } }]
  const map = await body([fileEmbed("embed", signed("expired", "diagram.html"), { embed: { url: signed("expired", "diagram.html"), caption } })])
  expect(unwrapBlock(map.block[BLOCK])?.properties?.caption).toEqual([["Custom caption"]])
})

test("untrusted embeds still degrade to bookmark cards", async () => {
  const map = await body([fileEmbed("embed", "https://evil.test/diagram.html")])
  const value = unwrapBlock(map.block[BLOCK])!
  expect(value.type).toBe("bookmark")
  expect(value.properties?.link).toEqual([["https://evil.test/diagram.html"]])
  expect(value.properties?.source).toBeUndefined()
})

test("allowlisted embeds keep direct iframe URLs without proxying", async () => {
  const youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  const map = await body([fileEmbed("embed", youtube)])
  const value = unwrapBlock(map.block[BLOCK])!
  expect(value.type).toBe("embed")
  expect(value.properties?.source).toEqual([[youtube]])
  expect(value.format?.display_source).toBe(youtube)
})

test("a published file embed proxies bytes as sandboxed HTML", async () => {
  const map = await body([fileEmbed("embed")])
  publish(map)
  const source = unwrapBlock(map.block[BLOCK])?.properties?.source?.[0]?.[0]
  const fresh = signed("fresh", "diagram.html")
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", fresh))
  fetchMock.mockResolvedValueOnce(s3Body("<html>diagram</html>"))
  const res = await request(Object.fromEntries(new URL(source!).searchParams))
  expect(fetchMock).toHaveBeenCalledWith(fresh, expect.objectContaining({ redirect: "manual" }))
  expect(res.statusCode).toBe(200)
  expect(res.headers.location).toBeUndefined()
  expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
  expect(res.headers["content-security-policy"]).toBe("sandbox allow-scripts")
  expect(res.headers["x-content-type-options"]).toBe("nosniff")
  expect(res.headers["content-disposition"]).toBe('inline; filename="diagram.html"')
  expect(res.headers["content-length"]).toBe(String("<html>diagram</html>".length))
  expect(res.headers["cache-control"]).toBe("public, max-age=300")
  expect(Buffer.from(res.sent as Uint8Array).toString()).toBe("<html>diagram</html>")
  expect(res.ended).toBe(true)
})

test("a link_preview file upload resolves through the published embed", async () => {
  const map = await body([fileEmbed("link_preview")])
  expect(unwrapBlock(map.block[BLOCK])?.type).toBe("embed")
  publish(map)
  retrieveBlock.mockResolvedValueOnce(fileEmbed("link_preview", signed("fresh", "diagram.html")))
  fetchMock.mockResolvedValueOnce(s3Body("<html>diagram</html>"))
  const source = unwrapBlock(map.block[BLOCK])?.properties?.source?.[0]?.[0]
  const res = await request(Object.fromEntries(new URL(source!).searchParams))
  expect(res.statusCode).toBe(200)
  expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
  expect(Buffer.from(res.sent as Uint8Array).toString()).toBe("<html>diagram</html>")
})

test("a file embed answers HEAD with headers and no body", async () => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "diagram.html")))
  fetchMock.mockResolvedValueOnce(s3Body("<html>diagram</html>"))
  const res = await request({ pageId: PAGE, blockId: BLOCK, filename: "diagram.html" }, "HEAD")
  expect(res.statusCode).toBe(200)
  expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
  expect(res.sent).toBeUndefined()
  expect(res.ended).toBe(true)
})

test("a proxied PDF embed keeps its inline content type", async () => {
  publish(await body([fileEmbed("embed", signed("expired", "slides.pdf"))]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "slides.pdf")))
  fetchMock.mockResolvedValueOnce(s3Body("%PDF-1.4"))
  const res = await request({ pageId: PAGE, blockId: BLOCK, filename: "slides.pdf" })
  expect(res.statusCode).toBe(200)
  expect(res.headers["content-type"]).toBe("application/pdf")
  expect(res.headers["content-disposition"]).toBe('inline; filename="slides.pdf"')
})

test("a hostile filename never escapes the disposition header", async () => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "diagram.html")))
  fetchMock.mockResolvedValueOnce(s3Body("<html>diagram</html>"))
  const res = await request({ pageId: PAGE, blockId: BLOCK, filename: "../../x.html\"\r\nInjected: 1" })
  expect(res.statusCode).toBe(200)
  expect(res.headers["content-type"]).toBe("application/octet-stream")
  expect(res.headers["content-disposition"] ?? "").not.toContain("\r")
  expect(res.headers["content-disposition"] ?? "").not.toContain("\n")
  expect(res.headers["content-disposition"] ?? "").not.toContain('"Injected')
})

test("a Korean filename stays ASCII-only via RFC 5987", async () => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "diagram.html")))
  fetchMock.mockResolvedValueOnce(s3Body("<html>diagram</html>"))
  const res = await request({ pageId: PAGE, blockId: BLOCK, filename: "\ub2e4\uc774\uc5b34\uadf8\ub7a8.html" })
  expect(res.statusCode).toBe(200)
  expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
  const disposition = res.headers["content-disposition"] ?? ""
  expect(disposition).toContain("filename*=UTF-8''")
  expect(disposition).toContain(encodeURIComponent("\ub2e4\uc774\uc5b34\uadf8\ub7a8.html"))
  expect([...disposition].every((ch) => ch.charCodeAt(0) <= 0x7e)).toBe(true)
})

test("a repeated file embed serves from cache without Notion or S3", async () => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "diagram.html")))
  fetchMock.mockResolvedValueOnce(s3Body("<html>cached</html>"))
  const query = { pageId: PAGE, blockId: BLOCK, filename: "diagram.html" }
  const first = await request(query)
  expect(first.statusCode).toBe(200)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(retrieveBlock).toHaveBeenCalledTimes(1)
  const second = await request(query)
  expect(second.statusCode).toBe(200)
  expect(second.headers["cache-control"]).toBe("public, max-age=300")
  expect(Buffer.from(second.sent as Uint8Array).toString()).toBe("<html>cached</html>")
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(retrieveBlock).toHaveBeenCalledTimes(1)
})

test("an embed body over the cache cap still serves but is not cached", async () => {
  publish(await body([fileEmbed("embed")]))
  const big = "a".repeat(1024 * 1024 + 16)
  const query = { pageId: PAGE, blockId: BLOCK, filename: "big.html" }
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "big.html")))
  fetchMock.mockResolvedValueOnce(s3Body(big))
  const first = await request(query)
  expect(first.statusCode).toBe(200)
  expect(first.headers["content-length"]).toBe(String(big.length))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "big.html")))
  fetchMock.mockResolvedValueOnce(s3Body(big))
  const second = await request(query)
  expect(second.statusCode).toBe(200)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test.each([
  ["an upstream outage", () => fetchMock.mockRejectedValueOnce(new Error("S3 unavailable"))],
  ["an error status", () => fetchMock.mockResolvedValueOnce(s3Body("denied", { status: 403 }))],
  ["an empty body", () => fetchMock.mockResolvedValueOnce(s3Body(""))],
  ["an oversized declaration", () => fetchMock.mockResolvedValueOnce(s3Body("tiny", { contentLength: String(6 * 1024 * 1024) }))],
])("fails 503 without a redirect when the embed fetch hits %s", async (_case, arrange) => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", signed("fresh", "diagram.html")))
  arrange()
  const res = await request()
  expect(res.statusCode).toBe(503)
  expect(res.headers.location).toBeUndefined()
  expect(res.sent).toBeUndefined()
})

test("rejects a file embed whose live URL left Notion hosting", async () => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(fileEmbed("embed", "https://evil.test/diagram.html"))
  const res = await request()
  expect(res.statusCode).toBe(503)
  expect(res.headers.location).toBeUndefined()
})

test("rejects a published embed that is no longer an embed", async () => {
  publish(await body([fileEmbed("embed")]))
  retrieveBlock.mockResolvedValueOnce(upload("file"))
  const res = await request()
  expect(res.statusCode).toBe(404)
  expect(res.headers.location).toBeUndefined()
})
