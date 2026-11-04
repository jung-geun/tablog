/**
 * @jest-environment node
 */

import type { NextApiRequest } from "next"
import { getInternalOrigin, getIp, isRequestOriginAllowed, isTrustedNotionFileUrl } from "src/libs/utils/security"
import { getRequestIp } from "src/libs/utils/image/proxyServer"

const REMOTE_ADDRESS = "172.18.0.2"
const originalHops = process.env.TRUSTED_PROXY_HOPS
const originalSecret = process.env.TRUSTED_PROXY_SECRET
const originalPort = process.env.PORT
const originalNodeEnv = process.env.NODE_ENV

function request(headers: Record<string, string> = {}, remoteAddress = REMOTE_ADDRESS): NextApiRequest {
  return {
    headers,
    socket: { remoteAddress },
  } as NextApiRequest
}

function setProxyConfig(hops: string | undefined, secret: string | undefined): void {
  if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS
  else process.env.TRUSTED_PROXY_HOPS = hops

  if (secret === undefined) delete process.env.TRUSTED_PROXY_SECRET
  else process.env.TRUSTED_PROXY_SECRET = secret
}

function setPort(port: string | undefined): void {
  if (port === undefined) delete process.env.PORT
  else process.env.PORT = port
}

function setNodeEnv(value: string | undefined): void {
  const mutableEnv = process.env as Record<string, string | undefined>
  if (value === undefined) delete mutableEnv.NODE_ENV
  else mutableEnv.NODE_ENV = value
}

afterEach(() => {
  setProxyConfig(originalHops, originalSecret)
  setPort(originalPort)
  setNodeEnv(originalNodeEnv)
})

describe("getInternalOrigin", () => {
  it("uses loopback and the default port when PORT is missing", () => {
    setPort(undefined)

    expect(getInternalOrigin()).toBe("http://127.0.0.1:3000")
  })

  it("uses only a valid configured port", () => {
    setPort("3411")
    expect(getInternalOrigin()).toBe("http://127.0.0.1:3411")

    setPort("invalid")
    expect(getInternalOrigin()).toBe("http://127.0.0.1:3000")
  })
})

describe("isRequestOriginAllowed", () => {
  beforeEach(() => setNodeEnv("production"))

  it("accepts the browser origin that exactly matches the direct request origin", () => {
    expect(isRequestOriginAllowed(request({
      host: "127.0.0.1:3100",
      origin: "http://127.0.0.1:3100",
    }), [])).toBe(true)
  })

  it("uses forwarded protocol only from the authenticated proxy", () => {
    setProxyConfig("1", "proxy-secret")
    const headers = {
      host: "blog.example.com",
      origin: "https://blog.example.com",
      "x-forwarded-proto": "https",
    }

    expect(isRequestOriginAllowed(request(headers), [])).toBe(false)
    expect(isRequestOriginAllowed(request({
      ...headers,
      "x-monolog-proxy-secret": "proxy-secret",
    }), [])).toBe(true)
  })

  it("rejects a cross-origin browser request", () => {
    expect(isRequestOriginAllowed(request({
      host: "blog.example.com",
      origin: "https://evil.example.com",
    }), [])).toBe(false)
  })
})


describe("getIp", () => {
  it("ignores spoofed X-Forwarded-For when proxy trust is disabled", () => {
    setProxyConfig("0", "proxy-secret")

    expect(getIp(request({ "x-forwarded-for": "198.51.100.10", "x-monolog-proxy-secret": "proxy-secret" }))).toBe(REMOTE_ADDRESS)
  })

  it.each([
    ["missing proxy secret", {}],
    ["wrong proxy secret", { "x-monolog-proxy-secret": "wrong-secret" }],
  ])("ignores X-Forwarded-For with a %s", (_case, headers) => {
    setProxyConfig("1", "proxy-secret")

    expect(getIp(request({ "x-forwarded-for": "198.51.100.10", ...headers }))).toBe(REMOTE_ADDRESS)
  })

  it("selects the sole client address behind one authenticated proxy hop", () => {
    setProxyConfig("1", "proxy-secret")

    expect(getIp(request({ "x-forwarded-for": "198.51.100.10", "x-monolog-proxy-secret": "proxy-secret" }))).toBe("198.51.100.10")
  })

  it("selects HAProxy's appended client address behind one authenticated proxy hop", () => {
    setProxyConfig("1", "proxy-secret")

    expect(getIp(request({ "x-forwarded-for": "203.0.113.99, 198.51.100.10", "x-monolog-proxy-secret": "proxy-secret" }))).toBe("198.51.100.10")
  })

  it("selects the left client address behind two authenticated proxy hops", () => {
    setProxyConfig("2", "proxy-secret")

    expect(getIp(request({ "x-forwarded-for": "198.51.100.10, 192.0.2.2", "x-monolog-proxy-secret": "proxy-secret" }))).toBe("198.51.100.10")
  })

  it.each([
    ["insufficient forwarded addresses", "2", "198.51.100.10"],
    ["an invalid selected address", "1", "not-an-ip"],
    ["an invalid hop count", "one", "198.51.100.10"],
  ])("falls back to the socket address for %s", (_case, hops, forwarded) => {
    setProxyConfig(hops, "proxy-secret")

    expect(getIp(request({ "x-forwarded-for": forwarded, "x-monolog-proxy-secret": "proxy-secret" }))).toBe(REMOTE_ADDRESS)
  })

  it("uses the same authenticated client identity for image proxy logs", () => {
    setProxyConfig("1", "proxy-secret")
    const req = request({ "x-forwarded-for": "198.51.100.10", "x-monolog-proxy-secret": "proxy-secret" })

    expect(getRequestIp(req)).toBe(getIp(req))
  })
})

describe("isTrustedNotionFileUrl", () => {
  it.each([
    "https://prod-files-secure.s3.us-west-2.amazonaws.com/bucket/diagram.html?X-Amz-Signature=abc",
    "https://prod-files-secure.s3.amazonaws.com/bucket/file.pdf",
    "https://secure.notion-static.com/file.pdf",
    "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/file.pdf",
  ])("trusts Notion file host: %s", (url) => {
    expect(isTrustedNotionFileUrl(url)).toBe(true)
  })

  const userinfoTarget = new URL("https://secure.notion-static.com/file.pdf")
  userinfoTarget.username = "example-user"

  it.each([
    "http://prod-files-secure.s3.us-west-2.amazonaws.com/file.pdf",
    "https://prod-files-secure.s3.us-west-2.amazonaws.com.evil.test/file.pdf",
    "https://unrelated.s3.amazonaws.com/file.pdf",
    "https://s3.us-west-2.amazonaws.com/other-bucket/file.pdf",
    // Explicit default :443 normalizes away per URL spec (same endpoint),
    // so only a non-default port is a meaningful rejection case here.
    "https://prod-files-secure.s3.us-west-2.amazonaws.com:8443/file.pdf",
    userinfoTarget.toString(),
    "https://evil.test/diagram.html",
    "not-a-url",
  ])("rejects untrusted target: %s", (url) => {
    expect(isTrustedNotionFileUrl(url)).toBe(false)
  })
})
