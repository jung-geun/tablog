# Tablog

> Write in Notion. Explore through a tabbed, VS Code-style workspace.

**[Personal-site example · pieroot.xyz](https://pieroot.xyz)** · [한국어](README.md) · [Setup and operations](docs/USAGE.md) · [Features](docs/FEATURES.md) · [Architecture](project.md) · [Design](DESIGN.md)

Tablog presents Notion publications through a **read-only, VS Code-style workspace** with tabs, Explorer, search, and Outline. Preview · Source · Split share the same reading workspace, and client-side navigation keeps open tabs. It is a dynamic Next.js Pages Router application with ISR, not a static-export-only template, terminal emulator, or code editor.

## Screenshots

**Captured on 2026-10-21.** These examples were captured from the current source running locally with real Notion publications. The `pieroot log` title, profile, articles, and counts belong to a personal-site configuration; they are not bundled sample content or the product name.

![Tablog Welcome in One Dark Pro Mix, with real article thumbnails, series, and Explorer](assets/screenshots/2026-10-21/welcome.png)

<details>
<summary>Search · Split · Series · About · Graph · Mobile</summary>

### Search
`tag:openstack` results with actual article thumbnails. Search covers titles, summaries, tags, and categories, not full article bodies.

![Tag-filtered publication results and real thumbnails in Tablog Search Editor](assets/screenshots/2026-10-21/search.png)

### Preview · Source · Split
Light Modern displays a rendered Notion table beside its GFM Markdown source. Wide tables, code, and source scroll inside their own regions.

![Tablog Split in Light Modern, showing a Notion table and its Markdown source](assets/screenshots/2026-10-21/split.png)

### Series
Reading order, real post titles, summaries, dates, and thumbnails.

![Actual research-paper thumbnails in a Tablog series](assets/screenshots/2026-10-21/series.png)

### About and activity
Entries, series, tags, estimated words, and writing/GitHub calendars built from Bklit UI Heatmap source.

![The four About statistics and Bklit-based writing and GitHub heatmaps](assets/screenshots/2026-10-21/about.png)

### 3D knowledge graph
Neutral post spheres, green tags/series, degree-based sizes, and faint edges. This example uses relationship layout; embedding readiness is reported separately in the UI.

![Three.js graph of actual Tablog post, tag, and series relationships](assets/screenshots/2026-10-21/graph.png)

### Mobile reading mode
A real document at 390px. Narrow editors switch between Split panes, while reading mode hides sidebars and panels.

<img src="assets/screenshots/2026-10-21/mobile.png" alt="Tablog mobile reading mode at 390px" width="390" />

</details>

## Features

### A reading workspace, not simulated development tools
Command Center, Activity Bar, resizable sidebars, Open Editors, tabs, Outline, and References/Comments perform real blog actions. Explorer shows the configured workspace name above its sections and real post titles rather than URL slugs. Settings has one Activity Bar entry, also reachable by command. The `SSH:`-style badge reports the requester's address; it does not open an SSH session.

One Dark Pro Mix is the default. Visitors can choose Dark Modern, Light Modern, or live System mode; their saved preference overrides `CONFIG.blog.theme`. Material Icon Theme file icons and Codicons retain their upstream attribution.

### Quick Pick, preview tabs, and publication search
`Cmd/Ctrl+K` opens Quick Pick; `Cmd/Ctrl+Shift+P` or `>` searches commands, and `@` searches the current document's headings. Explorer single click previews and double click or **Keep open** pins. Reorder with drag or arrow buttons; `Alt/Option+W` closes a post and `Alt/Option+Shift+T` reopens it. Browser close shortcuts are not intercepted.

Pinned tabs and recently closed posts persist only after consent; preview tabs and article bodies never do. `/search?q=...` shares title, summary, tag, and category searches. Welcome, Search, and Series use actual post thumbnails when available.

### Connected Preview, Source, and Split
The initial HTML includes the real Notion article. Source lazily loads original Markdown and line numbers. Split synchronizes matched headings; dragging a text/block selection highlights the corresponding area and reveals it in the opposite pane. Ordinary scrolling does not continuously lock the two panes together.

Preview, Source, Outline, and panels scroll independently within a viewport-bounded shell. Tables export as GFM Markdown; wide tables and code/source use local horizontal scrolling. Narrow editor widths place Outline above the article and switch between Preview/Source panes.

### Explicit, on-device translation
The globe inside the article's top-right corner and **Translate: Article language…** in Quick Pick open the same controls. Translation uses the browser's **Translator API**, without assuming a particular model or calling a cloud fallback. Supported non-Korean browser locales receive a suggestion, never automatic translation; model download and sentence-by-sentence translation require the reader's request.

Preview, Source, Outline, and heading search share one translated snapshot. Cancel keeps completed passages; Restore original restores the original document. Code, equations, and link destinations are preserved. Short text-recomposition motion is skipped during selection or reduced motion. **Markdown copy/download and public `.md` exports always remain original.**

### Relationship graphs and activity heatmaps
The **Three.js 3D graph** explores actual post, tag, and series relationships. Opaque neutral post spheres and green tag/series spheres grow with connection count; faint neutral edges show arrows on hovered/selected connections. Every node participates in repulsion and collision forces. Available document-vector PCA positions act as weak anchors, not fixed coordinates, so releasing an Alt/Option-dragged node does not snap it back.

Name search and relationship layout are separate from Meaning/similar-post search. Semantic features require **Qdrant, the public `google/embeddinggemma-2` model, and indexed documents**; unconfigured/pending states remain explicit. Successful content initialization is not proof of completed indexing. Ontology is a separate entity/relation view with optional Anthropic extraction.

Writing and GitHub calendars use **vendored Bklit UI Heatmap source**. The 3D graph and ontology were not replaced with Bklit. Original counts, contribution levels, and dates remain distinct, and small screens scroll within the calendar.

### Durable publications and incremental synchronization
Notion webhooks and a 15-minute host reconciliation cron update changed publications and affected routes. The durable publication registry is separate from expiring caches; slug changes retain a 308 redirect. Compose uses dedicated AOF Redis, while native single-host development uses `.content-state`.

The Docker entrypoint starts the standalone Node server, then calls `/api/init` to prepare publications and public routes. First initialization, media acquisition, and model backfill take time. GitHub Actions scheduling is a best-effort backup, not a propagation guarantee. The Notion image proxy refreshes expiring URLs and provides in-flight deduplication and a disk cache.

Comments, visitor statistics, analytics, and advertising are opt-in integrations. Ads separate overlay-only Auto mode from explicitly configured manual slots; missing requirements keep them inactive. Source configuration does not change Google account settings or prove filled ad delivery. See [operations](docs/USAGE.md) for prerequisites and account checks.

## Stack

| Area | Technology |
|---|---|
| Application | Next.js 16 Pages Router, ISR, standalone · TypeScript 6 · React 19 |
| UI and data | Emotion · Tailwind 4 · TanStack Query v5 · official Notion SDK · react-notion-x |
| Charts and graphs | Bklit UI Heatmap source · visx · Three.js · d3-force-3d · d3-force |
| Persistence | Dedicated content Redis/AOF or native file store · cache Redis · Qdrant |
| Verification and delivery | Jest 30 · ESLint · Docker Compose · Linux/amd64 GHCR workflow |

## Getting Started

### 1. Prerequisites and Notion

- **Node.js 22 or 24 LTS**, **Yarn 1.22.22**, and Git. If Yarn is unavailable, run `corepack enable`, then `corepack install` in the cloned checkout. Install Yarn 1.22.22 separately if your Node distribution does not include Corepack.
- Server deployment requires **Docker Engine or Docker Desktop with Docker Compose**. The full stack includes CPU embeddings; the production image target is `linux/amd64`, so ARM hosts need amd64 emulation for the embedding service.
- Duplicate the [Notion blog template](https://www.notion.so/pieroot/blog-assets-35a067c015d080a0bf17d3a0dffb3784) into your workspace.
- Create a read-enabled Internal Integration at [Notion Integrations](https://www.notion.so/my-integrations), then connect it through `... → Add connections` on the duplicated **original `blog-table` database**, not a linked view.

### 2. Connect content with two inputs

```bash
git clone https://github.com/jung-geun/tablog.git
cd tablog
yarn install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
```

You may also [fork Tablog](https://github.com/jung-geun/tablog/fork) and clone your fork. Fill these two values in the repository-root `.env`:

| Input | Source |
|---|---|
| `NOTION_TOKEN` | Your Internal Integration token |
| `NOTION_DATASOURCE_ID` | The full URL of the original duplicated `blog-table` database, or a known data-source UUID |

```bash
yarn setup
```

`yarn setup` resolves the database URL to a data-source UUID, generates `REVALIDATE_SECRET` when it is empty, and restricts `.env` to `0600`. Existing keys are preserved on reruns. If the database has multiple data sources, select one of the listed UUIDs explicitly. The command reads the checkout's `.env`, not `.env.local` or same-named shell variables.

Comments, visitor statistics, advertising, Analytics, search-engine verification, Utterances, Anthropic, and proxy authentication are optional. Their databases and service IDs are not required for basic use. Native development uses `.content-state`; Compose configures a separate AOF-backed content Redis.

**Notion images and thumbnails also require `COMMENT_HASH_SALT`.** The image proxy uses it for IP-based rate limiting even when comments are disabled. `yarn setup` generates it only when a comments data source is configured. Otherwise generate it once with the following command, put the result in `.env` as `COMMENT_HASH_SALT`, and preserve it. Never commit or publish the real secret.

```bash
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

### 3. Run locally

```bash
yarn dev
```

Open `http://localhost:3000`. Native development can display articles without Qdrant or the embedding service; use the full Compose stack for semantic search and embedding coordinates. Customize your site title and profile in `site.config.js`. The personal site shown here remains **pieroot log** at **pieroot.xyz**; that identity is distinct from the Tablog product name.

### 4. Deploy from source with Docker Compose

**Existing installations:** your checkout directory does not need to move. If you rename it or use a new path with existing data, pin `COMPOSE_PROJECT_NAME` to the **original** Compose project name before running any Compose command there (for example, `monolog` only if that was the original value). Preserve existing volumes and mounts; do not rename/delete them or use `docker compose down -v`. See the [rename and data-preservation instructions](docs/USAGE.md#기존-설치의-이름-변경).

Before a public build, set `NEXT_PUBLIC_SITE_URL` in `.env` to your actual HTTPS origin, such as `https://notes.example.com`. Canonical URLs, RSS, sitemap, and request-origin checks depend on it. Changing the public URL requires a rebuild; keep the localhost default for local-only use.

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 2400
docker compose ps
docker compose logs -f blog embedding
```

This builds the web and embedding images from source without access to this project's private GHCR packages. Redis, content Redis, Qdrant, and embeddings stay on the internal network; only the web port 3000 is exposed. Initial startup downloads about 1.49GB of public model weights and runs real CPU readiness inference. The blog entrypoint calls `/api/init` to prepare published content and routes.

Short readiness inference and full-document embedding backfill have different memory requirements. OOM exits were observed during long-document backfill in a shared 8GiB Docker VM. If the model restarts or maintenance returns `503`, `pending`, or `failed`, provide sufficient memory before retrying. `/api/init` success alone does not establish embedding completion. See [embedding operations](docs/USAGE.md#embeddinggemma--qdrant--ontology).

Configure DNS and an HTTPS reverse proxy separately. `TRUSTED_PROXY_HOPS=0` ignores forwarded IP headers by default. To trust a proxy, set the correct hop count and `TRUSTED_PROXY_SECRET`, and make the proxy overwrite **`X-Monolog-Proxy-Secret`** with that secret. The header deliberately keeps its existing name; never forward a client-provided value. Keep private storage/model services off public ports.

### 5. Reconcile Notion changes on Linux

The host needs Bash, curl, `flock` (util-linux), and cron. From the checkout, perform the initial maintenance/backfill, then edit the deployment account's existing crontab:

```bash
bash scripts/reconcile-content-host.sh
pwd
crontab -e
```

Preserve existing jobs and add the following line only if this installation does not already have one. Replace `/absolute/path/tablog` with your actual checkout path, including an old path you chose to keep:

```cron
*/15 * * * * /bin/bash "/absolute/path/tablog/scripts/reconcile-content-host.sh" 2>&1 | /usr/bin/logger -t tablog-content-sync
```

The script reads its own checkout's `.env` and calls the local port 3000 without putting the bearer token in cron. Inspect actual scheduled runs with `journalctl -t tablog-content-sync --since today --no-pager`; registering cron is not proof that it ran. Keep GitHub Actions scheduling as a best-effort backup, not a propagation guarantee.

## Docker image paths and publication

The workflow derives image names from `github.repository`: this repository uses `ghcr.io/jung-geun/tablog` and `ghcr.io/jung-geun/tablog-embedding`. Repository redirects do **not** alias GHCR packages. Before pulling, verify that the desired tag was actually published and that your deployment account has package access. A repository rename alone is not an image publication or deployment; source builds do not need this project's GHCR package access. Keep existing production image pins until a verified replacement is available.

| Tag | Workflow trigger |
|---|---|
| `latest` | Push to `main`, or a `v*` release tag |
| `X.Y.Z` | Push of the corresponding `vX.Y.Z` tag |

Production images target `linux/amd64`. Before replacing existing services, preserve rollback images and back up the content Redis AOF, cache Redis data, Qdrant snapshots, model cache, `.env`, and Compose overrides. See [full operations instructions](docs/USAGE.md) for published-image rollout, optional integrations, runtime-vs-build settings, and data-preserving maintenance.


## ❓ FAQ

<details>
   <summary>View FAQ</summary>

   **Q1: After creating avatar.svg, how do I create favicon.ico and apple-touch-icon.png?**

   A1: Refer to https://www.favicon-generator.org/.

   **Q2: Do I need to manually configure the sitemap file?**

   A2: The system automatically generates sitemap.xml, so you don't need to configure it manually.

   **Q3: Why don't Notion posts update automatically?**

   A3: Configure the Notion webhook and the host cron reconciliation described above. Inspect their actual responses and pending/failed work. GitHub Actions schedules can be delayed or skipped; ISR timing alone is not a guarantee of content propagation.

   **Q4: What should I enter for NEXT_PUBLIC_GOOGLE_MEASUREMENT_ID and NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?**

   A4: Use your own Google Analytics measurement ID and Search Console verification value, or leave them unset to disable those integrations. They are public runtime values supplied through the container environment. See [environment settings](docs/USAGE.md) rather than copying another site's IDs.

   **Q5: The Docker container won't run.**

   A5: Run `docker compose config --quiet`, then inspect `docker compose ps` and `docker compose logs blog embedding`. Complete the two-input content setup first; proxy credentials are required only when proxy trust is enabled. For comments, use the comments data-source UUID, not the database ID. Model readiness can take time and needs sufficient memory; do not delete volumes to resolve startup problems.

   For other issues, open a report in [Tablog Issues](https://github.com/jung-geun/tablog/issues) without sharing tokens, salts, or `.env` contents.

</details>

## 🤝 Contributing

Please check the [Contributing Guide](.github/CONTRIBUTING.md).

## 📄 License

Tablog follows the [MIT License](LICENSE) and originated from [morethan-log](https://github.com/morethanmin/morethan-log) by [morethanmin](https://github.com/morethanmin). Preserve the original copyright/license and the individual licenses for bundled assets.