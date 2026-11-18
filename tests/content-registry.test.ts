/**
 * @jest-environment node
 */

import type { ExtendedRecordMap, TextBlock } from "notion-types"
import type { TPost } from "src/types"
import type { ContentMetadata } from "src/libs/content/source"
import type { ContentState } from "src/libs/content/types"
import type * as ContentEngine from "src/libs/content"
import type * as ContentSelectors from "src/libs/content/registry"

jest.mock("src/libs/content/storage", () => ({
  readStoredContent: jest.fn(),
  withContentLock: jest.fn(),
}))
jest.mock("src/libs/content/source", () => ({
  listContentMetadata: jest.fn(),
  retrieveContentMetadata: jest.fn(),
  fetchContentBody: jest.fn(),
  normalizePageId: (id: string) => id.replace(/-/g, "").toLowerCase(),
  isContentSlug: jest.requireActual("src/libs/utils/notion/publication").isSafePostSlug,
}))
jest.mock("src/apis/notion-client/graphDelta", () => ({
  applyGraphDelta: jest.fn(),
}))
jest.mock("src/apis/vector/postEmbeddings", () => ({
  reconcilePostEmbeddings: jest.fn(async () => ({ updated: 0, pending: [], failed: [] })),
}))

import {
  enqueueContentEvent,
  getContentPostBySlug,
  readContentSnapshot,
  reconcileContent,
} from "src/libs/content"
import {
  getSlugRedirect,
  readContentRecordMap,
  readContentSnapshot as readPublicPosts,
} from "src/libs/content/registry"
import { readStoredContent, withContentLock } from "src/libs/content/storage"
import {
  fetchContentBody,
  listContentMetadata,
  normalizePageId,
  retrieveContentMetadata,
} from "src/libs/content/source"
import { applyGraphDelta } from "src/apis/notion-client/graphDelta"
import { reconcilePostEmbeddings } from "src/apis/vector/postEmbeddings"

const listMetadata = jest.mocked(listContentMetadata)
const retrieveMetadata = jest.mocked(retrieveContentMetadata)
const fetchBody = jest.mocked(fetchContentBody)
const graphDelta = jest.mocked(applyGraphDelta)
const revalidate = jest.fn<Promise<void>, [string]>()

const NOW = Date.parse("2026-06-01T12:00:00.000Z")
const EDITED = "2026-06-01T10:00:00.000Z"
const NEXT_EDIT = "2026-06-01T12:01:00.000Z"
const A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const C_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
const A_KEY = normalizePageId(A_ID)
const COLLECTIONS = ["/", "/search", "/series", "/graph", "/ontology"]
const A_PATHS = [...COLLECTIONS, "/alpha", "/categories/Engineering", "/series/Registry%20notes"]

function post(id: string, slug: string, overrides: Partial<TPost> = {}): TPost {
  return {
    id, slug, title: `Post ${slug}`,
    date: { start_date: "2026-05-01T00:00:00.000Z" },
    createdTime: "2026-05-01T00:00:00.000Z",
    lastEditedTime: EDITED,
    type: ["Post"], status: ["Public"], fullWidth: false,
    ...overrides,
  }
}

const a = post(A_ID, "alpha", { category: ["Engineering"], series: ["Registry notes"] })
const b = post(B_ID, "beta", { category: ["Other"], series: ["Other notes"] })

function recordMap(
  pageId: string,
  text: string,
  options: { editedAt?: string; version?: number; signedUrl?: string } = {},
): ExtendedRecordMap {
  const textId = `${normalizePageId(pageId)}-text`
  const common = {
    version: options.version ?? 1,
    created_time: Date.parse("2026-05-01T00:00:00.000Z"),
    last_edited_time: Date.parse(options.editedAt ?? EDITED),
    alive: true,
    created_by_table: "notion_user", created_by_id: C_ID,
    last_edited_by_table: "notion_user", last_edited_by_id: C_ID,
  }
  const textBlock: TextBlock = {
    ...common, id: textId, type: "text", parent_id: pageId, parent_table: "block",
    properties: {
      title: options.signedUrl ? [[text], [" attachment", [["a", options.signedUrl]]]] : [[text]],
    },
  }
  return {
    block: {
      [pageId]: {
        role: "reader",
        value: {
          ...common, id: pageId, type: "page", parent_id: C_ID, parent_table: "space",
          properties: { title: [["Fixture page"]] },
          format: {}, permissions: [], content: [textId],
        },
      },
      [textId]: { role: "reader", value: textBlock },
    },
    collection: {}, collection_view: {}, collection_query: {}, notion_user: {},
    signed_urls: options.signedUrl ? { [textId]: options.signedUrl } : {},
  }
}

