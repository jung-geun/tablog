import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ThemeProvider } from "@emotion/react"
import { createTheme } from "src/styles/theme"
import { resolveColorTheme } from "src/styles/colors"
import useArticleTranslation from "src/routes/Detail/PostDetail/useArticleTranslation"
import type { TranslationArticle } from "src/routes/Detail/PostDetail/articleTranslation"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const first: TranslationArticle = { title: "첫 문장. 다음 문장.", summary: "", recordMap: null }
const second: TranslationArticle = { title: "다른 글입니다.", summary: "", recordMap: null }
const theme = createTheme({ colorTheme: resolveColorTheme("one-dark-pro-mix") })
function Harness({ article, slug }: { article: TranslationArticle; slug: string }) {
  const translation = useArticleTranslation(article, slug)
  return <ThemeProvider theme={theme}><div className="document-main"><div className="document-panes"><output>{translation.article.title}</output></div>{translation.controls}</div></ThemeProvider>
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
let host: HTMLDivElement
let root: Root
let previousTranslator: PropertyDescriptor | undefined
let previousLanguage: PropertyDescriptor | undefined
const create = jest.fn()
const availability = jest.fn()
const button = (text: string) => Array.from(document.querySelectorAll("button")).find(element => element.textContent === text)!
const title = () => host.querySelector("output")!.textContent
const render = async (article = first, slug = "first", open = true) => {
  await act(async () => { root.render(<Harness article={article} slug={slug} />) })
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Article language and translation"]')
  if (open && trigger && trigger.getAttribute("aria-expanded") !== "true") act(() => trigger.click())
}

beforeEach(() => {
  previousTranslator = Object.getOwnPropertyDescriptor(globalThis, "Translator")
  previousLanguage = Object.getOwnPropertyDescriptor(navigator, "language")
  availability.mockReset().mockResolvedValue("available")
  create.mockReset()
  Object.defineProperty(globalThis, "Translator", { configurable: true, value: { availability, create } })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  if (previousTranslator) Object.defineProperty(globalThis, "Translator", previousTranslator)
  else Reflect.deleteProperty(globalThis, "Translator")
  if (previousLanguage) Object.defineProperty(navigator, "language", previousLanguage)
  else Reflect.deleteProperty(navigator, "language")
})

it("does not create a model on mount or when opening translation controls", async () => {
  await render(first, "first", false)
  expect(create).not.toHaveBeenCalled()
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Article language and translation"]')!.click())
  expect(create).not.toHaveBeenCalled()
  expect(title()).toBe(first.title)
  expect(button("Translate article").disabled).toBe(false)
})


it("resets the language panel and suggestion dismissal when navigating to another article", async () => {
  Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" })
  await render()
  await render(second, "second", false)
  expect(document.querySelector(".translation-panel")).toBeNull()
  expect(document.querySelector(".translation-suggestion")).not.toBeNull()
  expect(create).not.toHaveBeenCalled()
})

it("disposes a model that finishes creating after cancellation without translating", async () => {
  const pending = deferred<{ translate: jest.Mock; destroy: jest.Mock }>()
  const translator = { translate: jest.fn(), destroy: jest.fn() }
  create.mockReturnValue(pending.promise)
  await render()
  act(() => button("Translate article").click())
  const options = create.mock.calls[0][0]
  act(() => button("Cancel translation").click())
  await act(async () => pending.resolve(translator))
  expect(options.signal.aborted).toBe(true)
  expect(translator.destroy).toHaveBeenCalledTimes(1)
  expect(translator.translate).not.toHaveBeenCalled()
  expect(title()).toBe(first.title)
})

it("ignores an old sentence response after switching articles", async () => {
  const pending = deferred<string>()
  const translator = { translate: jest.fn(() => pending.promise), destroy: jest.fn() }
  create.mockResolvedValue(translator)
  await render()
  await act(async () => button("Translate article").click())
  await render(second, "second")
  await act(async () => pending.resolve("An old article."))
  expect(title()).toBe(second.title)
  expect(document.querySelector('[role="status"]')?.textContent).toBe("")
  expect(translator.destroy).toHaveBeenCalledTimes(1)
})

it("retains completed sentences on cancel and restores the original without accepting a late response", async () => {
  const pending = deferred<string>()
  const translator = { translate: jest.fn().mockResolvedValueOnce("First sentence.").mockReturnValueOnce(pending.promise), destroy: jest.fn() }
  create.mockResolvedValue(translator)
  await render()
  await act(async () => button("Translate article").click())
  expect(title()).toBe("First sentence. 다음 문장.")
  act(() => host.dispatchEvent(new Event("pointerdown", { bubbles: true })))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(translator.destroy).not.toHaveBeenCalled()
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Article language and translation"]')!.click())
  act(() => button("Cancel translation").click())
  expect(title()).toBe("First sentence. 다음 문장.")
  act(() => button("Restore original").click())
  await act(async () => pending.resolve("Second sentence."))
  expect(title()).toBe(first.title)
  expect(translator.translate).toHaveBeenCalledTimes(2)
})

it("dismisses a non-Korean locale suggestion without requesting translation", async () => {
  Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" })
  await render(first, "first", false)
  const dismiss = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss translation suggestion"]')!
  expect(dismiss).not.toBeNull()
  act(() => dismiss.click())
  expect(document.querySelector(".translation-suggestion")).toBeNull()
  expect(create).not.toHaveBeenCalled()
  expect(title()).toBe(first.title)
})

it("keeps Korean browser sessions original and returns keyboard focus after closing language options", async () => {
  Object.defineProperty(navigator, "language", { configurable: true, value: "ko-KR" })
  await render(first, "first", false)
  expect(document.querySelector(".translation-suggestion")).toBeNull()
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Article language and translation"]')!
  act(() => trigger.click())
  expect(document.activeElement).toBe(document.querySelector('input[id$="-target"]'))
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(create).not.toHaveBeenCalled()
  expect(title()).toBe(first.title)
})

it("offers no unsupported automatic translation and retains the article when the native API is absent", async () => {
  Reflect.deleteProperty(globalThis, "Translator")
  await render()
  expect(document.querySelector(".translation-suggestion")).toBeNull()
  expect(button("Translate article").disabled).toBe(true)
  expect(create).not.toHaveBeenCalled()
  expect(title()).toBe(first.title)
})

it("keeps controls above a late anchor ad outside body and restores space after it closes", async () => {
  let nextFrame: FrameRequestCallback | undefined
  const raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    nextFrame = callback
    return 1
  })
  const ad = document.createElement("ins")
  ad.className = "adsbygoogle adsbygoogle-noablate"
  ad.style.position = "fixed"
  const rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const bounds = this.classList.contains("document-main")
      ? { x: 0, y: 100, width: 400, height: 600 }
      : this === ad ? { x: 0, y: 580, width: 400, height: 220 } : { x: 0, y: 0, width: 0, height: 0 }
    return { ...bounds, top: bounds.y, left: bounds.x, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height, toJSON: () => bounds }
  })
  const flush = async () => {
    await act(async () => { await Promise.resolve() })
    const callback = nextFrame
    nextFrame = undefined
    act(() => callback?.(0))
  }
  try {
    await render()
    await flush()
    const overlay = document.querySelector<HTMLElement>(".translation-overlay")!
    expect(overlay.style.bottom).toBe("8px")
    // AdSense appends its served anchor beside body, directly under html.
    document.documentElement.append(ad)
    await flush()
    expect(overlay.style.bottom).toBe("128px")
    ad.style.position = "static"
    await flush()
    expect(overlay.style.bottom).toBe("8px")
    ad.style.position = "fixed"
    await flush()
    expect(overlay.style.bottom).toBe("128px")
    ad.remove()
    await flush()
    expect(overlay.style.bottom).toBe("8px")
  } finally {
    ad.remove()
    rect.mockRestore()
    raf.mockRestore()
  }
})
