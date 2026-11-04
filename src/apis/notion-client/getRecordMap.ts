import { ExtendedRecordMap } from "notion-types"
import { isFullPage, isFullBlock, type Client, type BlockObjectResponse } from "@notionhq/client"
import { getOfficialNotionClient } from "./notionClient"
import { getUser } from "./getUser"
import { optimizeRecordMap } from "src/libs/utils/notion/optimizeRecordMap"
import { unwrapBlock, getBlockById } from "src/libs/utils/notion/unwrapBlock"
import { parseNotionDate, formatDateKorean } from "src/libs/utils/notion/parseNotionDate"
import { getOgMetadata } from "src/libs/utils/notion/fetchOgMetadata"
import { TPosts } from "src/types"
import { cacheStore, keys } from "src/libs/cache"
import { CONFIG } from "site.config"
import { debugLog } from "src/libs/utils/logger"
import { normalizeNotionPost } from "./postModel"
import { absoluteUrl } from "src/libs/seo"
import { isTrustedNotionFileUrl } from "src/libs/utils/security"

const RECORD_MAP_TTL_MS = CONFIG.revalidateTime * 1000

/**
 * Convert Notion presigned URLs to our proxy URLs to prevent expiration
 * This ensures images remain accessible even after the original signed URL expires
 */
function convertPresignedUrlsToProxy(recordMap: ExtendedRecordMap): ExtendedRecordMap {
  // Process all blocks to find and convert image URLs
  Object.entries(recordMap.block).forEach(([blockId, blockData]) => {
    const block = unwrapBlock(blockData)
    if (!block) return

    // Handle image blocks
    if (block.type === 'image' && block.properties?.source) {
      const sources = block.properties.source
      if (Array.isArray(sources) && sources.length > 0) {
        sources.forEach((source, index) => {
          if (Array.isArray(source) && source.length > 0) {
            const url = source[0]
            if (typeof url === 'string' && shouldProxyUrl(url)) {
              source[0] = `/api/image-proxy?url=${encodeURIComponent(url)}`
            }
          }
        })
      }
    }

    // Handle cover images
    if (block.format?.page_cover) {
      const coverUrl = block.format.page_cover
      if (typeof coverUrl === 'string' && shouldProxyUrl(coverUrl)) {
        block.format.page_cover = `/api/image-proxy?url=${encodeURIComponent(coverUrl)}`
      }
    }

    // Handle page icons (if they're images)
    if (block.format?.page_icon) {
      const iconUrl = block.format.page_icon
      if (typeof iconUrl === 'string' && shouldProxyUrl(iconUrl)) {
        block.format.page_icon = `/api/image-proxy?url=${encodeURIComponent(iconUrl)}`
      }
    }

    // Handle block decorations (inline images)
    if (block.properties) {
      Object.values(block.properties).forEach((prop: any) => {
        if (Array.isArray(prop)) {
          prop.forEach((item: any) => {
            if (Array.isArray(item) && item.length > 0) {
              const maybeUrl = item[0]
              if (typeof maybeUrl === 'string' && shouldProxyUrl(maybeUrl)) {
                item[0] = `/api/image-proxy?url=${encodeURIComponent(maybeUrl)}`
              }
            }
          })
        }
      })
    }
  })

  return recordMap
}

/**
 * Check if a URL should be proxied (S3 presigned URLs)
 */
function shouldProxyUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  // Proxy S3 presigned URLs
  if (url.includes('amazonaws.com') && url.includes('X-Amz-Signature')) {
    return true
  }

  // Proxy Notion's prod-files-secure URLs
  if (url.startsWith('https://prod-files-secure.s3.us-west-2.amazonaws.com')) {
    return true
  }

  return false
}


/**
 * Recursively fetch child blocks
 */
