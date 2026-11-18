import { randomUUID } from "crypto"
import type { TPost, TPosts } from "src/types"
import { applyGraphDelta } from "src/apis/notion-client/graphDelta"
import { contentDigest, articleBodyDigest } from "./hash"
import { listContentMetadata, retrieveContentMetadata, fetchContentBody, normalizePageId, isContentSlug, type ContentMetadata } from "./source"
import { readStoredContent, withContentLock } from "./storage"
import { emptyContentState, type RegistryEntry, type ContentSnapshot, type ContentState } from "./types"
import { queueValidationWarning, queueIndexNow, drainNotifications } from "./notifications"
import { snapshotOf } from "./snapshot"
import { reconcilePostEmbeddings } from "src/apis/vector/postEmbeddings"

export type { ContentSnapshot, GraphDelta } from "./types"
const FULL_INTERVAL = 24 * 60 * 60 * 1000
const OVERLAP = 15 * 60 * 1000
const COLLECTION_PATHS = ["/", "/search", "/series", "/graph", "/ontology"]
export async function readContentSnapshot(bootstrap = true): Promise<ContentSnapshot> {
  let state = await readStoredContent()
  if (!state?.initialized && bootstrap) {
    const result = await reconcileContent({})
    if (result.pending.some(item => item.startsWith("page:")) || result.failed.length) throw new Error("Content baseline is pending; retry reconciliation")
    state = await readStoredContent()
  }
  if (!state?.initialized) throw new Error("Content baseline is not initialized")
  return snapshotOf(state)
}
export async function getContentPostBySlug(slug: string): Promise<TPost | undefined> {
  return (await readContentSnapshot()).posts.find(post => post.slug === slug)
}
export async function enqueueContentEvent(eventId: string, pageIds: string[]): Promise<void> {
  if (!eventId || eventId.length > 256) throw Object.assign(new Error("Invalid event id"), { statusCode: 400 })
  await withContentLock(async (load, save) => {
    const state = await load() || emptyContentState()
    if (Object.hasOwn(state.events, eventId)) return
    const now = Date.now()
    Object.defineProperty(state.events, eventId, { value: now, enumerable: true, configurable: true, writable: true })
    for (const id of pageIds) {
      if (!/^[a-fA-F0-9-]{32,36}$/.test(id)) throw Object.assign(new Error("Invalid page id"), { statusCode: 400 })
      const normalized = normalizePageId(id)
      state.pending[normalized] = { attempts: 0, nextAttemptAt: 0 }
    }
    // Events only suppress repeated delivery; periodic live reconciliation is
    // authoritative after this retention window too.
    for (const [id, seen] of Object.entries(state.events)) if (now - seen > 7 * FULL_INTERVAL) delete state.events[id]
    await save(state)
  })
}
function dependentPaths(before?: TPost, after?: TPost): string[] {
  const paths = [...COLLECTION_PATHS]
  for (const post of [before, after]) {
    if (!post) continue
    paths.push(`/${encodeURIComponent(post.slug)}`)
    for (const category of post.category || []) paths.push(`/categories/${encodeURIComponent(category)}`)
    for (const series of post.series || []) paths.push(`/series/${encodeURIComponent(series)}`)
  }
  return paths
}
function affectedIds(state: ContentState, path: string): string[] {
  if (COLLECTION_PATHS.includes(path)) return []
  if (/^\/(categories|series)\/[^/?#]+$/.test(path)) {
    const [, kind, encoded] = path.split("/")
    let name: string
    try { name = decodeURIComponent(encoded) } catch { throw Object.assign(new Error("Invalid local path"), { statusCode: 400 }) }
    const matches = Object.values(state.entries).filter(entry => (entry.post?.[kind === "categories" ? "category" : "series"] || []).includes(name))
    if (matches.length) return matches.map(entry => entry.id)
  }
  let slug: string
  try { slug = decodeURIComponent(path.startsWith("/") ? path.slice(1) : "") }
  catch { throw Object.assign(new Error("Invalid local path"), { statusCode: 400 }) }
  if (isContentSlug(slug)) {
    const matches = Object.values(state.entries).filter(entry => entry.post?.slug === slug || entry.slugHistory.includes(slug))
    if (matches.length) return matches.map(entry => entry.id)
  }
  throw Object.assign(new Error("Path must be a known local content route"), { statusCode: 400 })
}
export type ReconcileOptions = {
  revalidate?: (path: string) => Promise<void>
  full?: boolean
  path?: string
  cold?: boolean
  maintenance?: boolean
  deferPathRevalidation?: boolean
}
export type ReconcileResult = { completed: number; changed: number; pending: string[]; failed: string[]; revision: number; maintenancePending: number; notificationsPending: number }
export async function reconcileContent(options: ReconcileOptions): Promise<ReconcileResult> {
  return withContentLock(async (load, save) => {
    const state = await load() || emptyContentState()
    const started = Date.now()
    const deadline = started + 12 * 60 * 1000
    const maintenance = options.maintenance !== false
    const failed: string[] = []
    let completed = 0
    let changed = 0
    const wasInitialized = state.initialized
    const pathIds = options.path ? affectedIds(state, options.path) : []
    const force = new Set<string>(options.path && /^\/(categories|series)\//.test(options.path) ? [] : pathIds)
    for (const id of force) state.pending[id] ||= { attempts: 0, nextAttemptAt: 0 }
    const full = options.full || !state.lastFullAt || started - state.lastFullAt >= FULL_INTERVAL
    let metadata: ContentMetadata[]
    try {
      metadata = await listContentMetadata(full ? undefined : Math.max(0, state.lastReconciledAt - OVERLAP))
    } catch {
      await save(state)
      return { completed: 0, changed: 0, pending: Object.keys(state.pending).map(id => `page:${id}`), failed: ["metadata-reconciliation"], revision: state.revision, maintenancePending: state.effects.filter(effect => !effect.graphDone).length, notificationsPending: state.notifications.length }
    }
    const updates: Record<string, ContentMetadata> = {}
    for (const item of metadata) updates[normalizePageId(item.id)] = item
    if (full) {
      for (const entry of Object.values(state.entries)) if (!updates[entry.id]) updates[entry.id] = { id: entry.id, lastEdited: "deleted" }
    }
    for (const entry of Object.values(state.entries)) {
      if (entry.future && Date.parse(entry.future.date.start_date) <= started) state.pending[entry.id] ||= { attempts: 0, nextAttemptAt: 0 }
    }
    for (const [id, pending] of Object.entries(state.pending)) {
      if (pending.nextAttemptAt > started && !force.has(id)) continue
      // Events are hints, never metadata. Retrieve live even if the overlap query
      // omitted the page (deleted/moved, aggregate event, or clock skew).
      try { updates[id] = await retrieveContentMetadata(id) }
      catch { failed.push(`page:${id}`); pending.attempts++; pending.nextAttemptAt = started + retryDelay(pending.attempts) }
      if (Date.now() >= deadline) break
    }
    const candidates: Record<string, TPost> = {}
    for (const entry of Object.values(state.entries)) if (entry.post || entry.future) candidates[entry.id] = (entry.post || entry.future)!
    for (const [id, item] of Object.entries(updates)) {
      if (item.post) candidates[id] = item.post
      else delete candidates[id]
    }
    const slugOwners: Record<string, string[]> = {}
    for (const [id, post] of Object.entries(candidates)) {
      if (!Object.hasOwn(slugOwners, post.slug)) slugOwners[post.slug] = []
      slugOwners[post.slug].push(id)
    }
    const publishedOwners: Record<string, string> = {}
    for (const entry of Object.values(state.entries)) if (entry.post) publishedOwners[entry.post.slug] = entry.id
    for (const ids of Object.values(slugOwners)) {
      if (ids.length < 2) continue
      const incumbent = ids.find(id => publishedOwners[candidates[id].slug] === id)
      for (const id of ids) {
        if (id === incumbent) continue
        const previous = updates[id]
        updates[id] = { id, lastEdited: previous?.lastEdited || state.entries[id]?.lastEdited || "", post: candidates[id], warning: "duplicate-slug" }
      }
    }
    const staged: Record<string, RegistryEntry> = {}
    const visiblePosts = Object.entries(candidates).filter(([id, post]) =>
      !updates[id]?.warning && Date.parse(post.date.start_date) <= started).map(([, post]) => post)
    const paths = new Set<string>()
    const upserted: TPosts = []
    const deletedIds: string[] = []
    const indexPaths = new Set<string>()
    for (const [id, item] of Object.entries(updates)) {
      if (state.pending[id] && state.pending[id].nextAttemptAt > started && !force.has(id)) continue
      if (Date.now() >= deadline) { state.pending[id] ||= { attempts: 0, nextAttemptAt: 0 }; continue }
      const previous = state.entries[id]
      if (item.warning === "duplicate-slug" && previous?.post) {
        queueValidationWarning(state, id, item.warning)
        state.pending[id] = { attempts: 0, nextAttemptAt: started + retryDelay(1) }
        continue
      }
      if (item.warning && item.warning !== previous?.warning) queueValidationWarning(state, id, item.warning)
      const metadataHash = contentDigest(item.post || null)
      const eligible = !item.warning && item.post && Date.parse(item.post.date.start_date) <= started
      let entry: RegistryEntry = {
        id, lastEdited: item.lastEdited, metadataHash, warning: item.warning,
        slugHistory: [...new Set([...(previous?.slugHistory || []), ...(item.post ? [item.post.slug] : [])])],
      }
      if (eligible && item.post) {
        const editMinuteEnd = Math.floor(Date.parse(item.lastEdited) / 60_000) * 60_000 + 60_000
        const confirmEditMinute = previous?.post && (previous.bodyCheckedAt ?? 0) < editMinuteEnd && started >= editMinuteEnd
        const unchanged = previous?.post && previous.lastEdited === item.lastEdited && previous.metadataHash === metadataHash
          && !force.has(id) && !state.pending[id] && !confirmEditMinute
        if (unchanged) { delete state.pending[id]; continue }
        try {
          const recordMap = await fetchContentBody(item.id, item.lastEdited, visiblePosts)
          if (!recordMap) throw new Error("Live post body unavailable")
          const hash = articleBodyDigest(recordMap, item.id)
          const meaningful = previous?.post?.contentHash !== hash || previous.metadataHash !== metadataHash
          const firstModified = new Date(Math.max(Date.parse(item.lastEdited), Date.parse(item.post.date.start_date))).toISOString()
          const contentModifiedTime = meaningful
            ? previous?.post ? new Date().toISOString() : firstModified
            : previous?.post?.contentModifiedTime
          const post = { ...item.post, contentHash: hash, contentModifiedTime }
          entry = { ...entry, post, recordMap, bodyCheckedAt: Date.now() }
        } catch {
          const pending = state.pending[id] ||= { attempts: 0, nextAttemptAt: 0 }
          pending.attempts++
          pending.nextAttemptAt = Date.now() + retryDelay(pending.attempts)
          failed.push(`page:${id}`)
          continue
        }
      } else {
        if (item.post) entry.future = item.post
      }
      staged[id] = entry
    }
    // A proposed rename does not release its old slug until its body is staged.
    // Deferring one handover can retain another owner, so settle dependencies
    // before publishing any paths or graph deltas.
    let deferred: boolean
    do {
      deferred = false
      for (const [id, entry] of Object.entries(staged)) {
        if (!entry.post) continue
        const owner = publishedOwners[entry.post.slug]
        if (!owner || owner === id) continue
        const retained = staged[owner] ?? state.entries[owner]
        if (retained?.post?.slug !== entry.post.slug) continue
        delete staged[id]
        state.pending[id] = { attempts: 0, nextAttemptAt: started + retryDelay(1) }
        queueValidationWarning(state, id, "duplicate-slug")
        deferred = true
      }
    } while (deferred)
    for (const [id, entry] of Object.entries(staged)) {
      const previous = state.entries[id]
      if (entry.post && (previous?.post?.contentHash !== entry.post.contentHash || previous.metadataHash !== entry.metadataHash)) {
        changed++
        upserted.push(entry.post)
        for (const path of dependentPaths(previous?.post, entry.post)) paths.add(path)
        if (previous?.post) indexPaths.add(`/${encodeURIComponent(previous.post.slug)}`)
        if (previous?.post?.slug !== entry.post.slug) for (const slug of previous?.slugHistory || []) indexPaths.add(`/${encodeURIComponent(slug)}`)
        indexPaths.add(`/${encodeURIComponent(entry.post.slug)}`)
      } else if (!entry.post && previous?.post) {
        changed++
        deletedIds.push(previous.post.id)
        for (const path of dependentPaths(previous.post)) paths.add(path)
        for (const slug of previous.slugHistory) {
          paths.add(`/${encodeURIComponent(slug)}`)
          indexPaths.add(`/${encodeURIComponent(slug)}`)
        }
      }
      if (previous?.post?.slug !== entry.post?.slug) for (const slug of previous?.slugHistory || []) paths.add(`/${encodeURIComponent(slug)}`)
      state.entries[id] = entry
      delete state.pending[id]
    }
    state.lastReconciledAt = started
    if (full) state.lastFullAt = started
    if (Object.keys(state.pending).length === 0) state.initialized = true
    if (changed || (!wasInitialized && state.initialized)) state.revision++
    if (paths.size) {
      state.effects.push({ id: randomUUID(), revision: state.revision, paths: [...paths], upserted, deletedIds, graphDone: false })
      queueIndexNow(state, [...indexPaths])
    }
    // The atomic state publication precedes ISR, so renders see this revision.
    // Durable outbox entries survive any request crash and are removed only after
    // successful graph/path work.
    await save(state)
    if (state.initialized && options.path) {
      state.effects.push({ id: randomUUID(), revision: state.revision, paths: [options.path], upserted: [], deletedIds: [], graphDone: true })
      await save(state)
    }
    if (state.initialized && options.cold) {
      const snap = snapshotOf(state)
      const queued = new Set(state.effects.flatMap(effect => effect.paths))
      const coldPaths = [...new Set([...COLLECTION_PATHS, ...snap.posts.flatMap(post => dependentPaths(undefined, post))])].filter(path => !queued.has(path))
      if (coldPaths.length) {
        state.effects.push({ id: randomUUID(), revision: state.revision, paths: coldPaths, upserted: [], deletedIds: [], graphDone: true })
        await save(state)
      }
    }
    if (options.deferPathRevalidation) {
      // Scheduled background runs cannot call Pages Router ISR APIs. Pages
      // refresh lazily under their configured revalidate interval instead.
      for (const effect of state.effects) effect.paths = []
      await save(state)
    }
    if (state.initialized && options.revalidate) {
      const attemptedPaths = new Set<string>()
      for (const effect of [...state.effects]) {
        if (Date.now() >= deadline) break
        // Revalidation and graph deltas are idempotent, so progress is persisted
        // once per effect; a crash in between only repeats completed work.
        let progressed = false
        for (const path of [...effect.paths]) {
          if (Date.now() >= deadline) break
          if (attemptedPaths.has(path)) continue
          attemptedPaths.add(path)
          try {
            await options.revalidate(path)
            for (const queuedEffect of state.effects) queuedEffect.paths = queuedEffect.paths.filter(candidate => candidate !== path)
            completed++
            progressed = true
          } catch { failed.push(path) }
        }
        if (effect.graphDone && effect.paths.length === 0) {
          state.effects = state.effects.filter(candidate => candidate.id !== effect.id)
          progressed = true
        }
        if (progressed) await save(state)
      }
    }
    let embeddingsPending: string[] = []
    if (state.initialized && maintenance) {
      try {
        const embeddings = await reconcilePostEmbeddings(snapshotOf(state), deadline)
        embeddingsPending = embeddings.pending.map(id => `embedding:${id}`)
        failed.push(...embeddings.failed.map(id => `embedding:${id}`))
      } catch { failed.push("embeddings"); embeddingsPending = ["embeddings"] }
    }
    if (state.initialized && maintenance && (options.revalidate || options.deferPathRevalidation)) {
      for (const effect of [...state.effects]) {
        if (Date.now() >= deadline) break
        let progressed = false
        if (!effect.graphDone) {
          try {
            await applyGraphDelta({ revision: effect.revision, upserted: effect.upserted, deletedIds: effect.deletedIds })
            effect.graphDone = true
            progressed = true
          } catch { failed.push(`graph:${effect.revision}`) }
        }
        if (effect.graphDone && effect.paths.length === 0) {
          state.effects = state.effects.filter(candidate => candidate.id !== effect.id)
          progressed = true
        }
        if (progressed) await save(state)
      }
    }
    await drainNotifications(state, save)
    return {
      completed, changed, revision: state.revision, failed: [...new Set(failed)],
      maintenancePending: state.effects.filter(effect => !effect.graphDone).length + embeddingsPending.length,
      notificationsPending: state.notifications.length,
      pending: [...new Set([
        ...embeddingsPending,
        ...Object.keys(state.pending).map(id => `page:${id}`),
        ...state.effects.flatMap(effect => effect.paths),
        ...(maintenance ? state.effects.filter(effect => !effect.graphDone).map(effect => `graph:${effect.revision}`) : []),
      ])],
    }
  })
}
function retryDelay(attempts: number): number {
  return Math.min(15 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 10))
}
