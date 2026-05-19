# CLAUDE.md

> 이 파일은 Claude Code가 매 대화마다 프로젝트 맥락을 빠르게 파악하기 위한 가이드입니다.
> 상세 구현 계획은 `IMPLEMENTATION_PLAN.md`를 참조하세요.

---

## 토큰 절약 원칙

이 프로젝트는 매 대화 토큰 비용을 의식해서 다음을 지킨다.

- `docs/IMPLEMENTATION_PLAN.md`는 통째로 읽지 말 것. 작업할 Phase 섹션을 `grep -n "1.5 Dropbox" docs/IMPLEMENTATION_PLAN.md` 처럼 anchor를 먼저 찾아 `Read`의 `offset`/`limit`으로 그 범위만 호출한다.
- [docs/DESIGN_GUIDE.md](docs/DESIGN_GUIDE.md) / [docs/NOTE_FORMAT.md](docs/NOTE_FORMAT.md) / [docs/FAQ.md](docs/FAQ.md)는 CLAUDE.md에서 분리되어 있다. 해당 주제(UI 작업 / 노트 포맷 수정 / 함정 디버깅)가 등장할 때만 읽는다.

---

## 프로젝트 개요

**이름**: YouTube → Obsidian 학습 노트 자동화 도구

**목적**: 유튜브 강좌 영상을 검색·요약하여 옵시디언 보관함(Dropbox 기반)에 자동으로 마크다운 노트를 생성하는 개인 학습용 웹 애플리케이션.

**사용자**: 본인 1명 (개인 학습용)

**사용 흐름**: 검색어 + 필터 입력 → 유튜브 영상 목록 표시 → 복수 선택 → 카테고리 선택 → 자막 추출 → Gemini AI 요약 → Dropbox vault에 마크다운 노트로 저장 → 모바일 옵시디언으로 출퇴근 학습.

---

## 기술 스택

### 프론트엔드

- **Next.js 15+** (App Router, 안정 버전)
- **TypeScript** (strict mode 필수)
- **Tailwind CSS** (v4 안정 버전)
- **Shadcn UI** (Radix UI + Tailwind 기반)
- **디자인 시스템**: Notion 스타일 (`DESIGN.md` 참조)

### 백엔드

- **Next.js API Routes** (별도 서버 없음)
- **Server-Sent Events (SSE)** — 다중 영상 처리 진행 상황 스트리밍용

### 외부 API

| 용도      | 기술                                       | 비용                   |
| --------- | ------------------------------------------ | ---------------------- |
| 영상 검색 | YouTube Data API v3                        | 무료 (일 10,000 units) |
| 자막 추출 | `youtube-transcript` (npm)                 | 무료                   |
| AI 요약   | Google Gemini API (`gemini-2.0-flash-exp`) | 무료 (일 1,500 요청)   |
| 노트 저장 | Dropbox API (`dropbox` SDK)                | 무료                   |

### 개발 환경

- **Node.js**: 20 LTS 이상
- **패키지 매니저**: npm (계획서에는 pnpm으로 적혀 있지만 실제 셋업은 npm으로 진행됨)
- **IDE**: VS Code + Claude Code 공식 확장
- **배포**: Vercel (Hobby 플랜)

---

## 디렉토리 구조

```
youtube-obsidian-notes/
├── app/
│   ├── page.tsx                    # 검색 페이지 (메인)
│   ├── process/page.tsx            # 처리 진행 상황 페이지
│   ├── settings/page.tsx           # 노트 양식 설정 페이지 (Phase 4.3)
│   ├── dev/
│   │   ├── layout.tsx              # NODE_ENV !== 'development' 시 notFound() (Phase 2.6)
│   │   └── page.tsx                # 백엔드 raw JSON 디버깅용 (dev 전용 게이팅됨)
│   └── api/
│       ├── search/route.ts         # YouTube 검색 API
│       ├── process/route.ts        # 단일 영상 처리 API
│       ├── process-batch/route.ts  # 복수 영상 처리 API (SSE)
│       ├── video/route.ts          # 단일 영상 메타 GET (URL 직접 정리용)
│       └── settings/template/route.ts # 노트 양식 GET/PUT (Phase 4.3)
├── components/
│   ├── ui/                         # Shadcn UI 컴포넌트 (`tabs.tsx` 포함, Phase 4.4)
│   ├── settings/                   # 설정 페이지의 탭별 컴포넌트 — 탭 하나당 한 파일 (Phase 4.4 분리)
│   │   ├── CategoriesTab.tsx
│   │   ├── NoteTemplateTab.tsx
│   │   └── ProcessedHistoryTab.tsx # 처리 이력 조회/비우기 (Phase 4.6)
│   ├── SearchForm.tsx
│   ├── SearchResults.tsx
│   ├── VideoCard.tsx
│   ├── UrlInputCard.tsx            # URL 직접 정리 입력 카드
│   ├── CategorySelectModal.tsx     # 카테고리 + 하위폴더 선택 모달
│   ├── ProcessProgress.tsx
│   └── FilterPanel.tsx
├── config/
│   ├── categories.ts               # 기본 카테고리 목록
│   └── note-template.ts            # DEFAULT_TEMPLATE + EXAMPLE_TEMPLATES (Phase 4.3)
├── lib/
│   ├── youtube/
│   │   ├── search.ts               # YouTube Data API 검색
│   │   ├── transcript.ts           # 자막 추출
│   │   ├── parseUrl.ts             # YouTube URL/영상 ID → videoId 추출
│   │   └── types.ts
│   ├── ai/
│   │   ├── gemini.ts               # Gemini API 호출 (Dropbox 양식 인자 받음)
│   │   └── prompts.ts              # 프롬프트 + 양식 플레이스홀더 치환
│   ├── dropbox/
│   │   ├── auth.ts                 # refresh_token 기반 access_token 자동 갱신
│   │   ├── upload.ts               # 카테고리/검색어 기반 폴더에 업로드
│   │   ├── template.ts             # 노트 양식 read/write/seed (Phase 4.3)
│   │   └── index-note.ts           # 인덱스 노트 생성 (Phase 4)
│   └── utils/
│       ├── language.ts             # 언어 감지
│       ├── slugify.ts              # 폴더/파일명 슬러그화
│       ├── filename.ts
│       ├── duration.ts             # ISO 8601 duration 파싱
│       ├── categories-storage.ts   # 사용자 정의 카테고리 + 마지막 선택 localStorage (Phase 4.4)
│       └── processed-videos-storage.ts  # 정리한 영상 이력 localStorage (Phase 4.6)
├── scripts/
│   └── dropbox-exchange-code.mjs   # OAuth code → refresh_token 1회성 교환 (gitignored)
└── types/
    └── index.ts
```

---

## 옵시디언 Vault 폴더 구조

생성되는 노트는 **카테고리 + 검색어 기반 하이브리드 구조**로 분류됩니다.

```
/Vault/YouTube/                       ← DROPBOX_VAULT_PATH (루트)
├── .config/                           ← 앱 설정 파일 (옵시디언이 평소엔 안 보여줌)
│   ├── note-template.md              ← 사용자 정의 활성 노트 양식 (Phase 4.3)
│   └── note-template-examples/       ← 참고용 예시 양식들 (Phase 4.3 시드)
│       ├── practical.md
│       └── friendly.md
├── _inbox/                            ← 카테고리 미선택 시
├── 프로그래밍/                         ← 사용자 선택 카테고리
│   ├── 파이썬-데이터-분석-기초/        ← 검색어 슬러그 자동 생성
│   │   ├── _index.md                 ← 학습 세션 인덱스 (Phase 4)
│   │   └── 2026-05-14_채널명_제목.md
│   └── React-Hook-심화/
└── AI-머신러닝/
```

**규칙**:

- 카테고리는 사용자가 모달에서 선택 (`config/categories.ts`의 기본 목록 또는 새로 추가)
- 검색어는 슬러그화되어 카테고리 아래에 자동 폴더로 생성
- Dropbox API의 `filesUpload`는 상위 폴더가 없으면 자동 생성되므로 별도 `createFolder` 호출 불필요
- 파일명: `YYYY-MM-DD_채널명슬러그_제목슬러그.md`

---

## 노트 마크다운 형식

생성되는 노트의 frontmatter / 섹션 구조 원형은 [docs/NOTE_FORMAT.md](docs/NOTE_FORMAT.md) 참조. 실제 프롬프트와 frontmatter 생성 코드는 [lib/ai/prompts.ts](lib/ai/prompts.ts)에 있다. Phase 4.3부터는 "출력 형식" 영역(노트 본문 마크다운 양식)을 사용자가 `/settings`에서 직접 편집할 수 있으며, 저장된 양식은 Dropbox vault의 `.config/note-template.md`에 들어간다. 기본/예시 양식 상수는 [config/note-template.ts](config/note-template.ts) 참조.