async function fetchChildBlocks(blockId: string, pageId: string, notion: Client, recordMap: ExtendedRecordMap, allPosts?: TPosts): Promise<string[]> {
    const childIds: string[] = []

    // Notion children.list is paginated. Iterate through pages
    let cursor: string | undefined = undefined
    let fetched = 0
    const MAX_FETCH = 5000 // safety cap to avoid runaway fetching

    do {
      const resp = await notion.blocks.children.list({
        block_id: blockId,
        page_size: 100,
        start_cursor: cursor,
      })

      for (const block of resp.results) {
        if (!isFullBlock(block)) throw new Error("Notion returned incomplete child blocks")
        childIds.push(block.id)
        // process each block (this may in turn fetch deeper children)
        await processBlock(block, blockId, pageId, notion, recordMap, allPosts)
      }

      fetched += resp.results.length
      if (fetched >= MAX_FETCH && resp.has_more) {
        throw new Error(`Child block limit exceeded for ${blockId}; preserving the previous complete page`)
      }

      if (resp.has_more && !resp.next_cursor) throw new Error("Notion returned incomplete child pagination")
      cursor = resp.has_more ? resp.next_cursor ?? undefined : undefined
    } while (cursor)

    if (childIds.length > 0) {
      debugLog(`📦 [fetchChildBlocks] Fetched ${childIds.length} children for block ${blockId}`)
    }

    return childIds
}

/**
 * Synthesize a minimum `page` block in recordMap so RNX `case "p":` (page
 * mention) doesn't bail with `return null` when the linked page isn't part of
 * the same fetch. Title priority: allPosts → mention plain_text → 한국어 폴백.
 * Mirrors the lookup pattern used by `link_to_page` (Phase 1B).
 */
function synthesizePageStub(
  recordMap: ExtendedRecordMap,
  pageId: string,
  kind: 'page' | 'database',
  allPosts: TPosts | undefined,
  fallbackText: string
): void {
  if (recordMap.block[pageId]?.value) return
  const linkedPost = allPosts?.find((p) => p.id === pageId)
  const title =
    linkedPost?.title ||
    (fallbackText && fallbackText.trim()) ||
    (kind === 'database' ? '데이터베이스' : '페이지')

  recordMap.block[pageId] = {
    role: 'reader',
    value: {
      id: pageId,
      version: 1,
      type: 'page',
      properties: { title: [[title]] },
      created_time: 0,
      last_edited_time: 0,
      parent_id: '',
      parent_table: 'space',
      alive: true,
    } as any,
  }
}

/**
 * Convert rich text array to notion-types format with decorations.
 * Supports text/equation/mention. mention.type ∈
 *   - page/database → ['p', id]   + minimum page stub synthesis
 *   - date          → ['d', FormattedDate]
 *   - user          → ['u', id]   (notion_user populated in a later pass)
 *   - link_mention  → ['lm', metadata]   (Notion API returns full OG meta)
 *   - link_preview/template_mention/custom_emoji → plain_text fallback
 *     (RNX has no case branch; see Phase 4 limits in plan doc)
 */
function convertRichText(
  richTextArray: any[],
  recordMap?: ExtendedRecordMap,
  allPosts?: TPosts,
  blockIdForLog?: string
): any[][] {
  if (!richTextArray || !Array.isArray(richTextArray) || richTextArray.length === 0) return []

  return richTextArray.map((rt: any) => {
    let text = ''
    const decorations: any[][] = []

    if (rt.type === 'equation') {
      text = rt.equation?.expression || ''
      // Inline equation decoration must be ['e', expression]
      decorations.push(['e', text])
    } else if (rt.type === 'text') {
      text = rt.text?.content || rt.plain_text || ''
    } else if (rt.type === 'mention') {
      // plain_text is the visible anchor when RNX cannot render the decoration
      // (data missing / unsupported subtype). Decoration is layered on top.
      text = rt.plain_text || ''
      const m = rt.mention
      switch (m?.type) {
        case 'page':
        case 'database': {
          const linkedId = m[m.type]?.id
          if (linkedId && recordMap) {
            synthesizePageStub(recordMap, linkedId, m.type, allPosts, text)
            decorations.push(['p', linkedId])
          }
          break
        }
        case 'date': {
          if (m.date) {
            // RNX's `case "d":` formats dates in English ("Nov 12, 2025").
            // Override the visible text with a Korean-formatted string and
            // drop the decoration so RNX renders the plain Korean text.
            // parseNotionDate is still used to normalize the API response
            // shape (date / datetime / range variants).
            text = formatDateKorean(parseNotionDate(m.date))
          }
          break
        }
        case 'user': {
          const userId = m.user?.id
          // notion_user is populated by populateUserMentions() in a later pass;
          // here we only emit the decoration. RNX will resolve once data lands.
          if (userId) decorations.push(['u', userId])
          break
        }
        case 'link_mention': {
          if (m.link_mention) decorations.push(['lm', { ...m.link_mention }])
          break
        }
        // Phase 4 — known unsupported (RNX has no case branch; tracked in
        // /Users/pieroot/.claude/plans/notion-block-coverage.md):
        //   link_preview  : URL only, no metadata → Phase 3 OG preview
        //   template_mention, custom_emoji : library gap
        default: {
          if (process.env.NODE_ENV !== 'production' && m?.type) {
            console.log(
              `[mention] unsupported subtype: ${m.type} on block ${blockIdForLog ?? 'unknown'}`
            )
          }
          break
        }
      }
    } else {
      text = rt.plain_text || ''
    }

    if (rt.annotations) {
      if (rt.annotations.bold) decorations.push(['b'])
      if (rt.annotations.italic) decorations.push(['i'])
      if (rt.annotations.strikethrough) decorations.push(['s'])
      if (rt.annotations.underline) decorations.push(['_'])
      if (rt.annotations.code) decorations.push(['c'])
      if (rt.annotations.color && rt.annotations.color !== 'default') {
        decorations.push(['h', rt.annotations.color])
      }
    }

    if (rt.href) {
      decorations.push(['a', rt.href])
    }

    // Return format: [text, [decorations]] or [text] if no decorations
    if (decorations.length > 0) {
      return [text, decorations]
    }
    return [text]
  })
}

