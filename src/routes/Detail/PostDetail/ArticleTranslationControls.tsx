import styled from "@emotion/styled"
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { VscClose, VscGlobe } from "react-icons/vsc"

export type ArticleTranslationHandle = { open: () => void }

type Props = {
  sourceLanguage: string
  targetLanguage: string
  browserLanguage: string
  suggestTranslation: boolean
  onSourceChange: (language: string) => void
  onTargetChange: (language: string) => void
  onTranslate: () => void
  onCancel: () => void
  onRestore: () => void
  busy: boolean
  hasTranslation: boolean
  canTranslate: boolean
  sourceError: string
  targetError: string
  availabilityMessage: string
  status: string
  error: string
  completed: number
  total: number
  downloadProgress: number | null
}

const languageOptions = ["ko", "en", "ja", "zh", "zh-Hant", "es", "fr", "de", "pt", "ru", "ar", "hi", "vi", "id", "th", "it"]

const ArticleTranslationControls = forwardRef<ArticleTranslationHandle, Props>((props, ref) => {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const root = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const target = useRef<HTMLInputElement>(null)
  const restoreTriggerFocus = useRef(false)
  const closePanel = useCallback(() => { restoreTriggerFocus.current = true; setOpen(false) }, [])
  useEffect(() => {
    const overlay = root.current
    const main = overlay?.parentElement
    if (!overlay || !main) return
    let frame = 0
    // Read host-side ad geometry only; never access ad frames or alter served ads.
    const update = () => {
      frame = 0
      const bounds = main.getBoundingClientRect()
      let bottom = bounds.bottom
      for (const ad of document.querySelectorAll<HTMLElement>("ins.adsbygoogle")) {
        if (!ad.getBoundingClientRect().height) continue
        for (let host: HTMLElement | null = ad; host && host !== document.body; host = host.parentElement) {
          if (getComputedStyle(host).position !== "fixed") continue
          resize?.observe(host)
          const rect = host.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0 && rect.left < bounds.right && rect.right > bounds.left
            && rect.top >= bounds.top && rect.top < bottom && rect.bottom >= bounds.bottom) bottom = rect.top
          break
        }
      }
      const inset = `${Math.max(8, bounds.bottom - bottom + 8)}px`
      if (overlay.style.bottom !== inset) overlay.style.bottom = inset
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    const adChanges = new MutationObserver(schedule)
    const discoverAds = () => {
      adChanges.disconnect()
      resize?.disconnect()
      resize?.observe(main)
      for (const ad of document.querySelectorAll<HTMLElement>("ins.adsbygoogle")) {
        resize?.observe(ad)
        for (let host: HTMLElement | null = ad; host && host !== document.body && host !== document.documentElement; host = host.parentElement) {
          adChanges.observe(host, { attributes: true, attributeFilter: ["style", "class", "data-anchor-status"] })
        }
      }
    }
    // Served anchors are inserted directly under html or body. Article progress
    // and translation motion must not trigger ad discovery or geometry reads.
    const mutations = new MutationObserver(() => { discoverAds(); schedule() })
    mutations.observe(document.documentElement, { childList: true })
    mutations.observe(document.body, { childList: true })
    discoverAds()
    window.addEventListener("resize", schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      adChanges.disconnect()
      mutations.disconnect()
      window.removeEventListener("resize", schedule)
    }
  }, [])
  useLayoutEffect(() => {
    if (!open && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false
      trigger.current?.focus({ preventScroll: true })
    }
  }, [open])
  useImperativeHandle(ref, () => ({
    open: () => {
      setDismissed(true)
      setOpen(true)
      setFocusRequest(request => request + 1)
    },
  }), [])
  useEffect(() => {
    if (!open) return
    target.current?.focus({ preventScroll: true })
    const input = target.current
    const panel = input?.closest<HTMLElement>(".translation-panel")
    if (input && panel) {
      const inputBounds = input.getBoundingClientRect()
      const panelBounds = panel.getBoundingClientRect()
      if (inputBounds.bottom > panelBounds.bottom) panel.scrollTop += inputBounds.bottom - panelBounds.bottom + 4
      else if (inputBounds.top < panelBounds.top) panel.scrollTop -= panelBounds.top - inputBounds.top + 4
    }
  }, [open, focusRequest])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !(event.target instanceof Node) || !root.current?.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      closePanel()
    }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("keydown", escape)
    }
  }, [open, closePanel])

  let targetName = props.targetLanguage || props.browserLanguage
  try {
    targetName = new Intl.DisplayNames([props.browserLanguage || "en"], { type: "language" }).of(targetName) || targetName
  } catch { /* Keep an incomplete language input literal until validation succeeds. */ }
  return <Controls ref={root} className="translation-overlay" data-open={open || undefined} aria-label="Article translation">
    <button ref={trigger} type="button" className="translation-trigger" aria-label="Article language and translation" title={props.busy ? props.status : "Article language and translation"} aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} aria-haspopup="dialog" onClick={() => { setDismissed(true); setOpen(value => !value) }}>
      <VscGlobe size={21} aria-hidden="true" />
      {(props.busy || props.hasTranslation) && <span className="language-badge">{props.busy && props.total ? `${props.completed}/${props.total}` : props.targetLanguage.split("-")[0].toUpperCase()}</span>}
    </button>
    {!open && !dismissed && props.suggestTranslation && !props.busy && !props.hasTranslation && <div className="translation-suggestion">
      <button type="button" className="suggestion-action" onClick={() => { setDismissed(true); setOpen(true) }}>Read this article in {targetName}?</button>
      <button type="button" className="icon-button" aria-label="Dismiss translation suggestion" onClick={() => setDismissed(true)}><VscClose aria-hidden="true" /></button>
    </div>}
    {open && <section id={`${id}-panel`} role="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="translation-panel">
      <header><div><h2 id={`${id}-title`}>Article language</h2><span>Preview · Source · Outline</span></div><button type="button" className="icon-button" aria-label="Close language options" onClick={closePanel}><VscClose aria-hidden="true" /></button></header>
      <p id={`${id}-description`}>Translate on your device with your browser’s built-in AI Translator. A language model may download after you request translation. No cloud translation service is used.</p>
      <div className="translation-languages">
        <label htmlFor={`${id}-source`}>Source language
          <input id={`${id}-source`} value={props.sourceLanguage} onChange={event => props.onSourceChange(event.target.value)} list={`${id}-languages`} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-invalid={Boolean(props.sourceError)} aria-describedby={props.sourceError ? `${id}-source-error` : `${id}-language-help`} />
          {props.sourceError && <span id={`${id}-source-error`}>{props.sourceError}</span>}
        </label>
        <label htmlFor={`${id}-target`}>Target language
          <input ref={target} id={`${id}-target`} value={props.targetLanguage} onChange={event => props.onTargetChange(event.target.value)} list={`${id}-languages`} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-invalid={Boolean(props.targetError)} aria-describedby={props.targetError ? `${id}-target-error` : `${id}-language-help`} />
          {props.targetError && <span id={`${id}-target-error`}>{props.targetError}</span>}
        </label>
      </div>
      <datalist id={`${id}-languages`}>{languageOptions.map(language => <option value={language} key={language} />)}</datalist>
      <p id={`${id}-language-help`} className="language-help">Use language tags such as ko, en or zh-Hant. Changing a language restores the original.</p>
      <p>{props.availabilityMessage}</p>
      <p className="translation-note">Preview, Markdown Source and Outline share the same translation. Copy/download and the public .md URL remain original. Machine translations may be inaccurate.</p>
      <div className="translation-actions">
        <button type="button" className="translate-action" disabled={!props.canTranslate || props.busy} onClick={props.onTranslate} aria-describedby={`${id}-description`}>Translate article</button>
        {props.busy && <button type="button" onClick={props.onCancel}>Cancel translation</button>}
        {props.hasTranslation && <button type="button" onClick={props.onRestore}>Restore original</button>}
      </div>
      {props.busy && (props.total > 0 && props.downloadProgress === null
        ? <progress max={props.total} value={props.completed} aria-label="Article sentences translated" />
        : <progress max={1} value={props.downloadProgress ?? undefined} aria-label="Preparing translation model" />)}
      {props.status && <p className="panel-status">{props.status}</p>}
      {props.error && <p className="translation-error">{props.error}</p>}
    </section>}
    <span className="translation-live" role="status" aria-live="polite" aria-atomic="true">{props.status}</span>
    <span className="translation-live" role="alert">{props.error}</span>
  </Controls>
})