---

## 환경 변수 (.env.local)

```bash
# YouTube Data API v3 (Google Cloud Console에서 발급)
YOUTUBE_API_KEY=AIzaSy...

# Gemini API (Google AI Studio 또는 Google Cloud Console에서 발급)
GEMINI_API_KEY=AIzaSy...

# Dropbox (refresh_token 기반 자동 갱신 — scripts/dropbox-exchange-code.mjs 1회 실행으로 발급)
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_REFRESH_TOKEN=...
DROPBOX_VAULT_PATH=/Apps/youtube-obsidian-sync/YouTube

# Gemini 모델
GEMINI_MODEL=gemini-2.0-flash-exp

# 처리 제한
MAX_VIDEOS_PER_BATCH=10
MAX_RESULTS_PER_SEARCH=20
```

> 계획서(`docs/IMPLEMENTATION_PLAN.md`)에는 두 API를 같은 키로 묶을 수 있다고 적혀 있지만, 실제로는 별도 키가 필요해서 `YOUTUBE_API_KEY`와 `GEMINI_API_KEY`로 분리해서 관리합니다.

**중요**:

- API 키는 절대 클라이언트 코드에 노출하지 말 것. 반드시 서버 사이드(API Routes)에서만 사용.
- `.env.local`은 `.gitignore`에 포함되어 있어야 함. 커밋 전 항상 확인.

---

## 디자인 가이드

UI 작업(Phase 2+) 시작 전에 [docs/DESIGN_GUIDE.md](docs/DESIGN_GUIDE.md)를 먼저 읽는다. Notion 스타일 디자인 시스템(따뜻한 미니멀리즘, 세리프 헤딩, 부드러운 표면)을 이 프로젝트에 어떻게 적용하는지(컬러 토큰 매핑, 폰트, 컴포넌트별 적용 포인트, 다크 모드 톤)를 정리한 문서. 컬러/타이포 토큰 원본 정의는 프로젝트 루트의 `DESIGN.md` (getdesign으로 받은 Notion 정의).

---

## 구현 Phase

| Phase       | 내용                                                                                                         | 상태                            |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Phase 1** | 프로젝트 셋업 + 핵심 백엔드 모듈 (YouTube 검색, 자막 추출, Gemini 요약, Dropbox 업로드) + 개발용 검증 페이지 | ✅ 완료 (2026-05-13)             |
| **Phase 2** | 검색 UI + 결과 목록 + 카테고리 선택 모달 + 단일 영상 처리                                                    | ✅ 완료 (2026-05-14)             |
| **Phase 3** | 복수 선택 + SSE 기반 일괄 처리 + 진행 상황 표시                                                              | ✅ 완료 (2026-05-19)             |
| **Phase 4** | 카테고리 관리 UI, 인덱스 노트 자동 생성, 노트 템플릿 편집, PWA, 배포                                         | 🟡 진행 중 — 4.3·4.4·4.6·4.7 완료 (2026-05-19), 4.1·4.2·4.5 보류, 4.8 미착수 |

> 현재 Phase는 작업 시작 전 매번 확인할 것. 각 Phase의 세부 작업 목록은 `IMPLEMENTATION_PLAN.md` 섹션 6 참조.

### 백엔드 모듈 진행 상황

| 모듈                         | 위치                                  | 상태   | 비고                                                       |
| ---------------------------- | ------------------------------------- | ------ | ---------------------------------------------------------- |
| YouTube 검색                 | `lib/youtube/search.ts`               | ✅ 완료 | 네이티브 `fetch`로 직접 호출 (`@googleapis/youtube` 미사용) |
| YouTube 타입 정의            | `lib/youtube/types.ts`                | ✅ 완료 | 응답에서 실제 읽는 필드만 좁혀서 정의                       |
| ISO 8601 duration 파서       | `lib/utils/duration.ts`               | ✅ 완료 | `parseIso8601Duration`, `formatDuration`                    |
| 언어 감지                    | `lib/utils/language.ts`               | ✅ 완료 | `defaultLanguage` 우선, 없으면 한/일/중/영 휴리스틱         |
| 검색 Route Handler           | `app/api/search/route.ts`             | ✅ 완료 (+페이지네이션, +재생목록) | GET, 쿼리스트링 기반. `pageToken` 쿼리로 페이지 이동, 응답에 `nextPageToken`/`prevPageToken`/`totalResults` 동봉. `type=playlist` + `playlistId` 쿼리로 재생목록 모드 페이지 이동 (응답에 `playlistContext` 동봉) |
| 자막 추출                    | `lib/youtube/transcript.ts`           | ✅ 완료 | `youtube-transcript` 사용, ko→en→기본 자막 폴백, 초 단위 정규화 |
| Gemini 요약                  | `lib/ai/gemini.ts`, `lib/ai/prompts.ts` | ✅ 완료 | 네이티브 fetch로 REST 호출. Frontmatter는 코드에서 결정론적 생성, 본문만 모델에 요청. `summarizeTranscript`/`buildSummaryPrompt`는 사용자 정의 양식(Phase 4.3)을 받아 `{{title}}`·`{{categoryTag}}` 치환 후 "출력 형식" 자리에 삽입 |
| 노트 양식 Dropbox 저장소     | `lib/dropbox/template.ts`, `config/note-template.ts` | ✅ Phase 4.3 | Dropbox `.config/note-template.md`에 활성 양식 1개 + `.config/note-template-examples/{practical,friendly}.md`에 예시 2종 시드. `getNoteTemplate()`은 robust(실패 시 DEFAULT_TEMPLATE 폴백), `loadTemplateForSettings()`는 strict(설정 페이지가 에러 노출). `saveNoteTemplate()`은 `mode: 'overwrite'` |
| 노트 양식 Route Handler      | `app/api/settings/template/route.ts`  | ✅ Phase 4.3 | GET — 활성 양식 + source(`'remote'`/`'default'`) 반환, 신규 환경이면 시드까지 수행. PUT — `{ content: string }`, 빈 본문 400, 인증 실패는 500 |
| 카테고리 설정                | `config/categories.ts`                | ✅ 완료 | `DEFAULT_CATEGORIES`, `INBOX_CATEGORY`, `DefaultCategory` 타입 |
| 슬러그 / 파일명 생성         | `lib/utils/slugify.ts`, `lib/utils/filename.ts` | ✅ 완료 | 한글/영문/숫자/하이픈만 허용, `generateNoteFilename`이 채널 24자·제목 60자로 자름 |
| Dropbox 업로드               | `lib/dropbox/upload.ts`               | ✅ 완료 | 네이티브 fetch, ASCII-safe `Dropbox-API-Arg` 처리, `autorename: true` |
| Dropbox 토큰 자동 갱신       | `lib/dropbox/auth.ts`                 | ✅ 완료 | `getDropboxAccessToken()` — refresh_token으로 access_token 자동 발급, 메모리 캐시(만료 5분 전 사전 갱신) |
| 단일 처리 Route Handler      | `app/api/process/route.ts`            | ✅ 완료 | POST. 파이프라인 `meta → transcript → summarize → upload`. 실패 응답에 `step` 라벨 포함 |
| 일괄 처리 Route Handler (SSE) | `app/api/process-batch/route.ts`     | ✅ Phase 3.2 | POST. 영상별 순차 실행 + `data: <json>\n\n` SSE 스트림. 이벤트: `start`/`progress`/`complete`(filename+path)/`error`(optional `step` + upload 실패 시 `markdown`/`filename` 동봉)/`done`. 영상 간 `INTER_VIDEO_DELAY_MS=1000ms`, 11자 정규식, `MAX_VIDEOS_PER_BATCH`(env, 기본 10), 중복 videoId dedup, `request.signal.abort` 시 다음 영상 진입 차단 |
| 단일 영상 메타 조회          | `lib/youtube/search.ts` (`getVideoMeta`) | ✅ 완료 | 단일 videoId로 `VideoSearchResult` 조회. dev 페이지와 Phase 2/3 단일 처리에서 재사용 |
| YouTube URL → videoId 파서   | `lib/youtube/parseUrl.ts` (`extractVideoId`) | ✅ URL 직접 정리 | 11자 ID, `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/`, `/v/` 형태 + `m.`/`music.`/스킴 없는 호스트도 처리. `new URL()` 파싱 기반, 형식이 안 맞으면 null. 서버/클라이언트 양쪽에서 import 가능 (의존성 없음) |
| 단일 영상 메타 Route Handler | `app/api/video/route.ts`                | ✅ URL 직접 정리 | GET `?videoId=<11자>`. `getVideoMeta` wrapper. 잘못된 ID 400, 미존재 영상 404, 응답 본문은 `VideoSearchResult` 그대로 — 클라이언트가 검색 결과와 동일한 shape으로 단일 처리 흐름에 끼워 넣을 수 있음 |
| 개발용 검증 페이지           | `app/dev/page.tsx` + `app/dev/layout.tsx` | ✅ 유지 | Phase 2.6에서 **개발 환경 전용 게이팅**으로 전환 — layout이 `NODE_ENV !== 'development'`일 때 `notFound()` 호출. 프로덕션 빌드에선 자동 404, `next dev`에선 그대로 백엔드 raw JSON 디버깅용으로 사용 |

