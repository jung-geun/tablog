# USAGE

Tablog 셋업·운영 가이드. Notion으로 쓰고, 에디터처럼 탐색하는 블로그의 개요와 VS Code 테마의 차별점은 [`README.md`](../README.md)를 참고하세요.

---

## 빠른 시작

Node.js 22 또는 24 LTS와 **Yarn Classic 1.22.22**를 사용합니다(`package.json`의 `packageManager`; CI·웹 Dockerfile은 Node.js 22). Yarn이 없으면 `corepack enable`을 실행하고 clone한 저장소에서 `corepack install`로 활성화합니다. Corepack이 없는 Node 배포판은 Yarn 1.22.22를 별도 설치하세요. 의존성은 `yarn.lock`만 관리하며 npm·pnpm·Bun lockfile을 추가하지 않습니다. Notion 템플릿 복제와 Integration 연결은 아래 **Notion 셋업**을 먼저 완료하세요.

```bash
git clone https://github.com/jung-geun/tablog.git
cd tablog
yarn install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
# .env의 NOTION_TOKEN과 NOTION_DATASOURCE_ID만 직접 입력
# NOTION_DATASOURCE_ID에는 원본 blog-table DB 주소 전체 또는 data-source UUID
yarn setup
yarn dev
```

`http://localhost:3000`에서 확인합니다. `yarn setup`은 인자를 받지 않고 저장소 루트 `.env`만 읽습니다(셸 환경변수로 입력을 덮어쓰지 않음). DB 주소를 data-source UUID로 변환하고 비어 있는 재검증 비밀키를 생성합니다. 선택 기능의 DB ID가 설정된 경우에만 해당 salt도 독립 생성합니다. 기존 키·주석·기타 설정은 유지하며 파일 권한을 `0600`으로 제한합니다. 여러 data source가 있는 DB는 자동 선택하지 않으므로 안내된 UUID 중 사용할 값을 지정하고 다시 실행하세요. API 실패 시 파일은 변경하지 않습니다. `.env`·비밀키·개인 콘텐츠를 커밋하거나 로그에 공개하지 마세요.