/**
 * Walk the recordMap properties, collect every ['u', userId] decoration, and
 * populate `recordMap.notion_user` via cached users.retrieve calls.
 * Done as a final pass so processBlock() stays synchronous and dedup is global
 * to the page (not per-block).
 */
async function populateUserMentions(recordMap: ExtendedRecordMap): Promise<void> {
  const userIds = new Set<string>()
  for (const blockId of Object.keys(recordMap.block)) {
    const value = recordMap.block[blockId]?.value as any
    if (!value?.properties) continue
    for (const propVal of Object.values(value.properties)) {
      if (!Array.isArray(propVal)) continue
      for (const item of propVal) {
        if (!Array.isArray(item) || item.length < 2) continue
        const decorations = item[1]
        if (!Array.isArray(decorations)) continue
        for (const dec of decorations) {
          if (Array.isArray(dec) && dec[0] === 'u' && typeof dec[1] === 'string') {
            userIds.add(dec[1])
          }
        }
      }
    }
  }

  if (userIds.size === 0) return

  debugLog(`[mention] fetching ${userIds.size} unique user(s)`)
  const users = await Promise.all([...userIds].map((id) => getUser(id)))
  for (const u of users) {
    recordMap.notion_user[u.id] = { role: 'reader', value: u as any }
  }
}

/**
 * Fetch OG metadata for every bookmark block on the page (link_preview is
 * mapped to `bookmark` upstream by typeMapping). Populates the exact fields
 * RNX `case "bookmark":` reads — `format.bookmark_cover`, `format.bookmark_icon`,
 * `properties.title`, `properties.description`. Dedups by URL to avoid
 * re-fetching the same link cited by multiple bookmark blocks. SSRF +
 * timeout + size limits live inside getOgMetadata, not here.
 */
async function populateBookmarkMetadata(recordMap: ExtendedRecordMap): Promise<void> {
  const targets = new Map<string, string>() // blockId → url
  for (const blockId of Object.keys(recordMap.block)) {
    const v = recordMap.block[blockId]?.value as any
    if (v?.type !== 'bookmark') continue
    const url = v.properties?.link?.[0]?.[0]
    if (typeof url === 'string' && url.length > 0) {
      targets.set(blockId, url)
    }
  }
  if (targets.size === 0) return

  const uniqueUrls = [...new Set(targets.values())]
  debugLog(`[og] fetching ${uniqueUrls.length} unique bookmark URL(s)`)
  const results = await Promise.all(uniqueUrls.map((u) => getOgMetadata(u)))
  const byUrl = new Map<string, (typeof results)[number]>()
  uniqueUrls.forEach((u, i) => byUrl.set(u, results[i]))

  for (const [blockId, url] of targets) {
    const meta = byUrl.get(url)
    if (!meta) continue
    const v = recordMap.block[blockId]!.value as any
    v.format = v.format || {}
    if (meta.image) v.format.bookmark_cover = meta.image
    if (meta.icon) v.format.bookmark_icon = meta.icon
    // Only overwrite title if OG actually returned one — otherwise keep the
    // URL-fallback emitted during processBlock so the card always has text.
    if (meta.title) v.properties.title = [[meta.title]]
    if (meta.description) v.properties.description = [[meta.description]]
  }
}