### 프론트엔드 모듈 진행 상황

| 모듈                           | 위치                                                          | 상태   | 비고                                                                                  |
| ------------------------------ | ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 검색 페이지 (메인)             | `app/page.tsx`                                                | ✅ Phase 2.1 | `'use client'`, idle/loading/success/error discriminated union 상태 관리             |
| 검색 폼                        | `components/SearchForm.tsx`                                   | ✅ Phase 2.1 | 큰 입력창 + 필터 토글 + 검색 버튼. `buildSearchParams`가 프리셋 → ISO 변환            |
| URL 직접 정리 카드             | `components/UrlInputCard.tsx`                                 | ✅ URL 직접 정리 | 검색 폼 위에 배치되는 보조 카드. 클라이언트에서 `extractVideoId`로 URL/ID 검증 → `GET /api/video?videoId=...` 메타 조회(toast.loading) → 성공 시 `onVideoReady(video)` 콜백으로 부모(`handleProcessClick`)에 단일 모드 그대로 전달 → 기존 `CategorySelectModal` + `processVideo` 흐름 재사용 |
| 필터 패널                      | `components/FilterPanel.tsx`                                  | ✅ Phase 2.1 | controlled. `Filters`, `DEFAULT_FILTERS`, `UploadDatePreset` 타입 export             |
| UI primitive (base-ui 래핑)    | `components/ui/{radio-group,popover,calendar,date-picker}.tsx` | ✅ Phase 2.1 | `react-day-picker@10` 추가. Calendar는 classNames로 Tailwind 매핑                    |
| 검색 결과 목록                 | `components/SearchResults.tsx`                                | ✅ Phase 2.2 (+페이지네이션, +재생목록) | 카드 리스트(반응형) + Select 정렬 + 5가지 상태 UI. `SearchState`(now includes `pageNumber`/`nextPageToken`/`prevPageToken`/`totalResults`/`playlistContext?`) 여기서 export. 하단 `PaginationFooter`에 이전/다음 버튼 + 현재 페이지 번호 (1페이지 + 다음 없음일 땐 자동 숨김). `index`는 페이지를 가로질러 누적 번호(`(pageNumber-1)*resultCount + i`)로 표시. `playlistContext`가 있으면 상단 라벤더 배너 + 체크박스/정리하기 버튼 disabled + "전체 선택" 헤더 숨김 |
| Toaster 마운트                 | `app/layout.tsx` + `components/ui/sonner.tsx`                  | ✅ Phase 2.2 | `position='top-center' richColors`. `import { toast } from 'sonner'`로 호출           |
| 카테고리 선택 모달             | `components/CategorySelectModal.tsx`                          | ✅ Phase 2.3 (+4.4) | `_inbox`를 Select 맨 위 옵션으로 통합. `CategorySelection` 타입 export. `ytobs:lastCategory` localStorage prefill. Phase 4.4부터 카테고리 목록 자체도 localStorage(`ytobs:categories`)에서 mount 시 `useMemo`로 1회 로드 — 사용자 정의 카테고리가 드롭다운에 반영됨 |
| 단일 처리 흐름 연결            | `app/page.tsx` `processVideo`                                  | ✅ Phase 2.4 | sticky `toast.loading` → 시간 기반 단계 전환(자막 0s / 요약 3s / 저장 22s) → success/error |
| 에러 처리 강화                 | 모달 자막 고지 + Gemini 메시지 한국어화 + Dropbox 마크다운 폴백 | ✅ Phase 2.5 | upload 실패 시 `/api/process`가 markdown 동봉, toast.error의 `action`으로 다운로드 |
| 복수 선택 + 하단 액션바        | `SearchResults`(체크박스) + `components/BatchActionBar.tsx` + `app/page.tsx`의 `selectedIds` | ✅ Phase 3.1 | `MAX_VIDEOS_PER_BATCH=10` 하드 블록. `processingTarget` union으로 `CategorySelectModal` 재사용 |
| 일괄 처리 진행 모달            | `components/BatchProgressModal.tsx` + `app/page.tsx`의 `activeBatch` | ✅ Phase 3.3 | 별도 라우트 대신 Dialog. mount 시 `/api/process-batch` POST → fetch + ReadableStream reader로 SSE 수동 파싱(EventSource는 GET 전용). 영상별 `VideoStatus` discriminated union(`idle`/`running{step,percent}`/`success`/`error{+optional markdown/filename}`/`canceled`) + per-video & overall Progress. upload 실패 카드에는 인라인 `[마크다운 다운로드]` 버튼 (단일 처리의 toast.action 폴백과 동일 패턴). 처리 중 ESC/외부 클릭 차단, `[취소]`만 중단 가능(`AbortController.abort()` → 백엔드 `request.signal`). 새 batch는 `key={'batch-' + videoIds.join(',')}` remount |
| 설정 페이지 셸                 | `app/settings/page.tsx` + 메인 헤더의 `<Link href='/settings'>`(buttonVariants ghost) | ✅ Phase 4.3·4.4 | base-ui `Tabs`로 탭 분리(`components/ui/tabs.tsx` 래퍼). 각 탭 컴포넌트는 `components/settings/<Name>Tab.tsx`에 별도 파일로 분리되어 자체 상태/effect/handler를 보관 — 새 설정 추가 시 (1) 새 `<Name>Tab.tsx` 만들고 (2) `page.tsx`의 `TABS` 배열에 한 줄 추가. `Link`는 base-ui Button의 `asChild` 없어서 `buttonVariants({variant:'ghost'})` className 직접 적용 |
| 카테고리 관리 탭               | `components/settings/CategoriesTab.tsx`                       | ✅ Phase 4.4 | `lib/utils/categories-storage.ts`에서 mount 시 `useEffect`로 hydrate (SSR mismatch 회피 위해 lazy initializer 대신 effect 채택, 첫 setState만 `react-hooks/set-state-in-effect` disable 주석). draft 행마다 클라이언트 ID(`Math.random base36`) + ▲/▼/✕, 추가 input + form submit, `validateCategoryName`이 폴더 안전 검사. "기본 카테고리로 되돌리기"는 `resetStoredCategories` + `clearLastCategory` 동시 호출 |
| 노트 양식 탭                   | `components/settings/NoteTemplateTab.tsx`                     | ✅ Phase 4.3 (4.4 분리) | `GET /api/settings/template`으로 Dropbox 활성 양식 로드, monospace textarea 편집 + `PUT /api/settings/template`. 참고 예시 2종(`EXAMPLE_TEMPLATES`) 인라인 pre + "활성 양식으로 가져오기" 버튼. 변경 감지(`isDirty`)와 저장 중 상태 관리 |
| 처리 이력 탭                   | `components/settings/ProcessedHistoryTab.tsx`                 | ✅ Phase 4.6 | `lib/utils/processed-videos-storage.ts`에서 mount 시 hydrate. 정리한 영상 목록(최근순) + 카테고리/검색어/처리 시각/Dropbox 경로 표시. "이력 모두 비우기"는 2단계 확인(첫 클릭 → 3초 안에 한 번 더). 검색 결과의 "이미 정리됨" 배지와 같은 localStorage를 읽으므로 비운 직후 다음 페이지 진입 시 배지도 함께 사라짐 |
| 처리 이력 storage              | `lib/utils/processed-videos-storage.ts`                       | ✅ Phase 4.6 | `ytobs:processedVideos` 키, `ProcessedVideoRecord[]` JSON. `addProcessedVideo`는 같은 videoId를 dedupe하면서 맨 앞으로 (= LRU). 최대 500건. 단일/일괄 처리 양쪽에서 성공 시 호출. `getProcessedVideoIds()`로 `Set<string>` 추출해 빠른 lookup |
| Tabs UI primitive              | `components/ui/tabs.tsx`                                      | ✅ Phase 4.4 (+4.7) | base-ui `Tabs.Root/List/Tab/Panel` 래퍼. 활성 탭은 `data-active` 속성으로 표시되며 우리 스타일링은 `data-active:` Tailwind modifier로 적용. 활성 탭 하단에 `primary` 색 underline (`after:` pseudo + `-bottom-px`). `TabsPanel`의 `keepMounted`는 우리 래퍼에서 `true`가 기본 — 탭 전환 시 미저장 draft 유지. Phase 4.7부터 `TabsList`는 `overflow-x-auto scrollbar-none`으로 모바일 가로 스크롤, `TabsTab`은 `shrink-0 whitespace-nowrap` |
| PWA 매니페스트 + 메타데이터    | `app/manifest.ts`, `app/layout.tsx`, `public/icon.svg`        | ✅ Phase 4.7 | `MetadataRoute.Manifest`로 정의 → Next.js가 `/manifest.webmanifest`로 노출. `display: standalone`, 라이트 톤 컬러, 한국어 lang. 아이콘은 `public/icon.svg` 1개를 `any` + `maskable` 두 purpose로 참조. `layout.tsx`에 `viewport.themeColor`(light/dark), `viewportFit: cover`, `appleWebApp.capable: true`, `metadata.icons` 추가. `<html lang>`도 `en` → `ko` |