네이티브 개발은 `.env.example`의 `CONTENT_STATE_DIR=.content-state`로 발행본을 보관하며 임베딩/Qdrant 없이 글을 볼 수 있습니다. 이 디렉터리는 일회성 캐시가 아니므로 보존합니다. 이미지 프록시는 아래 [별도 salt 전제](#이미지-프록시)를 확인하세요. 의미 검색·유사 글은 아래 Compose 스택과 문서 임베딩 backfill이 필요하며, 단순 기동만으로 전체 색인이 완성되지는 않습니다. Node.js 26 대신 문서화된 LTS를 사용하고 실행 파일과 PATH를 맞춥니다.

---

## 기존 설치의 이름 변경

저장소 이름은 `monolog`에서 `tablog`로, 제품 표기는 **Tablog**로 바뀌었습니다. 기존 체크아웃 디렉터리는 옮기지 않아도 됩니다. 저장소 remote만 새 주소 `https://github.com/jung-geun/tablog.git`로 바꿔 사용할 수 있으며 개인 사이트 제목 `pieroot log`와 도메인 `pieroot.xyz`는 별개로 유지합니다.

**기존 설치의 디렉터리를 바꾸거나 새 경로에서 기존 스택을 이어 쓰려면, 그 경로에서 어떤 Compose 명령이든 실행하기 전에 원래 Compose 프로젝트 이름을 고정하세요.** 원래 값은 실행 중인 컨테이너의 `com.docker.compose.project` 라벨 또는 `docker compose ls`에서 확인합니다. 아래는 기존 값이 `monolog`였던 경우에만 쓰는 예시이며, 다른 이름이었다면 실제 원래 값을 사용합니다.

```dotenv
# 기존 설치의 .env에 유지 (새 설치에 일괄 적용하는 값이 아님)
COMPOSE_PROJECT_NAME=monolog
```

셸의 `COMPOSE_PROJECT_NAME`이나 `docker compose -p`도 같은 원래 값이어야 합니다. 디렉터리명으로 새 프로젝트를 만들면 기존 데이터 대신 새 빈 볼륨에 연결될 수 있습니다. **볼륨 이름을 바꾸거나 삭제하지 말고**, 기존 Compose override·이미지 고정·마운트·`.env`와 콘텐츠 Redis AOF·캐시 Redis·Qdrant·모델 캐시를 보존하세요. **`docker compose down -v`는 해당 프로젝트의 named volume을 삭제**하므로 콘텐츠 레지스트리·벡터·이미지/모델 캐시 등을 잃을 수 있습니다. 이름 변경·업데이트 절차에 사용하지 마세요. cron이 참조하는 절대 경로도 실제 체크아웃 위치에 맞추되 기존 작업을 중복 등록하지 않습니다.

방문자 쿠키 `monolog_visitor_id`, 탭·저장 동의·테마의 기존 브라우저 저장 키(예: `monolog.colorTheme`), `CACHE_NAMESPACE`·`CONTENT_NAMESPACE` 기본값 `monolog`는 데이터 연속성을 위해 유지합니다. 호스트 작업 잠금 경로 `${XDG_CACHE_HOME:-$HOME/.cache}/monolog`, 인증 프록시 헤더 `X-Monolog-Proxy-Secret`, 그래프 상태 헤더 `X-Monolog-Graph-Stale`, 디버그 환경변수 `MONOLOG_DEBUG`도 그대로입니다. 제품 이름에 맞추려고 이 식별자나 기존 프록시 설정을 바꾸지 마세요. 라이선스가 있는 폰트 이름 `Monolog Sans Supplement`도 변경하지 않습니다.

워크플로는 `github.repository`에서 웹·임베딩 이미지 이름을 생성합니다(`ghcr.io/jung-geun/tablog`, `ghcr.io/jung-geun/tablog-embedding`). 이 GHCR 패키지 이름은 이전 패키지에 대한 **GitHub 저장소 리다이렉트 별칭이 아닙니다**. 저장소 이름 변경은 이미지 게시·운영 배포를 뜻하지 않습니다. 사용할 패키지의 **실제 게시 태그와 접근 권한을 확인한 경우에만** pull하며, 기본 설치는 소스 빌드를 사용합니다. 기존 운영의 `monolog` 이미지 고정과 rollback 경로는 검증된 교체 전까지 유지합니다. 과거 변경 이력의 이전 이름·경로는 당시 기록입니다.

---

## 작업 공간 설정

### 기본 테마와 방문자 선택

`site.config.js`의 `CONFIG.blog.theme`를 설정합니다. 소스 설정이므로 배포 이미지는 다시 빌드해야 합니다.

```js
blog: {
  title: "pieroot log",
  description: "기술 블로그",
  theme: "one-dark-pro-mix", // dark-modern | light-modern | system
},
```

- 기본값은 **One Dark Pro Mix**입니다. System은 기기에 따라 Dark Modern/Light Modern으로 바뀝니다.
- 방문자는 **Activity Bar 하단의 Settings** 또는 Quick Pick의 `> Color Theme`로 테마를 선택합니다. `> Preferences: Open Settings`도 같은 설정 패널을 엽니다. 유효한 `localStorage["monolog.colorTheme"]`가 운영자 기본값보다 우선합니다. 이 키를 삭제하고 새로고침하면 운영자 기본값으로 돌아갑니다.
- 테마 선택과 탭 저장 동의는 별개입니다. 탭 저장을 거부하면 방문 기록을 영속 저장하지 않으며 테마 선택은 유지됩니다. 저장소가 차단돼도 현재 방문에서 선택할 수 있습니다.
- 파일·폴더 아이콘은 Material Icon Theme 5.39.0의 실제 SVG입니다. `public/icons/material/LICENSE`와 원본 출처를 유지하세요.

### 탐색과 문서 읽기

| 조작 | 동작 |
|---|---|
| `Cmd/Ctrl+K` | Quick Pick: 파일·태그·카테고리 검색 |
| `Cmd/Ctrl+Shift+P`, 또는 검색 앞 `>` | 실제 보기·테마·설정·현재 글의 언어 선택 명령 |
| 검색 앞 `@` | 현재 문서의 실제 제목으로 이동 |
| Explorer 한 번/두 번 클릭 | 임시 미리보기 / 고정 탭 |
| Keep open | 현재 미리보기 고정 |
| `Alt/Option+W` / `Alt/Option+Shift+T` | 글 탭 닫기 / 다시 열기 |
| Preview / Source / Split | 렌더링된 본문 / 실제 Markdown / 분할 보기 |
| Reading mode | 문서는 유지하고 탐색 사이드바·하단 패널 숨기기 |

Explorer 최상단의 작업 공간 이름, Title Bar, 검색 안내, 문서 경로 표시에는 `CONFIG.blog.title`을 사용합니다. Explorer의 작업 공간 이름은 스크롤 중에도 유지됩니다. **Files**를 접으면 파일 트리만 숨기고, **Open editors**는 별도로 펼쳐 열린 문서를 전환·닫을 수 있습니다. Open editors는 기본 접힘이며, 펼친 긴 목록은 안에서 스크롤되고 현재 편집기를 표시합니다. 각 항목의 닫기 버튼은 왼쪽에 있으며 마우스 hover·키보드 포커스·현재 항목에서 나타납니다(터치 환경에서는 항상 표시). 글 옆의 `posts` 등은 경로, 이탤릭은 임시 미리보기입니다. 파일·폴더의 펼침 상태는 Files를 접었다 열어도 유지합니다.

Files의 포스트와 시리즈 하위 글에는 URL 슬러그 대신 실제 글 제목을 표시합니다. 긴 제목은 사이드바 폭에 맞춰 말줄임하고 마우스를 올리면 전체 제목을 확인할 수 있습니다. 링크 주소와 열린 탭의 `.md` 파일명은 유지합니다. 파일 목록 끝에는 구분선을 두지 않으며, 짧은 목록 아래는 상태 표시줄까지 비워 두고 내용이 사이드바 높이를 넘을 때만 세로 스크롤합니다.

브라우저 자체 닫기·다시 열기 단축키는 가로채지 않습니다. 탭 저장에 동의한 경우 고정 탭·최근 닫은 글의 제목·주소·순서만 저장하며 임시 미리보기나 본문은 저장하지 않습니다. 해제·삭제는 Settings에서 가능합니다. 모든 화면에서 작업 공간 높이를 유지하며 본문·Source·Outline·패널은 각각 스크롤합니다. 에디터의 남은 폭이 1100px 미만이면 Outline은 본문 위에 놓이고 Split은 Preview/Source 버튼으로 전환합니다. Split은 두 pane이 동시에 보일 때 일치하는 제목 기준 양방향 스크롤 동기화를 유지합니다. 어느 pane에서든 텍스트를 마우스로 드래그하면 반대 pane의 대응 블록을 하이라이트하고 선택 위치가 보이도록 이동합니다. 같은 텍스트가 정확히 대응하면 글자 범위도 강조하며, Markdown 문법·수식 등 표현이 다르거나 블록 안의 문구가 중복되면 블록 단위로 표시합니다. 일반 스크롤을 줄별로 강제 연결하지 않으며 제목 동기화 checkbox를 꺼도 드래그 선택 추적은 동작합니다. 한 pane만 보이는 좁은 화면에서는 선택 때문에 숨겨진 pane으로 화면을 전환하지 않습니다.

없는 글·카테고리·시리즈·경로는 HTTP 404와 블록형 오류 화면을 반환합니다. 잘못된 URL 인코딩은 400, 서버 처리 실패는 500으로 구분하며 내부 진단은 공개하지 않습니다. 오류 화면은 Welcome 대신 실제 요청 주소의 별도 탭으로 열리고, 홈·검색 또는 새로고침으로 복구할 수 있습니다. 오류 탭은 저장하거나 최근 닫은 글로 다시 열지 않으며, 홈이 복구되면 오래된 홈 오류 탭은 제거됩니다.

상태 표시줄 왼쪽의 파란 **`SSH: IP주소`** 배지는 현재 방문자의 주소를 보여주는 SSH 스타일 표시이며 실제 SSH 접속을 만들지 않습니다. 주소는 같은 사이트의 `/api/ip`에서 조회하고 `private, no-store`로 응답하므로 다른 방문자의 주소를 공유 캐시에 저장하지 않습니다. 프록시 뒤에서는 기존 `TRUSTED_PROXY_HOPS`와 `TRUSTED_PROXY_SECRET` 검증을 통과한 전달 주소만 사용합니다. 조회 실패 시 임의 주소 대신 `SSH: unavailable`을 표시합니다.

Notion 표는 Source·Markdown 복사·`.md` 보기에서도 헤더 구분선이 있는 Markdown 표로 표시됩니다. Preview에서는 사용 가능한 본문 폭을 채우며, 열이 많거나 긴 코드·주소가 있으면 표 안에서 좌우로 스크롤해 나머지 열을 볼 수 있습니다. 페이지 전체의 가로 폭은 늘어나지 않습니다.

글의 **우측 하단 지구본**을 누르면 언어 선택을 엽니다. 한국어가 아닌 브라우저 언어에서는 지원되는 번역을 말풍선으로 제안하지만, 제안을 열거나 닫는 것만으로는 모델을 생성하거나 번역하지 않습니다. 원문 언어는 `CONFIG.lang`, 대상 언어는 `navigator.language`가 기본값이며 `ko`, `en`, `zh-Hant` 같은 언어 태그로 바꿀 수 있습니다. **Translate article**을 눌러야 모델 다운로드(필요한 경우)와 문장·구문별 순차 번역이 시작됩니다. 자동 번역이나 외부 AI 전송은 없습니다. 완료한 번역부터 본문·Source·Outline에 함께 표시하고, **Cancel translation**은 진행 중 작업만 중단해 완료 부분을 남기며 **Restore original**은 원문 전체를 복원합니다. 언어·글 변경은 이전 작업을 취소하고 원문으로 돌아갑니다. Markdown 복사·다운로드·공개 `.md`는 항상 원문이며 코드·수식·URL·링크 주소도 보존합니다. 번역 시 바뀐 텍스트에만 짧은 재조합 효과를 적용하며 OS/브라우저의 동작 줄이기를 켜면 생략합니다.

지구본과 언어 팝오버는 브라우저 전체가 아닌 **본문 콘텐츠 영역** 우측 하단에 고정됩니다. Preview·Source·Split과 하단 패널 열기, 사이드바 크기 조절에 맞춰 경계를 유지하며 공간이 작으면 팝오버 안에서 스크롤합니다. 번역을 지원하는 글에서는 상단 Command Center에 `>번역` 또는 `translation`을 입력해 **Translate: Article language…** 명령으로 같은 패널을 열 수 있습니다. 이 명령은 대상 언어 입력에 포커스를 옮길 뿐 번역을 시작하지 않으며, 페이지 이동 후 이전 글의 명령은 실행되지 않습니다.

이 기능은 HTTPS 또는 localhost의 보안 컨텍스트에서 **브라우저가 `Translator.availability`와 `Translator.create`를 실제 제공하고 선택한 언어 쌍을 지원할 때만** 동작합니다. 브라우저 이름·버전만으로 지원을 보장하지 않으며 모바일·OS·언어 모델·권한에 따라 달라집니다([브라우저 API 안내](https://developer.chrome.com/docs/ai/translator-api)). 언어 쌍의 `available`·`downloadable`·`downloading` 상태를 확인한 뒤에만 번역 버튼을 사용할 수 있습니다. 모델 생성은 **Translate article 클릭의 사용자 활성화 안에서** 시작하므로 패널 열기·명령 선택만으로 다운로드하지 않습니다. 권한·네트워크 오류나 미지원 사유는 패널에 표시하고 원문을 유지하며 클라우드 번역으로 우회하지 않습니다. 모델 다운로드는 브라우저가 관리하고 번역 결과는 서버나 브라우저 저장소에 저장하지 않습니다. 기계 번역은 부정확할 수 있으므로 기술 내용은 원문·코드를 함께 확인하세요.

Search Sidebar와 `/search?q=...`는 **제목·요약·태그·카테고리**를 검색합니다. `tag:"kolla ansible"` 또는 `category:"Computer Science"`처럼 값을 따옴표로 묶을 수 있습니다. 글 전문을 대상으로 하는 의미 검색은 기존 Graph의 Meaning 검색과 임베딩 서비스 설정을 사용합니다.

Welcome의 Recent, Search Editor·Search Sidebar와 시리즈 상세에서 실제 글의 `Thumbnail`을 함께 확인할 수 있습니다. 시리즈 인덱스와 Welcome Series의 대표 썸네일은 해당 시리즈 최신 글의 이미지이며, 함께 표시한 최신 글 제목과 일치합니다. 썸네일이 없는 글은 기존 텍스트·아이콘 표시를 유지합니다. 모바일에서도 이미지를 축소해 표시하고 시리즈의 읽기 순서·번호는 유지합니다.

### 이미지 프록시

Notion S3 이미지는 `?id=<uuid>&kind=s3`의 안정 URL과 디스크 BLOB 캐시를 사용하고, `?url=...` 경로는 허용된 Notion/AWS 원본과 GitHub OG 썸네일도 처리합니다. 후자는 단순 폐기 예정 경로가 아니며 외부 썸네일에서도 사용합니다. 프록시는 이미지 Content-Type·호스트 allow-list를 검사하고 리다이렉트를 따르지 않으며 원본 크기는 최대 16MiB입니다. 임의 외부 호스트를 허용하는 범용 프록시가 아닙니다. 큰 파일은 기존 placeholder로 처리하므로 썸네일은 작은 원본을 권장합니다. `next.config.js`의 Next Image 패턴과 API의 원본 allow-list는 별도 제한입니다.

**현재 구현의 추가 전제:** `/api/image-proxy`는 댓글 활성 여부와 무관하게 IP 기반 요청 제한에 `COMMENT_HASH_SALT`를 사용합니다. 최소 두 입력의 `yarn setup`은 댓글 DB가 없으면 이 salt를 생성하지 않습니다. 프록시 이미지를 쓸 설치는 서버 `.env`에 강한 임의의 `COMMENT_HASH_SALT`를 별도로 설정해야 합니다(예: `openssl rand -hex 32`로 로컬 생성한 값을 비공개로 보관). 이미 있는 salt는 바꾸지 말고 `VISITOR_HASH_SALT`와 재사용하지 마세요. 댓글 DB·댓글 UI를 켤 필요는 없습니다.

이미 placeholder가 Next.js 이미지 캐시에 저장된 배포는 원본을 수정해도 캐시 만료 전까지 빈 이미지가 남을 수 있습니다. 배포 시 해당 원본 URL·너비·포맷에 대응하는 캐시만 무효화하고 실제 목록에서 이미지 로딩을 확인하세요. 내구성 콘텐츠 Redis나 전체 볼륨 삭제로 이미지 캐시를 해결하지 않습니다.

### 광고와 작업 공간 경계

광고는 `NEXT_PUBLIC_GOOGLE_ADSENSE_MODE`로 **자동 광고(`auto`, 기본값)**와 **수동 배치(`manual`)**를 구분합니다. 게시자 ID만 설정한 상태에서는 SDK를 로드하지 않습니다. 모드별 계정 작업을 마친 뒤에만 확인값을 설정하세요. 이미 게재된 광고를 CSS로 숨기거나 DOM에서 제거·이동하지 않습니다.

#### 자동 광고: 오버레이 전용

자동 모드는 **인페이지 자동 광고를 허용하지 않습니다**. 완결된 본문 블록 사이라도 자동 배너를 남기지 않으며, 수동 단위 ID 없이 SDK만 로드하고 수동 슬롯은 함께 만들지 않습니다.

1. **AdSense → 광고 → 사이트 수정**에서 이 사이트의 **Auto ads는 ON**으로 유지합니다. **인페이지 형식의 Banner(배너)와 Multiplex(멀티플렉스)는 모두 OFF**로 바꿉니다.
2. **광고 의도(Ad intents)의 텍스트 링크·칩도 모두 OFF**로 설정합니다. 본문 스캔 제외 클래스만으로 이 계정 설정을 대신하지 않습니다.
3. 의도한 **오버레이 형식은 유지**합니다. 기존 **하단 전용 앵커 ON·사이드 레일 ON·전면 광고(Vignette) OFF**와 각 형식의 기존 세부 선택은 계정에서 그대로 유지합니다. 인페이지 형식을 끄려고 Auto ads 전체를 끄지 마세요.
4. **이 사이트의 자동 최적화(Auto optimize)는 OFF**로 설정합니다. 자동 최적화 실험은 Auto ads 형식을 켤 수 있으므로, 우수 실적 설정 자동 적용을 포함한 실험이 금지한 인페이지·텍스트 형식을 다시 활성화하지 않게 해야 합니다. **Auto ads 자체의 ON 설정과 자동 최적화 OFF는 별개**입니다. [공식 자동 최적화 설정](https://support.google.com/adsense/answer/9141298?hl=ko).
5. **사이트에 적용**한 뒤 계정 설정을 다시 열어 Auto ads ON, Banner·Multiplex OFF, 텍스트 광고 의도 링크·칩 OFF, 자동 최적화 OFF와 오버레이 선택을 확인합니다. 반영에는 최대 1시간이 걸릴 수 있습니다. 확인 전에는 아래 값을 기본값 `false`로 둡니다.
6. 계정을 확인한 운영자만 `NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_IN_PAGE_DISABLED_CONFIRMED=true`로 바꾸고 **이미지를 다시 빌드·배포**합니다. 이 값은 위 계정 작업의 확인 기록이며 Google 설정을 변경하거나 실제 광고 위치를 검증하지 않습니다.

```dotenv
NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT=ca-pub-본인게시자ID
NEXT_PUBLIC_GOOGLE_ADSENSE_MODE=auto
NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_IN_PAGE_DISABLED_CONFIRMED=false
NEXT_PUBLIC_GOOGLE_ADSENSE_DISABLE=false
```

**제외된 영역은 이 정책의 대체 수단이 아닙니다.** 이 UI는 인페이지 자동 광고의 후보 위치를 제외하며 앵커·사이드 레일 등 오버레이를 끄지 않습니다. 미리보기가 동적 작업 공간의 원하는 영역을 선택하지 못할 수 있고, 특정 글의 블록 ID·순서에 의존하는 제외는 다른 글에 적용되지 않을 수 있습니다. 공통 CSS 클래스나 DOM 경계를 유지하는 것만으로 광고가 차단되지 않으며, 이 프로젝트는 임의 선택자를 Google 설정에 등록하는 API를 제공하지 않습니다. 인페이지 형식을 모두 끄므로 별도의 작업 공간 후보 제외 목록으로 자동 배너를 허용하지 않습니다. [공식 제외 영역](https://support.google.com/adsense/answer/12626543?hl=ko).

**배포 후 실제 런타임 게재·배치 증거가 필요합니다.** 배포한 이미지의 실제 사이트에서 SDK 로드와 광고 요청을 확인하고, 실제로 채워진 광고가 선택한 오버레이 위치에만 표시되는지 브라우저 화면·네트워크 기록으로 남깁니다. 데스크톱·모바일의 여러 글, Preview/Source/Split, Explorer·메뉴·상태바를 확인해 본문 블록 안팎과 작업 공간에 인페이지 배너·Multiplex·텍스트 광고 의도 링크·칩이 생기지 않는지도 확인합니다. 계정 미리보기, 빌드 성공, SDK 로드만으로 실제 게재·위치가 증명되지는 않습니다. Google의 게재 결정·동의·광고 차단·미충전 등으로 광고가 보이지 않으면 게재 증거는 미확보 상태이며 검증 완료로 기록하지 않습니다. 원치 않는 형식이 나타나면 계정 설정을 수정하고, 필요하면 `NEXT_PUBLIC_GOOGLE_ADSENSE_DISABLE=true`로 재빌드·배포해 이후 SDK 로드를 중단합니다. 이미 게재된 광고를 CSS로 숨기거나 DOM에서 제거·이동해 해결하지 않습니다.

**설정 요청과 실제 광고 요청을 구분합니다.** `adsbygoogle.js`와 `pagead/ads?...format=0x0`의 HTTP 200은 SDK·자동 광고 설정을 받았다는 증거일 뿐, 광고 소재 게재의 증거가 아닙니다. 숨겨진 `0×0` 설정용 요소의 `unfilled`만으로 광고 재고 부족이나 계정 제한을 단정하지 마세요. AdSense 보고서에서 사이트별 페이지뷰·광고 요청·게재된 요청·노출수를 함께 확인하고, 실제 광고 요소의 `filled`·화면 내 크기·소재 응답을 별도로 확인합니다.

**작업 공간은 문서 흐름 안에서 뷰포트 높이를 유지합니다.** `EditorShell`의 `position: relative; height: 100dvh`는 Preview/Source/Outline의 독립 스크롤을 유지하면서 SDK가 문서 높이를 측정할 수 있게 합니다. 셸 전체를 `position: fixed`로 분리해 `body` 높이가 0이 되면 자동 오버레이가 시작되지 않을 수 있습니다. 인위적인 빈 공간·창 스크롤·광고 DOM 조작으로 우회하지 않습니다. 검증은 별도 프로필의 실제 창 브라우저에서 SDK 초기화 후 정상적인 읽기 동작을 하고 충분히 기다린 뒤 수행하며, 창 스크롤은 0이고 본문 pane만 스크롤되는지도 확인합니다.

#### 수동 광고 단위

1. 계정에서 이 사이트의 **Auto ads를 OFF**로 바꾸고 **사이트에 적용**합니다. 수동 단위도 같은 SDK를 쓰므로 계정 설정이 ON이면 SDK가 여전히 자동광고를 삽입할 수 있습니다.
2. **광고 → 광고 단위 기준 → 디스플레이**에서 실제 단위를 만들거나 기존 단위의 `data-ad-slot`을 확인합니다. 게시자 ID나 자동광고가 생성한 ID를 수동 단위 ID로 대신 사용하지 마세요.
3. 아래 `AUTO_ADS_DISABLED_CONFIRMED`는 계정 OFF를 확인한 뒤에만 `true`로 설정합니다. 기존 수동 배치 설정도 `MODE=manual`을 명시해야 합니다.

```dotenv
NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT=ca-pub-본인게시자ID
NEXT_PUBLIC_GOOGLE_ADSENSE_MODE=manual
NEXT_PUBLIC_GOOGLE_ADSENSE_ARTICLE_SLOT=
NEXT_PUBLIC_GOOGLE_ADSENSE_POST_BOTTOM_SLOT=
NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_DISABLED_CONFIRMED=false
NEXT_PUBLIC_GOOGLE_ADSENSE_DISABLE=false
```

`ARTICLE_SLOT`은 일반 글의 완결된 최상위 코드·블록 수식 뒤, `POST_BOTTOM_SLOT`은 본문 끝에 사용합니다. 사용할 위치에만 실제 단위 ID를 넣습니다. callout·인용·목록·표·toggle·column 내부와 블록 본문·캡션 사이에는 삽입하지 않습니다. 짧은 글과 시작/끝 근처의 본문 슬롯은 생략합니다. 너비가 0인 Source-only/compact pane에서는 요청하지 않고 실제 보이게 될 때 한 번 요청합니다.

두 확인값은 **운영자 확인 기록이지 AdSense 계정 설정을 바꾸거나 검증하는 API가 아닙니다**. 선택한 모드의 확인만 사용하며, 잘못된 모드·미확인 모드는 비활성화합니다. 수동 모드는 실제 단위 ID가 하나도 없으면 SDK도 로드하지 않습니다. 자동 모드는 수동 슬롯을 렌더링하지 않습니다. `NEXT_PUBLIC_GOOGLE_ADSENSE_DISABLE=true`는 두 모드의 SDK·수동 슬롯을 모두 끕니다. 모드·클라이언트·확인값·단위 ID는 운영 `.env`와 GHCR 빌드용 GitHub repository variables에 맞춰 설정하고 이미지를 다시 빌드해야 합니다. `.env` 변경이나 재시작만으로 이미 빌드된 값은 바뀌지 않습니다.

기존 본문의 `google-anno-skip`은 공식 Ad intents 텍스트 스캔 제외일 뿐 일반 배너 차단 수단이 아니며, 자동 모드에서 텍스트 링크·칩을 계정에서 OFF로 설정하는 절차를 대신하지 않습니다. 별도의 미지원 skip 속성은 사용하지 않습니다. [공식 Auto ads 설정](https://support.google.com/adsense/answer/9305577?hl=ko) · [공식 Ad intents 제외](https://support.google.com/adsense/answer/15111968?hl=ko).

---


## Notion 셋업

### 1. Integration 만들기
[Notion Integrations](https://www.notion.so/my-integrations)에서 Internal Integration을 만들고 토큰(`ntn_...`)을 복사합니다.

### 2. DB 템플릿 복제 (권장)
[**Notion 블로그 템플릿**](https://www.notion.so/pieroot/blog-assets-35a067c015d080a0bf17d3a0dffb3784) 페이지를 본인 워크스페이스로 **Duplicate** 합니다. 페이지 안에는 Tablog가 사용하는 DB가 미리 구성되어 있습니다.

| DB | 용도 | 환경변수 |
|---|---|---|
| `blog-table` | 글 본문 (Posts · Pages · Papers) | `NOTION_DATASOURCE_ID` |
| `comments` | 방문자 익명 댓글 (선택) | `NOTION_COMMENTS_DATASOURCE_ID` |
| `visit-stats` | 페이지별 고유 방문자 통계 (선택) | `NOTION_VISIT_STATS_DATASOURCE_ID` |

기본 블로그에는 `blog-table`만 필요합니다. 원본 DB를 열어 우상단 `... → Add connections`에서 Integration을 추가하고, 읽기 권한을 허용합니다. 원본 `blog-table`의 주소 전체를 `.env`의 `NOTION_DATASOURCE_ID`에 넣은 뒤 `yarn setup`을 실행하면 실제 data-source UUID를 찾아 저장합니다. DB URL의 UUID나 `?v=`의 view ID를 data-source ID로 직접 사용하지 마세요.

선택 기능의 DB는 별도로 연결합니다. `comments`에는 댓글 삽입 권한도 필요합니다. `NOTION_COMMENTS_DATASOURCE_ID`와 `NOTION_VISIT_STATS_DATASOURCE_ID`에는 명시적인 data-source UUID를 넣습니다. 직접 조회할 때는 [Retrieve database API](https://developers.notion.com/reference/retrieve-database)에 `Authorization: Bearer <token>`과 `Notion-Version: 2026-03-11` 헤더를 보내고 `data_sources`의 이름과 ID로 대상 소스를 선택합니다.

> Notion 댓글은 기본 비활성입니다. 댓글 DB ID를 설정하고 `yarn setup`으로 salt를 생성한 뒤 `.env`에 `NEXT_PUBLIC_NOTION_COMMENTS_ENABLE=true`를 추가하고 다시 빌드하세요. 방문자 통계는 해당 DB ID와 독립적인 `VISITOR_HASH_SALT`가 설정된 경우에만 동작합니다. 두 기능 모두 기본 블로그 배포에는 필요하지 않습니다.

### 3. 직접 만들고 싶다면

템플릿 없이 새로 만들 때 권장 스키마.

#### `blog-table` (글)
| 프로퍼티명 | 타입 | 설명 |
|---|---|---|
| `Title` | title | 글 제목 |
| `Status` | select | `Public` · `PublicOnDetail` · `Private` |
| `Type` | select | `Post` · `Paper` · `Page` |
| `Slug` | url | URL 경로 (예: `my-first-post`) |
| `Date` | date | 발행일 |
| `Category` | select | 카테고리 (단일) |
| `Series` | select | 시리즈 (단일, 선택) |
| `Tags` | multi_select | 태그 (복수) |
| `Summary` | rich_text | 요약 (피드 카드에 표시) |
| `Thumbnail` | files 또는 url | 실제 글 썸네일 (Welcome Recent·Series · 검색 결과 · 카테고리/시리즈 상세 · 시리즈 대표 카드 · 본문 상단 히어로) |
| `접속자수` | number | 서버가 계산해 Notion에 동기화하는 페이지별 고유 방문자 수 |

#### `comments` (댓글)
| 프로퍼티명 | 타입 | 설명 |
|---|---|---|
| `Title` | title | 자동 요약 — `[slug] 익명#xxxx: 본문 30자` |
| `Slug` | rich_text | 글 slug (조회 키) |
| `PostId` | rich_text | Notion 글 page_id |
| `Nickname` | rich_text | `익명#xxxx` (서버에서 자동 생성) |
| `Body` | rich_text | 본문 (≤ 1000자) |
| `Status` | select | `approved`(default) / `hidden` / `spam` |
| `IpHash` | rich_text | `SHA-256(ip + COMMENT_HASH_SALT)` 앞 16자 |

`Status`를 `hidden` 또는 `spam`으로 바꾸면 페이지에서 자동 제외됩니다 (캐시 TTL 45s 만료 후).

#### `visit-stats` (방문자 통계)
| 프로퍼티명 | 타입 | 설명 |
|---|---|---|
| `Title` | title | 자동 요약 — `slug:visitKeyPrefix` |
| `Slug` | rich_text | 글 slug (조회 키) |
| `PostId` | rich_text | Notion 글 page_id |
| `VisitKey` | rich_text | `SHA-256(postId + salted visitor cookie)` 앞 32자. 원본 쿠키·IP·User-Agent는 저장하지 않음 |
| `FirstVisitedAt` | date | 최초 방문 시각 |

사이트 메타(제목, 설명, 프로필, 프로젝트 카드, About 페이지의 stack 등)는 루트의 `site.config.js`에서 관리합니다.

---

## 환경 변수

설정은 아래 세 경로를 구분합니다. 모든 `NEXT_PUBLIC_*`가 런타임 설정인 것은 아닙니다.

| 적용 경로 | 설정 | 변경 시 |
|---|---|---|
| 소스/빌드 | `site.config.js`의 프로필·프로젝트·언어·시간대·기본 테마, 사이트 URL, AdSense 정책/단위, Utterances 저장소, Notion 댓글 UI, `REVALIDATE_HOURS` | 네이티브 개발 서버 재시작, 운영 이미지 재빌드 |
| 명시적 공개 런타임 | Analytics ID와 Google/Naver/Bing 인증 값 | 새 환경변수로 컨테이너 재생성; entrypoint가 `runtime-config.js` 작성 |
| 서버 런타임 | Notion 토큰·DB ID·salt·관리 키·스토리지/서비스 URL·프록시 신뢰·webhook/알림 | 서버 환경 반영 후 프로세스/컨테이너 재생성; 이미지 build args에 비밀값을 넣지 않음 |


### 필수

| 변수명 | 설명 |
|---|---|
| `NOTION_TOKEN` | Notion Internal Integration Token (`ntn_...`) |
| `NOTION_DATASOURCE_ID` | `blog-table`의 **data-source UUID**. 최초 `yarn setup`에서는 원본 Notion DB 주소 전체를 넣어 자동 변환 가능 |
| `CONTENT_REDIS_URL` 또는 `CONTENT_STATE_DIR` | 공개 게시물·본문·slug 이력·대기 중인 경로/그래프 작업을 보관하는 내구성 콘텐츠 저장소. 운영·컨테이너는 AOF가 켜진 Redis 7.2+(`CONTENT_REDIS_URL`, Compose의 `content-redis`), 로컬 단일 호스트 개발은 디렉터리(`CONTENT_STATE_DIR=.content-state`). 둘 다 없으면 페이지 렌더와 동기화가 실패합니다 |
| `REVALIDATE_SECRET` | 관리 API의 Bearer 토큰. `.env.example`은 빈 값이고 `yarn setup`이 생성하므로 직접 만들 필요 없음. 기존 값은 유지하며 Compose에서는 필수 |

### 댓글 활성 시 필수 (`NEXT_PUBLIC_NOTION_COMMENTS_ENABLE=true`)

| 변수명 | 설명 |
|---|---|
| `NOTION_COMMENTS_DATASOURCE_ID` | `comments` DB의 **data_source ID** (UUID with hyphens) |
| `NEXT_PUBLIC_NOTION_COMMENTS_ENABLE` | 기본 `false`. `true`로 설정한 뒤 빌드하면 댓글 UI 활성화 |
| `COMMENT_HASH_SALT` | IP/닉네임 해싱용 salt. 댓글 DB ID를 설정한 뒤 `yarn setup`을 실행하면 빈 값만 생성 |

### 방문자 통계 활성 시 필수

| 변수명 | 설명 |
|---|---|
| `NOTION_VISIT_STATS_DATASOURCE_ID` | `visit-stats` DB의 **data_source ID** (UUID with hyphens) |
| `VISITOR_HASH_SALT` | 방문자 쿠키 해싱용 salt. 방문자 DB ID를 설정한 뒤 `yarn setup`이 독립 생성. `COMMENT_HASH_SALT`와 재사용하지 마세요 |

### 선택

| 변수명 | 기본값 | 설명 |
|---|---|---|
| `REDIS_URL` | — | Redis 연결 URL. 설정 시 L2 캐시 활성 (cold start 성능 향상). 예: `redis://localhost:6379`, `rediss://user:pass@host:6380` |
| `ANTHROPIC_API_KEY` | — | `/ontology`와 Graph Logical overlay의 엔티티·논리 관계 추출용. 임베딩·Meaning 검색·유사 글에는 필요 없음 |
| `EMBEDDING_SERVICE_URL` | — | 고정된 `google/embeddinggemma-2`를 실행하는 private HTTP 서비스. 네이티브 개발은 `http://localhost:8000`; Compose는 `http://embedding:8000`을 직접 설정. OpenAI/Hugging Face 키 불필요 |
| `QDRANT_URL` | `http://localhost:6333` | 로컬 개발 또는 외부 Qdrant REST endpoint. Docker Compose 기본 스택은 `docker-compose.yml`에서 컨테이너용 `http://qdrant:6333`을 직접 설정 |
| `QDRANT_API_KEY` | — | 인증이 걸린 외부 Qdrant용 API key. 로컬/self-hosted Qdrant는 빈 값 |
| `CACHE_NAMESPACE` | `monolog` | Redis 키 prefix. 동일 Redis를 staging·preview 등 여러 배포가 공유할 때 충돌 방지 |
| `GRAPH_BUILD_TIMEOUT_MS` | `120000` | Notion graph complete-build 시간 제한(ms). 제한을 넘긴 partial graph는 Qdrant snapshot으로 저장하지 않음. 최대 `300000` |
| `REVALIDATE_HOURS` | `6` | 소스 빌드 시 적용하는 ISR 재생성 주기(양의 정수 시간); 콘텐츠 대조 cron 주기와 별개 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | 사이트 canonical·sitemap·RSS·IndexNow와 요청 origin 검증에 사용. 공개 배포에는 본인의 실제 주소를 **빌드 전에** 설정 |
| `TRUSTED_PROXY_HOPS` | `0` | 기본값은 전달된 IP 헤더를 무시. 프록시 인증키 검증을 통과한 요청에서만 지정한 홉 수를 신뢰 |
| `TRUSTED_PROXY_SECRET` | — | 프록시 신뢰를 켤 때만 필요. 프록시가 `X-Monolog-Proxy-Secret`을 강한 공유키로 덮어써야 하며 기본 배포에는 필요 없음 |
| `NEXT_PUBLIC_GOOGLE_MEASUREMENT_ID` | — | Google Analytics |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | — | Google Search Console |
| `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | — | Naver Search Advisor |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | — | Bing Webmaster Tools (`msvalidate.01`) |
| `NEXT_PUBLIC_UTTERANCES_REPO` | — | Utterances 댓글 (`user/repo`) |
| `SLACK_WEBHOOK` | — | image-proxy 실패 Slack 알림 |
| `NOTION_WEBHOOK_VERIFICATION_TOKEN` | — | Notion webhook 서명 검증 secret. 비워 둔 채 구독을 만들면 서버 로그에 `verification_token`이 출력되고, 그 값을 Notion에서 검증한 뒤 이 변수에 설정 |
| `INDEXNOW_KEY` | — | IndexNow 키(16진수 8–128자, 예: `openssl rand -hex 16`). `/<key>.txt`로 제공되고 변경된 공개 URL을 발행 직후 제출 |
| `INDEXNOW_KEY_LOCATION` | `<CONFIG.link>/<key>.txt` | 같은 origin의 다른 키 파일 위치를 쓸 때만 설정 |
| `DISCORD_WEBHOOK` | — | 공개 조건(Status·Type·Slug·발행일)을 통과하지 못한 Notion 페이지 경고 (`https://discord.com/api/webhooks/...`) |
| `CONTENT_NAMESPACE` | `monolog` | `CONTENT_REDIS_URL` 안의 콘텐츠 키 namespace |
| `CONTENT_LOCK_MS` | `900000` | Redis 콘텐츠 작업 lease(ms). 갱신 중 lease를 잃으면 저장하지 않고 실패 |

`NEXT_PUBLIC_GOOGLE_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION`는 컨테이너 시작 시 공개 runtime-config에 주입됩니다. 공개 값만 넣고 Compose의 `env_file` 또는 `docker run --env-file .env …`로 전달합니다. `.env`를 바꾼 뒤 기존 컨테이너를 단순 `restart`하면 환경을 다시 읽지 않으므로 새 환경으로 **재생성**하세요. 값이 없으면 Analytics와 검증 메타 태그는 비활성화되며 앱은 정상 실행됩니다.

상세 글의 날짜 레이블과 같은 날 수정일 생략은 `site.config.js`의 `timeZone`(기본 `Asia/Seoul`)을 따릅니다. `<time dateTime>`과 JSON-LD에는 UTC ISO 시각을 유지합니다. IndexNow·Discord의 실패는 콘텐츠 발행을 막지 않고 `notificationsPending`으로 별도 집계하며, 일시 장애는 최대 8회 시도 후 제거합니다. 영구 오류·제거된 설정은 즉시 제거합니다.

### GitHub Actions Secrets (워크플로우 전용)

[`revalidate.yml`](../.github/workflows/revalidate.yml) 워크플로우가 사용하는 GitHub Repository Secrets.
등록: 저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | 필수 | 설명 |
|---|---|---|
| `REVALIDATE_URL` | 필수 | 운영 사이트 base URL (예: `https://your-site.com`, 끝 `/` 없음) |
| `REVALIDATE_SECRET` | 필수 | 컨테이너의 `REVALIDATE_SECRET` 환경변수와 동일 값 |

워크플로우는 15분마다 `POST /api/cron/content` 실행을 **예약**합니다. GitHub Actions의 schedule은 지연·누락될 수 있으므로 운영 동기화의 유일한 트리거로 사용하지 않습니다. 응답이 `200`이 아니면 실패하거나 남은 작업(`pending`)이 있다는 뜻이며, 남은 작업은 저장소에 보존되어 다음 실행에서 이어서 처리됩니다.

### 운영 호스트 cron (Linux, 기본 트리거)

운영 호스트에는 15분 cron을 등록하고 GitHub Actions는 보조 트리거로 유지합니다. `scripts/reconcile-content-host.sh`는 실행 위치와 무관하게 **스크립트가 속한 저장소 루트의 `.env`**를 읽고 로컬 `POST http://127.0.0.1:3000/api/cron/content`를 호출합니다. 호스트에 Bash·curl·`flock`(util-linux)이 필요하고 `.env`는 신뢰할 수 있는 shell-compatible 설정이어야 합니다. 토큰은 curl의 표준 입력으로 전달해 명령행에 노출하지 않습니다. 기존 캐시를 지우거나 실제 Notion 글을 수정하지 않습니다.

최초 backfill은 저장소에서 `bash scripts/reconcile-content-host.sh`로 실행합니다. 기존 작업을 보존하며 배포 계정의 `crontab -e`에 다음 줄을 추가하고 `/absolute/path/tablog`는 본인의 저장소 절대 경로로 교체합니다. 기존 경로를 유지했다면 그 경로를 사용합니다. 호스트의 `cron` 서비스가 실행 중이어야 합니다.

```cron
*/15 * * * * /bin/bash "/absolute/path/tablog/scripts/reconcile-content-host.sh" 2>&1 | /usr/bin/logger -t tablog-content-sync
```

스크립트는 사용자 캐시 디렉터리의 `flock`으로 호스트 작업 중첩을 막고 요청을 최대 900초로 제한합니다. GitHub 호출과의 중첩은 콘텐츠 저장소의 lease가 제어합니다. 실패한 콘텐츠 작업은 저장소에 남아 다음 실행에서 이어서 처리됩니다.

```bash
# 등록 상태와 실제 자동 호출 응답 확인 (토큰 출력 없음)
crontab -l
journalctl -t tablog-content-sync --since today --no-pager
```

등록만으로 자동 갱신이 검증된 것은 아닙니다. 실제 quarter-hour 실행 로그의 `status=completed`, `pending=0`, `failed=0`과 `maintenancePending`·`notificationsPending`을 확인하고, 수동 호출 성공과 자동 실행 성공을 구분해 보고합니다. `/api/init`의 성공은 발행 경로 준비를 뜻하며 임베딩 완료가 아닙니다. 유지보수 후에도 그래프의 현재 문서 임베딩 진행 수를 함께 확인해야 전체 의미 색인 완료를 판단할 수 있습니다.

---

## API 엔드포인트

| Path | 인증 | 용도 |
|---|---|---|
| `GET\|POST /api/revalidate` | `Authorization: Bearer $REVALIDATE_SECRET` | 수동 증분 동기화. 캐시를 지우지 않고 바뀐 글과 영향받는 경로만 갱신. `path=/slug`는 해당 글 본문을 다시 확인, `path=/categories/x`·`/series/x`·컬렉션 경로는 그 경로만 재생성, `full=true`는 삭제·이동 감지용 전체 메타데이터 대조. 모든 작업이 끝나면 `200`, 남은 작업이 있으면 `503` |
| `GET\|POST /api/init` | `Authorization: Bearer $REVALIDATE_SECRET` | 컨테이너 시작 워밍. 저장소가 비어 있으면 최초 동기화 후 모든 공개 경로를 재생성. AI 그래프 유지보수는 기다리지 않음(`maintenancePending`) |
| `GET\|POST /api/cron/content` | `Authorization: Bearer $REVALIDATE_SECRET` | 정기 증분 동기화 + 24시간 전체 대조, 최초·변경 포스트 임베딩, 대기 그래프·ontology 작업과 IndexNow 제출 처리 |
| `POST /api/notion-webhook` | `X-Notion-Signature` (HMAC-SHA256) | Notion 이벤트를 힌트로 받아 해당 페이지를 실시간 메타데이터로 다시 확인하고 발행. 같은 이벤트 ID는 한 번만 처리 |
| `POST /api/cron/ontology` | `REVALIDATE_SECRET` Bearer | 누락·변경 문서 임베딩을 먼저 보충하고 LLM ontology를 갱신. `?force=1`은 LLM 캐시 우회이며 같은 문서를 다시 임베딩하지 않음 |
| `GET /robots.txt` · `GET /llms.txt` | — | 크롤러 정책·사이트맵 위치, AI용 공개 글 색인 (공개 글 목록과 동기) |
| `GET /.well-known/security.txt` | 없음 | RFC 9116 취약점 제보 연락처·만료일·언어·canonical (`text/plain; charset=utf-8`) |
| `GET /security.txt` | 없음 | 표준 `/.well-known/security.txt` 경로로 308 리다이렉트 |
| `GET /{slug}.md` | — | 글의 Markdown 대체 표현 (`<link rel="alternate" type="text/markdown">`) |
| `GET /{INDEXNOW_KEY}.txt` | — | IndexNow 키 검증 파일 |
| `GET /api/similar?postId=<id-or-slug>&limit=5` | 없음 | 현재 문서 버전의 영속 EmbeddingGemma 벡터로 유사 글 반환. 벡터가 아직 없으면 `202` |
| `GET /api/graph/search?q=<query>` | 없음 | 공식 SearchQuery prompt로 현재 문서 버전의 공개 글 검색. IP당 분당 6회·웹 프로세스당 동시 1개, 초과는 `429`와 `Retry-After`. 미설정·유지보수 중·서비스 장애는 `503`, 빈 검색어·8000자 초과는 `400` |
| `GET /api/image-proxy?id=<uuid>&kind=s3` | 없음 (allow-list) | Notion S3 이미지 프록시 (안정 URL) |
| `GET /api/image-proxy?url=<url>` | 없음 (allow-list·IP 요청 제한) | Notion/AWS·GitHub OG 이미지 프록시, 기존 ISR URL 호환; 임의 외부 URL은 불가 |
| `GET /api/refresh-image?blockId=...` | 없음 | 단일 블록 이미지 URL 재발급 |
| `GET /api/comments?slug=...` | 없음 | slug별 댓글 목록 (45s 서버 캐시) |
| `POST /api/comments` | 없음 | 익명 댓글 작성 (honeypot + IP rate limit) |
| `POST /api/visits` | 없음 | 글 상세 페이지 방문 시 서버가 first-party `HttpOnly` 쿠키로 페이지별 고유 방문을 dedupe하고 Notion `접속자수`를 갱신 |
| `GET /sitemap.xml` | — | SSR 사이트맵 |
| `GET /rss.xml` | — | SSR RSS 2.0 피드 |

방문자 통계는 1년짜리 first-party `HttpOnly` 쿠키(`monolog_visitor_id`)를 사용합니다. Notion에는 salted per-page `VisitKey`만 저장하며 원본 쿠키 값, 원본 IP, User-Agent, cross-page visitor ID는 저장하지 않습니다. 방문자가 쿠키를 삭제하거나 다른 브라우저/기기를 쓰면 새 방문자로 계산됩니다.

```bash
# 수동 전체 대조 (삭제·이동 감지 포함, 캐시 wipe 없음)
curl -X POST -H "Authorization: Bearer $REVALIDATE_SECRET" "https://your-site.com/api/revalidate?full=true"
```

### 취약점 제보 안내 관리 (`security.txt`)

[`public/.well-known/security.txt`](../public/.well-known/security.txt)는 인증 없이 공개되는 정적 파일입니다. 취약점은 `Contact`의 이메일로 비공개 제보하며, 현재 사이트에 공개된 `pieroot@konkuk.ac.kr`를 사용합니다.

- `Contact`는 실제로 수신·확인할 수 있는 주소로 유지합니다. `site.config.js`의 `profile.email`과 자동 연동되지 않으므로 연락처를 바꾸면 이 파일도 함께 수정합니다.
- 현재 `Expires`는 `2027-10-01T00:00:00Z`입니다. 자동 갱신하지 않으므로 **만료 전에** 연락처를 점검하고, RFC 9116 권고에 따라 갱신 시점에서 1년 미만인 새 만료일을 설정합니다.
- 다른 도메인에 배포할 때는 `Canonical`을 자신의 `https://<domain>/.well-known/security.txt`로 변경합니다. `NEXT_PUBLIC_SITE_URL`을 바꿔도 이 정적 파일은 바뀌지 않습니다.

파일과 리다이렉트 설정은 Docker 이미지에 포함됩니다. 변경 후 새 이미지를 빌드·배포해야 하며, 기존 컨테이너를 재시작하는 것만으로는 반영되지 않습니다. 배포 후 표준 경로의 `200`·UTF-8 평문 응답과 루트 경로의 `308`·`Location`을 확인합니다.

```bash
curl -fsS -D - https://pieroot.xyz/.well-known/security.txt
curl -sSI https://pieroot.xyz/security.txt
```


---

## Docker

최소 설정과 `yarn setup`을 마친 뒤, 외부 공개 시 `.env`의 `NEXT_PUBLIC_SITE_URL`을 실제 HTTPS 주소로 설정합니다. 웹·임베딩을 소스 빌드하는 기본 경로는 프로젝트의 비공개 GHCR 이미지 인증이 필요하지 않습니다.

```bash
# blog + redis(캐시) + content-redis(내구성 콘텐츠 저장소) + qdrant + embedding
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 2400
docker compose ps
docker compose logs -f blog embedding
```

첫 기동은 모델 다운로드·CPU 추론과 Notion 콘텐츠 초기화를 포함합니다. Compose는 임베딩 서비스 readiness를 기다리고, blog entrypoint는 서버 기동 후 `/api/init`을 재시도해 공개 경로를 준비합니다. `/health`의 HTTP 프로세스 응답과 init 성공은 별개이며, init 재시도를 모두 실패해도 서버는 계속 실행하므로 **로그의 초기화 응답까지** 확인하세요. 이어서 `/api/cron/content`로 문서 임베딩 backfill을 진행합니다. 포트 3000 외의 서비스는 호스트에 공개하지 않습니다. DNS·HTTPS 리버스 프록시는 호스트에서 별도 구성합니다. `docker compose down -v`는 프로젝트의 named volume과 그 안의 내구성 콘텐츠·벡터 등을 삭제하므로 운영 갱신에 사용하지 않습니다.

외부 모니터링에는 홈페이지 대신 `https://<사이트 도메인>/health`를 사용하세요. 인증 없이 `GET`에 `200 OK`, `Content-Type: text/plain; charset=utf-8`, 본문 `ok\n`을 반환하며 `HEAD`도 지원합니다. 응답은 `Cache-Control: no-store`로 캐시하지 않습니다. 페이지 렌더링이나 Notion·Redis·Qdrant·임베딩 요청을 하지 않는 **liveness** 확인이며, 콘텐츠 초기화 완료나 모든 글·검색 기능의 정상 동작을 보장하지 않습니다. Compose와 entrypoint도 이 경로를 사용합니다. 리버스 프록시·CDN에서도 이 경로를 캐시하거나 홈페이지로 리다이렉트하지 않도록 설정하세요.

```bash
curl --fail --max-time 5 'https://<사이트-도메인>/health'
```

### 기존 운영 GHCR 이미지 사용 (선택)

웹 이미지 경로는 `ghcr.io/jung-geun/tablog`, 임베딩은 `ghcr.io/jung-geun/tablog-embedding`입니다. **두 패키지 모두 사용할 태그가 실제 게시됐는지와 패키지 접근 권한을 먼저 확인**하세요. 아래는 워크플로의 태그 규칙이지 게시 완료 목록이 아닙니다. 저장소 이름 변경만으로 이전 GHCR 패키지가 리다이렉트되거나 운영 이미지가 교체되지 않습니다. 처음 설치하는 일반 사용자는 위 소스 빌드를 사용하세요.

| 태그 | 트리거 |
|---|---|
| `latest` | `main` 브랜치 push 또는 git 태그 `v*` push |
| `X.Y.Z` | git 태그 `vX.Y.Z` push |

- 아키텍처: `linux/amd64`
- SLSA build provenance attestation 자동 첨부

GHCR CI 빌드에는 GitHub repository variables로 `NEXT_PUBLIC_SITE_URL`과 사용 중인 선택 기능의 공개 값을 설정합니다: `NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT`·`NEXT_PUBLIC_GOOGLE_ADSENSE_DISABLE`·`NEXT_PUBLIC_GOOGLE_ADSENSE_MODE`·`NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_IN_PAGE_DISABLED_CONFIRMED`·`NEXT_PUBLIC_GOOGLE_ADSENSE_ARTICLE_SLOT`·`NEXT_PUBLIC_GOOGLE_ADSENSE_POST_BOTTOM_SLOT`·`NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_DISABLED_CONFIRMED`·`NEXT_PUBLIC_UTTERANCES_REPO`·`NEXT_PUBLIC_NOTION_COMMENTS_ENABLE`·`REVALIDATE_HOURS`. 자동 모드의 인페이지·텍스트 광고 의도 OFF 확인값은 미설정 시 `false`이며, 계정 확인 후 운영 `.env`와 CI variable을 함께 맞춘 뒤 다시 빌드합니다. 이 값은 이미지 빌드 때 고정됩니다. `.env`만 바꿔서는 이미 게시된 이미지의 canonical·광고·댓글 UI가 바뀌지 않습니다. Notion 토큰·DB ID·salt·관리 키는 repository variables나 Docker build args에 넣지 말고 운영 `.env`에만 보관하세요.

`pieroot.xyz`는 이 저장소 운영자의 개인 사이트 예시이며 Tablog 설치에 필수인 도메인이 아닙니다. 자신의 공개 도메인을 **이미지 빌드 전** `.env`의 `NEXT_PUBLIC_SITE_URL`에 설정하고, GHCR CI를 사용하면 같은 repository variable에도 설정하세요. 빌드 값은 canonical·sitemap·RSS 등에 사용되고 운영 `.env`의 origin 검증 설정과 일치해야 합니다. `.env` 수정이나 컨테이너 재시작만으로 이전 이미지에 포함된 공개 URL은 바뀌지 않습니다. 별칭 도메인 리다이렉트·HTTPS는 본인의 리버스 프록시에 구성하며 로컬 개발은 `http://localhost:3000`을 사용합니다.

필요한 태그·접근 권한을 확인한 뒤에만 `docker compose pull blog embedding`으로 가져오고 두 이미지의 OCI revision·대상 아키텍처를 확인합니다. 교체 전 기존 이미지 rollback 태그/고정, `.env`·Compose override·캐시 Redis RDB·콘텐츠 Redis AOF·Qdrant snapshot을 백업합니다. `embedding`이 모델 다운로드·실제 추론 warmup까지 healthy가 된 후 `docker compose up -d --no-build --wait --wait-timeout 2400`으로 교체합니다. rollback은 백업한 이미지 고정·Compose 설정으로 되돌려 같은 원래 프로젝트/볼륨을 사용하며, 볼륨을 삭제하거나 새 이미지 이름으로 기존 pin을 덮어쓰지 않습니다.

서버 전용 `docker-compose.override.yml`이 `blog`·`redis`·`qdrant`를 외부 네트워크에 연결한다면 `content-redis`와 `embedding`도 blog가 도달 가능한 네트워크에 지정해야 합니다. 첫 배포는 새 서비스를 먼저 준비하고 기존 안내대로 후보 blog에서 `/api/init`과 실제 페이지를 확인한 뒤 교체합니다. `/api/init`은 임베딩을 기다리지 않으므로 교체 후 `/api/cron/content`로 첫 backfill을 진행하고 `pending`·`failed`·`maintenancePending`이 0인지 확인합니다.

### EmbeddingGemma · Qdrant · ontology

Compose의 `embedding`은 내부 네트워크의 `linux/amd64` CPU 서비스입니다. 기본 소스 빌드는 `docker compose build embedding`이고, 실제 게시 태그와 접근 권한을 확인하면 `ghcr.io/jung-geun/tablog-embedding:<tag>` 이미지를 사용할 수 있습니다. 웹·임베딩 이미지는 같은 Docker Build and Push 워크플로의 별도 matrix 작업으로 발행하므로 두 작업의 성공 여부를 각각 확인합니다. 호스트 포트를 공개하지 않으며 `embedding-model-cache` 볼륨에 공개 체크포인트를 보관합니다. 이 볼륨과 Qdrant 저장소도 백업 대상입니다.

모델은 [공식 EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2)의 고정 revision `914f7f89142e33e77833254d9c9b90c3cef7303b`, CPU float32, 768차원입니다. 첫 실행은 약 1.49GB의 결합 safetensors를 내려받지만 vision/audio encoder는 생성하지 않습니다. `/health`는 다운로드와 실제 추론 성공 뒤에만 ready를 반환하며, 초기 health grace는 30분입니다. 긴 글은 8192-token 창마다 처리하므로 메모리·CPU 여유가 필요합니다. ARM 호스트에서는 선언된 amd64 서비스의 에뮬레이션이 필요합니다.

readiness의 짧은 query 추론과 긴 문서 backfill은 메모리 사용량이 다르므로 실제 문서 길이에 맞는 Docker/서버 메모리를 확보하세요. 재시작·OOM은 `docker compose logs embedding`과 Docker 호스트 로그로 확인합니다. 키를 추가하거나 이미지만 반복 재시작해도 메모리 부족은 해결되지 않습니다. 환경을 보완한 뒤 유지보수를 다시 실행해 `/api/cron/content`의 `pending=0`, `failed=0`, `maintenancePending=0`과 그래프의 현재 문서 임베딩 진행 수를 함께 확인하세요. `/api/init`은 임베딩을 실행하지 않으므로 그 응답이나 모델 서비스의 healthy만으로 전체 backfill 완료를 판단하면 안 됩니다.

공개 의미 검색은 IP당 분당 6회·웹 프로세스당 동시 1개로 제한하며 초과 시 `429`와 `Retry-After`를 반환합니다. 모델 서비스는 문서 유지보수에 우선권과 최대 1개 대기 예약을 부여하고 추가 요청을 `503`으로 거절합니다. health 요청은 추론 대기열과 분리하며, 웹의 query 추론은 30초·document 추론은 10분 뒤 중단합니다.

`QDRANT_URL`은 Compose의 `http://qdrant:6333`, 네이티브 개발의 `http://localhost:6333`을 사용합니다. 새 768d 컬렉션은 예전 OpenAI 1536d `posts` 컬렉션을 읽거나 덮어쓰지 않습니다. 동일 제목·본문·모델 revision은 정기 재검증이나 LLM 강제 갱신에서도 재임베딩하지 않습니다. 최초 backfill·제목·본문 수정만 계산하고 slug·태그 수정은 payload만 갱신합니다.

호스트 cron `/api/cron/content`가 임베딩과 증분 작업을 처리합니다. 초기화·webhook·수동 revalidate는 경로 발행을 먼저 마치며 다음 유지보수가 임베딩을 채웁니다. 수동 ontology 갱신도 같은 콘텐츠 잠금을 사용해 동시 발행·벡터 쓰기를 직렬화합니다. Meaning 검색과 RightRail 유사 글은 Anthropic 키 없이 동작하고, 논리 온톨로지 추출만 `ANTHROPIC_API_KEY`가 필요합니다. 수동 온톨로지 갱신:

```bash
curl -X POST "https://your-site.com/api/cron/ontology" \
  -H "Authorization: Bearer $REVALIDATE_SECRET"
```

Compose의 `build.args`는 사이트 주소·Utterances 저장소·AdSense client/disable·자동/수동 모드·인페이지 및 텍스트 광고 의도 OFF 확인·수동 단위 ID·Auto ads OFF 확인·재검증 주기를 웹 이미지에 전달합니다. 자동 모드 확인값 `NEXT_PUBLIC_GOOGLE_ADSENSE_AUTO_ADS_IN_PAGE_DISABLED_CONFIRMED`는 Compose·Dockerfile·GHCR CI에서 기본 `false`이며 `site.config.js`도 정확히 `true`일 때만 확인으로 취급합니다. 이 값과 `site.config.js`를 변경하면 `docker compose up -d --build --wait --wait-timeout 2400`으로 다시 빌드합니다. 재빌드·배포 후에는 위 광고 절차의 실제 런타임 게재·배치 증거를 별도로 확보해야 합니다. Analytics 및 Google/Naver/Bing 인증 값만 컨테이너 시작 시 runtime-config로 주입되므로 이미지 재빌드 없이 재생성할 수 있습니다. 모든 `NEXT_PUBLIC_*`가 런타임 값인 것은 아닙니다.

단독 `docker run`은 내구성 콘텐츠 Redis와 그래프 서비스 연결을 자동 구성하지 않습니다. 기본 설치·운영에는 위 Compose 경로를 사용합니다.


### Redis 캐시 (선택)

기본 Compose는 이미 `redis`를 캐시 L2로 연결합니다. 네이티브 개발 또는 별도 구성에서 외부 Redis를 쓰려면 서버 `.env`에 `REDIS_URL=redis://localhost:6379`(인증/TLS 환경은 해당 주소)를 설정합니다. 기본 Compose는 이를 내부 `redis://redis:6379`로 지정하므로 외부 Redis 전환은 Compose 환경 설정도 명시적으로 바꿔야 합니다. 캐시 Redis와 콘텐츠 authority는 같은 역할이 아닙니다.

Redis 미설정 시 in-process 메모리 캐시(L1)만 사용합니다 — 서버 재시작마다 초기화됩니다.

`content-redis`는 TTL 캐시와 분리된 내구성 콘텐츠 저장소입니다. 첫 기동부터 AOF(`--appendonly yes`)가 켜져 있고, 저장은 `WAITAOF`로 로컬 fsync를 확인한 뒤에만 성공합니다. 기존 캐시 `redis`의 설정을 재시작으로 AOF로 바꾸면 기존 RDB 데이터셋을 읽지 않으므로, 두 저장소를 합치지 마세요. 백업 대상에 `content-redis-data` 볼륨을 포함하세요.

### 볼륨 (`docker-compose.yml`)

| Compose volume 키 | 용도 / 컨테이너 경로 |
|---|---|
| `logs-data` | 웹 로그 `/app/logs` |
| `image-cache` | 이미지 BLOB 캐시 `/app/.image-cache` |
| `redis-data` | 캐시 Redis `/data` |
| `content-redis-data` | AOF 기반 콘텐츠 authority `/data` |
| `qdrant-storage` | 그래프 snapshot·문서 벡터 `/qdrant/storage` |
| `embedding-model-cache` | 모델 체크포인트 `/models` |

실제 Docker volume 이름에는 기존 Compose 프로젝트 prefix가 붙을 수 있습니다. checkout 디렉터리나 제품 이름이 달라져도 원래 프로젝트 이름과 볼륨 연결을 보존합니다. 이미지 캐시는 재생성 가능하지만 콘텐츠 레지스트리와 벡터 저장소까지 함께 지우는 명령으로 관리하지 마세요.

---

## 스크립트

```bash
yarn setup            # 최소 .env 입력 검증 · DB 주소 변환 · 비밀키/salt 생성
yarn dev              # 개발 서버 (next dev --webpack)
yarn build            # 프로덕션 빌드 (next build --webpack)
yarn start            # 빌드 결과 실행
yarn type-check       # TypeScript strict 검사
yarn lint             # ESLint
yarn test             # Jest 단위 테스트 (test:unit과 동일)
yarn test:unit        # 명시적 unit 선택
yarn test:integration # 선택 실행: 실제 Notion API·로컬 환경/fixture 사용
yarn test:all         # unit 성공 후 live integration 실행
yarn test:watch       # unit watch
yarn test:coverage    # unit coverage
yarn test:coverage:all # unit 및 live integration coverage
yarn warm:graph       # 실행 중인 localhost:${PORT:-3000} 그래프 JSON 요청
```

통합 테스트는 최소 토큰/DB가 없으면 건너뛰며, 설정돼 있으면 실제 Notion을 조회합니다. `NOTION_TEST_POST_TITLE`(기본 `test post`), 실제 표를 포함한 최근 페이지, color 테스트의 고정 페이지 등 선택한 테스트의 fixture 접근 권한이 필요합니다. 일부 fixture 부재는 assertion을 건너뛰거나 실패하므로 skip을 실제 API 검증 성공으로 보고하지 않습니다. `.env`에 자격증명이 있다는 이유만으로 자동 실행하지 말고 전용 테스트 데이터로 명시적으로 선택하세요. `test:all`도 live 접근을 포함합니다. 세부 기여 절차는 [CONTRIBUTING](../.github/CONTRIBUTING.md)을 참고하세요.

CI는 `yarn test`와 별도 `yarn build`를 실행합니다. 현재 lint·type-check 단계는 `continue-on-error`이므로 workflow 성공만으로 두 검사에 오류가 없었다고 판단하지 말고 각 결과를 확인하세요.

### 수동 CI runner 선택

`Test Suite`의 일반 push·PR 검사와 수동 실행 기본값은 GitHub hosted `ubuntu-latest`를 사용합니다. Hosted runner를 확보할 수 없을 때는 수동 실행에서만 기존 `self-hosted`·`Linux`·`X64` runner를 선택할 수 있습니다.

```bash
gh workflow run test.yml --ref main -f runner=self-hosted
```

`--ref`에는 검증할 저장소 브랜치·태그를 지정합니다. Self-hosted 경로는 Node.js 설치 후 Corepack으로 `package.json`의 `packageManager`에 선언된 Yarn을 활성화하고 동일한 테스트·빌드를 실행합니다. 해당 호스트에서 프로젝트 코드가 실행되므로 신뢰하는 브랜치만 수동으로 선택하세요.

웹·임베딩 이미지의 일반 main/tag 빌드는 GitHub hosted `ubuntu-latest`에서 선언된 `linux/amd64` 대상으로 수행합니다. 게시에 사용하는 공개 build args는 운영에서 검증한 사이트 주소·댓글·광고 설정·재검증 주기와 맞추고 비밀값은 넣지 않습니다. 이미지 게시 자체는 운영 컨테이너 교체가 아닙니다.

아래 수동 staging 작업은 기존 self-hosted Docker 데몬에 이미지를 적재하는 별도 경로이며, 다른 호스트의 Docker context를 자동 갱신하지 않습니다. 운영 호스트를 이전했다면 기존 writer와 볼륨을 보존하고 실제 대상 데몬·Compose 프로젝트를 확인한 뒤, 검증한 이미지의 digest 또는 레이어·설정 동일성을 확인해 이전합니다. 오프라인 self-hosted runner를 이전 운영 호스트와 혼동해 다시 시작하지 않습니다.

운영 호스트가 비공개 GHCR 이미지를 직접 pull할 인증이 없으면, 같은 Docker 데몬을 공유하는 신뢰된 self-hosted runner에서 기존 `GHCR_TOKEN`으로 게시 이미지만 적재합니다. 토큰을 호스트나 로그에 내보내지 않으며 패키지를 공개로 바꾸지 않습니다. 아래 수동 경로는 재빌드 없이 두 이미지의 지정 태그를 pull하고 로컬 `latest`로 지정합니다. 이후 Compose에서 `--no-build --pull never --no-deps`로 필요한 서비스만 시작합니다.

```bash
gh workflow run docker-build.yml --ref main -f image-tag=검증한-게시-태그
```


---

## 구조·개발 문서

중복된 전체 파일 트리 대신 목적에 맞는 문서를 사용합니다. 실제 의존성·실행 명령은 `package.json`과 `yarn.lock`, 배포 서비스·마운트는 적용 중인 Compose 파일이 기준입니다.

| 목적 | 참조 |
|---|---|
| 모듈 책임·페이지/API·콘텐츠 파이프라인·저장소 경계 | [`project.md`](../project.md) |
| 문서 뷰·검색·시리즈·차트·그래프·Notion 블록 지원 범위 | [`FEATURES.md`](FEATURES.md) |
| 테마·레이아웃·모션·접근성·광고 경계 | [`DESIGN.md`](../DESIGN.md) |
| 개발 환경·단위/실제 연동 테스트·변경 제출 | [`CONTRIBUTING.md`](../.github/CONTRIBUTING.md) |


## 선택적 운영자 분석 도구와 Google OAuth

블로그 통계·검색 실적을 외부 도구로 분석할 때는 Google Analytics의 `analytics.readonly`와 Search Console의 `webmasters.readonly`를 구분하고, 사용하는 API 활성화와 해당 속성의 계정 접근 권한을 확인합니다. 다른 서브도메인을 포함하는 Search Console 도메인 속성은 분석 대상 URL로 필터링하며, 페이지 집계와 속성 집계·검색어별 집계의 차이를 명시합니다.

OAuth 도구의 공개 앱 홈페이지·개인정보처리방침은 **각 운영자가 실제 처리 방식에 맞춰 별도로 제공**해야 합니다. 접근 데이터, 목적, 저장·공유·AI 처리, 보관·삭제·연결 철회와 Google API Limited Use를 설명하고 앱 홈페이지에서 방침으로 연결합니다. 특정 운영자의 개인정보처리방침을 공용 템플릿의 `public/` 또는 기본 이미지에 넣지 않습니다. 공개 문서 게시와 Google 심사 승인·프로덕션 게시 상태는 별개이며, 테스트 상태의 갱신 토큰은 7일 후 만료될 수 있습니다.

OAuth 클라이언트 JSON·ADC·갱신 토큰은 앱 저장소·공개 경로·로그·모델 입력 밖에 보관합니다. 분석에 불필요한 Cloud 권한을 요구하는 인증 흐름 대신 필요한 두 읽기 권한만 승인하고, 실제 토큰 갱신과 scope를 검증합니다. 이전의 결합 승인을 철회하면 같은 Google 프로젝트의 다른 토큰에도 영향을 줄 수 있으므로 최종 최소 권한 재인증 전에 처리하고 새 연결을 다시 검증합니다.

개인 호스트의 주간 분석 프로그램·보고서·세션·스케줄 및 공개 문서 원본은 앱 배포와 분리해 관리하고, 해당 운영 환경의 별도 운영 가이드와 백업을 유지합니다. 부분 수집을 정상·0건으로 취급하거나 작은 표본을 성장·실패로 단정하지 않습니다. 글·Google 설정의 변경은 별도 검토하며, 제목·본문·게시일·검색량·경험을 꾸미거나 같은 글을 여러 URL로 복제하는 노출 개선은 하지 않습니다.

주간 분석을 운영한다면 실패·진단 실행에서도 보관 기간 정리를 수행하고, `정상 → 부분 수집 → 정상` 전환에서 미해결 문제와 마지막 검증 인벤토리를 유지합니다. 지속 세션에 주간 원본을 무한 누적하지 않도록 실제 입력 토큰·모델 컨텍스트를 확인하고 요약·압축을 사용하며, 플랫폼이 추가로 생성하는 heartbeat·자동 학습 작업도 분석 작업의 도구 권한과 분리해 확인합니다.