/**
 * Whitelist of hosts allowed to render as iframe-style embeds. Anything else
 * falls back to a bookmark card so we don't mount iframes from arbitrary
 * origins (XSS surface). Update with intent — each addition is a trust
 * boundary expansion.
 */
const EMBED_ALLOWED_HOSTS: readonly string[] = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "loom.com",
  "codepen.io",
  "codesandbox.io",
  // github.com and gist.github.com intentionally omitted:
  // both respond with X-Frame-Options: DENY + frame-ancestors 'none',
  // so iframes render blank. They fall back to bookmark cards via OG metadata.
  "figma.com",
  "replit.com",
  "excalidraw.com",
  "twitter.com",
  "x.com",
  "typeform.com",
  "docs.google.com",
  "drive.google.com",
  "maps.google.com",
  "speakerdeck.com",
  "soundcloud.com",
  "open.spotify.com",
]

function isAllowedEmbedHost(rawUrl: string): boolean {
  let host = ""
  try {
    host = new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return EMBED_ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h))
}

/**
 * Some providers ship raw share URLs that, when used as an iframe src, force
 * a redirect to "open in app" pages instead of rendering the embed. Rewrite
 * the URL to the provider's documented embed path here so the iframe source
 * is the player, not the landing page.
 */
function normalizeEmbedUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.toLowerCase()

    // Spotify: open.spotify.com/<type>/<id> → open.spotify.com/embed/<type>/<id>
    // The non-embed share URL hijacks navigation to the desktop app.
    if (
      (host === "open.spotify.com" || host.endsWith(".spotify.com")) &&
      !u.pathname.startsWith("/embed/")
    ) {
      u.pathname = "/embed" + u.pathname
      return u.toString()
    }

    return rawUrl
  } catch {
    return rawUrl
  }
}

/**
 * Returns a default pixel height for embed providers that need an explicit
 * height to avoid collapsing to 0px in react-notion-x's iframe renderer.
 * Returns null for providers where react-notion-x uses aspect-ratio instead.
 */
function embedHeight(src: string): number | null {
  try {
    const u = new URL(src)
    const host = u.hostname.toLowerCase()
    if (host === "open.spotify.com" || host.endsWith(".spotify.com")) {
      // Embedded path is /embed/<type>/<id>; segments: ['embed', type, id]
      const type = u.pathname.split("/").filter(Boolean)[1]
      return type === "track" ? 152 : 352
    }
  } catch {}
  return null
}

// Only official uploads need refreshing. Keep external media URLs untouched.
function attachmentSource(
  data: { type: string; file?: { url: string }; external?: { url: string }; name?: string },
  pageId: string,
  blockId: string
): string | undefined {
  if (data.type !== 'file') return data.external?.url
  if (!data.file?.url) return undefined
  const params = new URLSearchParams({ pageId, blockId })
  const filename = data.name || decodeURIComponent(new URL(data.file.url).pathname.split('/').pop() || '')
  if (filename) params.set('filename', filename)
  return absoluteUrl(`/api/attachment?${params}`)
}

// The official API exposes no embed height, and RNX's embed iframe is
// absolutely positioned, so file embeds collapse to 0px without one.
const NOTION_FILE_EMBED_HEIGHT = 480

/**
 * Render a Notion-hosted file upload (e.g. a self-contained `.html` diagram
 * attached to an Embed block) as an embed instead of a bookmark card.
 * The presigned S3 URL expires within hours while the recordMap cache lives
 * on, so the iframe points at `/api/attachment`, which re-resolves a fresh
 * signed URL per request. Falls back to the bare filename as caption so the
 * file stays identifiable below the frame (and in Markdown export).
 */
