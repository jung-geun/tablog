import React, { ReactNode, useEffect, useRef, useState, type CSSProperties } from "react"
import styled from "@emotion/styled"
import { useRouter } from "next/compat/router"
import Router from "next/router"
import CommandPalette from "src/components/CommandPalette"
import ActivityBar from "./ActivityBar"
import FileTree from "./FileTree"
import SearchSidebar from "./SearchSidebar"
import KnowledgeSidebar from "./KnowledgeSidebar"
import TabBar from "./TabBar"
import TabSessionControls from "./TabSessionControls"
import TitleBar from "./TitleBar"
import StatusBar from "./StatusBar"
import SettingsPanel from "./SettingsPanel"
import { RouteChromeProvider, useRouteChrome } from "./RouteChromeContext"
import { WorkbenchProvider, useWorkbench } from "./WorkbenchContext"
import { getReadingScrollRoot } from "src/routes/Detail/PostDetail/scrollRoot"

export const EDITOR_SCROLL_ROOT = ".page-content"

const EditorShellInner = ({ children }: { children: ReactNode }) => {
  const { chrome, isFileTreeOpen, setFileTreeOpen } = useRouteChrome()
  const { sidebarView, readingMode, settingsOpen, scrollToHeading } = useWorkbench()
  const events = useRouter()?.events
  const contentRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [navigation, setNavigation] = useState<"idle" | "loading" | "complete">("idle")
  const [sidebarWidth, setSidebarWidth] = useState(248)
  const [mobileDrawerReady, setMobileDrawerReady] = useState(false)
  const resizeStart = useRef({ x: 0, width: 248 })
  const scrollPositions = useRef(new Map<string, number>())
  const sidebarVisible = isFileTreeOpen && !readingMode

  useEffect(() => { setMobileDrawerReady(true) }, [])

  useEffect(() => {
    if (!mobileDrawerReady || !sidebarVisible) return
    const previousFocus = document.activeElement as HTMLElement | null
    if (window.matchMedia("(max-width: 960px)").matches) sidebarRef.current?.querySelector<HTMLElement>("button, input, a[href]")?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && window.matchMedia("(max-width: 960px)").matches) {
        setFileTreeOpen(false)
        previousFocus?.focus({ preventScroll: true })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileDrawerReady, sidebarVisible, sidebarView, setFileTreeOpen])

  useEffect(() => {
    if (!events) return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let currentRoute = window.location.pathname + window.location.search
    let pendingRoute: string | null = null
    let historyTarget: string | null = null
    let skipEntry = false
    let entryAnimation: Animation | undefined
    let frame = 0
    let pendingRestore: MutationObserver | undefined
    const cancelEntry = () => { entryAnimation?.cancel(); entryAnimation = undefined }
    const restore = (url: string) => {
      pendingRestore?.disconnect()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const root = getReadingScrollRoot()
          const hash = url.split("#")[1]
          if (hash) {
            let id = hash
            try { id = decodeURIComponent(hash) } catch { /* Keep malformed anchors literal. */ }
            const target = document.getElementById(id)
            const preview = target?.closest<HTMLElement>(".document-preview")
            if (preview && !preview.getClientRects().length) scrollToHeading(id)
            else target?.scrollIntoView({ block: "start", behavior: "instant" })
          } else {
            // Source rows arrive asynchronously after a history navigation. Applying
            // the offset to its loading placeholder would permanently clamp it to zero.
            if (root instanceof HTMLElement && root.classList.contains("document-source") && !root.querySelector(".source-line")) {
              pendingRestore = new MutationObserver(() => restore(url))
              if (contentRef.current) pendingRestore.observe(contentRef.current, { childList: true, subtree: true })
              return
            }
            const position = scrollPositions.current.get(url.split("#")[0]) ?? 0
            root.scrollTo({ top: position, behavior: "instant" })
          }
        })
      })
    }
    const start = (url: string, { shallow }: { shallow: boolean }) => {
      const route = url.split("#")[0]
      const fromHistory = historyTarget === route
      historyTarget = null
      if (shallow || route === currentRoute) return
      pendingRestore?.disconnect()
      const root = getReadingScrollRoot()
      scrollPositions.current.set(currentRoute, root instanceof HTMLElement ? root.scrollTop : window.scrollY)
      skipEntry = fromHistory || scrollPositions.current.has(route)
      pendingRoute = url
      cancelEntry()
      setNavigation("loading")
    }
    const complete = (url: string) => {
      currentRoute = url.split("#")[0]
      if (pendingRoute === null) return
      pendingRoute = null
      setNavigation("complete")
      restore(url)
      if (reducedMotion.matches || skipEntry || url.includes("#")) return
      entryAnimation = contentRef.current?.animate([
        { opacity: 0.84, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
    }
    const fail = (_error: unknown, url: string) => {
      if (pendingRoute !== url) return
      pendingRoute = null
      cancelEntry()
      setNavigation("idle")
    }
    const preferenceChanged = () => { if (reducedMotion.matches) cancelEntry() }
    Router.beforePopState(({ as }) => { historyTarget = as.split("#")[0]; return true })
    events.on("routeChangeStart", start)
    events.on("routeChangeComplete", complete)
    events.on("routeChangeError", fail)
    events.on("hashChangeComplete", restore)
    reducedMotion.addEventListener("change", preferenceChanged)
    if (window.location.hash) restore(window.location.pathname + window.location.search + window.location.hash)
    return () => {
      Router.beforePopState(() => true)
      events.off("routeChangeStart", start)
      events.off("routeChangeComplete", complete)
      events.off("routeChangeError", fail)
      events.off("hashChangeComplete", restore)
      reducedMotion.removeEventListener("change", preferenceChanged)
      cancelAnimationFrame(frame)
      pendingRestore?.disconnect()
      cancelEntry()
    }
  }, [events, scrollToHeading])

  return <StyledWrapper data-mobile-ready={mobileDrawerReady || undefined} style={{ "--primary-sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
    <a className="skip-content" href="#workbench-content">Skip to document</a>
    <TitleBar filename={chrome.filename} />
    <div className="main-row">
      <ActivityBar />
      <aside id="primary-sidebar" ref={sidebarRef} className="primary-sidebar" hidden={!sidebarVisible} aria-label={`${sidebarView} sidebar`}>
        {sidebarView === "explorer" ? <FileTree /> : sidebarView === "search" ? <SearchSidebar /> : <KnowledgeSidebar />}
      </aside>
      {sidebarVisible && <div className="sidebar-resize" role="separator" tabIndex={0} aria-label="Resize primary sidebar" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={420} aria-valuenow={sidebarWidth}
        onPointerDown={(event) => { resizeStart.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setSidebarWidth(Math.min(420, Math.max(180, resizeStart.current.width + event.clientX - resizeStart.current.x))) }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
          event.preventDefault()
          setSidebarWidth((width) => event.key === "Home" ? 180 : event.key === "End" ? 420 : Math.min(420, Math.max(180, width + (event.key === "ArrowRight" ? 10 : -10))))
        }} />}
      {sidebarVisible && <button type="button" className="filetree-backdrop" aria-label="Close sidebar" onClick={() => setFileTreeOpen(false)} />}
      <div className="editor-body">
        <TabBar />
        {!settingsOpen && <TabSessionControls preferencesOpen={false} onClosePreferences={() => contentRef.current?.focus({ preventScroll: true })} />}
        <div className="route-signal" data-navigation={navigation} aria-hidden="true" />
        <div id="workbench-content" tabIndex={-1} className="page-content" ref={contentRef} aria-busy={navigation === "loading"}>{children}</div>
      </div>
    </div>
    <StatusBar items={chrome.statusItems} />
    <SettingsPanel />
    <CommandPalette />
  </StyledWrapper>
}

const EditorShell = ({ children }: { children: ReactNode }) => <RouteChromeProvider><WorkbenchProvider><EditorShellInner>{children}</EditorShellInner></WorkbenchProvider></RouteChromeProvider>
export default EditorShell

const StyledWrapper = styled.div`
  /* Keep the bounded shell in flow so ad SDKs can measure the page height. */
  position: relative;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.editor.bg};
  color: ${({ theme }) => theme.colors.editor.fg};
  font-family: var(--font-ui, sans-serif);
  .skip-content { position: fixed; left: 12px; top: -60px; z-index: 110; padding: 8px; background: ${({ theme }) => theme.colors.editor.bg2}; color: inherit; }
  .skip-content:focus { top: 4px; }
  .main-row { flex: 1; min-height: 0; display: flex; position: relative; }
  .primary-sidebar { width: var(--primary-sidebar-width); flex-shrink: 0; overflow: auto; background: ${({ theme }) => theme.colors.editor.bg2}; }
  .primary-sidebar[hidden] { display: none; }
  .sidebar-resize { width: 4px; flex-shrink: 0; cursor: col-resize; touch-action: none; background: ${({ theme }) => theme.colors.editor.line}; }
  .sidebar-resize:hover, .sidebar-resize:focus-visible { background: ${({ theme }) => theme.colors.editor.accent}; outline: 0; }
  .editor-body { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .page-content { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain; display: flex; flex-direction: column; scroll-behavior: auto; }
  .page-content:focus { outline: none; }
  .page-content { container: editor / inline-size; }
  .page-content > * { flex-shrink: 0; }
  .page-content:has(.post-detail) { overflow: hidden; }
  .page-content:has(.post-detail) > * { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
  .route-signal { position: relative; height: 2px; margin-bottom: -2px; flex-shrink: 0; z-index: 35; pointer-events: none; overflow: hidden; }
  .route-signal::after { content: ""; position: absolute; inset: 0; height: 2px; background: ${({ theme }) => theme.colors.editor.accent}; transform-origin: left; opacity: 0; }
  .route-signal[data-navigation="loading"]::after { width: 32%; opacity: .8; animation: tablog-route-scan 1100ms ease-in-out infinite; }
  .route-signal[data-navigation="complete"]::after { animation: tablog-route-finish 420ms var(--motion-ease); }
  .filetree-backdrop { display: none; }
  @media (max-width: 960px) {
    .main-row { flex-direction: column; }
    .editor-body { flex: 1; }
    .primary-sidebar { position: fixed; top: ${({ theme }) => theme.variables.titleBarHeight + 40}px; bottom: ${({ theme }) => theme.variables.statusBarHeight}px; left: 0; width: min(320px, 90vw); z-index: 70; border-right: 1px solid ${({ theme }) => theme.colors.editor.line}; box-shadow: 6px 0 20px #0004; }
    .sidebar-resize { display: none; }
    .filetree-backdrop { display: block; position: fixed; top: ${({ theme }) => theme.variables.titleBarHeight + 40}px; left: 0; right: 0; bottom: ${({ theme }) => theme.variables.statusBarHeight}px; width: 100%; background: #0006; z-index: 65; border: 0; }
    &:not([data-mobile-ready]) .primary-sidebar, &:not([data-mobile-ready]) .filetree-backdrop { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .route-signal[data-navigation]::after { animation: none; } }
`