ArticleTranslationControls.displayName = "ArticleTranslationControls"

export default ArticleTranslationControls

const Controls = styled.section`
  position: absolute;
  inset: 8px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
  color: ${({ theme }) => theme.colors.editor.fg};
  font-family: var(--font-ui, sans-serif);
  font-size: 12px;
  line-height: 1.6;
  button { font: inherit; color: inherit; cursor: pointer; border: 1px solid ${({ theme }) => theme.colors.editor.line}; background: ${({ theme }) => theme.colors.editor.bg2}; }
  button:hover:not(:disabled) { background: ${({ theme }) => theme.colors.editor.bg3}; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.editor.accent}; outline-offset: 2px; }
  .translation-trigger { flex: 0 0 auto; pointer-events: auto; max-width: 100%; min-width: 42px; min-height: 42px; padding: 8px 10px; display: flex; align-items: center; gap: 7px; border-radius: 6px; box-shadow: 0 3px 12px #0002; }
  .translation-trigger[aria-expanded="true"] { border-color: ${({ theme }) => theme.colors.editor.accent}; }
  .language-badge { max-width: 90px; overflow: hidden; font-size: 11px; font-variant-numeric: tabular-nums; }
  .translation-panel, .translation-suggestion { box-sizing: border-box; flex: 0 1 auto; min-height: 0; max-width: 100%; overflow-y: auto; overscroll-behavior: contain; pointer-events: auto; background: ${({ theme }) => theme.colors.editor.bg2}; border: 1px solid ${({ theme }) => theme.colors.editor.line}; box-shadow: 0 8px 28px #0003; border-radius: 6px; }
  .translation-suggestion { display: flex; align-items: center; width: 320px; padding: 4px; }
  .suggestion-action { min-width: 0; padding: 8px; text-align: left; border: 0; overflow-wrap: anywhere; }
  .icon-button { display: inline-grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; padding: 0; border: 0; }
  .translation-panel { width: 390px; padding: 16px; animation: language-panel-in 160ms ease-out; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
  header span { color: ${({ theme }) => theme.colors.editor.fg3}; font-size: 11px; }
  p { margin: 0 0 12px; overflow-wrap: anywhere; }
  .translation-languages { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 8px; }
  label { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
  input { box-sizing: border-box; width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid ${({ theme }) => theme.colors.editor.line}; border-radius: 3px; background: ${({ theme }) => theme.colors.editor.bg}; color: inherit; font: inherit; }
  label span, .translation-error { color: ${({ theme }) => theme.colors.editor.accent}; }
  .language-help, .translation-note { color: ${({ theme }) => theme.colors.editor.fg3}; }
  .translation-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .translation-actions button { min-height: 36px; padding: 6px 10px; border-radius: 3px; }
  .translation-actions .translate-action { background: ${({ theme }) => theme.colors.editor.accent}; color: ${({ theme }) => theme.colors.editor.bg}; }
  .translation-actions .translate-action:hover:not(:disabled) { filter: brightness(1.12); background: ${({ theme }) => theme.colors.editor.accent}; }
  .panel-status { margin-top: 10px; }
  progress { display: block; width: 100%; height: 7px; accent-color: ${({ theme }) => theme.colors.editor.accent}; }
  .translation-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @keyframes language-panel-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .translation-panel { animation: none; } }
  @container article-document (max-width: 320px) { .translation-languages { grid-template-columns: minmax(0, 1fr); } .translation-panel { padding: 12px; } }
  @container article-document (max-height: 180px) {
    &[data-open] .translation-trigger { display: none; }
    .translation-panel { max-height: 100%; padding: 8px; }
  }
  @media (max-width: 480px) { .translation-trigger { min-height: 44px; min-width: 44px; } input { font-size: 16px; } }
`
