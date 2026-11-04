// Bump DB_VERSION when TNotionDatabase schema changes (e.g. new fields like groupBy/icon)
// so previously persisted entries in `.notion-cache/` are treated as misses.
const DB_VERSION = "v6"
// Bump RM_VERSION when convertRichText / processBlock output shape changes
// (e.g. new mention decorations, new format fields) so existing recordMap
// caches are invalidated and re-fetched with the new translator.
// v9 preserves heading 4, toggle-heading children, and column width ratios.
// v10 renders Notion-hosted file embeds (e.g. uploaded `.html`) as proxied iframes.
const RM_VERSION = "v10"
// Bump NG_VERSION when NotionGraph schema changes (e.g. new edge types, node fields)
// so cached graphs are discarded and rebuilt with the new shape.
const NG_VERSION = "v4"
// Bump BG_VERSION when built layout semantics change as well as its serialized shape.
// v5 replaces category-colored posts with neutral gray and vivid green tag/series nodes.
const BG_VERSION = "v5"
// Bump ONT_VERSION when PostOntology/Entity/SemanticEdge schema changes.
const ONT_VERSION = "v2"
const OG_VERSION = "v2"
// v3 joins rich text and enforces public status, path and publication date.
const POSTS_VERSION = "v3"

export const keys = {
  posts: (dataSourceId: string) => `posts:${POSTS_VERSION}:${dataSourceId}`,
  pageIndex: (dataSourceId: string) => `pageIndex:${POSTS_VERSION}:${dataSourceId}`,
  recordMap: (pageId: string, lastEdited: string) =>
    `recordMap:${RM_VERSION}:${pageId}:${lastEdited}`,
  database: (databaseId: string, lastEdited: string) =>
    `database:${DB_VERSION}:${databaseId}:${lastEdited}`,
  user: (userId: string) => `user:${userId}`,
  og: (url: string) => `og:${OG_VERSION}:${url}`,
  notionGraph: (hash: string) => `notionGraph:${NG_VERSION}:${hash}`,
  builtGraph: (hash: string) => `builtGraph:${BG_VERSION}:${hash}`,
  postGraphExtraction: (postId: string, contentVersion: string) =>
    `postGraphExtraction:v1:${postId}:${contentVersion}`,
  comments: (slug: string) => `comments:${slug}`,
  postOntology: (postId: string, lastEdited: string) => `postOntology:${ONT_VERSION}:${postId}:${lastEdited}`,
  ontology: (postsHash: string) => `ontology:${ONT_VERSION}:${postsHash}`,
  ontologyState: `ontologyState:${ONT_VERSION}`,
}