### 주요 결정 사항

- **YouTube API 클라이언트**: 계획서는 `googleapis` 또는 `@googleapis/youtube` SDK 설치를 권장하지만, 실제로는 **네이티브 `fetch`로 직접 호출**한다. 이유: (1) API 키 인증만 쓰는 단순 REST 호출이라 SDK 이점이 적고, (2) 의존성과 번들 크기를 줄이며, (3) Next.js 캐싱·타입을 우리가 명시적으로 제어할 수 있다. 응답 타입은 `lib/youtube/types.ts`에서 우리가 실제 읽는 필드만 좁혀 정의.
- **재생목록(playlist) 검색**: Phase 1에서는 `type=video`만 처리. `type=playlist`로 호출하면 명확한 에러를 던진다 (Phase 4 또는 추후 확장).
- **검색 API의 HTTP 메서드**: GET + URL 쿼리스트링. 브라우저/curl 테스트가 쉽고 멱등하다. 프론트에서 호출할 때도 `fetch('/api/search?query=...')` 형태.
- **Gemini SDK 미사용**: 계획서는 `@google/generative-ai` SDK 설치를 권장하지만, YouTube 검색과 같은 이유로 **네이티브 `fetch`로 REST 호출**한다 (`v1beta/models/{model}:generateContent`). 의존성을 줄이고 응답 타입을 우리가 좁혀서 잡는다.
- **Gemini 모델 기본값**: `gemini-flash-latest` (`.env.local`의 `GEMINI_MODEL`로 덮어쓰기 가능). 계획서의 `gemini-2.0-flash-exp`는 실험 모델이라 stable alias로 교체. 단, 이 alias는 시간이 지나면서 더 최신 모델을 가리킨다 — 2026-05-18 기준으로는 `gemini-3-flash`로 resolve되며 free tier RPM은 약 20회로 stable Flash(15회)보다 약간 후하지만, 일괄 처리 + 재시도 burst가 쉽게 넘긴다. 한도가 바뀌어도 우리 재시도 로직이 Gemini 응답의 `retryDelay`를 존중하므로 alias 변경을 따로 추적하지 않아도 된다 (아래 retryDelay 항목 참고). 한도 자체가 너무 빡빡해서 문제가 되면 `.env.local`의 `GEMINI_MODEL`을 특정 stable 버전(`gemini-2.5-flash` 등)으로 pin.
- **Gemini 429 재시도는 응답의 `retryDelay`를 존중**: 429 응답 본문의 `error.details`에 `google.rpc.RetryInfo`가 들어 있고 `retryDelay: "23.728s"` 형식으로 정확한 대기 시간을 알려준다. `lib/ai/gemini.ts`의 `extractRetryDelayMs`가 이걸 파싱해서 `callGemini`의 다음 재시도 sleep에 사용한다(없으면 1s/2s 지수 백오프로 폴백). 최대 30초까지만 대기(`MAX_RETRY_DELAY_MS`) — 그보다 길면 quota 회복까지 너무 오래 막혀서 사용자가 직접 대응(모델 교체, 시간 두기)하는 게 낫다. 또한 429 에러 메시지에는 Gemini가 보낸 원본을 그대로 노출해서(`formatGeminiError`) 어느 metric(RPM/RPD/TPM/free_tier_requests)에 걸렸는지를 즉시 확인할 수 있다. 우리 식 한국어 "분당 15회/일일 1500회" 같은 추정은 alias 변경 시 misleading이라 의도적으로 제거했다.
- **노트 frontmatter 생성**: AI에 YAML까지 맡기지 않고 `buildFrontmatter()`에서 결정론적으로 만들고, 모델에는 본문 마크다운만 요청한다. AI 응답에 frontmatter나 코드 펜스가 섞여 와도 `cleanBody()`가 방어적으로 제거한다.
- **자막 토큰 제한 처리**: Flash 1M 컨텍스트라 단일 호출로 거의 모든 영상 커버. 자막 50만 자 초과 시 명확한 한국어 에러로 차단. 실제 청크 분할/맵리듀스 요약은 필요해질 때 추가 (Phase 4 이후).
- **Dropbox SDK 미사용**: 검색·Gemini와 같은 이유로 **네이티브 fetch로 REST 호출** (`content.dropboxapi.com/2/files/upload`). 단일 엔드포인트만 쓰는 단순 호출이라 SDK 이점이 작다. Phase 4에서 인덱스 노트 등 호출이 늘어나면 재검토.
- **`Dropbox-API-Arg` ASCII 이스케이프**: Dropbox는 이 헤더에 ASCII-only JSON을 요구한다. `JSON.stringify`는 한글을 그대로 두기 때문에 `asciiSafeJson`이 U+0080 이상 문자를 모두 `\uXXXX`로 수동 이스케이프한다. 이 처리가 없으면 한국어 카테고리/검색어 경로에서 즉시 깨진다.
- **Dropbox 토큰은 refresh_token 자동 갱신**: 2021-09 이후 Dropbox 신규 앱의 access_token은 단기(약 4시간)만 발급되어 콘솔의 "Generate" 버튼으로 받은 토큰을 `.env.local`에 정적으로 박아두는 방식은 4시간마다 만료된다. 대신 1회성 OAuth(`scripts/dropbox-exchange-code.mjs`)로 long-lived refresh_token을 발급받고, `lib/dropbox/auth.ts`의 `getDropboxAccessToken()`이 호출 직전마다 새 access_token을 받아 메모리 캐시한다(만료 5분 전 사전 갱신). 환경변수는 `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN` 3개로 구성되며, 기존 `DROPBOX_ACCESS_TOKEN`은 더 이상 사용하지 않는다. refresh_token이 revoke되면 401 응답이 떨어지면서 사용자에게 재발급 스크립트를 안내한다.
- **Shadcn UI 베이스**: 이 프로젝트의 Shadcn 컴포넌트는 Radix가 아니라 **`@base-ui/react` 기반**으로 셋업되어 있다. `Select.Value`는 `children`에 raw value를 받으므로 라벨을 보이려면 `<SelectValue>{(value) => labels[value]}</SelectValue>` 형태의 render function child를 넘겨야 한다. 라디오 칩 호버는 `data-checked:hover:bg-foreground/90` + `data-unchecked:hover:bg-muted`로 분기 (안 그러면 선택 상태 흰 글자가 호버 muted 배경에 묻힘).
- **`suppressHydrationWarning` on `<html>`/`<body>`**: 한컴 뷰어(`data-hwp-extension`) 같은 브라우저 확장이 루트 태그에 속성을 주입해 SSR hydration mismatch를 일으킨다. `app/layout.tsx`의 `<html>`/`<body>`에 `suppressHydrationWarning`을 둬서 해당 태그의 속성 mismatch만 무시한다 (자식 컴포넌트의 hydration 검증은 그대로 유지됨). 이건 우리 코드의 SSR 버그가 아니라 외부 확장 호환 처리이므로 제거하지 말 것.
- **YouTube 썸네일은 `next/image` + `unoptimized`**: `next.config.ts`에 `images.remotePatterns`로 `i.ytimg.com`만 허용한다. `unoptimized` prop을 켜서 Vercel 이미지 최적화 비용을 피하고 (YouTube CDN이 이미 사이즈별 캐싱 제공), `mqdefault.jpg`(320×180)를 그대로 16:9 컨테이너에 `object-cover`로 채운다. Phase 2.3 모달/2.4 진행 화면에 썸네일이 또 들어가면 같은 패턴 재사용.
- **Sort UI는 헤더 클릭이 아닌 Select 드롭다운**: 계획서 2.2의 "헤더 클릭 시 정렬"은 테이블 전제였는데 우리는 카드 리스트로 갔다. 정렬 옵션(관련도 기본 / 제목순 / 최신순 / 영상 길이 / 조회수)을 `Select`로 노출. 클라이언트 사이드(`useMemo`)에서 정렬하며 API는 재호출 안 함. 한글 정렬은 `localeCompare(other, 'ko')` 명시.
- **React 19 `react-hooks/set-state-in-effect` 회피 패턴**: 모달/위젯의 "open prop 변화에 따라 내부 state 리셋" 같은 흐름을 `useEffect` 안의 `setState`로 짜면 새 lint 규칙에 막힌다. 해법: 부모에서 `key={...}` 변경으로 자식을 remount 시키고, 자식은 `useState` lazy initializer로 초기값을 한 번만 계산한다. `CategorySelectModal`에서 처음 적용 (key는 `processingVideo?.videoId`). Phase 2.4/2.5의 다른 모달성 컴포넌트에도 같은 패턴을 우선 시도할 것.
- **`_inbox`는 별도 체크박스가 아니라 Select 맨 위 옵션**: 계획서 2.3은 카테고리 Select + "_inbox 저장" 체크박스의 두 컨트롤이었지만, 상호 배타 상태 관리가 번거로워 `나중에 분류 (_inbox)` 옵션 하나로 통합. Phase 3에서 복수 처리 모달을 재사용할 때도 같은 구조 유지.
- **클라이언트 저장 키 prefix `ytobs:`**: 마지막 카테고리(`ytobs:lastCategory`)부터 시작. Phase 4의 카테고리 관리/노트 템플릿/처리 이력 등에서 localStorage를 늘리게 되면 같은 prefix를 쓰고, 가능한 한 정의 위치에 콜로케이션해서 키 충돌과 흩어짐을 방지한다. 현재 카테고리 관련 모든 ytobs:* 키(`categories`, `lastCategory`)는 [lib/utils/categories-storage.ts](lib/utils/categories-storage.ts)에 한 곳으로 모아두었다 — 한 키의 변경이 다른 키의 cleanup을 수반하는 경우(예: 기본값 reset 시 `lastCategory`도 같이 비움)가 늘어나면서 한 모듈에서 다루는 게 일관성에 유리해졌기 때문.
- **단일 영상 진행 표시는 시간 기반 추정**: `/api/process`는 단일 응답만 돌려주므로 "자막 추출 → 요약 → 저장" 단계 전환을 서버가 알릴 길이 없다. `app/page.tsx`의 `processVideo`가 `setTimeout` 두 개(3s, 22s)로 sonner toast 메시지를 추정 전환한다. 응답이 일찍 오면 모두 `clearTimeout`. 평균 응답 시간에 맞춰져 있어서 자연스럽게 보이지만, 진짜 단계별 스트림이 필요해지면 Phase 3 SSE 작업 때 같은 패턴을 단일 영상에도 확장한다 (지금 미리 SSE를 도입하지 말 것 — 단일 처리에 비해 과한 복잡도).
- **모달 `subfolder` ↔ API `searchQuery` idempotent**: `CategorySelectModal`이 반환하는 `subfolder`는 이미 `slugifyForFolder`를 거친 문자열이지만, 같은 슬러그 함수에 재투입해도 동일 결과가 나온다(`-`/한글/영문/숫자만 남고 트림됨). 그래서 `/api/process`의 `searchQuery` 필드에 `subfolder`를 그대로 넘겨도 안전하다. 별도 "이미 슬러그됨" 플래그를 추가하지 않은 이유.
- **단일/일괄 처리 같은 모달 — `ProcessingTarget` union으로 통합**: `app/page.tsx`가 `{ kind: 'single', video } | { kind: 'batch', videos }`를 보관하고, `CategorySelectModal`은 `subtitle`(이전 `videoTitle`을 일반화) + 옵셔널 `hasCaption`만 받는다. 두 흐름 다 같은 카테고리/검색어 선택 UI를 쓰며 confirm에서만 분기. 일괄 confirm은 별도 `activeBatch` 상태로 전이되어 `BatchProgressModal`이 마운트된다(Phase 3.3에서 연결됨).
- **MAX 초과 시 하드 블록**: 일괄 선택 11번째 클릭은 `handleToggleSelect`가 토스트 경고 후 set을 그대로 반환(체크 안 들어감). "전체 선택"이 결과 > 10개인 상황에서는 처음 10개만 들어가고 슬라이스 안내 토스트. "초과는 처리에서만 잘라낸다" 안을 거른 이유: 사용자가 "왜 마지막 영상이 처리 안 됐지?" 헷갈리지 않도록 선택 시점에 즉시 피드백.
- **EventSource 대신 fetch + ReadableStream reader**: 계획서 3.3은 "EventSource API로 SSE 수신"을 권장하지만, EventSource는 GET-only다. 우리 백엔드(`/api/process-batch`)는 `videoIds` 배열과 옵션을 POST body로 받기 때문에 EventSource로는 보낼 수 없다. 대신 `BatchProgressModal`이 `fetch` POST + `response.body.getReader()`로 chunk를 받아 `data: <json>\n\n` 블록 단위로 직접 파싱한다. chunk 경계가 블록 중간에 떨어지는 경우를 보정하기 위해 buffer의 마지막 `\n\n` 위치까지만 flush하고 나머지는 다음 chunk와 합쳐서 재시도. SSE 멀티라인 `data:` 라인도 표준대로 줄 단위로 모은 뒤 합친다.
- **SSE 이벤트 스펙 — 계획서 대비 확장**: 계획서 3.2의 `ProcessEvent` 타입에서 세 가지를 더 보냄: (1) `complete` 이벤트에 `path` 추가 — 완료 카드에서 Dropbox 저장 경로를 보여줄 때 클라이언트가 따로 계산하지 않도록. (2) `error`에 optional `step`(`'meta' | 'transcript' | 'summarize' | 'upload'`) 추가 — 단일 처리(`/api/process`)가 이미 같은 라벨을 쓰기 때문에 `STEP_KOREAN_LABEL` 표를 그대로 재사용해 `[자막 추출 중] 자막이 비활성화되어…` 형태로 표시 가능. meta 단계 실패는 `start` 없이 `error`만 emit되는 케이스라 step이 optional이어야 정합. (3) `error`에 optional `markdown`/`filename` 동봉 — upload 단계만 마크다운이 이미 완성된 상태이므로, 단일 처리(`/api/process`)의 응답 폴백과 동일하게 클라이언트에서 로컬 다운로드 버튼을 띄울 수 있도록 본문을 그대로 실어 보낸다. `BatchProgressModal`이 이 필드가 있을 때만 인라인 `[마크다운 다운로드]` 버튼을 렌더한다.
- **일괄 처리 영상 간 간격 (`INTER_VIDEO_DELAY_MS=1000ms`)**: 영상별 처리 시간이 보통 10~30s라 Gemini 분당 한도(alias에 따라 15~20회)를 자연스럽게 안 넘기지만, 짧은 영상이 연속으로 빠르게 끝나는 경우를 위한 안전 마진. `lib/ai/gemini.ts`의 429 재시도(이제 Gemini가 보내는 `retryDelay` 존중)가 한 번 더 보호한다. 더 큰 batch(예: Phase 4에서 10개 한도를 풀 때)를 도입한다면 이 상수를 다시 보거나 Gemini 호출 시각 기준 슬라이딩 윈도우로 바꾼다.
- **처리 중 모달 닫기 차단**: `BatchProgressModal`은 `isRunning`일 때 `onOpenChange(false)` 호출을 무시하고 `showCloseButton={false}`로 X 버튼도 숨긴다. 명시적 `[취소]` 버튼만 흐름을 끊을 수 있고, 클릭 시 `AbortController.abort()`로 백엔드 `request.signal`을 발동시켜 다음 영상 진입을 막는다. 진행 중인 영상은 외부 API(YouTube/Gemini) 호출을 중도 abort 못해서 그대로 끝까지 가지만, **upload 직전에 한 번 더 `signal.aborted` 검사를 둬서 Dropbox에 사본을 남기는 것만 막는다** (read-only 단계는 그냥 완료되어도 부작용 없음). 그 이후 `controller.enqueue`는 cancelled 플래그로 무시되어 클라이언트엔 영향 없음. 남아 있던 idle/running 상태는 한꺼번에 `canceled`로 표시.
- **Strict Mode 더블 인보크 → 일괄 처리 중복 업로드 버그 (2026-05-18 사용자 테스트로 수정 확인됨)**: `next dev`의 React Strict Mode는 mount useEffect를 두 번 invoke하는데, `BatchProgressModal`이 첫 effect의 cleanup에서 fetch를 abort하면 서버는 이미 진행 중인 video #1의 Dropbox 업로드까지 끝낸 뒤에야 cancelled를 검사한다. 그 뒤 Strict Mode가 두 번째 effect에서 같은 batch를 새 fetch로 다시 보내면서 video #1이 두 번 업로드되어 Dropbox에 `(1)` autorename 사본이 남는다 (Gemini 응답이 호출마다 달라 내용도 미세하게 다름). 해법: (1) 클라이언트 — `startedRef` 가드로 effect 본문을 1회만 실행하고 cleanup에서 abort를 호출하지 않는다. 사용자 [취소]는 별도로 `abortRef.current.abort()` 경로를 그대로 사용. (2) 서버 — `processOne`에 `request.signal`을 전달해 upload 직전 한 번 더 검사 (위 항목과 동일). 같은 클래스의 버그(useEffect 안에서 서버 쪽 영구 부작용을 일으키는 fetch를 시작하고 cleanup에서 그걸 끄려 하는 패턴)는 향후에도 똑같이 ref 가드 + 부작용 단계 직전 abort 검사 조합으로 막는다.
- **노트 양식은 Dropbox 마크다운으로 저장 (localStorage 아님)**: Phase 4.3에서 사용자 정의 노트 양식을 `${DROPBOX_VAULT_PATH}/.config/note-template.md`에 저장. 이유: (1) PC 설정과 모바일 옵시디언이 같은 양식을 공유 — localStorage였다면 브라우저별로 따로 관리됨. (2) 옵시디언 vault 안에 있어 사용자가 데스크톱/모바일 옵시디언으로 직접 양식을 열고 편집 가능. (3) `.config/` 폴더는 옵시디언이 기본적으로 안 보여줘서 noise가 안 됨. 시드: 첫 진입 시 활성 양식 + 참고 예시 2종(`practical`, `friendly`)을 한꺼번에 Dropbox에 쓴다. 양식 customization은 처리 흐름에 critical하지 않으므로 `getNoteTemplate()`은 어떤 실패든 `DEFAULT_TEMPLATE`로 폴백한다(설정 페이지는 strict한 `loadTemplateForSettings()`를 별도로 사용해 에러를 사용자에게 노출). batch 처리는 시작 시 1회만 양식을 읽어 모든 영상에 같은 양식을 적용 — 일관성 보장 + Dropbox 호출 최소화.
- **양식 플레이스홀더는 `{{title}}`·`{{categoryTag}}` 두 개만**: 다른 메타데이터(채널/카테고리/검색어/원본 자막 언어)는 프롬프트의 "영상 정보" 섹션에서 별도로 들어가므로 양식에서 중복 표기할 필요 없다. 사용자가 양식을 단순하게 유지하도록 의도적으로 좁힌 인터페이스. 알 수 없는 `{{...}}`는 치환하지 않고 그대로 둔다(사용자가 일부러 적은 텍스트일 수 있음). 플레이스홀더 매칭은 정규식(`\{\{\s*name\s*\}\}`)이라 공백 허용.
- **Phase 4.1·4.2 보류 (2026-05-19)**: 4.1 검색어 Gemini 변환 — 현재 직접 입력 흐름이 단순하고 충분해서 추가 가치가 낮음. 4.2 자막 언어 표시 강화 — YouTube `captions.list`가 OAuth 2.0을 요구해 API 키 기반 우리 아키텍처와 안 맞고, 어떤 자막 언어가 들어와도 노트 출력은 한국어로 강제되므로 사용자가 자막 언어를 미리 고를 실익이 작다. `lib/youtube/transcript.ts`의 ko→en→기본 자막 폴백으로 사실상 충분. 둘 다 추후 필요 시점에 다시 본다 — 세부 사유는 [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)의 §4.1, §4.2 헤더 참조.
- **카테고리 저장은 localStorage (노트 양식과 다른 선택)**: Phase 4.4에서 사용자 정의 카테고리 목록을 브라우저 localStorage(`ytobs:categories`)에만 저장. §4.3 노트 양식은 Dropbox로 가져갔지만 카테고리는 다른 결정인 이유: (1) 카테고리는 PC에서 영상을 처리할 때 폴더 선택용으로만 쓰이고 모바일 옵시디언은 결과 노트만 읽으므로 cross-device 동기화 가치가 낮음. (2) localStorage가 모달 열 때 동기적으로 읽혀 Dropbox round-trip(~500ms) 없이 즉시 노출됨 — 카테고리 선택 모달이 한 batch에 여러 번 열릴 수 있어 latency 차이가 누적된다. 카테고리 이름은 `_inbox` 예약어 + Dropbox 폴더 안전 문자(`/\:*?"<>|` 거부)만 검증해 폴더 구조 보호. "기본 카테고리로 되돌리기"는 `ytobs:categories`와 함께 `ytobs:lastCategory`도 비워서 옛 사용자 정의 이름이 다음 모달에 stale prefill로 떠올라 같은 폴더에 재저장되는 케이스를 막는다. 추후 사용자가 PC 여러 대를 쓰게 되면 Dropbox로 이전 검토.
- **카테고리 이름 변경 시 기존 폴더는 그대로**: 사용자가 "프로그래밍"을 "개발"로 바꿔도 Dropbox의 `프로그래밍/` 폴더는 그대로 두고 다음 정리부터 `개발/`이 새로 만들어진다. cascade rename은 명시적으로 안 함 — Dropbox API로 가능하지만 (1) 오류 시 부분 이동이 위험하고 (2) 사용자가 "옛 노트는 옛 분류에 남기고 새 분류는 새 노트부터"를 더 직관적이라 판단할 가능성이 높음. 설정 UI에 이 사실을 안내 문구로 명시.
- **처리 이력 중복 경고는 hard block이 아닌 soft warning (Phase 4.6)**: 계획서의 "중복 처리 방지" 표현은 "(이미 정리되었습니다 알림)"이라는 부연이 붙어 있어 차단보다 경고에 가깝다고 해석. 의도적 재처리(예: 양식 변경 후 같은 영상을 새 양식으로 다시 만들어 비교) 케이스를 막지 않기 위해 흐름 자체는 그대로 두고, (1) 검색 카드 amber 배지, (2) 카테고리 모달 amber 박스 두 단계로 사용자가 인지하게 한다. Dropbox `autorename: true`로 사본은 `(1)` 접미사로 자동 보존되니 중복 처리해도 기존 파일은 안 깨진다. 처리 성공 시 storage 갱신은 단일 처리(`app/page.tsx::processVideo`의 `onSuccess` 콜백)와 일괄 처리(`BatchProgressModal::onVideoComplete` → 부모 콜백) 양쪽에서 같은 `recordProcessed` 헬퍼를 호출 — 단일/일괄에서 기록 누락 가능성을 없앤다.
- **설정 페이지는 탭별로 파일을 분리한다 (Phase 4.4 리팩토링)**: `app/settings/page.tsx`는 base-ui Tabs를 두른 얇은 셸이고, 각 탭의 본체는 `components/settings/<Name>Tab.tsx`에 한 파일로 떼어 둔다. 각 탭은 자기 useState/useEffect/handler를 모두 자체 보관해 다른 탭과 격리된다. 새 설정 추가 시 절차: (1) `components/settings/`에 새 `<Name>Tab.tsx` 추가, (2) `page.tsx`의 `TABS` 배열에 `{value, label, Component}` 한 줄 추가. 이 패턴이 좋은 이유: 탭 추가/제거가 다른 탭에 영향을 안 주고, 페이지 셸이 짧게 유지되어 탭이 늘어나도 가독성이 유지된다.
- **`TabsPanel`은 우리 래퍼에서 `keepMounted=true`가 기본**: base-ui 원본 `Tabs.Panel`의 `keepMounted` 기본값은 `false`라 비활성 탭이 즉시 unmount되고 작성 중인 draft state(예: 카테고리 inline 편집, 노트 양식 textarea 미저장 텍스트)가 날아간다. 설정 페이지처럼 사용자가 여러 탭을 오가며 편집하는 UI에선 명백한 UX 손실이라 [components/ui/tabs.tsx](components/ui/tabs.tsx)의 `TabsPanel` 래퍼에서 `keepMounted = true`로 prop 기본값을 바꿨다. 결과: 비활성 탭은 `hidden` 속성으로 숨겨지지만 DOM에 그대로 남아 state 보존됨. 초기 mount 시 모든 탭의 useEffect가 동시 실행되니 향후 비싸지는 탭이 생기면 그 탭만 `keepMounted={false}`로 override하는 게 깔끔.
- **모바일 반응형은 `sm:` 분기로 진행 (Phase 4.7)**: 기본(=모바일) 스타일을 좁은 화면 기준으로 잡고 `sm:` modifier(≥640px)로 데스크톱 향상을 얹는 mobile-first 패턴을 일관 적용. 주요 분기: (1) [components/SearchForm.tsx](components/SearchForm.tsx) — 모바일은 input 한 줄 + 두 버튼(필터/검색)이 그 아래 row를 균등 분할(`flex-1`), 데스크톱은 한 줄에 인라인. (2) [components/SearchResults.tsx](components/SearchResults.tsx)의 VideoCard 제목+`정리하기` row가 모바일에서 `flex-col → sm:flex-row`로 분리되어 버튼이 자체 줄을 가져 narrow width에서 title이 잘리지 않음. 정렬 Select는 `w-36 sm:w-44`. (3) [components/BatchActionBar.tsx](components/BatchActionBar.tsx)는 모바일에서 버튼 라벨을 `선택한 N개 정리하기` → `N개 정리하기`로 짧게 (sm:hidden/sm:inline 토글). 또 iOS PWA에서 home indicator 영역을 보호하기 위해 `paddingBottom: max(0.75rem, env(safe-area-inset-bottom))`을 인라인 style로 적용(Tailwind에 임의 env() utility를 추가하지 않기 위해 의도적으로 인라인). (4) [components/ui/tabs.tsx](components/ui/tabs.tsx)의 `TabsList`는 `overflow-x-auto scrollbar-none`으로 좁은 화면에서 가로 스크롤, `TabsTab`은 `shrink-0 whitespace-nowrap` — 탭이 늘어나도 줄바꿈 없이 자연스럽게 스크롤된다.
- **PWA는 Next.js `app/manifest.ts` + `public/icon.svg` 1개로 처리 (Phase 4.7)**: 매니페스트는 [app/manifest.ts](app/manifest.ts)에서 `MetadataRoute.Manifest`로 export — Next.js가 `/manifest.webmanifest`로 자동 노출한다. `display: 'standalone'`, `start_url: '/'`, 한국어 `lang`, 라이트 톤 `theme_color/background_color`(`#ffffff`). 아이콘은 [public/icon.svg](public/icon.svg) 단일 파일을 `purpose: 'any'`와 `'maskable'` 두 항목으로 모두 참조 — 검정 둥근 사각형(`#1f1f1f`, oklch(0.205) 토큰과 유사) 위 흰 play 삼각형, 512x512 viewBox 안에서 maskable safe zone 40%(가운데 ~204px) 안에 들어가도록 좌표 설정. `apple-touch-icon` 별도 PNG를 만들지 않고 [app/layout.tsx](app/layout.tsx)의 `metadata.icons.apple`도 같은 SVG를 가리킴 — 개인 사용 PWA이므로 iOS Safari의 PNG 폴백이 필요해질 때만 추가. `viewport.themeColor`는 라이트/다크 둘 다 정의해 OS 모드에 따라 상태바 색이 자동 전환, `viewportFit: 'cover'`로 노치 영역을 활용하고 safe-area-inset env()와 짝이 맞도록 함.
- **URL 직접 정리 흐름은 검색 결과 단일 처리 경로를 그대로 재사용한다 (Phase 4.7 이후 추가)**: 계획서에 없던 추가 기능으로, 사용자가 영상 URL/ID를 붙여 넣고 검색 단계를 건너뛰어 바로 정리할 수 있게 한다. [components/UrlInputCard.tsx](components/UrlInputCard.tsx)는 검색 폼 위에 배치되는 보조 카드로, 클라이언트에서 [lib/youtube/parseUrl.ts](lib/youtube/parseUrl.ts)::`extractVideoId`로 URL을 즉시 검증한 뒤 `GET /api/video?videoId=...`로 메타를 조회하고, 성공한 `VideoSearchResult`를 부모(`app/page.tsx`)의 `handleProcessClick`에 그대로 넘긴다 — 그 뒤로는 검색 결과 카드의 정리하기 버튼과 **완전히 같은 코드 경로**(같은 `CategorySelectModal` + 같은 `processVideo`)를 탄다. 의도적으로 별도 처리 함수를 만들지 않은 이유: 단일 영상 정리는 입력 출처(검색/URL)와 무관하게 같은 4단계 파이프라인이라, 출처를 갈라놓으면 `processedVideoIds` 체크, "이미 정리됨" 배지, hasCaption 안내, upload 실패 markdown 폴백 같은 케어 코드를 두 곳에서 유지해야 한다. URL 파서는 의존성 없는 순수 함수라 서버/클라이언트 양쪽에서 import 가능 — `/api/video` route는 별도로 11자 정규식을 재검증해 클라이언트 우회 입력에도 안전. 메타 조회를 모달 열기 전에 수행한 이유는 (1) 잘못된 URL/삭제된 영상을 모달 열기 전에 즉시 차단, (2) `hasCaption`/"이미 정리됨" 안내 박스가 첫 노출부터 표시되어 검색 흐름과 UX 일관성 유지, (3) 사용자가 모달에서 카테고리를 고른 뒤에야 영상이 없다는 사실을 알게 되는 헛걸음 방지.
- **재생목록(`type=playlist`) 검색 — top 1 재생목록의 영상을 펼치되 정리하기는 비활성 (Phase 4.7 이후 추가)**: 기존에 즉시 에러를 던지던 `searchVideos`의 playlist 분기를 [searchPlaylistVideos](lib/youtube/search.ts)로 구현. **2단계 호출**: (1) 첫 검색 — `search.list?type=playlist&maxResults=1`로 쿼리와 가장 잘 맞는 재생목록 1개 찾고(100 units), 그 재생목록의 영상을 `playlistItems.list`(1 unit) → `videos.list`(1 unit)로 enrich → 총 ~102 units. (2) 페이지 이동 — 클라이언트가 직전 응답의 `playlistContext.playlistId`를 [SearchParams.playlistId](lib/youtube/types.ts)로 그대로 보내면 백엔드가 `search.list`를 건너뛰고 `playlists.list`(제목 재조회 1 unit) + `playlistItems.list`(1 unit) + `videos.list`(1 unit) = 총 ~3 units. 다음 페이지 비용이 1/30 수준으로 떨어진다. UI는 응답의 `playlistContext`가 있을 때만 (1) 결과 상단에 재생목록 컨텍스트 배너(라벤더 톤, UrlInputCard와 같은 토큰)를 그리고, (2) `VideoCard`의 체크박스/정리하기 버튼을 `disabled`로 렌더, (3) "전체 선택" 버튼도 헤더에서 숨긴다. 썸네일/제목 링크는 그대로 작동 — **사용자 흐름은 "재생목록 영상 목록에서 마음에 드는 영상 링크로 YouTube 이동 → URL 복사 → 위쪽 URL 입력 카드에 붙여 넣어 정리"**. 재생목록 영상이 수백 개일 수 있어 일괄 처리는 위험하다고 보고 명시적으로 닫아둔 것. 재생목록 자체 페이지네이션(여러 매칭 재생목록 사이 이동)은 하지 않는다 — 다른 재생목록을 보고 싶으면 키워드를 바꿔 다시 검색하면 된다.
- **검색 결과는 페이지네이션 — 한 페이지 20개, prev/next 토큰 기반 (Phase 4.7 이후 추가)**: 기존 `DEFAULT_MAX_RESULTS = 25` 단일 호출에서 **YouTube `pageToken` 기반 페이지네이션**으로 전환. 한 페이지당 20개([lib/youtube/search.ts](lib/youtube/search.ts)의 `DEFAULT_MAX_RESULTS`), 응답에 `nextPageToken`/`prevPageToken`/`totalResults`를 동봉해 클라이언트가 같은 검색 파라미터에 토큰만 갈아 끼워 다음/이전 페이지를 받는다. 페이지 번호 1, 2, 3... 형태가 아닌 **이전/다음 두 버튼**으로 단순화한 이유: YouTube의 `pageInfo.totalResults`는 부정확한 추정치(수십만~수백만으로 부풀려짐)라 정확한 페이지 수를 미리 알 수 없고, 정확하지 않은 숫자에 기대 페이지 점프 UI를 만들면 사용자가 신뢰할 수 없는 번호를 보게 된다. 비용: `search.list`는 호출당 100 units이라 페이지 한 번 넘기면 100 units 소비 — 일일 한도 10,000 units 안에서 검색+페이지 총 100회 가능. **선택 상태(`selectedIds`)는 페이지 이동 시 항상 초기화** — 페이지 가로질러 모으는 흐름은 `selectedIds`와 별도의 `Map<videoId, video>` 보관소가 필요해 복잡도가 커지고, `MAX_VIDEOS_PER_BATCH=10` 한도와도 자연스럽게 들어맞지 않는다. 현재 검색의 SearchParams는 `app/page.tsx`의 `currentSearchRef`(useRef)에 보관 — 페이지 이동 시 같은 필터/정렬을 그대로 재사용한다. ref를 쓴 이유는 setState 직후에도 동기적으로 읽혀야 다음 페이지 요청에서 race condition 없이 같은 파라미터를 쓸 수 있어서. SearchResults의 `index` 번호는 페이지 전환 시 누적되어(`(pageNumber-1)*20 + i`) 사용자가 "전체 결과의 몇 번째"인지 파악 가능. 결과수 헤더는 정확한 숫자가 부담스러워 "21–40 · 약 1.2만개 중" 같은 약식 표기로 노출 (`formatTotalResults`가 만 단위 위는 "만"으로 자름).
- **Pretendard Variable + Notion 톤 리디자인 (Phase 4.7 이후 추가)**: Notion의 "따뜻한 미니멀리즘"을 한국어 환경에서 재현하기 위해 시각 시스템 전체를 리디자인. 폰트는 영문/한글 모두 **Pretendard Variable**을 jsdelivr CDN의 `pretendardvariable-dynamic-subset.min.css`로 [app/globals.css](app/globals.css) 최상단에서 `@import url(...)`로 로드한다 — Google Fonts에 없는 폰트라 `next/font/google`는 못 쓰고, `next/font/local`을 쓰려면 woff2를 직접 관리해야 해서 잘 운영되는 CDN을 그대로 활용. **`@import url()`은 반드시 `@import 'tailwindcss'`보다 위에 둬야** 한다 — Tailwind v4의 `@import`도 빌드 시 ruleset으로 확장되어 CDN @import가 뒤로 밀리면 CSS 사양 위반으로 `next build`가 경고하고 일부 브라우저가 폰트 로드를 건너뛴다. 컬러 토큰은 모노크롬 oklch에서 **따뜻한 hue 60~85, chroma 0.005~0.012**의 warm-neutral로 교체 — light는 `oklch(0.99 0.004 85)` 캔버스 + `oklch(0.24 0.01 60)` 잉크, dark는 순수 검정 대신 `oklch(0.21 0.006 80)` 따뜻한 다크. primary는 Notion 시그니처 보라(hue 280, light `0.55 0.21`, dark `0.7 0.19`). `--radius`는 0.625rem → **0.75rem(12px)**로 키워 DESIGN.md의 `rounded.lg`(카드 12px)와 정확히 정합 — 결과적으로 카드/모달/입력창의 모서리가 한 단계 부드러워진다. 헤딩(`h1`~`h6`)에는 base layer에서 `font-heading tracking-tight`를 자동 적용해 페이지마다 같은 클래스를 반복하지 않아도 위계가 일관 유지. 메인/설정 페이지 헤더는 `text-4xl sm:text-5xl leading-[1.1] font-semibold`로 Notion 마케팅 페이지 톤의 디스플레이 위계를 적용했고, 메인 페이지에는 작은 배지("YouTube → Obsidian")를 상단에 두어 브랜드 시그널을 추가. UrlInputCard는 의도적으로 **lavender 톤 표면**(`oklch(0.97 0.018 290)`)으로 분리해 DESIGN.md의 `card-tint-lavender` 무드를 재현 — 보조 입력 경로임을 시각적으로 표현하면서 primary 보라와 자연스럽게 어울린다.