function visibleText(map: ExtendedRecordMap, pageId: string): string {
  const wrapped = map.block[`${normalizePageId(pageId)}-text`].value
  const block = ("value" in wrapped ? wrapped.value : wrapped) as TextBlock
  return block.properties!.title.map(([text]) => text).join("")
}

// Storage round-trips JSON at every boundary, never sharing mutable state with
// the engine. This fixture tests lifecycle persistence, not filesystem locking.
let serializedState: string | null
const liveMetadata = new Map<string, ContentMetadata>()
const liveBodies = new Map<string, ExtendedRecordMap>()
const omittedFromScan = new Set<string>()
let scanOverride: ContentMetadata[] | undefined

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
function loadFixture(): ContentState | null {
  return serializedState === null ? null : JSON.parse(serializedState) as ContentState
}
function publish(next: TPost, text: string, editedAt = next.lastEditedTime ?? EDITED): void {
  const id = normalizePageId(next.id)
  liveMetadata.set(id, { id: next.id, lastEdited: editedAt, post: clone(next) })
  liveBodies.set(id, recordMap(next.id, text, { editedAt }))
}
function clearEffects(): void {
  listMetadata.mockClear()
  retrieveMetadata.mockClear()
  fetchBody.mockClear()
  graphDelta.mockClear()
  revalidate.mockClear()
}
function requestedBodies(): string[] {
  return fetchBody.mock.calls.map(([id]) => normalizePageId(id))
}
function expectPaths(paths: string[]): void {
  expect(revalidate.mock.calls.map(([path]) => path).sort()).toEqual([...paths].sort())
}
async function bootstrap(): Promise<void> {
  const result = await reconcileContent({ full: true, revalidate })
  expect(result.failed).toEqual([])
  expect(result.pending).toEqual([])
  clearEffects()
}

const notificationKeys = ["DISCORD_WEBHOOK", "INDEXNOW_KEY"] as const
let savedNotificationEnv: Partial<Record<(typeof notificationKeys)[number], string>>

beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
  savedNotificationEnv = {}
  for (const key of notificationKeys) {
    savedNotificationEnv[key] = process.env[key]
    delete process.env[key]
  }
  serializedState = null
  liveMetadata.clear()
  liveBodies.clear()
  omittedFromScan.clear()
  scanOverride = undefined
  jest.mocked(readStoredContent).mockReset().mockImplementation(async () => loadFixture())
  jest.mocked(withContentLock).mockReset().mockImplementation(async operation => operation(
    async () => loadFixture(),
    async state => { serializedState = JSON.stringify(state) },
  ))
  listMetadata.mockReset().mockImplementation(async () => clone(
    scanOverride ?? [...liveMetadata.entries()]
      .filter(([id]) => !omittedFromScan.has(id))
      .map(([, metadata]) => metadata),
  ))
  retrieveMetadata.mockReset().mockImplementation(async id => clone(
    liveMetadata.get(normalizePageId(id)) ?? { id, lastEdited: "deleted" },
  ))
  fetchBody.mockReset().mockImplementation(async id => {
    const map = liveBodies.get(normalizePageId(id))
    if (!map) throw new Error("Fixture body unavailable")
    return clone(map)
  })
  graphDelta.mockReset().mockResolvedValue(undefined)
  revalidate.mockReset().mockResolvedValue(undefined)
  jest.mocked(reconcilePostEmbeddings).mockReset().mockResolvedValue({ updated: 0, pending: [], failed: [] })
  publish(a, "Alpha original body")
  publish(b, "Beta original body")
})

