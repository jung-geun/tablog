# Tablog 아키텍처·개발 참조

**Tablog**는 Notion에서 글을 발행하고 VS Code 스타일의 읽기 전용 작업 공간에서 탐색하는 블로그입니다. 저장소는 [jung-geun/tablog](https://github.com/jung-geun/tablog), JavaScript 패키지는 `tablog`입니다. `site.config.js`의 개인 사이트 제목 `pieroot log`와 도메인 `pieroot.xyz`는 제품 이름과 별개입니다.

이 문서는 소스의 책임과 유지보수 진입점을 설명합니다. 설치·운영·기존 데이터 보존은 [docs/USAGE.md](docs/USAGE.md), 사용자 기능은 [docs/FEATURES.md](docs/FEATURES.md), 변경 이력은 [docs/CHANGELOG.md](docs/CHANGELOG.md)를 참고하세요. 아래 구조는 실행 가능한 구현 설명이지 특정 사이트의 배포·색인 완료를 뜻하지 않습니다.

## 1. 실행 모델과 개발 시작

- Next.js 16 **Pages Router**, React 19, TypeScript 6 기반의 서버 애플리케이션입니다. 정적 export 전용 템플릿이 아닙니다. 버전의 정확한 범위·해결 결과는 `package.json`과 `yarn.lock`이 기준입니다.
- UI는 Emotion·Tailwind CSS 4, 서버 데이터 hydration은 TanStack Query v5를 사용합니다. 본문은 공식 Notion API 응답을 `react-notion-x`용 record map으로 변환합니다.
- 개발·CI·웹 이미지의 기준은 Node.js 22와 **Yarn Classic 1.22.22**입니다. 다른 잠금 파일이나 peer-dependency 우회 설치를 추가하지 않습니다.

### 네이티브 개발

새 checkout에서만 `.env.example`을 복사하고 Notion integration 토큰과 원본 데이터 소스를 설정합니다. 기존 `.env`를 덮어쓰지 마세요.

```bash
yarn install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
# .env의 NOTION_TOKEN, NOTION_DATASOURCE_ID를 실제 값으로 편집
yarn setup
yarn dev
```

`yarn setup`은 `scripts/setup-env.js`를 실행합니다. 데이터 소스 UUID 또는 복사한 Notion 데이터베이스 URL을 해석하고, 비어 있는 관리용 시크릿만 생성하며 기존 값은 보존합니다. integration에는 원본 데이터베이스 읽기 권한이 필요합니다. 런타임의 `NOTION_DATASOURCE_ID`는 선택한 **data-source UUID**여야 합니다.

Notion 이미지·썸네일의 프록시에는 댓글 UI가 비활성이어도 `COMMENT_HASH_SALT`가 필요합니다. 댓글 DB가 없으면 setup이 이 salt를 생성하지 않으므로 [이미지 프록시 전제](docs/USAGE.md#이미지-프록시)를 따라 한 번 생성해 비공개로 보관하세요.

기본 네이티브 개발은 `.env.example`의 `CONTENT_STATE_DIR=.content-state`와 메모리 캐시로 동작합니다. Redis·Qdrant·임베딩 서버 없이도 기본 읽기·탐색을 개발할 수 있습니다. 의미 검색까지 개발하려면 별도로 실행한 Qdrant·embedding 서비스 주소를 설정합니다. Compose 내부 호스트 이름을 네이티브 프로세스의 주소로 그대로 사용하지 마세요.

### Compose의 다섯 서비스

`docker-compose.yml`은 다음 서비스를 묶습니다. 소스 빌드 실행은 `docker compose up -d --build`이며, 기존 설치의 override·이미지 핀·Compose 프로젝트 이름이 있다면 먼저 운영 가이드를 따릅니다. 이미지 주소가 설정되어 있다는 사실은 해당 태그가 실제 게시되었거나 배포되었다는 증거가 아닙니다.

| 서비스 | 책임 | 보존 대상 |
| --- | --- | --- |
| `blog` | Next.js standalone 서버, API, 콘텐츠 동기화·ISR | `logs-data`, `image-cache` |
| `redis` | 공유 캐시·파생 상태 저장 | `redis-data` |
| `content-redis` | AOF를 사용하는 내구성 콘텐츠 레지스트리 | `content-redis-data` |
| `qdrant` | 게시글 벡터와 관계 그래프 스냅샷 | `qdrant-storage` |
| `embedding` | private CPU 임베딩 HTTP 서비스 | `embedding-model-cache` |

웹 이미지는 `Dockerfile`에서 빌드하고 `scripts/docker-entrypoint.sh`가 `node server.js`를 시작합니다. entrypoint는 공개 런타임 설정을 생성한 뒤 `/api/init`을 호출합니다. 초기 콘텐츠 워밍과 의미 색인 유지보수는 분리되어 있으므로 웹 healthcheck 통과나 init 성공만으로 전체 임베딩 완료를 판단하지 않습니다. embedding은 첫 모델 다운로드와 실제 추론 워밍 이후 준비 상태가 되며, Compose 설정은 이 서비스를 `linux/amd64`로 실행합니다.

## 2. 책임별 소스 지도

전체 파일 목록 대신 변경 목적에 맞는 진입점을 찾으세요.

| 변경 목적 | 진입점·책임 |
| --- | --- |
| 페이지·라우팅 | `src/pages/`: Pages Router, `getStaticProps`/`getStaticPaths`, 서버 응답·API |
| 화면별 구성 | `src/routes/Feed/`, `Search/`, `SeriesList/`, `SeriesArchive/`, `Archive/`, `Detail/`, `Graph/`, `Ontology/` |
| 공통 작업 공간 | `src/layouts/RootLayout/index.tsx`, `EditorChrome/EditorShell.tsx`: 테마, 사이드바, 탭, 패널, 문서 스크롤 |
| 탭·탐색 상태 | `EditorChrome/RouteChromeContext.tsx`, `tabSessionStorage.ts`, `TabBar.tsx`, `FileTree.tsx` |
| 문서 표시·명령 상태 | `EditorChrome/WorkbenchContext.tsx`, `src/components/CommandPalette/` |
| Notion API·변환 | `src/apis/notion-client/notionClient.ts`, `postModel.ts`, `getPosts.ts`, `getRecordMap.ts`, `getRecordMapDatabases.ts` |
| 게시 레지스트리·동기화 | `src/libs/content/`: `source.ts`, `index.ts`, `storage.ts`, `registry.ts`, `snapshot.ts`, `webhook.ts`, `notifications.ts` |
| 캐시·직렬화 | `src/libs/cache/`: L1 메모리, L2 Redis, 버전 키, 이미지 blob/file 캐시 |
| Query hydration | `src/libs/react-query/`, `src/constants/queryKey.ts`, `src/hooks/usePostsQuery.ts`, `usePostQuery.ts` |
| 본문·Markdown | `src/routes/Detail/components/NotionRenderer/`, `src/routes/Detail/PostDetail/`, `src/libs/utils/notion/markdown.ts` |
| 관계 그래프 | `src/apis/notion-client/buildNotionGraph.ts`, `getBuiltGraph.ts`, `graphDelta.ts`, `graphSnapshot.ts`, `src/libs/utils/graph.ts` |
| 벡터·의미 검색 | `src/apis/vector/`, `src/apis/llm/embeddingGemma.ts`, `services/embedding/` |
| 온톨로지 | `src/apis/ontology/`, `src/apis/llm/anthropicClient.ts`, `src/types/ontology.ts` |
| About 활동 차트 | `src/routes/Detail/PageDetail/components/ActivityCalendar.tsx`, `ActivityHeatmap.tsx`, `GitHubContributions.tsx`, `src/components/charts/` |
| 테마·스타일 | `src/hooks/useColorTheme.ts`, `src/components/ThemePicker/`, `src/styles/`, `RootLayout/ThemeProvider/` |
| SEO·공개 내보내기 | `src/libs/seo.ts`, `src/components/MetaConfig/`, `src/pages/sitemap.xml.tsx`, `rss.xml.tsx`, `src/pages/api/robots.ts`, `llms.ts` |
| 설치·컨테이너·CI | `.env.example`, `site.config.js`, `next.config.js`, `scripts/`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/` |

`EditorChrome/` 표의 경로는 모두 `src/layouts/RootLayout/EditorChrome/` 아래입니다. 문서 컨텍스트는 현재 route가 등록·해제하며, Quick Pick이 이미 떠난 문서의 명령을 호출하지 않도록 합니다. 탭은 실제 URL에 연결된 탐색 상태이지 파일 편집기가 아닙니다. 미리보기 탭·고정·이동·닫기·다시 열기를 제공하고, 탭 세션의 로컬 저장은 사용자 동의에 따릅니다.

## 3. 콘텐츠에서 HTML까지

### 게시 파이프라인

1. `notionClient.ts`가 `@notionhq/client`와 명시적인 Notion API 버전으로 접근합니다. `NOTION_TOKEN`은 서버 전용이며, 공식 `dataSources.query`와 pages/blocks API가 원본 데이터 소스입니다.
2. `src/libs/content/source.ts`가 메타데이터·소속 데이터 소스·상태·타입·slug를 검증합니다. `Public`, `PublicOnDetail`, `Private`와 `Post`, `Paper`, `Page`를 구별하고 예약 발행일·중복 slug를 처리합니다. `Private`는 공개 본문으로 발행하지 않습니다.
3. `reconcileContent`(`src/libs/content/index.ts`)가 락 안에서 증분 스캔, 주기적 전체 스캔, webhook 힌트 재확인, 본문 취득·해시 비교를 수행합니다. 검증된 메타데이터와 본문을 같은 레지스트리 revision으로 저장한 다음 ISR·그래프 작업을 처리합니다.
4. 본문 취득 실패가 기존 발행 본문을 빈 페이지로 대체하지 않게 하고, 삭제·비공개 전환·slug 변경·리다이렉트 이력과 미완료 작업을 레지스트리에 반영합니다. durable outbox가 요청 중단 후에도 남은 경로 갱신·그래프 작업을 재시도할 수 있게 합니다.
5. 공개 목록과 상세 읽기는 초기화된 레지스트리를 우선합니다. cold registry에서는 공식 API 취득 경로가 사용되지만, 초기화된 빈 목록은 권위 있는 결과입니다. 네트워크 오류를 정상적인 빈 사이트로 취급하지 않습니다.

`/api/init`은 cold 워밍과 경로 재생성에 집중하고 유지보수는 미룹니다. `/api/cron/content`는 임베딩·그래프 유지보수도 수행합니다. 응답의 `pending`, `failed`, `maintenancePending`, `notificationsPending`를 구분하세요. 본문 발행 성공과 모든 파생 작업 완료는 같은 상태가 아닙니다.

### 저장소 경계

| 계층 | 성격·유지보수 주의점 |
| --- | --- |
| Notion | 저작 원본. integration 권한과 데이터 소스 선택이 출발점 |
| `src/libs/content/storage.ts` | TTL 없는 발행 권위: 메타데이터·record map·revision·slug 이력·pending/outbox. `CONTENT_REDIS_URL` 또는 지속성 `CONTENT_STATE_DIR` 필수 |
| Content Redis | Redis 7.2+와 AOF 필요. 저장 승인에 `WAITAOF`를 사용하며 실패 시 파일/메모리로 조용히 대체하지 않음 |
| 로컬 content 파일 | 동일 호스트/PID namespace의 네이티브 개발용. fsync·원자적 저장·소유자 락 사용. 컨테이너 재시작/다중 호스트 공유 저장 대용이 아님 |
| `cacheStore` | 재계산 가능한 데이터의 L1 메모리·선택적 L2 Redis 캐시. 게시 권위를 TTL 캐시에 맡기지 않음 |
| Qdrant·ontology 상태 | 관계 스냅샷·벡터·추출 결과 등 파생 데이터. 캐시 Redis에는 만료 없는 ontology 상태도 있으므로 무분별한 전체 삭제는 비싼 재구축을 유발할 수 있음 |
| Next.js ISR·브라우저 Query | HTML과 공개 조회 데이터의 전달 계층. 콘텐츠 레지스트리의 대체물이 아님 |

제품 이름 변경을 이유로 기존 `CACHE_NAMESPACE`·`CONTENT_NAMESPACE` 기본값 `monolog`, 쿠키·탭 동의·테마 저장 키, 프록시/그래프 헤더, 폰트 이름을 일괄 변경하지 않습니다. 기존 checkout을 이동할 때 Compose 프로젝트 이름과 실제 볼륨 연결을 먼저 보존하세요. 볼륨 삭제나 기존 Redis의 AOF 전환을 단순 재시작으로 해결하지 말고 [운영 가이드의 이름 변경·데이터 보존 절차](docs/USAGE.md)를 따릅니다.

### 서버 렌더링과 hydration

- `src/pages/[slug].tsx`는 `getStaticPaths`의 **`fallback: "blocking"`**과 `getStaticProps`의 ISR을 사용합니다. 이미지 빌드에 Notion 인증 정보가 없어 생성되지 않은 글도 첫 요청에서 서버 생성 경로를 거칩니다.
- 본문 renderer의 핵심 `react-notion-x`, 코드 텍스트·KaTeX는 서버에서도 동기 렌더링합니다. PDF·modal 등 브라우저 의존 위젯과 Three.js 장면은 별도 client-only 경계입니다. 전체 본문을 client-only로 바꾸면 HTML·hydration 계약이 달라집니다.
- 서버는 요청/생성 작업마다 새 QueryClient를 만들고 공개 목록·상세·데이터베이스를 prefetch하여 `dehydrate`합니다. `_app.tsx`는 `HydrationBoundary`와 브라우저 공유 QueryClient를 연결합니다. 서버에서 브라우저 singleton을 재사용하지 않습니다.
- `prefetchFeedPosts.ts`가 Explorer·Quick Pick·피드의 공개 `Post`/`Paper` 목록을 공통 query key로 seed합니다. `usePostsQuery.ts`는 `/api/posts`를 통해 주기적·focus 시 메타데이터를 갱신하므로 사이드바 변경마다 모든 ISR 본문을 재생성할 필요가 없습니다.

## 4. 문서·내보내기·번역 경계

| 기능 | 구현과 경계 |
| --- | --- |
| Preview·Source·Split | `PostDetail/index.tsx`, `PostWorkspace.tsx`, `MarkdownSource.tsx`. 읽기 전용이며 좁은 문서 영역에서는 Preview/Source 전환 사용 |
| Markdown export | `src/pages/api/markdown/[slug].ts` + `src/libs/utils/notion/markdown.ts`. 공개 가능한 글만 조회하고 `/<slug>.md`로 노출. `?sourceMap=1`은 block ID·줄 범위가 포함된 문서 JSON |
| 원본 복사·다운로드 | `MarkdownActions.tsx`가 서버의 원본 Markdown을 사용. 번역된 표시 상태가 저작 원본·공개 export를 덮어쓰지 않음 |
| Split 동기화 | heading 기반 스크롤과 `useSplitSelection.ts`의 block ID 기반 선택 대응. 유일한 텍스트 대응이 있으면 정밀 강조, 모호하면 블록 강조. React 소유 DOM을 문자열로 재작성하지 않음 |
| 브라우저 번역 | `useArticleTranslation.tsx`가 내장 `Translator` API를 feature-detect. 명시적인 Translate 동작에서만 모델 생성/번역. 지원 브라우저·언어 쌍·권한·모델 다운로드 조건에 따라 사용 가능 |
| 번역 표시 | `articleTranslation.ts`의 문장/구절 계획으로 title·summary·본문 prose를 투영. 코드·수식·URL·참조 등 보호 대상은 유지. `translatedMarkdown.ts`는 같은 snapshot으로 Source를 표시하고 Outline도 번역 snapshot을 따름 |

브라우저 번역은 이 앱의 클라우드 번역 API나 서버 Anthropic 호출을 사용하지 않습니다. 취소 시 완료된 부분을 남길 수 있고 원본 복원은 진행 중 작업을 중단합니다. 문서·언어 변경과 unmount는 이전 작업을 무효화합니다. 번역 결과는 표시용 데이터로 다루며 Notion·Query 원본을 수정하거나 HTML 코드로 실행하지 않습니다. Source 강조는 원문을 escape한 Prism 토큰으로 생성합니다. 선택 강조의 세밀함은 CSS Highlight 등 브라우저 기능 지원에 따라 달라집니다.

## 5. 관계 그래프·임베딩·온톨로지

- **관계 그래프**: `buildNotionGraph.ts`가 공개 글 사이의 Notion 링크·참조 및 tag/series hub 관계를 추출하고 `getBuiltGraph.ts`가 레이아웃 데이터를 만듭니다. `graphDelta.ts`·`graphSnapshot.ts`는 변경 반영과 Qdrant 스냅샷 재사용을 담당합니다. 본문 References의 `PostEgoGraph.tsx`는 해당 글의 직접 연결만 보여주는 별도 SVG 뷰입니다.
- **3D 장면**: `src/routes/Graph/GraphScene.tsx`와 `layout3d.ts`의 Three.js·d3-force-3d 구현입니다. 문서 벡터의 3D 투영은 **약한 semantic anchor**이며 고정 좌표나 실제 관계의 대체물이 아닙니다. 노드들은 링크·반발·충돌 힘을 함께 받고 드래그 중에만 위치가 고정됩니다.
- **선택적 임베딩**: `EMBEDDING_SERVICE_URL`과 접근 가능한 Qdrant가 필요합니다. `embeddingGemma.ts`는 고정된 `google/embeddinggemma-2` 모델·revision·768차원 unit-normalized 응답 계약을 검사합니다. `postEmbeddings.ts`는 콘텐츠 유지보수 중 권위 있는 본문에서 색인하고 `graphEmbeddings.ts`는 현재 유효한 벡터만 붙입니다. 관계 JSON 요청 자체가 전체 문서 추론을 수행하는 구조가 아닙니다.
- **준비 중 상태**: 임베딩이 없거나 서비스가 불가하면 관계 그래프는 유지할 수 있고, 의미 anchor/search에는 pending·가용성 상태가 표시됩니다. `/api/similar`는 해당 글 벡터가 없으면 `202 ready:false`, `/api/graph/search`는 미설정·서비스 장애 시 `503`을 반환합니다. 빈 검색 결과를 전체 색인 완료로 해석하지 않습니다.
- **온톨로지**: `src/apis/ontology/`는 준비된 문서 벡터로 후보를 찾고 Anthropic으로 entity·방향성 관계·근거를 추출하는 별도 계층입니다. 실행에는 임베딩/Qdrant 외에 `ANTHROPIC_API_KEY`가 필요합니다. `/api/cron/ontology`로 갱신하고 `/graphs/ontology.json`은 아직 구축되지 않았으면 `202 ready:false`를 반환합니다. Meaning·유사 글 검색 자체에는 Anthropic 키가 필요하지 않습니다.

그래프 캐시 스키마·레이아웃 의미를 바꿀 때 `src/libs/cache/keys.ts`의 키 버전뿐 아니라 `src/apis/vector/qdrantGraphStore.ts`의 snapshot schema도 확인하세요. Qdrant snapshot을 먼저 읽는 경로가 있어 한 계층만 무효화하면 오래된 결과가 남을 수 있습니다.

About의 활동/기여 calendar만 **Bklit UI Heatmap registry 소스를 vendoring**하여 `src/components/charts/`에서 사용합니다. 이는 npm의 전체 Bklit 컴포넌트 제품군 설치나 3D/ontology renderer 사용을 뜻하지 않습니다. 실제 달력 데이터 연결은 `ActivityCalendar.tsx`에서 수행합니다.

## 6. 공개 경로와 관리 API

| 경로 | 역할 |
| --- | --- |
| `/`, `/search`, `/series`, `/series/[name]`, `/categories/[name]` | 피드·검색·시리즈·분류 탐색. `/search`와 Quick Pick의 메타데이터 검색은 의미 검색과 별개 |
| `/[slug]` | 공개 상세 문서. `CONFIG.aboutSlug`가 지정한 About도 Notion 문서 경로 |
| `/graph`, `/ontology` | 관계 탐색과 선택적 의미/ontology 표시 |
| `/api/posts` | 공개 피드 메타데이터 갱신, no-store |
| `/<slug>.md`, `/api/markdown/[slug]` | 원본 Markdown·Source용 source map |
| `/graphs/notion-graph.json`, `/graphs/ontology.json` | 관계/임베딩 상태와 구축된 ontology 전달 |
| `/api/graph/search`, `/api/similar` | 질의 임베딩 의미 검색·문서 벡터 유사 글; 준비 상태와 rate limit은 각 handler 기준 |
| `/api/image-proxy`, `/api/refresh-image`, `/api/attachment` | 이미지 프록시·서명 URL 갱신·공개 첨부 연결. 공개 글 소속/URL 검증 경계를 유지 |
| `/api/comments`, `/api/visits`, `/api/github-contributions` | 설정에 따른 Notion 댓글·방문 통계·GitHub 기여 조회 |
| `/api/ip` | 인증된 프록시 정책에 따른 요청자 IP 표시; private/no-store |
| `/sitemap.xml`, `/rss.xml`, `/robots.txt`, `/llms.txt`, `/api/og`, `/<IndexNow key>.txt` | 공개 검색·피드·기계 접근·메타데이터용 응답 |
| `/api/init`, `/api/revalidate`, `/api/cron/content`, `/api/cron/graph`, `/api/cron/ontology` | `REVALIDATE_SECRET` Bearer 인증이 필요한 운영 작업. 공개 조회와 분리 |
| `/api/notion-webhook` | Notion 검증 handshake 후 서명 검증 이벤트 수신. 이벤트는 재조회 힌트이며 주기적 reconciliation을 대체하지 않음 |

rewrite는 `next.config.js`, 개별 HTTP method·입력·캐시·오류 응답 계약은 각 handler가 기준입니다. 외부 프록시에서 `TRUSTED_PROXY_HOPS`만 늘리지 마세요. `src/libs/utils/security.ts`는 `TRUSTED_PROXY_SECRET`과 프록시가 덮어쓴 `X-Monolog-Proxy-Secret`이 맞을 때만 forwarding 정보를 신뢰합니다. Notion 자격 증명·관리 토큰·salt를 브라우저 공개 설정에 넣지 않습니다.

## 7. 설정의 빌드·런타임 경계

| 설정 | 적용 경계 |
| --- | --- |
| `site.config.js` | profile·projects·blog·theme·aboutSlug·stack 등 소스 설정. 브라우저 번들에 포함되는 값은 소스 재빌드 필요 |
| `NEXT_PUBLIC_SITE_URL`, Utterances, Notion 댓글 enable, AdSense 설정, `REVALIDATE_HOURS` | 소스 이미지 빌드 전에 지정. 이미 빌드된 이미지의 runtime env 변경만으로 프런트엔드 설정을 바꾸지 않음 |
| `NEXT_PUBLIC_GOOGLE_MEASUREMENT_ID`, Google/Naver/Bing verification | 명시적으로 지원하는 공개 런타임 예외. `scripts/write-runtime-config.js` → `public/runtime-config.js` → `window.__TABLOG_RUNTIME_CONFIG__`; 정적 HTML verification 태그도 갱신 |
| Notion token·data source, content/cache/vector/service URL, webhook token, Anthropic key, salt, proxy secret | 서버 런타임 env. `.env.example`과 해당 모듈이 기준이며 공개 runtime config 대상 아님 |

컨테이너 entrypoint는 runtime writer를 자동 실행합니다. 네이티브에서 위 공개 런타임 값을 바꿨다면 `node --env-file=.env scripts/write-runtime-config.js`를 실행하고 페이지를 다시 로드합니다. `yarn dev`/`yarn start` 스크립트가 이 단계를 대신 수행하지는 않습니다.

AdSense의 confirmation env는 운영자가 계정 설정을 확인했다는 표식이지 Google 설정 API가 아닙니다. auto/manual 모드·실제 slot ID·필수 확인 조건에 맞지 않으면 앱은 광고 실행을 제한합니다. 설정만으로 광고 채움이나 수익 발생을 보장하지 않습니다.

## 8. 명령·테스트·자동화

| 명령 | 범위 |
| --- | --- |
| `yarn setup` | 기존 `.env` 기반 초기 설정 보완·data-source 해석 |
| `yarn dev` | webpack 개발 서버 |
| `yarn build` / `yarn start` | webpack production build / Next 서버. `prebuild`는 이전 정적 sitemap 파일 제거 |
| `yarn warm:graph` | 로컬 `/graphs/notion-graph.json` 요청; 서비스 준비·전체 의미 색인 검증 명령은 아님 |
| `yarn type-check` / `yarn lint` | TypeScript / ESLint flat config(`eslint.config.mjs`) |
| `yarn test` 또는 `yarn test:unit` | `jest.config.unit.js`: `tests/`의 unit/component 회귀 테스트, integration 제외·캐시 Redis 연결 비활성화 |
| `yarn test:integration` | `jest.config.integration.js`: `tests/integration/`의 실제 연동 테스트 |
| `yarn test:all` | unit 다음 integration |
| `yarn test:watch`, `yarn test:coverage`, `yarn test:coverage:all` | unit watch/coverage, unit+integration coverage |

공통 Jest 설정은 `jest.config.base.js`와 `tests/setup.ts`이며 기본 JSDOM, 실제 Notion 연동 테스트는 파일별 Node 환경 등을 사용합니다. integration은 실제 자격 증명·연결된 데이터 소스와 fixture 조건을 요구할 수 있습니다. 환경/fixture 누락에 따른 skip을 실제 연동 통과로 보고하지 않습니다. unit의 renderer·번역·탭·콘텐츠 상태·graph/vector 회귀 테스트는 브라우저·컨테이너 smoke를 대체하지 않습니다.

| Workflow | 실제 책임 |
| --- | --- |
| `.github/workflows/test.yml` | `main`/`dev` push·PR 및 수동 실행. Node 22, frozen Yarn install, lint/type-check/unit, 후속 build. 수동 실행 runner 선택은 hosted 기본·ARC `monolog-arc`. 현재 lint/type-check step은 `continue-on-error: true`이므로 workflow 성공만으로 둘의 무오류를 주장하지 않음 |
| `.github/workflows/docker-build.yml` | main·버전 태그에서 웹/embedding `linux/amd64` 이미지 빌드·GHCR 게시. 수동 실행은 ARC `monolog-arc`에서 게시 웹 이미지를 pull·검증해 운영자 전송 키로 암호화한 artifact(`*.enc`+`envelope.json`+provenance, 평문 없음)로 export하는 staging이며 운영 데몬 적재·앱 교체를 수행하지 않음 |
| `.github/workflows/revalidate.yml` | 15분 주기/수동 `/api/cron/content` 완료 대기. `REVALIDATE_URL`·`REVALIDATE_SECRET` secrets 필요, 일일 전체 스캔 판단은 콘텐츠 엔진 책임 |

Next.js 코드를 수정하기 전에는 `AGENTS.md`와 설치된 `node_modules/next/dist/docs/`의 해당 가이드를 확인하세요. 이 문서에 적힌 명령은 개발 참조이며 이번 문서 갱신에서 실행한 검증 결과가 아닙니다.

## 9. 출처·라이선스

Tablog는 [morethan-log](https://github.com/morethanmin/morethan-log)에서 출발했습니다. 루트 [LICENSE](LICENSE)의 원본 MIT 고지(`Copyright (c) 2021-present, Craig Hart`)를 유지합니다. vendored Bklit Heatmap의 출처·snapshot·변경 사항·MIT 고지는 [src/components/charts/LICENSE](src/components/charts/LICENSE), pattern primitives의 추가 고지는 [src/components/charts/patterns/LICENSE-visx-pattern](src/components/charts/patterns/LICENSE-visx-pattern)에 있습니다. 원본 저작자 고지와 `src/assets/fonts/`의 개별 폰트 라이선스를 제품 이름 변경이나 문서 정리 과정에서 제거하지 않습니다.