---

## 코딩 컨벤션

### TypeScript

- **strict mode 필수**. `any` 사용 금지 (불가피한 경우 주석으로 이유 명시).
- 외부 API 응답은 반드시 타입 정의 후 사용.
- 함수 시그니처에 명시적 반환 타입 작성.

### 파일 / 명명

- 컴포넌트: PascalCase (`SearchForm.tsx`)
- 유틸/모듈: camelCase (`slugify.ts`)
- 타입: PascalCase, `type` 키워드 선호 (interface는 확장이 필요한 경우만)
- 상수: UPPER_SNAKE_CASE (`MAX_VIDEOS_PER_BATCH`)

### 컴포넌트

- Client Component는 파일 최상단에 `'use client'` 명시
- 가능한 한 Server Component를 기본으로 사용
- props는 명시적 타입으로 정의 (`type Props = { ... }`)

### 에러 처리

- 외부 API 호출은 반드시 try/catch로 감싸기
- 사용자에게 보일 에러는 한국어, 로그용은 영어
- 빈 catch 블록 금지 — 최소한 console.error라도 남기기

### 스타일링

- **`DESIGN.md`를 항상 참조**할 것 (Notion 스타일 디자인 시스템)
- Tailwind 클래스 우선, 인라인 스타일 금지
- 반복되는 클래스 조합은 `cn()` 헬퍼 또는 컴포넌트로 추출
- Shadcn UI 컴포넌트를 먼저 활용하되 DESIGN.md 토큰에 맞게 커스터마이징
- 색상은 직접 HEX 코드 쓰지 말고 CSS 변수(`bg-background`, `text-foreground` 등) 사용

