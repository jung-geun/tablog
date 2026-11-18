import { NextApiRequest, NextApiResponse } from "next"
import { getPosts } from "src/apis/notion-client/getPosts"
import { eligibleGraphPosts } from "src/apis/notion-client/graphHash"
import { searchSimilar, normalizeUUID, getPostEmbedding } from "src/apis/vector/qdrantClient"
import { getOntology } from "src/apis/ontology/getOntology"

export type SimilarPost = {
  postId: string
  slug: string
  title: string
  category: string
  score: number
  rationale?: string
}

// GET /api/similar?postId=<notionId>&limit=5
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end()

  const rawId = typeof req.query.postId === "string" ? req.query.postId : undefined
  if (!rawId) return res.status(400).json({ error: "postId is required" })

  const requestedLimit = Number(req.query.limit ?? 5)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 20) : 5
  // Unpublishing must take effect immediately, so neither request nor results are CDN-cached.
  res.setHeader("Cache-Control", "no-store")

  const posts = eligibleGraphPosts(await getPosts())
  const post = posts.find((p) => p.id === rawId || p.slug === rawId)
  if (!post) return res.status(404).json({ error: "Post not found" })

  const vector = await getPostEmbedding(post)

  if (!vector) {
    return res.status(202).json({
      ready: false,
      message: "Post embedding is pending scheduled content reconciliation.",
    })
  }

  const similar = await searchSimilar(vector, limit, normalizeUUID(post.id))

  // Enrich with rationale from ontology if available
  const ontology = await getOntology()
  const rationaleMap = new Map<string, string>()
  if (ontology) {
    for (const edge of ontology.edges) {
      if (edge.source === post.id && edge.rationale) {
        rationaleMap.set(edge.target, edge.rationale)
      }
    }
  }

  const postMap = new Map(posts.map((p) => [p.id, p]))
  const results: SimilarPost[] = similar.flatMap((r) => {
    const current = postMap.get(r.payload.postId)
    if (!current || current.id === post.id) return []
    return [{
      postId: current.id,
      slug: current.slug,
      title: current.title,
      category: current.category?.[0] ?? "misc",
      score: r.score,
      rationale: rationaleMap.get(current.id),
    }]
  })

  res.json({ postId: post.id, results })
}
