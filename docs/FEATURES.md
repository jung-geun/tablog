# FEATURES

Tablog — Notion으로 쓰고, 에디터처럼 탐색하는 블로그의 주요 기능 상세. 프로젝트 개요는 [`../README.md`](../README.md) · [English](../README.en.md), 셋업·운영 조건은 [`USAGE.md`](USAGE.md), UI 구조·디자인 계약은 [`../DESIGN.md`](../DESIGN.md), 구현 책임과 유지보수 진입점은 [`../project.md`](../project.md)를 참고하세요. 프로젝트 저장소는 [jung-geun/tablog](https://github.com/jung-geun/tablog)이며, 작업 공간 이름·프로필·사이트 주소는 운영자의 `site.config.js` 설정입니다.

---

## Editor chrome UI
모든 라우트가 읽기 전용 VS Code 작업 공간을 공유하며, 각 컨트롤은 실제 탐색·보기·설정 기능에 연결됩니다.

| 컴포넌트 | 설명 |
|---|---|
| **TitleBar** | 실제 뒤로/앞으로 이동, Command Center, 사이드바·패널 버튼. 중복 설정 버튼·가짜 창 닫기·최소화·Git 브랜치 표시 없음 |
| **ActivityBar** | Explorer / Search / Knowledge 사이드바를 현재 문서 이동 없이 전환. 명령·Reading mode·설정 접근 |
| **FileTree** | 최상단 `CONFIG.blog.title` 작업 공간 이름, 서로 독립적으로 접는 Open Editors·Files, 최근/열린 글·카테고리·시리즈·프로젝트·public 파일 계층. 글·시리즈 구성원은 실제 글 제목으로 표시하고 URL·탭 파일명은 유지. Open Editors는 기본 접힘이며 긴 목록은 내부 스크롤·현재 편집기 자동 노출. 왼쪽 닫기 버튼·경로·미리보기 이탤릭 표시. 섹션 사이에만 구분선을 두고 마지막 항목 아래는 빈 여백 유지. 180–420px 크기 조절; 한 번 클릭은 미리보기, 두 번 클릭은 고정. Material Icon Theme 파일·폴더 SVG |
| **TabBar** | Welcome, 문서, Search/Graph/Ontology 사용자 정의 편집기. 교체 가능한 이탤릭 미리보기 탭과 **Keep open**, 드래그 정렬·좌우 이동·닫기·다시 열기 |
| **StatusBar** | 방문자 IP를 표시하는 `SSH:` 스타일 연결 배지, 문서 종류·보기 모드·읽기 위치·탭 저장 상태. 실제 SSH 세션을 열지 않으며 조회 실패 시 unavailable 표시 |
| **Quick Pick** | `⌘/Ctrl+K`: 파일·태그·카테고리, `⌘/Ctrl+Shift+P` 또는 `>`: 명령, `@`: 실제 문서 제목. 화살표·Enter·Escape와 포커스 복원 |
| **Settings** | 화면의 설정 버튼은 ActivityBar 하단 한 곳으로 통합. Quick Pick의 Preferences 명령도 같은 패널을 열며 One Dark Pro Mix(기본)·Dark Modern·Light Modern·System 선택, 레이아웃 토글, 탭 저장 동의 관리 |

각 라우트는 `useRegisterChrome(filename, statusItems, kind)`로 자기 chrome 메타와 탭 종류를 동적 등록합니다.

- 글 내 앵커의 해시 이동과 앵커 주소 새로고침은 같은 문서 탭을 사용합니다. 쿼리가 다른 주소는 구분하며, 다시 열 때는 저장한 전체 주소를 사용합니다.
- 브라우저 저장소 접근·쓰기 실패 시 새 탭 저장을 중단합니다. 이전 세션은 남아 있을 수 있으므로 저장 해제·삭제 버튼은 계속 제공하며, 저장소가 삭제도 막으면 저장 불가 상태를 유지합니다.
- Welcome을 포함한 모든 탭을 드래그해 순서를 바꿀 수 있습니다. 삽입 위치와 가장자리 자동 스크롤을 제공하며 이동·취소 중 현재 문서는 유지합니다. 저장에 동의하면 고정 탭 순서도 복원합니다. 미리보기 탭은 영속 저장·최근 닫은 목록에서 제외합니다.
- 탭바의 좌우 버튼으로 현재 탭을 한 칸씩 이동할 수 있습니다. 클릭·터치와 키보드 Enter/Space를 지원하며 양 끝에서도 포커스를 잃지 않고 변경된 위치를 안내합니다. `Cmd/Ctrl+클릭`으로 다른 창에 탭을 열 때는 원래 창의 활성 탭을 변경하지 않습니다.
- 글 탭 닫기 `Alt/Option+W`, 다시 열기 `Alt/Option+Shift+T`. 브라우저의 `Cmd/Ctrl+W`·`Cmd/Ctrl+Shift+T`는 가로채지 않습니다.
- 운영자 기본 테마는 `CONFIG.blog.theme`, 방문자 선택은 별도 `monolog.colorTheme` 저장값으로 우선 적용합니다. 첫 페인트 전에 테마를 적용하고 System은 기기 변경을 실시간 반영합니다. 저장소가 차단돼도 이번 방문의 테마 전환은 동작합니다.
- 모든 화면에서 셸을 뷰포트 안에 유지하고 본문·Source·Outline·패널이 각각 스크롤합니다. 탭·뒤로 가기에서 읽던 위치를 복원하며 모바일 drawer는 닫힌 상태로 시작합니다. 실제 에디터 폭 1100px 미만에서는 Split 한 pane을 전환하고 Outline은 본문 위의 높이 제한 영역으로 배치합니다. 데스크톱 사이드바 선택과 모바일 drawer 상태는 별도로 유지합니다.
- 방문자 주소는 같은 origin의 `/api/ip`에서 요청별로 조회하며 응답은 `private, no-store`입니다. 기존 인증된 프록시 홉 검증을 재사용하고 위조된 전달 헤더를 신뢰하지 않습니다. 원본 IP를 탭 저장소나 번역 서비스에 보내지 않습니다.

구현: `src/layouts/RootLayout/EditorChrome/{TitleBar,ActivityBar,FileTree,StatusBar,SettingsPanel}.tsx`, `src/pages/api/ip.ts`. `SSH:`는 실제 요청 주소를 사용하는 표시 형식이며 원격 접속 상태가 아닙니다.

### 독서를 방해하지 않는 모션
- **글 열기·페이지 전환** — 기존 화면을 숨기거나 전환 완료를 지연하지 않음. 새 문서는 320ms 동안 최대 8px 올라오고, 탭 아래 2px 신호선이 이동 중에만 흐른 뒤 420ms에 사라짐. 빠른 연속 이동은 이전 진입 모션을 취소하고 마지막 요청의 완료·취소 상태를 따름.
- **직접 진입·새로고침** — 실제 SSR 본문을 처음부터 표시. 뒤로/앞으로 이동·목차 앵커·shallow 라우팅에서는 문서 이동 모션 없이 올바른 스크롤 루트의 위치를 복원합니다.
- **상호작용** — 메뉴·Quick Pick·비활성 글 hover 프리뷰의 짧은 전환만 사용하고, 현재 글 프리뷰로 본문을 가리지 않습니다.
- **독서 중 안정성** — 일반 스크롤에 단어별 등장이나 패럴랙스를 적용하지 않습니다. 번역으로 실제 바뀐 화면 내 텍스트에만 380ms 흐림·잔상·재조합 효과를 적용하고, React 소유 텍스트·선택·블록 ID는 변경하지 않습니다. 텍스트 선택 중에는 생략합니다.
- **동작 줄이기** — `prefers-reduced-motion: reduce`에서는 등장·전환·아이콘 이동·이미지 shimmer·댓글 skeleton pulse를 끄고, 이동 중 신호선은 정적으로 표시. 목차·맨 위로 이동·읽기 진행선도 즉시 반응하며 설정을 실행 중에 바꾸면 진행 중인 문서 진입 모션을 취소.


---

## Welcome · 검색
홈은 Start · Recent · Series로 구성된 밀도 높은 Welcome 화면입니다. Search Sidebar와 `/search?q=...` Search Editor가 제목·요약·태그·카테고리를 같은 규칙으로 검색합니다. `tag:"kolla ansible"`·`category:"Computer Science"`처럼 공백이 있는 값은 따옴표로 묶고, 화살표로 결과 링크를 이동해 Enter로 엽니다. 검색 URL과 뒤로 가기에서 검색어를 복원합니다. 본문 전체 검색이라고 표시하지 않습니다.
Welcome의 Recent와 Search Editor·Sidebar는 각 글의 실제 Notion `Thumbnail` 이미지를 제목·요약 옆에 표시합니다. 썸네일이 없는 글은 파일 아이콘을 유지하며, 모바일과 좁은 검색 사이드바에서도 이미지를 숨기지 않고 크기를 줄입니다. 기존 이미지 프록시·Next.js 이미지 최적화와 지연 로딩을 사용합니다.

## 문서 Preview · Source · Split
Post·Page·About가 동일한 문서 작업 공간을 사용합니다. breadcrumbs·제목 다음에 접힌 Frontmatter와 요약·축소된 커버를 표시하며, 기존 Notion SSR 본문·코드 복사·시리즈 이동은 유지합니다. About의 활동·GitHub·기술·연락처 위젯은 접을 수 있는 영역에 유지합니다.

- **Source**는 기본적으로 `/{slug}.md`와 동일한 Markdown과 블록별 줄 범위를 `/api/markdown/{slug}?sourceMap=1`에서 지연 로드하고 읽기 전용 문법 강조·줄 번호를 표시합니다. 번역 중에는 Preview와 같은 스냅샷을 기존 Markdown 직렬화기로 표시하며 제목·표·블록 매핑도 갱신합니다. `.md`·복사·다운로드는 원문을 유지하고, 원본 요청 실패 시 Retry·원본 링크를 제공하며 문서 이동 시 요청을 취소합니다.
- **Split**은 실제 에디터 컨테이너 폭 1100px 이상에서 독립된 두 pane의 일치하는 제목을 양방향 동기화합니다. 텍스트를 마우스로 드래그하면 실제 Notion 블록 ID·내보낸 줄 범위로 반대 pane의 대응 블록을 강조하고 선택 위치로 이동합니다. 일치하는 글자 범위는 추가 강조하며 문법 차이·블록 내 중복 문구는 블록 단위로 표시합니다. 드래그 추적은 제목 동기화 checkbox와 독립적이고 일반 스크롤을 줄별로 강제 연결하지 않습니다. 1100px 미만에서는 Preview/Source 한 pane을 전환합니다.
- **표**는 Notion의 실제 열 순서·셀 속성을 따라 GFM pipe 표로 내보내며 빈 셀·줄바꿈·인라인 서식을 보존합니다. 표·행별 블록 매핑을 유지해 Split 선택 영역도 연결합니다. Preview 표는 콘텐츠 폭을 채우고 긴 토큰이나 많은 열로 넘치면 표 안에서만 가로 스크롤됩니다. Source의 긴 줄은 해당 pane 안에서 가로 스크롤합니다. 본문은 최대 880px(Reading mode 900px), 좌우 여백은 데스크톱 최대 32px·Split 20px·좁은 에디터 16px로 제한합니다.
- **브라우저 내장 번역**은 본문 콘텐츠 영역 우측 상단의 지구본 또는 Quick Pick의 **Translate: Article language…**에서 엽니다(`translation`·`번역`·`언어` 검색). 제안·팝오버는 지구본 아래로 열리며 버튼·제안·팝오버는 Preview/Source 영역의 경계 안에 머물고 Outline·하단 패널·상태바를 침범하지 않습니다. 하단 고정 AdSense 광고의 실제 경계를 읽어 사용 가능한 높이를 줄이며, 광고 표시·크기 변경·닫힘에 맞춰 갱신합니다. 광고나 iframe은 변경하지 않습니다. 남은 높이가 작으면 팝오버 안에서 스크롤하며, 아주 낮은 콘텐츠 영역에서는 열린 팝오버가 지구본 공간까지 사용합니다. 브라우저의 실험적 `Translator` API와 언어 쌍 가용성을 감지하고, 번역 가능한 비한국어 브라우저 언어에서 제안 말풍선을 표시합니다. 원문 언어(기본 `CONFIG.lang`)·대상 언어(기본 브라우저 언어)를 선택한 뒤 **Translate article**을 눌러야 모델 준비·번역을 시작합니다. 제목·요약·본문·표·캡션을 문장/구문별로 번역하고 Preview·Source·Outline에 함께 반영합니다. 코드·수식·멘션·URL·링크 목적지와 원본 내보내기는 유지합니다. 진행률·중단·원문 복원을 제공하고 글/언어 변경 시 이전 작업을 취소합니다. 외부 번역 서버·모델명 추정·API 키 없이 브라우저 API가 지원하는 모델만 사용하고, 결과는 방문 중 메모리에만 유지합니다.
- **Outline · Series**는 실제 제목 앵커와 시리즈 순서를 보여줍니다. `@` 제목 이동은 모바일의 숨겨진 Source pane에서 Preview로 전환한 뒤 올바른 스크롤 루트로 이동합니다.
- **References · Comments**는 하단 패널로 분리합니다. 명시적 링크·같은 카테고리·AI 유사 글을 구분하며, 댓글은 처음 열 때 마운트하고 패널 전환 중 유지합니다. Reading mode는 사이드바와 패널을 숨깁니다.

구현: `src/routes/Detail/index.tsx`, `src/routes/Detail/PostDetail/{PostWorkspace,MarkdownSource,RightRail,DocumentPanel,ArticleTranslationControls,useArticleTranslation}.tsx`, 같은 디렉터리의 `{articleTranslation,translatedMarkdown,useSplitSelection}.ts`, `src/libs/utils/notion/markdown.ts`. 번역 지원 여부는 브라우저·보안 컨텍스트·언어 쌍에 따라 달라지며, 미지원·실패 상태에서도 원문은 유지합니다. 중단 시 이미 번역한 문장은 남을 수 있으며 **Restore original**로 전체 원문을 복원합니다.

## Markdown 복사 · 보기
문서 도구 모음에서 **Markdown 복사**와 추가 작업 disclosure를 제공합니다. About와 작은 화면에서도 동일하게 사용할 수 있습니다.

복사할 때만 현재 origin의 `/{slug}.md`를 요청하고 frontmatter를 포함한 응답 전문을 그대로 복사합니다. 요청·클립보드 실패는 실패로 안내하며, 클립보드 API가 없거나 거부되면 코드 블록과 동일한 textarea fallback을 시도하고 포커스를 복원합니다. 글 이동 시 진행 중 요청을 취소하고 이전 글의 늦은 응답·안내를 무시합니다. 로딩·성공·실패는 live status로 알립니다.

추가 작업은 기본 HTML disclosure로 키보드에서 열 수 있고 Escape·바깥 클릭·다른 컨트롤로 포커스 이동 시 닫힙니다. 그 안의 **Markdown으로 보기**는 기존 Markdown 주소 생성기를 사용하는 일반 링크로 전문을 새 창에 열며 원래 글의 주소·스크롤 위치를 유지하고 `noopener noreferrer`로 새 창 접근을 차단합니다. 링크나 disclosure 표시만으로 Markdown을 미리 다운로드하지 않습니다.

## 광고 배치
- **자동 광고는 오버레이 전용**입니다. `MODE=auto`와 게시자 클라이언트, 기본 `false`인 `NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_IN_PAGE_DISABLED_CONFIRMED`의 명시적 `true` 확인이 있어야 SDK를 로드하며 수동 단위는 렌더링하지 않습니다. 운영자는 계정에서 **Auto ads ON, 인페이지 Banner·Multiplex OFF, 텍스트 광고 의도 링크·칩 OFF**를 적용·확인한 뒤 값을 바꾸고 재빌드·배포해야 합니다. **이 사이트의 자동 최적화(Auto optimize)는 OFF**로 설정해 실험이나 우수 실적 설정 자동 적용이 금지한 형식을 다시 켜지 않게 합니다. 의도한 오버레이 선택(기존 하단 전용 앵커·사이드 레일 ON, 전면 광고/Vignette OFF)은 유지합니다. 본문 블록 사이라도 인페이지 자동 광고는 허용하지 않습니다.
- **수동 배치**는 `MODE=manual`, 실제 디스플레이 광고 단위 ID와 **AdSense에서 Auto ads를 껐다는 운영자 확인**이 필요합니다. 일반 글의 완결된 최상위 코드·블록 수식 뒤에만 본문 슬롯을 두며 callout·인용·목록·표·toggle·column 내부에는 삽입하지 않습니다. React가 코드 캡션까지 포함한 전체 블록 다음의 형제로 렌더링하고 원본 블록 ID·선택·번역 상태를 유지합니다. 짧은 글과 시작/끝 근처에는 본문 슬롯을 두지 않으며 선택적인 본문 끝 슬롯도 지원합니다.
- 모드별 필수 값이 없거나 모드가 잘못되면 SDK·슬롯·빈 여백을 만들지 않습니다. 확인값은 운영자 기록이지 Google 계정 설정을 바꾸거나 검증하는 API가 아닙니다. 제외된 영역 UI는 인페이지 후보 위치용이며 동적 작업 공간을 선택하지 못할 수 있고 오버레이 설정을 대신하지 않습니다. 공통 CSS 클래스·DOM 경계나 `google-anno-skip`이 일반 배너를 차단한다고 보장하지 않습니다. **자동 모드에서는** 배포 후 실제 SDK·광고 요청과 채워진 광고의 오버레이 위치, 데스크톱·모바일·Split에서 인페이지 광고가 없는지에 대한 런타임 증거가 필요하며 미충전은 게재 검증 완료가 아닙니다. 미지원 skip 속성을 추가하거나 이미 게재된 광고를 숨기거나 제거·이동하지 않습니다. [활성화 절차와 공식 링크](USAGE.md#광고와-작업-공간-경계).

## 코드 블록
- 언어명과 24px 복사 버튼을 작은 헤더에 표시. 코드 상단 패딩을 4px로 줄이며 원문에 포함된 빈 줄이나 들여쓰기는 제거하지 않음.
- 복사 버튼은 코드 스크롤 영역 바깥에 있어 내부 가로·세로 스크롤 중에도 같은 위치를 유지. 복사 대기·완료 중 키보드 포커스를 보존하며 진행 중에는 중복 복사를 막음. Clipboard API를 사용할 수 없으면 기존 레거시 복사 경로를 시도하며, 실제 성공 후 `복사되었습니다.`, 두 경로 모두 실패하면 오류 toast를 표시. 알림은 스크린리더에 전달. Mermaid는 코드의 세로 높이 제한을 적용하지 않음.
- 블록 코드에는 인라인 코드용 패딩을 적용하지 않음. 첫 줄에만 생기던 CSS 들여쓰기를 제거하며 원문 공백·탭·줄바꿈은 그대로 보존. 문법 강조·캡션·Mermaid 렌더링 유지.

---

## 시리즈 (Series)
Notion DB의 `Series` select 프로퍼티로 연재글을 묶어 관리합니다.

- **`/series`** — 전체 시리즈 인덱스. 카드 그리드(시리즈명 · 글 수 · 최신 글 제목과 실제 썸네일).
- **`/series/[name]`** — 오래된 글부터 최신 글까지 읽기 순서·번호를 유지하는 상세 목록. 각 글의 실제 썸네일·제목·요약·날짜, 다른 시리즈 chip 탐색을 제공하며 모바일에서도 썸네일을 축소해 표시.
- **Welcome Series** — 시리즈별 최신 글의 제목·썸네일과 글 수를 표시. 대표 글에 썸네일이 없으면 기존 폴더 아이콘을 유지.
- **FileTree** — `▾ series/` 섹션 자동 노출 (시리즈 0개면 숨김).
- **RightRail** — 현재 글이 속한 시리즈 글 목록. 현재 글 강조(`▸`).
- **본문 하단 Prev/Next** — 시리즈 내 이전/다음 글 카드. 시간 순(오래된→최신), 위치(N/M) 표시.

---

## 이미지 프록시 + BLOB 캐시
Notion S3 presigned URL 만료를 자동 복구하고 디스크에 캐싱합니다.

- **안정 프록시 URL** — S3 UUID를 키로 `?id=<uuid>&kind=s3` 형태 emit. presigned URL이 ISR마다 바뀌어도 프록시 URL은 고정 → 브라우저 disk cache · `next/Image` 옵티마이저 캐시 정상 동작.
- **서버 BLOB 디스크 캐시** — `/app/.image-cache/`에 이미지 바이너리 영속 저장. S3 UUID 키 30일 TTL, blockId 폴백 7일 TTL. 1 GB / 500 entry cap + LRU eviction.
- **In-flight dedup** — 동일 이미지 concurrent cold-miss가 Notion API를 중복 호출하지 않도록 Promise 공유.
- **자동 URL 재발급** — 401 / 403 / 404 / 410 응답 시 `notion.blocks.retrieve` → `notion.pages.retrieve` 순으로 재시도.
- **`next/Image` 옵티마이저 활성** — `next.config.js` `localPatterns`로 프록시 경로 허용. WebP/AVIF + 디바이스별 해상도 자동 생성.
- **응답·실패 안내** — 성공한 이미지 응답에는 `Cache-Control: public, max-age=31536000, immutable`을 사용. 복구 불가·크기 초과 등 실패 경로는 짧은 캐시의 PNG placeholder를 반환할 수 있으며 IP 제한은 `429`로 응답합니다. Slack webhook 알림은 별도 설정한 경우에만 동작하며, placeholder 응답의 HTTP `200`을 실제 원본 이미지 로딩 성공으로 간주하지 않음.

---

## About 페이지 (IDE 위젯)
About 라우트는 다음 위젯들을 한 화면에 묶어 보여줍니다.

- **문서 메타데이터·프로필** — 공통 Frontmatter에 실제 문서 제목·날짜·작성자·분류·태그를 표시하고, 프로필 설명은 `site.config.js`의 `profile.role` / `bio`를 사용
- **StatsGrid** — 화면의 네 필드는 `entries`(글 수) · `series` · `tags` · `words`. `words`는 제목·요약의 공백 구분 토큰 수 × 8을 올림한 추정치 합계이며 본문 전체 단어 수가 아님. 카테고리는 집계 유틸리티에 있지만 이 위젯에는 표시하지 않음
- **ActivityHeatmap** — 일요일–토요일 7행 × 52주 열의 글 활동 달력. ISR 게시물 쿼리 기준 시각에서 52주 전으로 이동한 뒤 일요일로 정렬하고 364일을 표시하므로 오늘까지의 달력이라고 보장하지 않음. UTC 날짜와 게시일(없으면 생성일)을 사용. 하루 1건부터 색을 표시하며 1·2·4·6건에서 색상 레벨이 증가
- **GitHubContributions** — 설정된 `profile.github`의 공개 기여를 `/api/github-contributions`에서 읽어 최신 응답 날짜가 속한 주까지 52주 × 7일로 표시. GitHub 제공 0–4 색상 레벨과 실제 기여 횟수를 분리해 적은 기여의 색과 원본 건수를 유지하며, 로딩·실패 안내와 프로필 링크 제공. 달력 아래 연간 합계는 서버 응답 값이며 보이는 364칸의 합계와 같다고 가정하지 않음
- **StackGrid** — `site.config.js`의 `stack` 객체를 카테고리별 chip으로 자동 렌더 (정의 없으면 위젯 자체 숨김)
- **ContactBlock** — email · GitHub · LinkedIn · Instagram (config-driven)

두 달력만 `ActivityCalendar`에서 실제 [Bklit UI Heatmap](https://bklit.com/docs/components/heatmap-chart) registry 소스를 조합합니다. 0은 빈 칸 색, 1–4는 테마의 활동 색을 직접 매핑해 낮은 활동도 빈 칸과 구별합니다. 월·요일 레이블과 연동되는 Less/More 범례, 원본 날짜·건수 tooltip, 한 칸씩 이동하는 방향키·Escape를 지원합니다. 작은 화면에서는 최소 680px 달력 영역만 가로 스크롤합니다. 소스·MIT 라이선스·registry 원본 해시는 `src/components/charts/LICENSE`와 소스 헤더에 보관합니다. Three.js 지식 그래프·글별 SVG 미니 그래프·커스텀 온톨로지와 Mermaid는 Bklit 렌더러가 아닙니다.

구현: `src/routes/Detail/PageDetail/components/{ActivityCalendar,ActivityHeatmap,GitHubContributions}.tsx`, `activityGrid.ts`, `src/routes/Feed/StatsGrid.tsx`, `src/libs/utils/stats.ts`, `src/libs/github/contributions.ts`.

---

## Archive timeline (`/categories/[name]`)
연도 헤더 + 수직 타임라인 + 점 마커로 카테고리별 글을 최신순 정렬. 카드 우측 썸네일, 다른 카테고리 chip으로 점프.

---

## Graph view (`/graph`)
실제 포스트·태그·시리즈 관계를 Three.js 원근 카메라로 탐색하는 3D 지식 그래프. 문서 임베딩의 3D PCA 투영을 약한 의미적 기준점으로 사용하고, 모든 노드를 실제 연결·척력·충돌 방지로 배치합니다. 같은 태그·시리즈를 공유한다는 이유로 가짜 명시적 포스트 간 엣지를 만들지 않습니다.

### 데이터 — 페이지별 해시 기반 캐시 + Qdrant 스냅샷
- 현재 공개 글의 본문 해시(레지스트리 초기화 전에는 수정 시각)와 그래프에 영향을 주는 메타데이터로 재빌드 필요 여부를 판단
- 해시가 일치하는 Qdrant `post_graph_snapshots` 스냅샷이 있으면 그 `BuiltGraph`를 재사용하고, 바뀐 글의 엣지만 다시 추출해 raw/built graph를 갱신
- `/graphs/notion-graph.json`는 관계 스냅샷에 현재 문서 버전의 PCA 좌표·코사인 유사도만 응답 시 결합하며 `no-store`로 제공합니다. 원본 `BuiltGraph`와 RightRail의 2D 좌표는 변경하지 않음
- `/api/cron/content`가 콘텐츠 outbox의 경로 무효화를 먼저 완료한 뒤 그래프·임베딩 유지보수를 수행. 초기화·수동 revalidate·webhook은 AI 유지보수를 기다리지 않으며, `yarn warm:graph`로 수동 워밍 가능
- `google/embeddinggemma-2@914f7f89142e33e77833254d9c9b90c3cef7303b`의 정규화된 768차원 벡터를 별도 Qdrant 컬렉션 `post_embeddings_embeddinggemma_2_768_v1`에 영속 저장. 초기 공개·제목·본문 해시가 바뀔 때만 재계산하며 slug·태그·시각만 바뀌면 메타데이터만 갱신
- 임베딩은 `/api/cron/content`의 유지보수 단계에서 수행. 초기화·webhook·수동 발행은 기다리지 않고 다음 유지보수에서 누락·변경분을 보충. 실패한 버전은 검색·좌표에서 제외하고 기존 벡터 체크포인트를 보존해 다음 유지보수에서 재시도. 비공개·삭제 글은 즉시 검색 후보에서 제외하고 유지보수 시 저장 벡터도 제거
- 문서 제목과 전체 본문을 공식 document prompt로 처리. 8192-token을 넘는 본문은 토큰을 버리지 않는 창으로 나눠 정규화·가중 결합. 검색은 공식 SearchQuery prompt를 사용하며 전체 768차원으로 검색; PCA에서 가까운 점은 유사도의 시각적 근사이며 명시적 관계를 뜻하지 않음
- 벡터 보강 실패는 이미 확보한 명시적 관계·태그·시리즈 논리 그래프를 중단시키지 않음. Qdrant 전체 장애 시에는 사용 가능한 캐시·본문 관계로 fallback. 임베딩이 없으면 `Relationship layout · post embeddings pending`, 일부 있으면 준비된 글 수/전체 수를 표시. stale 응답은 클라이언트에서 3초 간격으로 재조회하지만 인덱싱 완료 자체를 보장하지 않으며, Meaning 검색은 서버가 사용 가능 상태를 응답할 때만 활성화

### 엣지 종류
같은 페어가 여러 타입으로 연결될 수 있으며, 상세 패널에서는 이웃 노드별로 묶고 각 관계의 방향·유형·근거를 따로 표시합니다.

| 종류 | 의미 |
|---|---|
| `mention` | Notion `@mention`으로 다른 글을 인용 |
| `link` | rich-text 안의 Notion 페이지 링크 |
| `link_to_page` | `link_to_page` 블록 (페이지 전체 링크) |
| `has-tag` | 포스트 → 실제 태그 허브 |
| `in-series` | 포스트 → 실제 시리즈 허브 |
| `similar-topic` | 각 임베딩 문서의 가장 가까운 3개 후보를 합쳐 중복 제거한 코사인 유사 관계. Similar content를 켜면 임계값(기본 0.65) 이상만 표시. LLM·명시적인 참조 관계와 독립 |
| `elaborates` / `contradicts` / `supports` / `prerequisite` / `applies` | 기존 온톨로지의 의미 관계. Logical 레이어로 표시하며 신뢰도·rationale 제공 |

### 시각화 — Three.js + d3-force-3d
- 옵시디언 스타일의 선명한 불투명 구: 포스트는 중성 회색(`#5c5c5c`, 어두운 테마에서는 `#b8b8b8`), 태그·시리즈는 같은 초록색(`#18b94f`). 모든 종류가 연결 수에 따라 커지며 카테고리는 색상 대신 필터 메타데이터로 유지. 조명·안개·바닥 격자·배경색 혼합 없이 각도와 거리에 관계없이 원래 색을 유지하고, 글별 미니 그래프도 같은 팔레트·채워진 원 사용
- 임베딩을 고정 좌표가 아닌 약한 XYZ 기준점으로 사용. 임베딩된 포스트를 포함한 모든 노드에 실제 엣지 spring·3D 척력·collision을 적용해 무관한 노드와 겹침을 줄이면서 의미적 이웃을 유지
- 얇고 흐린 중성 회색 간선(alpha 0.28), weight 기반 굵기와 의미 관계 점선 유지. 화살표(alpha 0.32)는 선택·hover한 노드의 직접 연결에만 표시해 전체 보기의 혼잡을 줄임. 관계 종류·방향·근거는 상세 패널에서 확인
- 선택·hover 시 직접 연결을 강조하고 무관한 노드는 배경색 쪽으로 감쇠하되 불투명 depth를 유지. 일반 라벨은 배경 없는 문자로, 선택·hover·키보드 포커스는 선명한 표면으로 표시. 명시적인 선택 관계에만 방향 입자를 표시하고 `prefers-reduced-motion`에서는 입자·카메라 보간을 중지하며, 회전·이동·줌 후에도 라벨은 노드 위치를 따라 갱신
- 관계 선·화살표를 instancing으로 묶고 React state 없이 좌표·라벨을 갱신. 정지·비가시 상태에서는 RAF를 쉬고, 라우트 종료 시 controls·시뮬레이션·WebGL 자원·observer를 해제
- WebGL이 없거나 context를 잃으면 원인을 안내하며 가짜 2D 대체 화면으로 성공한 것처럼 표시하지 않음

### 인터랙션
- **회전** — 왼쪽 드래그. 모바일은 한 손가락 드래그
- **이동·줌** — 오른쪽 또는 Shift+왼쪽 드래그 이동, 휠 줌. 모바일은 두 손가락 이동·핀치 줌
- **노드 이동** — Alt/Option+왼쪽 드래그로 카메라 평면에서 이동. 모든 종류가 놓으면 XYZ 고정을 해제하고 현재 위치에서 시뮬레이션을 재개하며 PCA 좌표로 순간 이동하지 않음. 카메라 드래그는 선택 클릭으로 처리하지 않음
- **검색·키보드** — Name은 제목·slug·태그, Meaning은 검색어를 같은 모델로 임베딩해 본문 의미로 검색. Enter로 실행하며 결과에 코사인 점수를 표시하고 클릭하면 해당 노드를 선택·포커스. 노드 라벨은 Tab/Enter/Space로 탐색·선택, Escape로 선택 해제, canvas Home으로 전체 보기
- **상세 패널** — 직접 연결된 노드 목록, 입출력 방향, 관계 종류, 반복 참조 weight, 본문 인용문 표시. 논리 관계는 신뢰도·rationale, 임베딩 유사 관계는 코사인 점수와 명시적 참조가 아니라는 안내 제공
- **Connections only / Focus node** — 실제 한 단계 이웃만 남기거나 선택한 노드와 이웃을 화면에 맞춤. 헤더와 데스크톱·모바일 상세 패널이 가리는 영역을 제외해 포커스하며, 연결 항목 hover 중에도 선택한 이웃 집합을 유지
- **레이어·카테고리** — References·Tags·Series, Logical·Similar content를 개별 표시. 유사도 임계값 조절과 카테고리 강조. 임베딩 유사 레이어는 Anthropic 키 없이 사용하며, 실제 데이터가 없는 레이어는 비활성화
- **실시간 레이아웃** — 임베딩된 포스트를 포함한 모든 노드에 force 설정 적용. 선택·필터·테마·슬라이더 변경은 renderer·카메라를 재생성하지 않음
- **Reset view / Reset layout** — 카메라와 레이아웃 설정을 독립 초기화. ResizeObserver로 viewport 변경을 반영
- **시간순 재생** — 포스트 생성 순으로 노드와 실제 허브·관계를 공개. Play/Pause·Rewind·Show all·속도 조절 제공

구현: `src/routes/Graph/{index,GraphScene}.tsx`, `src/routes/Graph/{layout3d,types}.ts`, `src/libs/utils/graph.ts`, `src/hooks/useNotionGraphQuery.ts`, `src/apis/vector/graphEmbeddings.ts`. 화면의 임베딩 준비 상태·관계 수는 현재 응답 데이터이며, 프로젝트의 모든 글이 의미 검색에 이미 포함됐다는 보장이 아닙니다.

---

## Inline Notion databases
페이지 본문 안의 `child_database` 블록을 4개 뷰로 직접 렌더합니다.

| View | 용도 |
|---|---|
| Table | 행/열 표 (기본) |
| Board | `groupBy` 기반 칸반 (status / select / multi_select 자동 감지) |
| Gallery | 커버 이미지 카드 그리드 (220px+ auto-fill) |
| List | 한 줄 요약 리스트 |

지원 컬럼 타입: `title` · `rich_text` · `select` · `multi_select` · `status` · `date` · `url` · `checkbox` · `files` · `number` · `people`.

DB 블록은 `src/routes/Detail/components/NotionRenderer/index.tsx`의 **`components.Collection` 슬롯**으로 react-notion-x의 React 트리 안에서 직접 렌더합니다. 루트가 아닌 `collection_view_page`를 `collection_view`로 정규화하고 React Query의 데이터가 없으면 placeholder를 표시합니다. 예전 portal 기반 형제 DOM 주입 방식이 아닙니다.

---
## 공식 Notion 블록 지원 범위
- `heading_4`, 토글 제목의 `is_toggleable`, `column.width_ratio`를 현재 렌더러가 이해하는 형태로 변환. 생략된 열 너비는 실제 열 개수에 맞춰 균등 배분.
- 독립된 페이지 링크·alias 및 한 공개 글의 링크만 담긴 문단은 제목·요약·선택적 썸네일의 미리보기 카드로 자동 표시. Notion 페이지 ID를 공개 slug로 연결하고 원본 블록 앵커·SSR·에디터 SPA 이동을 유지. 문장 안의 mention·링크와 알 수 없는·비공개 대상은 기존 표시를 유지하며 모바일에서는 썸네일을 아래에 배치.
- 변환 캐시는 `recordMap:v9`. 이미 발행된 내구성 본문은 캐시 버전 변경만으로 재작성하지 않으므로 기존 글에 적용하려면 해당 글의 정상 변경 동기화 또는 인증된 `/api/revalidate?path=/slug` 본문 재확인이 필요. `full=true`는 전체 메타데이터 대조이며 모든 본문 강제 재작성 옵션이 아님.
- 의존성 선언은 `package.json`, 정확한 해석 버전은 `yarn.lock` 기준. 현재 선언은 Notion SDK `^5.21.0`, `react-notion-x` / `notion-types` / `notion-utils` `^7.10.0`이며, 공식 API 블록을 현재 렌더러 구조로 변환하는 코드를 함께 사용합니다. SDK를 올리는 것만으로 모든 새 블록이 지원되지는 않습니다.
- 탭은 RNX 7.10.1 이상이 지원하지만 현재 설치판에는 렌더 분기가 없음. 회의록·레거시 template·동기화 원본 참조는 별도 변환 정책이 필요. 공식 API의 `unsupported.block_type`은 종류만 알려주며 블록 내용은 제공하지 않으므로 SDK 갱신만으로 복원할 수 없음.
- [업로드 HTML 블록](https://developers.notion.com/reference/block#html-blocks)은 별도 `html` 타입이 아닌 업로드 기반 `embed`. 읽기 응답은 만료되는 서명 `embed.url`이며 현재는 인라인 실행 대신 링크로 표시. 안전한 인터랙티브 지원에는 공개 페이지·블록 검증을 통한 URL 갱신과 전용 샌드박스 iframe이 필요하며 앱 출처의 HTML 삽입이나 일반 iframe 호스트 허용만으로 대체하지 않음.

---


## Durable content registry (`src/libs/content`)
- 공개 게시물 메타데이터·본문 recordMap·slug 이력·대기 작업 outbox를 `CONTENT_REDIS_URL`(Redis 7.2+, AOF + `WAITAOF`) 또는 `CONTENT_STATE_DIR`에 원자적으로 저장. TTL 캐시 만료·재시작·Notion 장애와 무관하게 마지막 발행본을 렌더
- 증분 대조: `last_edited_time` overlap 스캔 + 24시간마다 전체 대조(삭제·데이터소스 이동 감지). 같은 분 안의 연속 편집은 분이 지난 뒤 1회 재확인
- 바뀐 글만 본문을 다시 가져오고 영향 경로만 ISR 재생성. 본문 버전(`contentHash`)이 같으면 유지; 임베딩은 제목·본문 변경만 재계산하며 그 외 메타데이터 변경은 기존 벡터 유지
- slug 변경 → 이전 주소 308 리다이렉트, 비공개·삭제 → 이전 alias까지 제거, slug 충돌 → 양쪽 모두 비노출, 예약 발행 → 발행 시각 이후 첫 대조에서 공개
- 입력: Notion webhook(`/api/notion-webhook`, HMAC 서명 · 이벤트 ID 중복 제거), 호스트 cron의 15분 주기 `/api/cron/content`, 수동 `/api/revalidate`. GitHub Actions schedule은 지연·누락 가능한 보조 트리거
- 실패한 경로·그래프 유지보수·IndexNow·Discord 알림은 영속 outbox에서 재시도. webhook·수동·초기화 요청은 발행만 기다리고 AI 그래프 작업은 cron에서 처리

---

## Dual-layer cache (Memory + Redis)
- **L1**: 프로세스 내 `Map` 캐시 (FIFO eviction, 200 entries)
- **L2**: `REDIS_URL`이 설정되면 `RedisBackend` 사용. 키 접두사는 `CACHE_NAMESPACE`(기본 `monolog`)이며 기존 설치의 이름을 임의 변경하지 않음
- `REDIS_URL`이 없으면 L2를 사용하지 않고 L1-only로 동작. `.notion-cache/*.json` 파일시스템은 현재 캐시 백엔드가 아님
- L2 → L1 백필은 60초 hot TTL. 동시 요청 Promise 공유는 프로세스 내부 범위이며 여러 인스턴스 전체의 단일 실행을 보장하지 않음
- recordMap·database 키는 Notion `last_edited_time`, 관계 그래프 키는 콘텐츠/메타데이터 해시를 사용. 이 TTL 캐시는 위의 내구성 콘텐츠 저장소나 이미지 BLOB 디스크 캐시와 별도

| 키 | TTL (기본 6h 기준) |
|---|---|
| `posts:v3:<dsId>` | `revalidateTime / 2` (3시간, 레지스트리 초기화 전 cold path 전용) |
| `recordMap:v9:<pageId>:<lastEdited>` | `revalidateTime` (6시간) |
| `database:v6:<dbId>:<lastEdited>` | 30분 |
| `notionGraph:v4:<hash>` | `GRAPH_TTL_MS` (기본 6시간) |
| image BLOB (S3 UUID 키) | 30일 |
| image BLOB (blockId 폴백 키) | 7일 |

구현: `src/libs/cache/{cacheStore,MemoryBackend,RedisBackend,keys,imageBlobCache,blobFsBackend}.ts`. 캐시는 소실 후 재생성할 수 있지만 `CONTENT_REDIS_URL`의 내구성 발행본·outbox는 운영 데이터로 보존합니다.

---

## Reading aids
- **ReadingProgress** — 현재 보이는 Preview/Source의 스크롤 루트를 추적하는 2px accent 바. 탭·주소·보기 전환 후 같은 루트를 사용하는 목차·맨 위로 이동·상태바 진행률과 연동
- **Outline · Series** — `RightRail.tsx`의 독립 스크롤 영역. 넓은 에디터에서는 224px 오른쪽 열, 에디터 1100px 미만에서는 본문 위 높이 제한 행으로 배치하며 숨김·Reading mode 전환 가능. 직접 참조·같은 카테고리 글 최대 3개·AI 유사 글·직접 관계 SVG 미니 그래프는 오른쪽 rail이 아니라 `DocumentPanel.tsx`의 **References** 탭에 표시. AI 제안이 없으면 없는 상태를 안내하며 관계를 만들어 채우지 않음
- **Frontmatter** — YAML 형식 메타데이터 블록 (모노스페이스, key가 accent3 컬러)
- **SeriesNav** — 본문 하단 시리즈 Prev/Next 박스
- **SPA 내부 링크** — 본문의 다른 글로 향하는 링크는 capture-phase 인터셉터로 `router.push`로 전환, 새로고침 없는 페이지 이동

---

## 익명 댓글 (Notion DB 적재)
방문자가 닉네임/이메일 없이 댓글을 달면, 본인 Notion `comments` DB에 자동 적재됩니다. 외부 SaaS(Disqus·Giscus·Cusdis) 의존 없이 자기 데이터로 모더레이션·확인.

- **자동 닉네임** — `익명#a3f2`. `SHA-256(slug + ipHash + salt)` 앞 4자 → 글 단위 일관성 + 글 간 추적 차단
- **서버 캐시** — slug별 45s TTL. POST 성공 시 해당 slug 캐시 invalidate → 새 댓글 즉시 반영
- **스팸 방어** — honeypot 필드 + 폼 mount time 검사(<3s reject) + IP rate limit (60s 쿨다운 / 1분 3건 / 1시간 20건)
- **PII 최소화** — IP는 `SHA-256(ip + COMMENT_HASH_SALT)` 앞 16자만 저장. 이메일·실명 수집 안 함
- **Notion 모더레이션** — `Status`를 `hidden`/`spam`으로 변경하면 페이지에서 자동 제외 (캐시 만료 시점부터)
- **Optimistic UI** — POST 즉시 목록에 표시, 실패 시 롤백 + 백그라운드 재fetch

---

## SEO / AEO / GEO
- **메타데이터** — 모든 라우트에 canonical, Open Graph·Twitter 절대 이미지, JSON-LD(`WebSite` · `Person` · `BlogPosting`/`WebPage` · `BreadcrumbList`). 상세 글은 작성자·발행일·의미 있는 수정일·요약을 HTML에도 표시
- **본문 SSR** — 본문·코드·KaTeX 수식을 서버에서 렌더하고, 제목 계층을 h2부터 건너뜀 없이 정규화(TOC·Markdown 공통). Summary가 없으면 본문 첫 문단 발췌를 설명으로 사용
- **`/sitemap.xml`** — 공개 글·분류·시리즈, `lastmod`는 의미 있는 본문 수정 시각
- **`/rss.xml`** — RSS 2.0 SSR 피드 (`<channel>` + 글마다 `<item>`, FileTree·`_document` `<link rel="alternate">` 정렬)
- **`/robots.txt` · `/llms.txt` · `/{slug}.md`** — 공개 글 목록과 같은 레지스트리에서 동적 생성
- **IndexNow** — 발행·수정·slug 변경·삭제된 URL을 발행 직후 제출 (`INDEXNOW_KEY`, `/<key>.txt`)
- **검색 서비스 검증** — Google·Naver·Bing 메타 태그를 컨테이너 시작 시 주입
- 정기 동기화 — 운영 Linux 호스트의 `scripts/reconcile-content-host.sh`를 15분 cron으로 실행. GitHub Action (`revalidate.yml`)은 같은 `/api/cron/content` 호출을 예약하는 보조 수단이며 자동 실행 시각을 보장하지 않음. 남은 작업이 있으면 실패로 표시
- **홈 초기 로딩·접근성** — Feed의 `main` 랜드마크와 SSR 링크를 유지. Prism 추가 문법은 코드가 나타날 때만 로딩하고, 글·About·Graph 링크는 자동 viewport prefetch 대신 Pages Router의 hover·클릭 로딩을 사용. 태그는 빈도별 글자 크기와 hover 색상을 유지하되 불투명도·색상 tween 없이 24px 이상의 타깃·포커스 표시를 제공하고 라이트 테마 보조 텍스트 대비를 확보.

---

## 컨테이너 ISR warmup
Docker 컨테이너 entrypoint가 standalone 서버를 시작한 뒤 자동으로 `/api/init`을 호출합니다 (3회 retry). 레지스트리가 비어 있으면 최초 동기화로 구축하고 모든 공개 경로를 재생성하며, 이미 있으면 바뀐 글만 확인한 뒤 경로를 워밍합니다. 그래프·ontology의 대기 작업은 `/api/cron/content`가 처리합니다.

수동 워밍:

```bash
yarn warm:graph  # /graphs/notion-graph.json 호출
curl -H "Authorization: Bearer $REVALIDATE_SECRET" "https://your-site.com/api/init"
```

---

## 기타
- 증분 동기화 (`/api/cron/content` 15분 주기, Notion webhook, `/api/revalidate`)
- Mermaid 다이어그램, KaTeX 수식, Prism 코드 하이라이팅
- YouTube · Vimeo · Loom · GoogleDrive · audio 임베드
- 다중 named theme와 System 실시간 전환; 운영자 기본값·방문자 선택 분리, localStorage 영속