---

## 작업 시 주의사항

### Phase별 작업 흐름

- Phase 1을 완료하기 전에 Phase 2의 UI 작업을 시작하지 말 것
- 각 Phase의 "완료 기준"을 만족한 뒤 다음으로 이동
- 한 번에 한 Phase 하위 항목 하나씩 작업 (예: "Phase 1.5 Dropbox 모듈을 만들어줘")

### API 호출 시 비용 의식

- YouTube `search.list`는 호출당 100 units (가장 비쌈). 개발 중 무한 반복 호출 주의
- Gemini API는 분당 15회 제한. 복수 처리 시 간격 두기
- 개발 중에는 실제 API 호출을 줄이기 위해 응답 캐싱 또는 mocking 활용 권장

### 한글 처리

- 파일명/폴더명에 한글 사용 가능. 단 슬러그화 시 안전 문자(한글/영문/숫자/하이픈)로 제한
- 사용자 UI 문구는 한국어, 코드 주석은 한국어 또는 영어 자유

### 보안

- API 키는 환경 변수로만 관리. 코드 하드코딩 금지
- Dropbox 토큰은 만료될 수 있으므로 에러 처리 시 재발급 안내 메시지 포함
- 사용자 입력은 항상 검증 (검색어 길이, videoId 형식 등)