function applyNotionFileEmbed(args: {
  embedUrl: string
  pageId: string
  blockId: string
  properties: Record<string, unknown>
  format: Record<string, unknown>
  caption: unknown[] | undefined
  richText: (arr: unknown[]) => unknown
}): void {
  const src = attachmentSource({ type: "file", file: { url: args.embedUrl } }, args.pageId, args.blockId)
  if (!src) return
  args.properties.source = [[src]]
  args.format.display_source = src
  args.format.block_height = NOTION_FILE_EMBED_HEIGHT
  if (args.caption && args.caption.length > 0) {
    args.properties.caption = args.richText(args.caption)
  } else {
    const filename = decodeURIComponent(new URL(args.embedUrl).pathname.split("/").pop() || "")
    if (filename) args.properties.caption = [[filename]]
  }
}

/**
 * Process a single block and add it to recordMap
 */
async function processBlock(block: any, parentId: string, pageId: string, notion: any, recordMap: ExtendedRecordMap, allPosts?: TPosts): Promise<void> {
  const properties: any = {}
  const format: any = {}
  // forcedMappedType lets a case override the post-switch typeMapping lookup
  // (used by `embed` when an unknown host falls back to `bookmark`).
  let forcedMappedType: string | null = null
  // Bind recordMap/allPosts/block.id once so call sites stay tight.
  const rt = (arr: any[]) => convertRichText(arr, recordMap, allPosts, block.id)

  if (block.type && block[block.type]) {
    const blockData = block[block.type]

    // Handle blocks with rich_text (paragraph, headings, lists, quotes, callouts, toggles, etc.)
    if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
      properties.title = rt(blockData.rich_text)
    }

    // Handle specific block types
    switch (block.type) {
      case 'link_to_page':
        // Link to page block - convert to text with link decoration
        const linkToPageData = blockData
        if (linkToPageData) {
          const linkedPageId = linkToPageData.page_id || linkToPageData.database_id
          const linkedType = linkToPageData.type // 'page' or 'database'

          if (linkedPageId) {
            // Try to find the linked page in recordMap to get its title
            let pageTitle = linkedType === 'database' ? '데이터베이스' : '페이지'

            // Search for the page in recordMap
            const linkedPageBlock = getBlockById(recordMap, linkedPageId)
            if (linkedPageBlock) {
              // Extract title from properties
              const titleProp = linkedPageBlock.properties?.title
              if (titleProp && Array.isArray(titleProp) && titleProp.length > 0) {
                pageTitle = titleProp[0][0] || pageTitle
              }
            }

            // Find the linked post in allPosts to get its slug
            const linkedPost = allPosts?.find((post) => post.id === linkedPageId)
            // Resolve URL: prefer in-site slug; otherwise fall back to the
            // Notion source URL (the legacy `/database/<id>` and
            // `/[page-id]?id=<id>` paths were dead links).
            const pageUrl = linkedPost?.slug
              ? `/${linkedPost.slug}`
              : `https://www.notion.so/${linkedPageId.replace(/-/g, '')}`
            pageTitle = (linkedPost ? linkedPost.title : pageTitle) || pageTitle

            properties.title = [[pageTitle, [['a', pageUrl]]]]

            // console.log(`🔗 [link_to_page] Converted to text link:`, {
            //   blockId: block.id,
            //   linkedPageId,
            //   linkedType,
            //   pageTitle,
            //   pageUrl,
            //   slug: linkedPost?.slug,
            // })
          }
        }
        break

      case 'code':
        if (blockData.rich_text && Array.isArray(blockData.rich_text)) {
          properties.title = rt(blockData.rich_text)
          properties.language = [[blockData.language || 'plain text']]
        }
        if (blockData.caption && Array.isArray(blockData.caption) && blockData.caption.length > 0) {
          properties.caption = rt(blockData.caption)
        }
        break

      case 'image':
        const imageUrl = blockData.file?.url || blockData.external?.url
        debugLog('🖼️ [processBlock] Image block found:', block.id, imageUrl)
        debugLog('🖼️ [processBlock] Full block data:', blockData)
        if (imageUrl) {
          debugLog('🖼️ Image URL from Notion API:', imageUrl)

          properties.source = [[imageUrl]]

          // Add format for image display
          format.display_source = imageUrl
        }
        if (blockData.caption && blockData.caption.length > 0) {
          properties.caption = rt(blockData.caption)
        }
        break

      case 'video':
      case 'file':
      case 'pdf':
        const fileUrl = attachmentSource(blockData, pageId, block.id)
        if (fileUrl) {
          properties.source = [[fileUrl]]
          if (block.type === 'file' && blockData.name) properties.title = [[blockData.name]]
          if (blockData.caption && blockData.caption.length > 0) {
            properties.caption = rt(blockData.caption)
          }
        }
        break

      case 'bookmark':
        // Phase 4 limit: bookmark surfaces URL + caption only.
        // No OG metadata fetch; tracked for Phase 3 (server-side OG endpoint).
        if (blockData.url) {
          properties.link = [[blockData.url]]
          properties.title = blockData.caption && blockData.caption.length > 0
            ? rt(blockData.caption)
            : [[blockData.url]]
        }
        break

      case 'link_preview': {
        // Upgrade to embed when the host is allowlisted; else fall back to bookmark card.
        // Notion pastes as link_preview (not embed) when the user doesn't explicitly
        // convert — we recover the iframe here so allowlisted embeds always render.
        const lpUrl = blockData.url
        if (!lpUrl) break
        if (isAllowedEmbedHost(lpUrl)) {
          const src = normalizeEmbedUrl(lpUrl)
          properties.source = [[src]]
          format.display_source = src
          const h = embedHeight(src)
          if (h !== null) format.block_height = h
          if (blockData.caption && blockData.caption.length > 0) {
            properties.caption = rt(blockData.caption)
          }
          forcedMappedType = 'embed'
        } else if (isTrustedNotionFileUrl(lpUrl)) {
          applyNotionFileEmbed({ embedUrl: lpUrl, pageId, blockId: block.id, properties, format, caption: blockData.caption, richText: rt })
          forcedMappedType = 'embed'
        } else {
          properties.link = [[lpUrl]]
          properties.title = blockData.caption && blockData.caption.length > 0
            ? rt(blockData.caption)
            : [[lpUrl]]
          // typeMapping already has link_preview → bookmark; no forcedMappedType needed
        }
        break
      }

      case 'embed': {
        // Phase 2D: emit display_source for allowlisted hosts; otherwise
        // degrade to a bookmark card. Arbitrary iframe origins are an XSS
        // surface, so the trust boundary is explicit (EMBED_ALLOWED_HOSTS).
        // Notion-hosted file uploads (e.g. `.html` diagrams) are the author's
        // own files, not third-party origins, so they keep the iframe.
        const embedUrl = blockData.url
        if (!embedUrl) break
        if (isAllowedEmbedHost(embedUrl)) {
          const src = normalizeEmbedUrl(embedUrl)
          properties.source = [[src]]
          format.display_source = src
          const h = embedHeight(src)
          if (h !== null) format.block_height = h
          if (blockData.caption && blockData.caption.length > 0) {
            properties.caption = rt(blockData.caption)
          }
        } else if (isTrustedNotionFileUrl(embedUrl)) {
          applyNotionFileEmbed({ embedUrl, pageId, blockId: block.id, properties, format, caption: blockData.caption, richText: rt })
        } else {
          properties.link = [[embedUrl]]
          properties.title =
            blockData.caption && blockData.caption.length > 0
              ? rt(blockData.caption)
              : [[embedUrl]]
          forcedMappedType = 'bookmark'
        }
        break
      }

      case 'equation':
        if (blockData.expression) {
          properties.title = [[blockData.expression]]
        }
        break

      case 'divider':
        // Divider has no properties
        break

      case 'callout':
        // RNX isIconBlock() includes 'callout', and PageIcon auto-detects
        // emoji vs URL via isUrl(icon). External/file URLs are routed through
        // mapImageUrl (customMapImageUrl) and convertPresignedUrlsToProxy
        // already rewrites format.page_icon for S3-signed file URLs, so all
        // three icon variants render correctly.
        if (blockData.icon) {
          format.page_icon = blockData.icon.emoji || blockData.icon.external?.url || blockData.icon.file?.url
        }
        break

      case 'to_do':
        if (typeof blockData.checked !== 'undefined') {
          properties.checked = [[blockData.checked ? 'Yes' : 'No']]
        }
        break

      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'heading_4':
        // RNX renders heading children only for toggleable headings.
        if (blockData.is_toggleable) format.toggleable = true
        break

      case 'column_list':
        // Equal default widths are assigned after children are fetched.
        break

      case 'column':
        if (typeof blockData.width_ratio === 'number') format.column_ratio = blockData.width_ratio
        break

      case 'table':
        if (blockData.table_width) {
          format.table_width = blockData.table_width

          // Phase 4 limit: official API gives no `table_block_column_order`,
          // so we synthesize `cell_0..N` based on table_width. Rows whose
          // cell count diverges from table_width may misalign columns.
          const columnOrder: string[] = []
          for (let i = 0; i < blockData.table_width; i++) {
            columnOrder.push(`cell_${i}`)
          }
          format.table_block_column_order = columnOrder
        }
        if (blockData.has_column_header) {
          format.table_block_column_header = true
        }
        if (blockData.has_row_header) {
          format.table_block_row_header = true
        }
        break

      case 'table_row':
        if (blockData.cells && Array.isArray(blockData.cells)) {
          blockData.cells.forEach((cell: any[], index: number) => {
            if (cell && cell.length > 0) {
              properties[`cell_${index}`] = rt(cell)
            }
          })
        }
        break

      case 'child_database':
        // Database block - store metadata for placeholder rendering
        debugLog('📊 [getRecordMap] Found child_database block:', block.id)
        if (blockData.title) {
          properties.title = rt(blockData.title)
        }
        // Store database ID for future custom rendering (Option 3)
        // Use block.id as database_id (the child_database block itself)
        if (block.id) {
          format.database_id = block.id
        }
        break

      case 'child_page':
        // Inline child-page card: typeMapping converts this to RNX `page`
        // (level > 0 branch renders <PageLink><PageTitle/></PageLink>).
        // Title comes from blockData.title (plain string in the official API);
        // the page id is block.id itself, so mapPageUrl resolves slug routing.
        // Icon is not in the official child_page response — PageIcon falls back
        // to defaultIcon. Fetching page metadata for an icon would add an
        // extra users.retrieve-style API call per child_page; deferred.
        if (typeof blockData.title === 'string' && blockData.title) {
          properties.title = [[blockData.title]]
        }
        break

      case 'synced_block':
        // Phase 4 limit: only locally-fetched children survive the
        // optimizeRecordMap flatten pass. `synced_from` references on other
        // pages are not resolved (would change fetch graph + cache key).
        debugLog('📋 [synced_block] Found:', {
          id: block.id,
          has_children: block.has_children,
          synced_from: blockData.synced_from,
        })
        if (blockData.synced_from) {
          format.synced_from = blockData.synced_from
        }
        break

      case 'audio':
        // Audio block - similar to video/file
        const audioUrl = attachmentSource(blockData, pageId, block.id)
        if (audioUrl) {
          properties.source = [[audioUrl]]
          // Add format for audio display
          format.display_source = audioUrl
          debugLog('🎵 [getRecordMap] Audio block found:', block.id, audioUrl)
        }
        if (blockData.caption && blockData.caption.length > 0) {
          properties.caption = rt(blockData.caption)
        }
        break

      case 'breadcrumb':
      case 'table_of_contents':
      case 'transclusion_container':
        // Container blocks - no specific properties needed
        // Children will be fetched automatically via has_children
        break
    }

    // Handle color for all block types
    if (blockData.color && blockData.color !== 'default') {
      format.block_color = blockData.color
    }
  }

  // Map Official API block types to notion-types format
  const typeMapping: Record<string, string> = {
    'paragraph': 'text',
    'heading_1': 'header',
    'heading_2': 'sub_header',
    'heading_3': 'sub_sub_header',
    'heading_4': 'header_4',
    'bulleted_list_item': 'bulleted_list',
    'numbered_list_item': 'numbered_list',
    'to_do': 'to_do',
    'toggle': 'toggle',
    'code': 'code',
    'quote': 'quote',
    'callout': 'callout',
    'divider': 'divider',
    'image': 'image',
    'video': 'video',
    'file': 'file',
    'pdf': 'pdf',
    'bookmark': 'bookmark',
    'equation': 'equation',
    'column_list': 'column_list',
    'column': 'column',
    'table': 'table',
    'table_row': 'table_row',
    'embed': 'embed',
    'link_preview': 'bookmark',
    'child_database': 'collection_view_page', // Temporary: use collection_view_page for placeholder
    'child_page': 'page', // Inline child-page card via RNX level>0 page branch
    // Additional block types
    'synced_block': 'synced_block',
    'link_to_page': 'text', // Convert link_to_page to text with link decoration
    'audio': 'audio',
    'breadcrumb': 'breadcrumb',
    'table_of_contents': 'table_of_contents',
    'transclusion_container': 'transclusion_container',
  }

  const mappedType = forcedMappedType || typeMapping[block.type] || block.type

  const blockValue: any = {
    id: block.id,
    version: 1,
    type: mappedType,
    properties,
    created_time: block.created_time,
    last_edited_time: block.last_edited_time,
    parent_id: parentId,
    parent_table: 'block',
    alive: true,
  }

  // Add format if not empty
  if (Object.keys(format).length > 0) {
    blockValue.format = format
  }

  // Fetch children if has_children is true
  if (block.has_children) {
    const childIds = await fetchChildBlocks(block.id, pageId, notion, recordMap, allPosts)
    if (childIds.length > 0) {
      blockValue.content = childIds
      // The API omits width_ratio for equal columns; RNX would otherwise use 0.5 each.
      if (block.type === 'column_list') {
        for (const childId of childIds) {
          const column = unwrapBlock(recordMap.block[childId])
          if (column?.type === 'column' && typeof column.format?.column_ratio !== 'number') {
            column.format = { ...column.format, column_ratio: 1 / childIds.length }
          }
        }
      }
    }
  }

  recordMap.block[block.id] = {
    role: 'reader',
    value: blockValue,
  }
}

