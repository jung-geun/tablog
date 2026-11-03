# Tablog Design System

Tablog is a VS Code-themed, Notion-powered blog with a read-only publishing workspace. The document remains the primary content; editor controls perform real blog actions. It is not a terminal, Git client, or remote SSH session: the status bar's `SSH:`-style badge displays the actual requester address, not an SSH connection.

See the [project overview](README.md) · [English](README.en.md), [feature reference](docs/FEATURES.md), [setup/operations guide](docs/USAGE.md), and [implementation/maintenance map](project.md). The canonical repository is [jung-geun/tablog](https://github.com/jung-geun/tablog). Product identity is separate from the operator's configured workspace title, profile, and domain.

## Color themes

The theme catalog in `src/styles/colors.ts` is the source of truth for exact colors, upstream references, and license notices.

| Preference | Appearance |
| --- | --- |
| `one-dark-pro-mix` | One Dark Pro Mix; initial operator default |
| `dark-modern` | VS Code Dark Modern |
| `light-modern` | VS Code Light Modern |
| `system` | Dark Modern or Light Modern, following the device live |

`CONFIG.blog.theme` selects the operator default. A valid visitor preference in `monolog.colorTheme` overrides it. Invalid defaults fall back to Mix; unavailable local storage does not prevent switching for the current visit. The old binary `scheme` cookie is not a preference source.

`_document.tsx` emits the catalog CSS and an early bootstrap before application rendering. Only the HTML root owns `data-color-theme`, `data-theme` (dark/light compatibility), and `data-theme-preference`. Never add stale server-rendered theme attributes to descendant wrappers. `useColorTheme()` subscribes to visitor, storage, and system changes; `useScheme()` is derived, read-only compatibility for binary third-party renderers.

### Planned: legacy orange accent

Restore the earlier orange accent as a separately selectable theme in a future change. This is not implemented or included in the current theme catalog. Keep the existing default and saved visitor choices unchanged; use the same named-theme tokens, Settings, and Quick Pick rather than a separate styling path.

### Token contracts

| Consumer | Contract |
| --- | --- |
| Emotion / CSS | `theme.colors.editor.*` references `--editor-*` CSS variables |
| Canvas / Three.js | `theme.colorTheme.editor.*` supplies real hex colors, not `var(...)` |
| Tailwind | `--c-*` RGB tuples feed semantic utilities through `@theme inline` |
| Prism / Markdown | `--syntax-*` follows the selected named theme |
| Notion renderer | Shared `--fg-color`, `--bg-color`, and `--theme-colors-*` |

`editor.bg` is the document/editor canvas; `editor.bg2` is chrome/sidebar; `editor.bg3` is an elevated/hover surface. `--c-card` maps to the editor and `--c-chrome` to chrome. Keep borders, active tabs, selections, inputs, syntax, and diagrams in the same named theme. Do not branch on dark/light to hard-code a second surface palette.

## Typography and icons

- `--font-ui`: native sans UI stack for title bar, activity controls, Explorer, tabs, settings, lists, and Quick Pick. Compact 11–13px control text.
- `--font-sans`: Pretendard reading text and article titles. Article text remains 15–16px with generous line height; it is not a monospaced source editor.
- `--font-mono`: JetBrains Mono for code, real source line numbers, frontmatter, and technical metadata.
- `WorkbenchIcon` uses the existing `react-icons/vsc` Codicons for operations and custom editors.
- `FileIcon` uses an unmodified subset of Material Icon Theme 5.39.0. SVGs and MIT attribution live under `public/icons/material/`.
- No Unicode approximations for file/control icons. Content-authored emoji and Notion colors remain content, not chrome decoration.

## Workspace structure

`RootLayout` supplies the theme. `EditorShell` composes `RouteChromeProvider` and `WorkbenchProvider`, then the shell, Settings, and Quick Pick inside those contexts.

| Region | Behavior |
| --- | --- |
| Title bar | Configured workspace name, browser history, Command Center, primary/secondary sidebar and bottom-panel toggles; no duplicate Settings button or simulated window controls |
| Activity bar | Switches Explorer / Search / Knowledge without replacing the document; command and reading controls, plus the single visible Settings button at the bottom. Preferences commands open the same settings panel |
| Primary sidebar | Independently scrollable; resizable from 180–420px using pointer or keyboard |
| Explorer | Workspace title at the top; independently collapsible Open Editors and Files, recent/open posts, categories, nested series, configured projects, public files. Post/member rows show real article titles while icons, tab filenames, and URLs keep their original identities. Separators occur between sections only, leaving a blank tail below short content |
| Editor tabs | Active state, transient italic preview, pin, close/reopen, reorder, touch-friendly actions |
| Document toolbar | Breadcrumbs, Preview / Source / Split, reading mode, Outline/panel toggles, Markdown actions |
| Secondary sidebar | Collapsible Outline and Series using real document anchors |
| Bottom panel | References and Comments; no fake Problems, Output, or terminal console |
| Status bar | Requester-IP `SSH:`-style badge, document kind, view/reading position, actual local-tab-storage state. Lookup shows connecting/unavailable states; it does not open SSH or claim a Git branch or server sync |

The shell is viewport-bounded at every size. Document routes allocate remaining space through the route wrapper into PostWorkspace; Preview, Source, Outline and the bottom panel each own scrolling. Generic routes retain `.page-content` scrolling. `getReadingScrollRoot()` follows the visible pane across mode switches, resizing and asynchronous content for progress, outline, Top and history restoration. No fixed viewport subtraction may size a Split pane; chrome height includes consent controls and wrapping toolbars.

At ≤960px the primary sidebar is a closed-by-default drawer; its state is independent of the desktop preference. Document layout uses the actual editor container width: below 1100px, Split shows one pane with Preview/Source buttons and Outline occupies a bounded row above the article. At wider editor widths, Outline is a 224px right rail beside the document. Heading navigation reveals Preview if the anchor is hidden. Panels take allocated space rather than overlaying article text. Lists use `minmax(0, 1fr)` and shrinkable text to prevent long-title overflow.

`src/layouts/RootLayout/EditorChrome/{TitleBar,ActivityBar,FileTree,StatusBar,SettingsPanel}.tsx` implement the chrome surfaces. The badge fetches same-origin `/api/ip` with no-store caching. `src/pages/api/ip.ts` returns `private, no-store` data using the existing authenticated proxy-hop rules; forwarded headers are not trusted without that contract. The raw address is not part of saved tab history or browser translation requests.

## Tabs and storage

- Explorer single click opens/replaces one transient preview; double click or **Keep open** pins it. Ordinary article navigation is permanent.
- Only pinned tabs and the closed-post list are persisted after affirmative consent. Never persist a preview, article body, or search history through the tab-storage feature.
- Welcome retains the stable `readme` identity; saved legacy `README.md` labels can be restored.
- Reordering never navigates. Modified link clicks retain browser behavior. `Alt/Option+W` and `Alt/Option+Shift+T` are app shortcuts; browser `Cmd/Ctrl+W` and `Cmd/Ctrl+Shift+T` are not intercepted.
- Storage denial/revocation must leave the in-memory session and reading available. Theme preference is separate from tab-history consent.

## Document design

The first response contains the actual SSR article. Do not make preview rendering depend on client editor loading.

- Compact breadcrumbs precede the title. Frontmatter is collapsed by default; the title and summary precede a reduced cover.
- Preview uses the existing Notion renderer and code-copy behavior. Source normally lazily fetches the canonical Markdown export and its source map. While translated, Source projects the exact Preview snapshot through the same client-safe serializer; Outline and heading Quick Pick derive from that snapshot too. Copy/download/public `.md` always remain canonical original content.
- Source requests cancel on unmount/route changes. Errors remain visible with Retry and the original export link; never substitute a fabricated source.
- Split heading synchronization uses stable Notion heading IDs. Drag selection connects exported block/row line spans and highlights exact matching text when possible; it does not continuously lock the two panes by arbitrary source line.
- Notion tables serialize as GFM pipe tables in real column order, including empty cells, inline formatting, and row/block source spans. Preview tables own horizontal overflow; long Markdown lines scroll inside Source, not the whole workspace. `src/libs/utils/notion/markdown.ts` supplies original and translated serialization.
- `PostWorkspace.tsx` caps the Preview body at 880px (900px in reading mode), with up to 32px horizontal padding, 20px in Split, and 16px in narrow editor containers. Do not derive document width or Split availability from the browser viewport alone.
- Reading mode hides primary/secondary sidebars and the panel without changing the route.
- References distinguish direct links/mentions, same-category articles, and AI-inferred similarity. Missing data is not an invented relationship.
- Translation controls are absolutely positioned at the top-right **inside `.document-main`**, outside article flow but bounded to the Preview/Source area; the suggestion and language panel open below the globe. They do not cover Outline, the bottom panel, or status bar; the popover scrolls internally when height is limited. Host-side geometry of bottom-fixed AdSense units reduces the overlay's available height as ads appear, resize, or disappear; served ads and their frames are never modified. API/locale detection may offer translation for a non-Korean browser language without creating a model. Only an explicit **Translate article** click calls `Translator.create()` and starts model preparation/translation. Support depends on the browser, secure context, and language pair; unavailable support keeps the original readable. Never assume a model family or silently call a cloud fallback.
- Recomposition motion changes presentation only for changed visible text, never React-owned text nodes or block IDs. It is skipped during selection and reduced motion; preference changes cancel in-flight effects.
- Comments mount lazily and remain mounted after first opening while panel tabs are switched. Changing the document resets the panel content.
- About uses the same document workspace and retains its activity, contribution, technology, and contact widgets in collapsible sections.

Implementation: `src/routes/Detail/index.tsx`, `src/routes/Detail/PostDetail/{PostWorkspace,MarkdownSource,RightRail,DocumentPanel,ArticleTranslationControls,useArticleTranslation}.tsx` and `{articleTranslation,translatedMarkdown,useSplitSelection}.ts`. Translated snapshots stay in visit memory; code, formulas, URL destinations, and canonical exports remain original. Cancellation may leave already translated sentences visible until **Restore original**.

## Welcome, Search, and knowledge

Welcome is a compact Start / Recent / Series surface with real publication data, not a marketing hero. Graph and Ontology are custom editors rather than fake Markdown files.

Quick Pick opens with `Cmd/Ctrl+K`; `Cmd/Ctrl+Shift+P` starts command mode. `>` filters real commands, including individual named themes. `@` searches the current document's actual headings. Default search finds files, tags, and categories. Arrows/Enter/Escape work; focus returns to the opener. The surrounding page is not blurred.

Search Sidebar and the shareable `/search?q=...` Search Editor share the same matcher. Supported fields are title, summary, tags, and category, including `tag:"kolla ansible"` and `category:"Computer Science"`. Do not label summary matching as full-body search. Keyboard arrows focus real result links; Enter opens, Escape clears/exits. Sort multilingual server-rendered lists with an explicit locale.

Welcome Recent, Search Editor/Sidebar, and series lists use actual post thumbnails when present, retaining file/folder fallbacks otherwise. Narrow layouts reduce thumbnail size rather than replacing real imagery with generated artwork.

Graph uses Three.js and `d3-force-3d`; Ontology remains a separate custom editor. Ontology distinguishes loading, unavailable, and empty data, with a link to the knowledge graph rather than a backend command.

### Graph appearance and interaction

- `src/routes/Graph/GraphScene.tsx` renders unlit opaque spheres: neutral posts (`#5c5c5c`, brighter `#b8b8b8` on dark backgrounds) and green tag/series hubs (`#18b94f`). `src/libs/utils/graph.ts` owns the shared display palette; categories are metadata/highlighting, not node colors. The per-document SVG graph reuses this palette but is not the Three.js renderer.
- Every kind scales by degree: `graphNodeRadius()` in `src/routes/Graph/types.ts` uses `4.5 + min(13.5, sqrt(max(0, degree)) × 1.6)`. Faint neutral edges use alpha 0.28, weight-scaled thickness, and dashed semantic relations. Arrowheads (alpha 0.32) appear only on directed links incident to the hovered/selected node, not across the entire graph. Details retain relation type, direction, context, confidence/rationale or cosine score.
- `src/routes/Graph/layout3d.ts` applies link forces, repulsion, and collision to **all** nodes. Available 3D PCA projections are weak semantic anchors, not fixed coordinates; nodes without embeddings use relationship/category placement. Alt/Option-drag temporarily pins a node in the camera plane. Release clears XYZ constraints and resumes from its current position; there is no snap back to PCA coordinates.
- Camera controls are rotate, pan, and zoom (touch rotate/pinch/pan); camera drags are not selection clicks. Keyboard-accessible labels and the detail panel expose direct neighbors. Connections only and Focus node use actual one-hop neighbors, not category similarity. Reduced motion stops directional particles and camera interpolation; missing/lost WebGL reports failure instead of substituting a fake successful graph.
- Relationship layout remains usable when embeddings are pending or unavailable. `src/routes/Graph/index.tsx` shows pending or embedded/total status and enables Meaning search only when `embedding.searchAvailable` is true. `src/hooks/useNotionGraphQuery.ts` re-fetches stale graph responses every three seconds while foregrounded; this does not promise that indexing has completed. PCA proximity and cosine similarity are inferred, not explicit citations, and shared tags/series do not manufacture post-to-post reference edges.

### About statistics and activity

The shared document workspace composes About widgets in `src/routes/Detail/PostDetail/index.tsx`. `src/routes/Feed/StatsGrid.tsx` displays exactly **entries, series, tags, words**. Categories are not a fifth field; `words` is a title/summary-based estimate from `src/libs/utils/stats.ts`, not a full-body count.

Only the writing and GitHub calendars use vendored **Bklit UI Heatmap** registry source. `src/routes/Detail/PageDetail/components/ActivityCalendar.tsx` composes the actual chart/cells/axes/tooltip/legend, with MIT attribution, upstream URLs, and registry/source hashes preserved in `src/components/charts/LICENSE` and source headers. Three.js graphs, SVG mini-graphs, custom Ontology, and Mermaid are separate renderers.

Both calendars have 52 week columns × 7 Sunday–Saturday rows, UTC dates, exact-count tooltips, keyboard cell navigation, and local horizontal scrolling with a 680px minimum chart width. The writing grid (`activityGrid.ts`) starts on the Sunday at/before the ISR query date minus 52 weeks and displays 364 days; do not call it a calendar ending today. Its activity thresholds are 1/2/4/6 posts. `GitHubContributions.tsx` aligns to the latest returned date's week and preserves GitHub's 0–4 color levels separately from exact counts. `ActivityCalendar` maps levels directly to theme colors, so low nonzero activity does not collapse into the empty-cell color. The server's GitHub annual total need not equal the visible 364-cell sum. Missing GitHub configuration hides that widget; fetching/error states do not invent activity.


## Surfaces, motion, and accessibility

- Flat 1px boundaries and role-based surfaces; no gradients, ambient glow, or decorative card rails. Modest shadows are reserved for floating menus/dialogs/drawers, not every content row.
- Small radii on controls/Quick Pick; no dashboard-style oversized cards around articles.
- Keep visible keyboard focus, named icon buttons, actual checked/pressed/selected states, native checkbox geometry, dialog focus containment, and a skip-to-document link.
- Source line numbers are not implied preview line numbers. Do not add a minimap that cannot map to the actual document.
- Keep existing content visible during routing. Entry motion is skipped for history, anchors, and revisited documents. `prefers-reduced-motion` disables decorative movement and uses immediate heading navigation.
- Notion author colors are scoped to content; they must not override workspace theme roles.

## Advertising boundary

Automatic advertising is overlay-only: operators must keep Auto ads ON, disable in-page Banner/Multiplex and text ad-intent links/chips, and turn site Auto optimize OFF in AdSense before setting the explicit in-page-disabled confirmation. Auto mode never renders manual units. Account settings are not applied or verified by this source.

Manual mode instead requires actual display-unit IDs and explicit account Auto ads OFF confirmation. Its slots may follow eligible complete top-level code/equation blocks (`article`) or article content (`postBottom`), never split a block or its caption. Do not put slots in the activity bar, tabs, Explorer, Outline, or panel controls. Missing mode requirements render no SDK, slots, or empty space.

Neither undocumented attributes nor CSS hiding/removing served ads can enforce account settings. Excluded areas are not a substitute for disabling in-page formats or configuring overlays. See `docs/USAGE.md` for account procedures and separate runtime evidence requirements; configuration alone is not proof of ad delivery.

## Change verification

For theme/layout work, exercise the real application at desktop and mobile widths: named themes and reload, System changes, no hydration mismatch, keyboard search, preview→pin→reorder/close/reopen, consent revocation, article/source/split, anchor/history scroll, panel switching, and graph geometry. Tests protect state and parsing boundaries; they do not replace visual browser proof.