afterEach(() => {
  for (const key of notificationKeys) {
    const value = savedNotificationEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  jest.useRealTimers()
})

describe("content registry public lifecycle", () => {
  it("bootstraps two readable posts, then does no body, ISR or graph work for unchanged content", async () => {
    const initial = await reconcileContent({ full: true, revalidate })
    const snapshot = await readContentSnapshot(false)

    expect(initial).toMatchObject({ changed: 2, failed: [], pending: [] })
    expect(snapshot.posts.map(item => item.id)).toEqual([A_ID, B_ID])
    expect(visibleText(snapshot.recordMaps[A_ID], A_ID)).toBe("Alpha original body")
    expect(visibleText(snapshot.recordMaps[B_ID], B_ID)).toBe("Beta original body")
    expect(await readPublicPosts()).toEqual(snapshot.posts)
    expect(await getContentPostBySlug("alpha")).toEqual(snapshot.posts[0])
    expect(requestedBodies().sort()).toEqual([A_KEY, normalizePageId(B_ID)].sort())
    expectPaths([...A_PATHS, "/beta", "/categories/Other", "/series/Other%20notes"])
    expect(graphDelta).toHaveBeenCalledTimes(1)
    expect(graphDelta.mock.calls[0][0].upserted.map(item => item.id).sort()).toEqual([A_ID, B_ID])
    expect(graphDelta.mock.calls[0][0].deletedIds).toEqual([])
    clearEffects()

    jest.setSystemTime(NOW + 60_000)
    const unchanged = await reconcileContent({ revalidate })

    expect(unchanged).toMatchObject({ changed: 0, completed: 0, failed: [], pending: [], revision: snapshot.revision })
    expect(await readContentSnapshot(false)).toEqual(snapshot)
    expect(fetchBody).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
  })

  it("processes scheduled maintenance without requiring ISR revalidation", async () => {
    await bootstrap()
    publish({ ...a, title: "Updated title", lastEditedTime: NEXT_EDIT }, "Alpha original body")

    const result = await reconcileContent({ deferPathRevalidation: true })

    expect(result).toMatchObject({ changed: 1, failed: [], pending: [], maintenancePending: 0 })
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).toHaveBeenCalledTimes(1)
    expect(loadFixture()?.effects).toEqual([])
  })

  it("changes metadata without changing the body version or another post", async () => {
    await bootstrap()
    const previous = await getContentPostBySlug("alpha")
    const untouched = await getContentPostBySlug("beta")
    publish({ ...a, title: "Updated title", lastEditedTime: NEXT_EDIT }, "Alpha original body")
    const result = await reconcileContent({ revalidate })
    const updated = await getContentPostBySlug("alpha")

    expect(result.changed).toBe(1)
    expect(updated?.title).toBe("Updated title")
    expect(updated?.contentHash).toBe(previous?.contentHash)
    expect(await getContentPostBySlug("beta")).toEqual(untouched)
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha original body")
    expect(requestedBodies()).toEqual([A_KEY])
  })

  it("confirms the edit minute once so two edits sharing a Notion timestamp are not lost", async () => {
    await bootstrap()
    jest.setSystemTime(NOW + 60_000)
    const edited = { ...a, lastEditedTime: NEXT_EDIT }
    publish(edited, "First edit in this minute")
    await reconcileContent({ revalidate })
    clearEffects()
    publish(edited, "Second edit in the same minute")
    jest.setSystemTime(NOW + 120_000)

    const confirmed = await reconcileContent({ revalidate })
    expect(confirmed.changed).toBe(1)
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Second edit in the same minute")
    expect(requestedBodies()).toEqual([A_KEY])
    clearEffects()
    jest.setSystemTime(NOW + 180_000)
    expect((await reconcileContent({ revalidate })).changed).toBe(0)
    expect(fetchBody).not.toHaveBeenCalled()
  })

  it("uses a webhook hint to refresh a body even if Notion's timestamp did not change", async () => {
    await bootstrap()
    publish(a, "Same-timestamp body edit")
    await enqueueContentEvent("same-minute-edit", [A_ID])

    const result = await reconcileContent({ revalidate })
    expect(result.changed).toBe(1)
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Same-timestamp body edit")
    expect(requestedBodies()).toEqual([A_KEY])
  })

  it("publishes content before deferred graph maintenance and keeps failed maintenance retryable", async () => {
    await bootstrap()
    publish({ ...a, lastEditedTime: NEXT_EDIT }, "Published before AI maintenance")
    graphDelta.mockRejectedValue(new Error("AI provider unavailable"))
    const published = await reconcileContent({ revalidate, maintenance: false })

    expect(published).toMatchObject({ changed: 1, failed: [], pending: [], maintenancePending: 1 })
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Published before AI maintenance")
    expect(graphDelta).not.toHaveBeenCalled()
    expectPaths(A_PATHS)
    clearEffects()
    const failed = await reconcileContent({ revalidate })
    expect(failed.maintenancePending).toBe(1)
    expect(failed.failed).toContain(`graph:${published.revision}`)
    expect(revalidate).not.toHaveBeenCalled()
    graphDelta.mockResolvedValue(undefined)
    const recovered = await reconcileContent({ revalidate })
    expect(recovered).toMatchObject({ changed: 0, failed: [], pending: [], maintenancePending: 0 })
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Published before AI maintenance")
  })
  it("regenerates publication paths even when optional embeddings exhaust the maintenance deadline", async () => {
    await bootstrap()
    publish({ ...a, lastEditedTime: NEXT_EDIT }, "Published before slow embedding maintenance")
    jest.mocked(reconcilePostEmbeddings).mockImplementationOnce(async () => {
      jest.setSystemTime(NOW + 13 * 60_000)
      return { updated: 0, pending: [A_ID], failed: [] }
    })
    const result = await reconcileContent({ revalidate })
    expectPaths(A_PATHS)
    expect(result).toMatchObject({ changed: 1, maintenancePending: 2 })
    expect(result.pending).toContain(`embedding:${A_ID}`)
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Published before slow embedding maintenance")
  })


  it("keeps content healthy and readable while optional IndexNow delivery is pending", async () => {
    process.env.INDEXNOW_KEY = "1234567890abcdef"
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockRejectedValue(new Error("IndexNow unavailable"))
    try {
      const result = await reconcileContent({ full: true, revalidate })
      expect(result).toMatchObject({ changed: 2, failed: [], pending: [], notificationsPending: 1 })
      expect((await readPublicPosts())?.map(item => item.id)).toEqual([A_ID, B_ID])
      expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha original body")
      expect(loadFixture()?.notifications[0]).toMatchObject({ kind: "indexnow", attempts: 1 })
    } finally {
      global.fetch = originalFetch
    }
  })

  it("refreshes an unchanged category route without refetching all of its posts", async () => {
    await bootstrap()
    const before = await readContentSnapshot(false)
    const result = await reconcileContent({ path: "/categories/Engineering", revalidate })
    expect(result).toMatchObject({ changed: 0, completed: 1, failed: [], pending: [] })
    expect(await readContentSnapshot(false)).toEqual(before)
    expect(fetchBody).not.toHaveBeenCalled()
    expectPaths(["/categories/Engineering"])
  })

  it("publishes one body edit and invalidates its detail/category/series, without touching another post", async () => {
    await bootstrap()
    const before = await readContentSnapshot(false)
    jest.setSystemTime(NOW + 60_000)
    publish({ ...a, lastEditedTime: NEXT_EDIT }, "Alpha edited body")

    const result = await reconcileContent({ revalidate })
    const after = await readContentSnapshot(false)
    const edited = await getContentPostBySlug("alpha")

    expect(result).toMatchObject({ changed: 1, failed: [], pending: [] })
    expect(visibleText(after.recordMaps[A_ID], A_ID)).toBe("Alpha edited body")
    expect(edited?.contentHash).not.toBe(before.posts.find(item => item.id === A_ID)!.contentHash)
    expect(edited?.contentModifiedTime).toBe(new Date(NOW + 60_000).toISOString())
    expect(after.posts.find(item => item.id === B_ID)).toEqual(before.posts.find(item => item.id === B_ID))
    expect(after.recordMaps[B_ID]).toEqual(before.recordMaps[B_ID])
    expect(requestedBodies()).toEqual([A_KEY])
    expectPaths(A_PATHS)
    expect(graphDelta).toHaveBeenCalledTimes(1)
    expect(graphDelta.mock.calls[0][0]).toEqual({ revision: after.revision, upserted: [edited], deletedIds: [] })
  })

  it("ignores timestamp/version and S3 signature churn for the visible stamp, ISR and graph", async () => {
    const signedUrl = (signature: string, date: string) =>
      `https://bucket.s3.amazonaws.com/attachment.png?width=640&X-Amz-Signature=${signature}&X-Amz-Date=${date}&X-Amz-Expires=900`
    liveBodies.set(A_KEY, recordMap(A_ID, "Alpha original body", { signedUrl: signedUrl("first", "20260601T100000Z") }))
    await bootstrap()
    const before = await readContentSnapshot(false)
    jest.setSystemTime(NOW + 60_000)
    publish({ ...a, lastEditedTime: NEXT_EDIT, createdTime: "2026-05-02T00:00:00.000Z" }, "Alpha original body")
    liveBodies.set(A_KEY, recordMap(A_ID, "Alpha original body", {
      editedAt: NEXT_EDIT, version: 42, signedUrl: signedUrl("renewed", "20260601T120100Z"),
    }))

    const result = await reconcileContent({ revalidate })
    const after = await readContentSnapshot(false)
    const oldPost = before.posts.find(item => item.id === A_ID)!
    const current = after.posts.find(item => item.id === A_ID)!

    expect(requestedBodies()).toEqual([A_KEY])
    expect(visibleText(after.recordMaps[A_ID], A_ID)).toBe("Alpha original body attachment")
    expect(current.contentHash).toBe(oldPost.contentHash)
    expect(current.contentModifiedTime).toBe(oldPost.contentModifiedTime)
    expect(after.revision).toBe(before.revision)
    expect(result).toMatchObject({ changed: 0, completed: 0, failed: [], pending: [] })
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()

    // Non-authentication query parameters still change what the consumer sees.
    clearEffects()
    jest.setSystemTime(NOW + 120_000)
    publish({ ...a, lastEditedTime: "2026-06-01T12:02:00.000Z" }, "Alpha original body")
    liveBodies.set(A_KEY, recordMap(A_ID, "Alpha original body", {
      signedUrl: signedUrl("renewed", "20260601T120100Z").replace("width=640", "width=1280"),
    }))
    const meaningful = await reconcileContent({ revalidate })
    expect(meaningful).toMatchObject({ changed: 1, failed: [], pending: [] })
    expect((await getContentPostBySlug("alpha"))?.contentHash).not.toBe(oldPost.contentHash)
    expect((await getContentPostBySlug("alpha"))?.contentModifiedTime).toBe(new Date(NOW + 120_000).toISOString())
    expectPaths(A_PATHS)
    expect(graphDelta.mock.calls[0][0].upserted.map(item => item.id)).toEqual([A_ID])
  })

  it("redirects a renamed slug, then revokes its aliases and body when the page becomes private", async () => {
    await bootstrap()
    const untouched = await getContentPostBySlug("beta")
    publish({ ...a, slug: "renamed-alpha", lastEditedTime: NEXT_EDIT }, "Alpha original body")
    await reconcileContent({ revalidate })

    expect(await getContentPostBySlug("alpha")).toBeUndefined()
    expect((await getContentPostBySlug("renamed-alpha"))?.id).toBe(A_ID)
    expect(await getSlugRedirect("alpha")).toBe("renamed-alpha")
    expect((await readContentSnapshot(false)).redirects).toEqual({ alpha: "/renamed-alpha" })
    expectPaths([...A_PATHS, "/renamed-alpha"])
    clearEffects()

    // The source boundary represents Private metadata by omitting its public post.
    liveMetadata.set(A_KEY, { id: A_ID, lastEdited: "2026-06-01T12:02:00.000Z" })
    const revoked = await reconcileContent({ revalidate })
    const snapshot = await readContentSnapshot(false)

    expect(revoked).toMatchObject({ changed: 1, failed: [], pending: [] })
    expect(snapshot.posts).toEqual([untouched])
    expect(await readPublicPosts()).toEqual([untouched])
    expect(await getContentPostBySlug("renamed-alpha")).toBeUndefined()
    expect(await readContentRecordMap(A_ID)).toBeNull()
    expect(snapshot.recordMaps[A_ID]).toBeUndefined()
    expect(snapshot.redirects).toEqual({})
    expect(await getSlugRedirect("alpha")).toBeNull()
    expect(await getSlugRedirect("renamed-alpha")).toBeNull()
    expect(fetchBody).not.toHaveBeenCalled()
    expectPaths([...A_PATHS, "/renamed-alpha"])
    expect(graphDelta.mock.calls[0][0]).toEqual({ revision: snapshot.revision, upserted: [], deletedIds: [A_ID] })
  })

  it("never resurrects an old redirect after another page reclaims that alias and is deleted", async () => {
    await bootstrap()
    publish({ ...a, slug: "renamed-alpha", lastEditedTime: NEXT_EDIT }, "Alpha original body")
    await reconcileContent({ revalidate })
    expect(await getSlugRedirect("alpha")).toBe("renamed-alpha")

    publish({ ...b, slug: "alpha", lastEditedTime: NEXT_EDIT }, "Beta original body")
    await reconcileContent({ revalidate })
    expect((await getContentPostBySlug("alpha"))?.id).toBe(B_ID)
    expect(await getSlugRedirect("alpha")).toBeNull()
    clearEffects()

    liveMetadata.delete(normalizePageId(B_ID))
    await reconcileContent({ full: true, revalidate })

    expect(await getContentPostBySlug("alpha")).toBeUndefined()
    expect(await getSlugRedirect("alpha")).toBeNull()
    expect(await getSlugRedirect("beta")).toBeNull()
    expect(await readContentRecordMap(B_ID)).toBeNull()
    expect((await readContentSnapshot(false)).posts.map(item => item.slug)).toEqual(["renamed-alpha"])
    expect(graphDelta.mock.calls[0][0].deletedIds).toEqual([B_ID])

    await reconcileContent({ full: true, revalidate })
    expect(await getSlugRedirect("alpha")).toBeNull()
  })

  it.each(["metadata listing", "metadata retrieval", "body fetch", "missing body"] as const)(
    "preserves the published snapshot on %s failure and retries the pending page",
    async failure => {
      await bootstrap()
      const before = await readContentSnapshot(false)
      publish({ ...a, title: "Recovered title", lastEditedTime: NEXT_EDIT }, "Recovered alpha body")
      scanOverride = [] // The queued hint must retrieve live metadata even outside the scan.
      await enqueueContentEvent(`failure:${failure}`, [A_ID])
      if (failure === "metadata listing") listMetadata.mockRejectedValueOnce(new Error("Notion query 502"))
      if (failure === "metadata retrieval") retrieveMetadata.mockRejectedValueOnce(new Error("Notion retrieve 502"))
      if (failure === "body fetch") fetchBody.mockRejectedValueOnce(new Error("Notion body 502"))
      if (failure === "missing body") fetchBody.mockResolvedValueOnce(null)

      const failed = await reconcileContent({ revalidate })

      expect(failed.failed).toEqual([failure === "metadata listing" ? "metadata-reconciliation" : `page:${A_KEY}`])
      expect(failed.pending).toEqual(expect.arrayContaining([expect.stringContaining(A_KEY)]))
      expect(failed.changed).toBe(0)
      expect(await readContentSnapshot(false)).toEqual(before)
      expect(await readPublicPosts()).toEqual(before.posts)
      expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha original body")
      expect(revalidate).not.toHaveBeenCalled()
      expect(graphDelta).not.toHaveBeenCalled()
      clearEffects()

      jest.setSystemTime(NOW + 60_000)
      const retried = await reconcileContent({ revalidate })
      const recovered = await readContentSnapshot(false)

      expect(retried).toMatchObject({ changed: 1, failed: [], pending: [] })
      expect(retrieveMetadata.mock.calls.map(([id]) => id)).toEqual([A_KEY])
      expect(requestedBodies()).toEqual([A_KEY])
      expect((await getContentPostBySlug("alpha"))?.title).toBe("Recovered title")
      expect(visibleText(recovered.recordMaps[A_ID], A_ID)).toBe("Recovered alpha body")
      expect(recovered.posts.find(item => item.id === B_ID)).toEqual(before.posts.find(item => item.id === B_ID))
      expectPaths(A_PATHS)
      expect(graphDelta.mock.calls[0][0].upserted.map(item => item.id)).toEqual([A_ID])
    },
  )

  it("keeps failed ISR pending after publication and later drains only the failed route", async () => {
    await bootstrap()
    publish({ ...a, lastEditedTime: NEXT_EDIT }, "Alpha committed before ISR")
    revalidate.mockImplementation(async path => {
      if (path === "/alpha") {
        expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha committed before ISR")
        throw new Error("ISR unavailable")
      }
    })

    const failed = await reconcileContent({ revalidate })
    const published = await readContentSnapshot(false)

    expect(failed).toMatchObject({ changed: 1, failed: ["/alpha"], pending: ["/alpha"] })
    expect(visibleText(published.recordMaps[A_ID], A_ID)).toBe("Alpha committed before ISR")
    expectPaths(A_PATHS)
    expect(graphDelta).toHaveBeenCalledTimes(1)
    clearEffects()
    revalidate.mockResolvedValue(undefined)

    const drained = await reconcileContent({ revalidate })

    expect(drained).toMatchObject({ changed: 0, completed: 1, failed: [], pending: [] })
    expectPaths(["/alpha"])
    expect(fetchBody).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
    expect(await readContentSnapshot(false)).toEqual(published)
  })

  it("deduplicates event IDs and handles an older hint using current upstream content, not event order", async () => {
    await bootstrap()
    scanOverride = []
    publish({ ...a, title: "Newer event version", lastEditedTime: NEXT_EDIT }, "Alpha version two")
    await enqueueContentEvent("newer-event", [A_ID])
    await reconcileContent({ revalidate })
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha version two")
    clearEffects()

    publish({ ...a, title: "Current live title", lastEditedTime: "2026-06-01T12:02:00.000Z" }, "Alpha current live body")
    await enqueueContentEvent("older-delayed-event", [A_ID])
    await enqueueContentEvent("newer-event", [B_ID]) // Duplicate IDs cannot enqueue a different page.
    const result = await reconcileContent({ revalidate })
    const current = await readContentSnapshot(false)

    expect(result).toMatchObject({ changed: 1, failed: [], pending: [] })
    expect(retrieveMetadata.mock.calls.map(([id]) => id)).toEqual([A_KEY])
    expect(requestedBodies()).toEqual([A_KEY])
    expect((await getContentPostBySlug("alpha"))?.title).toBe("Current live title")
    expect(visibleText(current.recordMaps[A_ID], A_ID)).toBe("Alpha current live body")
    expectPaths(A_PATHS)
    expect(graphDelta.mock.calls[0][0].upserted.map(item => item.title)).toEqual(["Current live title"])
    clearEffects()

    publish({ ...a, lastEditedTime: "2026-06-01T12:03:00.000Z" }, "Unannounced version")
    await enqueueContentEvent("older-delayed-event", [A_ID])
    await enqueueContentEvent("newer-event", [A_ID])
    const duplicate = await reconcileContent({ revalidate })

    expect(duplicate).toMatchObject({ changed: 0, failed: [], pending: [] })
    expect(await readContentSnapshot(false)).toEqual(current)
    expect(retrieveMetadata).not.toHaveBeenCalled()
    expect(fetchBody).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
  })

  it("publishes a scheduled page at its date on reconciliation even when the incremental scan omits it", async () => {
    const publication = NOW + 60 * 60_000
    publish({ ...a, date: { start_date: new Date(publication).toISOString() } }, "Scheduled alpha body")
    await reconcileContent({ full: true, revalidate })

    expect((await readContentSnapshot(false)).posts.map(item => item.id)).toEqual([B_ID])
    expect(await getContentPostBySlug("alpha")).toBeUndefined()
    expect(await readContentRecordMap(A_ID)).toBeNull()
    expect(requestedBodies()).toEqual([normalizePageId(B_ID)])
    clearEffects()
    scanOverride = []
    jest.setSystemTime(publication - 1)
    const early = await reconcileContent({ revalidate })
    expect(early).toMatchObject({ changed: 0, failed: [], pending: [] })
    expect(await getContentPostBySlug("alpha")).toBeUndefined()
    expect(fetchBody).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
    clearEffects()

    jest.setSystemTime(publication)
    const published = await reconcileContent({ revalidate })

    expect(published).toMatchObject({ changed: 1, failed: [], pending: [] })
    expect(retrieveMetadata.mock.calls.map(([id]) => id)).toEqual([A_KEY])
    expect(requestedBodies()).toEqual([A_KEY])
    expect((await readContentSnapshot(false)).posts.map(item => item.id)).toEqual([A_ID, B_ID])
    expect((await getContentPostBySlug("alpha"))?.contentModifiedTime).toBe(new Date(publication).toISOString())
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Scheduled alpha body")
    expectPaths(A_PATHS)
    expect(graphDelta.mock.calls[0][0].upserted.map(item => item.id)).toEqual([A_ID])
  })

  it.each(["deleted", "moved out of the data source"] as const)(
    "removes a missing %s page and its aliases on a full scan, preserving unrelated content",
    async removal => {
      await bootstrap()
      publish({ ...a, slug: "renamed-alpha", lastEditedTime: NEXT_EDIT }, "Alpha original body")
      await reconcileContent({ revalidate })
      const untouched = await getContentPostBySlug("beta")
      clearEffects()
      if (removal === "deleted") liveMetadata.delete(A_KEY)
      else {
        liveMetadata.set(A_KEY, { id: A_ID, lastEdited: NEXT_EDIT })
        omittedFromScan.add(A_KEY)
      }

      const result = await reconcileContent({ full: true, revalidate })
      const snapshot = await readContentSnapshot(false)

      expect(result).toMatchObject({ changed: 1, failed: [], pending: [] })
      expect(snapshot.posts).toEqual([untouched])
      expect(await getContentPostBySlug("renamed-alpha")).toBeUndefined()
      expect(await getSlugRedirect("alpha")).toBeNull()
      expect(await readContentRecordMap(A_ID)).toBeNull()
      expect(Object.keys(snapshot.recordMaps)).toEqual([B_ID])
      expectPaths([...A_PATHS, "/renamed-alpha"])
      expect(graphDelta.mock.calls[0][0]).toEqual({ revision: snapshot.revision, upserted: [], deletedIds: [A_ID] })
      expect(fetchBody).not.toHaveBeenCalled()
      clearEffects()

      const unchanged = await reconcileContent({ full: true, revalidate })
      expect(unchanged).toMatchObject({ changed: 0, failed: [], pending: [] })
      expect(await readContentSnapshot(false)).toEqual(snapshot)
      expect(fetchBody).not.toHaveBeenCalled()
      expect(revalidate).not.toHaveBeenCalled()
      expect(graphDelta).not.toHaveBeenCalled()
    },
  )

  it("preserves incumbent posts when a rename proposes an already published slug", async () => {
    const unrelated = post(C_ID, "unrelated")
    publish(unrelated, "Unrelated public body")
    await bootstrap()
    const before = await readContentSnapshot(false)
    publish({ ...a, slug: "beta", lastEditedTime: NEXT_EDIT }, "Alpha must not leak under beta")

    const result = await reconcileContent({ revalidate })

    expect(result).toMatchObject({ changed: 0, failed: [], pending: [`page:${A_KEY}`] })
    expect(await readContentSnapshot(false)).toEqual(before)
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha original body")
    expect(visibleText((await readContentRecordMap(B_ID))!, B_ID)).toBe("Beta original body")
    expect(await getSlugRedirect("alpha")).toBeNull()
    expect(fetchBody).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
  })

  it.each([false, true])("defers a slug handover if its incumbent's body fails (reverse scan: %s)", async reverse => {
    await bootstrap()
    const before = await readContentSnapshot(false)
    publish({ ...a, slug: "renamed-alpha", lastEditedTime: NEXT_EDIT }, "Alpha renamed body")
    publish({ ...b, slug: "alpha", lastEditedTime: NEXT_EDIT }, "Beta reclaimed body")
    if (reverse) scanOverride = [...liveMetadata.values()].reverse()
    fetchBody.mockImplementation(async id => {
      if (normalizePageId(id) === A_KEY) throw new Error("Incumbent body unavailable")
      return clone(liveBodies.get(normalizePageId(id))!)
    })

    const failed = await reconcileContent({ revalidate })

    expect(failed).toMatchObject({ changed: 0, failed: [`page:${A_KEY}`] })
    expect(failed.pending.sort()).toEqual([`page:${A_KEY}`, `page:${normalizePageId(B_ID)}`].sort())
    expect(await readContentSnapshot(false)).toEqual(before)
    expect(await readPublicPosts()).toEqual(before.posts)
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
    clearEffects()
    jest.setSystemTime(NOW + 60_000)
    fetchBody.mockImplementation(async id => clone(liveBodies.get(normalizePageId(id))!))

    const recovered = await reconcileContent({ revalidate })

    expect(recovered).toMatchObject({ changed: 2, failed: [], pending: [] })
    expect((await getContentPostBySlug("alpha"))?.id).toBe(B_ID)
    expect((await getContentPostBySlug("renamed-alpha"))?.id).toBe(A_ID)
    expect(visibleText((await readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha renamed body")
    expect(visibleText((await readContentRecordMap(B_ID))!, B_ID)).toBe("Beta reclaimed body")
    expect(await getSlugRedirect("alpha")).toBeNull()
    expect(await getSlugRedirect("beta")).toBe("alpha")
  })

  it("also rejects ambiguous slugs during a cold bootstrap without fetching or exposing either body", async () => {
    publish({ ...a, slug: "shared" }, "Secret alpha collision body")
    publish({ ...b, slug: "shared" }, "Secret beta collision body")

    const result = await reconcileContent({ full: true, revalidate })

    expect(result).toMatchObject({ changed: 0, failed: [], pending: [] })
    expect(await readPublicPosts()).toEqual([])
    expect(await getContentPostBySlug("shared")).toBeUndefined()
    expect((await readContentSnapshot(false)).recordMaps).toEqual({})
    expect(await getSlugRedirect("shared")).toBeNull()
    expect(fetchBody).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
  })

  it("reloads a serialized restart fixture with its public snapshot, aliases and undrained outbox intact", async () => {
    await bootstrap()
    publish({ ...a, slug: "renamed-alpha", lastEditedTime: NEXT_EDIT }, "Alpha persisted edit")
    const queued = await reconcileContent({}) // Publish without an ISR worker; graph and paths remain durable.
    const beforeRestart = await readContentSnapshot(false)
    expect(queued.pending).toEqual(expect.arrayContaining(["/alpha", "/renamed-alpha", `graph:${beforeRestart.revision}`]))
    const checkpoint = serializedState!

    serializedState = null
    let restarted!: typeof ContentEngine
    let restartedSelectors!: typeof ContentSelectors
    jest.isolateModules(() => {
      restarted = require("src/libs/content")
      restartedSelectors = require("src/libs/content/registry")
    })
    serializedState = checkpoint
    clearEffects()

    expect(await restarted.readContentSnapshot(false)).toEqual(beforeRestart)
    expect(await restartedSelectors.readContentSnapshot()).toEqual(beforeRestart.posts)
    expect(await restartedSelectors.getSlugRedirect("alpha")).toBe("renamed-alpha")
    expect(visibleText((await restartedSelectors.readContentRecordMap(A_ID))!, A_ID)).toBe("Alpha persisted edit")
    expect(fetchBody).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()

    const drained = await restarted.reconcileContent({ revalidate })

    expect(drained).toMatchObject({ changed: 0, failed: [], pending: [] })
    expectPaths([...A_PATHS, "/renamed-alpha"])
    expect(fetchBody).not.toHaveBeenCalled()
    expect(graphDelta).toHaveBeenCalledTimes(1)
    expect(graphDelta.mock.calls[0][0]).toEqual({
      revision: beforeRestart.revision,
      upserted: [beforeRestart.posts.find(item => item.id === A_ID)],
      deletedIds: [],
    })
    expect(await restarted.readContentSnapshot(false)).toEqual(beforeRestart)
    clearEffects()

    await restarted.reconcileContent({ revalidate })
    expect(revalidate).not.toHaveBeenCalled()
    expect(graphDelta).not.toHaveBeenCalled()
  })
})