/**
 * Get page record map for rendering with react-notion-x
 * Uses official @notionhq/client API
 * 
 * Note: This returns a compatible structure for react-notion-x
 */
export const getRecordMap = async (
  pageId: string,
  allPosts?: TPosts,
  options?: { bypassCache?: boolean; lastEditedTime?: string }
): Promise<ExtendedRecordMap | null> => {
  const notion = getOfficialNotionClient()
  let lastEdited = options?.lastEditedTime ?? allPosts?.find((post) => post.id === pageId)?.lastEditedTime
  if (!lastEdited) {
    const meta = await notion.pages.retrieve({ page_id: pageId })
    if (!("last_edited_time" in meta)) throw new Error("Notion returned incomplete page metadata")
    lastEdited = meta.last_edited_time
  }

  const key = keys.recordMap(pageId, lastEdited)
  if (!options?.bypassCache) {
    const cached = await cacheStore.get<ExtendedRecordMap>(key)
    if (cached) return cached
  }

  const result = await fetchRecordMap(pageId, allPosts, notion)
  if (result) await cacheStore.set(key, result, RECORD_MAP_TTL_MS)
  return result
}

async function fetchRecordMap(
  pageId: string,
  allPosts: TPosts | undefined,
  notion: Client
): Promise<ExtendedRecordMap | null> {
  debugLog(`📡 Fetching page content for ${pageId}`)
  const page = await notion.pages.retrieve({ page_id: pageId })
  if (!isFullPage(page)) throw new Error("Notion returned incomplete page metadata")
  if (page.archived || page.in_trash) return null

  const blocks: BlockObjectResponse[] = []
  let cursor: string | undefined
  do {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100, start_cursor: cursor })
    for (const block of response.results) {
      if (!isFullBlock(block)) throw new Error("Notion returned incomplete page blocks")
      blocks.push(block)
    }
    if (response.has_more && !response.next_cursor) throw new Error("Notion returned incomplete page pagination")
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined
  } while (cursor)

  const recordMap: ExtendedRecordMap = {
    block: {}, collection: {}, collection_view: {}, notion_user: {}, collection_query: {}, signed_urls: {},
  }
  // Never serialize database properties into public page HTML. Keep only the
  // visible title and the fields required by the renderer.
  recordMap.block[pageId] = {
    role: "reader",
    value: {
      id: pageId, version: 1, type: "page", properties: { title: [[normalizeNotionPost(page).title]] },
      created_time: Date.parse(page.created_time), last_edited_time: Date.parse(page.last_edited_time),
      created_by_table: "notion_user", created_by_id: page.created_by.id,
      last_edited_by_table: "notion_user", last_edited_by_id: page.last_edited_by.id,
      parent_id: "", parent_table: "space", alive: true, content: blocks.map(block => block.id),
      format: {}, permissions: [],
    },
  }
  for (const block of blocks) await processBlock(block, pageId, pageId, notion, recordMap, allPosts)
  await populateUserMentions(recordMap)
  await populateBookmarkMetadata(recordMap)
  return optimizeRecordMap(recordMap)
}