### 커밋

- Conventional Commits 형식 권장: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- 한 커밋에 한 가지 변경만 (Phase 단위가 아니라 작업 단위)
- 비밀 정보(API 키, 토큰) 포함 여부 커밋 전 확인

---

## 자주 묻는 질문 / 함정

함정·예외 케이스(자막 없는 영상, 노트 길이 한계, Dropbox 업로드 실패, Vercel 함수 timeout, 같은 영상 중복 처리)에 대한 대응 메모는 [docs/FAQ.md](docs/FAQ.md) 참조.

---

## 외부 문서 참조

- [Next.js 15 App Router](https://nextjs.org/docs/app)
- [Shadcn UI](https://ui.shadcn.com)
- [YouTube Data API v3](https://developers.google.com/youtube/v3/docs)
- [Gemini API](https://ai.google.dev/gemini-api/docs)
- [Dropbox API](https://www.dropbox.com/developers/documentation/http/documentation)
- [youtube-transcript (npm)](https://www.npmjs.com/package/youtube-transcript)
- [Notion DESIGN.md (getdesign.md)](https://getdesign.md/notion/design-md) — 이 프로젝트의 디자인 가이드 출처

---

## Claude Code 사용 팁

이 프로젝트에서 작업을 요청할 때 효율적인 패턴:

✅ **좋은 요청 예시**

- "구현 계획 문서의 Phase 1.5 Dropbox 업로드 모듈을 구현해줘"
- "`lib/youtube/search.ts`에 정의된 SearchParams 타입을 기반으로 검색 함수를 작성해줘. 캐싱은 아직 빼고 기본 흐름만"
- "이 에러 로그를 보고 lib/ai/gemini.ts의 토큰 제한 처리 부분을 수정해줘"
- "DESIGN.md를 참조해서 SearchForm 컴포넌트를 Notion 스타일로 구현해줘"
- "globals.css에 DESIGN.md의 컬러 토큰을 Shadcn CSS 변수 형식으로 반영해줘"

❌ **피해야 할 요청 예시**

- "프로젝트 전체를 만들어줘" (너무 광범위)
- "Phase 1, 2, 3 다 한 번에 해줘" (Phase별 검증을 건너뜀)
- "알아서 해줘" (의도가 불명확)

작업 후에는 항상 다음을 확인:

1. TypeScript 컴파일 에러 없음 (`pnpm tsc --noEmit`)
2. ESLint 경고 없음 (`pnpm lint`)
3. 변경된 모듈이 IMPLEMENTATION_PLAN.md의 해당 Phase 완료 기준을 만족하는가
4. UI 작업의 경우 DESIGN.md의 스타일 가이드를 준수하는가 (색상, 타이포, 간격, 모서리)
