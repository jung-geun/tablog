import { timingSafeEqual } from "crypto"
import { isIP } from "net"
import type { NextApiRequest } from "next"
import { LRUCache } from "lru-cache"
import { ipHash } from "src/libs/utils/comments/hash"

export function getInternalOrigin(): string {
  const configuredPort = Number(process.env.PORT)
  const port =
    Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535
      ? configuredPort
      : 3000
  return `http://127.0.0.1:${port}`
}

function hasTrustedProxySecret(req: NextApiRequest): boolean {
  const expected = process.env.TRUSTED_PROXY_SECRET
  const actual = req.headers["x-monolog-proxy-secret"]
  if (!expected || typeof actual !== "string") return false

  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

export function getIp(req: NextApiRequest): string {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0")
  if (Number.isSafeInteger(hops) && hops > 0 && hasTrustedProxySecret(req)) {
    const forwarded = req.headers["x-forwarded-for"]
    if (typeof forwarded === "string") {
      const ips = forwarded.split(",").map((ip) => ip.trim())
      const index = ips.length - hops
      if (index >= 0 && isIP(ips[index])) return ips[index]
    }
  }
  return req.socket?.remoteAddress ?? "unknown"
}

export function getIpHash(req: NextApiRequest): string {
  return ipHash(getIp(req))
}

const imageProxyStore = new LRUCache<string, { count: number; start: number }>({
  max: 50_000,
  ttl: 60_000,
})
const IMAGE_PROXY_PER_MIN = 120

export function checkImageProxyRateLimit(ipH: string): { ok: boolean } {
  const now = Date.now()
  const entry = imageProxyStore.get(ipH)
  if (!entry || now - entry.start >= 60_000) {
    imageProxyStore.set(ipH, { count: 1, start: now })
    return { ok: true }
  }
  if (entry.count >= IMAGE_PROXY_PER_MIN) return { ok: false }
  imageProxyStore.set(ipH, { count: entry.count + 1, start: entry.start })
  return { ok: true }
}

const refreshImageStore = new LRUCache<string, { count: number; start: number }>({
  max: 20_000,
  ttl: 60_000,
})
const REFRESH_IMAGE_PER_MIN = 60

export function checkRefreshImageRateLimit(ipH: string): { ok: boolean } {
  const now = Date.now()
  const entry = refreshImageStore.get(ipH)
  if (!entry || now - entry.start >= 60_000) {
    refreshImageStore.set(ipH, { count: 1, start: now })
    return { ok: true }
  }
  if (entry.count >= REFRESH_IMAGE_PER_MIN) return { ok: false }
  refreshImageStore.set(ipH, { count: entry.count + 1, start: entry.start })
  return { ok: true }
}

function normalizeOrigin(input: string | undefined): string | null {
  if (!input || typeof input !== "string") return null

  const trimmed = input.trim()
  if (!trimmed) return null

  const withScheme = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : trimmed

  try {
    return new URL(withScheme).origin.toLowerCase()
  } catch {
    // Accept host-only entries from env vars (e.g. mysite.com or mysite.com:3000)
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(withScheme) && !trimmed.includes("/")) {
      try {
        return new URL(`https://${trimmed}`).origin.toLowerCase()
      } catch {
        return null
      }
    }
  }
  return null
}

function normalizeAllowedOrigins(origins?: Array<string | undefined> | null): Set<string> {
  const candidateOrigins = origins ?? [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL,
  ]
  const normalized = new Set<string>()
  for (const origin of candidateOrigins) {
    const next = normalizeOrigin(origin)
    if (next) normalized.add(next)
  }
  return normalized
}

export function extractRequestOrigin(req: NextApiRequest): string | null {
  const originHeader = req.headers["origin"]
  const refererHeader = req.headers["referer"] || req.headers["referrer"]

  const rawOrigin =
    typeof originHeader === "string" && originHeader
      ? originHeader
      : typeof refererHeader === "string"
        ? refererHeader
        : undefined

  return normalizeOrigin(rawOrigin)
}

function getRequestOrigin(req: NextApiRequest): string | null {
  const host = req.headers.host
  if (typeof host !== "string" || !host.trim()) return null

  const forwardedProto = hasTrustedProxySecret(req)
    ? req.headers["x-forwarded-proto"]
    : undefined
  const firstForwardedProto = typeof forwardedProto === "string"
    ? forwardedProto.split(",", 1)[0].trim().toLowerCase()
    : undefined
  const protocol = firstForwardedProto === "http" || firstForwardedProto === "https"
    ? firstForwardedProto
    : (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted
      ? "https"
      : "http"

  return normalizeOrigin(`${protocol}://${host}`)
}

export function isRequestOriginAllowed(req: NextApiRequest, allowedOrigins?: Array<string | undefined>): boolean {
  if (process.env.NODE_ENV !== "production") return true

  const source = extractRequestOrigin(req)
  if (!source) return false

  if (source === getRequestOrigin(req)) return true

  const allowed = normalizeAllowedOrigins(allowedOrigins)
  if (allowed.size === 0) return false

  return allowed.has(source)
}

export function normalizeNotionId(value: string): string {
  const trimmed = value.trim()
  return trimmed.replace(/-/g, "").toLowerCase()
}

export function isValidNotionId(value: string): boolean {
  const trimmed = value.trim()
  const uuidWithDashes =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  if (uuidWithDashes.test(trimmed)) return true
  const uuidWithoutDashes = /^[0-9a-fA-F]{32}$/
  return uuidWithoutDashes.test(trimmed)
}

/**
 * True only for Notion's own file hosts (official SDK `file.url` values).
 * Used both when translating embed blocks and when validating the
 * `/api/attachment` redirect target, so the trust boundary stays in one place.
 */
export function isTrustedNotionFileUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.port) return false
    // Reject any userinfo in the authority section without reading URL credential fields.
    const authority = url.href.slice(url.protocol.length + 2).split(/[/?#]/, 1)[0]
    if (authority.includes("@")) return false
    return /^prod-files-secure\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)
      || url.hostname === "secure.notion-static.com"
      || (url.hostname === "s3.us-west-2.amazonaws.com" && url.pathname.startsWith("/secure.notion-static.com/"))
  } catch {
    return false
  }
}
