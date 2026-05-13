# CLAUDE.md

> 이 파일은 Claude Code가 매 대화마다 프로젝트 맥락을 빠르게 파악하기 위한 가이드입니다.
> 상세 구현 계획은 `IMPLEMENTATION_PLAN.md`를 참조하세요.

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
│   ├── settings/page.tsx           # 설정 페이지 (Phase 4)
│   ├── dev/page.tsx                # 개발용 임시 페이지 (Phase 1, Phase 2 후 제거)
│   └── api/
│       ├── search/route.ts         # YouTube 검색 API
│       ├── process/route.ts        # 단일 영상 처리 API
│       └── process-batch/route.ts  # 복수 영상 처리 API (SSE)
├── components/
│   ├── ui/                         # Shadcn UI 컴포넌트
│   ├── SearchForm.tsx
│   ├── SearchResults.tsx
│   ├── VideoCard.tsx
│   ├── CategorySelectModal.tsx     # 카테고리 + 하위폴더 선택 모달
│   ├── ProcessProgress.tsx
│   └── FilterPanel.tsx
├── config/
│   └── categories.ts               # 기본 카테고리 목록
├── lib/
│   ├── youtube/
│   │   ├── search.ts               # YouTube Data API 검색
│   │   ├── transcript.ts           # 자막 추출
│   │   └── types.ts
│   ├── ai/
│   │   ├── gemini.ts               # Gemini API 호출
│   │   └── prompts.ts              # 프롬프트 템플릿
│   ├── dropbox/
│   │   ├── upload.ts               # 카테고리/검색어 기반 폴더에 업로드
│   │   └── index-note.ts           # 인덱스 노트 생성 (Phase 4)
│   └── utils/
│       ├── language.ts             # 언어 감지
│       ├── slugify.ts              # 폴더/파일명 슬러그화
│       ├── filename.ts
│       └── duration.ts             # ISO 8601 duration 파싱
└── types/
    └── index.ts
```

---

## 옵시디언 Vault 폴더 구조

생성되는 노트는 **카테고리 + 검색어 기반 하이브리드 구조**로 분류됩니다.

```
/Vault/YouTube/                       ← DROPBOX_VAULT_PATH (루트)
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

```markdown
---
source: youtube
category: [카테고리]
search_query: [검색어]
processed_at: [YYYY-MM-DD]
video_url: [영상 URL]
channel: [채널명]
published: [YYYY-MM-DD]
duration: [길이]
---

# [영상 제목]

## 핵심 요약 (3~5줄)

...

## 주요 개념

### 개념 1: ...

## 타임스탬프별 정리

- **00:00 - 02:30**: ...

## 핵심 인사이트

...

## 추가 학습 키워드

- [[키워드1]]

## 태그

#youtube #학습 #[카테고리] #[주제관련태그]
```

> frontmatter는 옵시디언 Dataview 플러그인과 연동 가능하도록 설계됨.

---

## 환경 변수 (.env.local)

```bash
# YouTube Data API v3 (Google Cloud Console에서 발급)
YOUTUBE_API_KEY=AIzaSy...

# Gemini API (Google AI Studio 또는 Google Cloud Console에서 발급)
GEMINI_API_KEY=AIzaSy...

# Dropbox
DROPBOX_ACCESS_TOKEN=sl.B...
DROPBOX_VAULT_PATH=/Apps/youtube-obsidian-sync/YouTube

# Gemini 모델
GEMINI_MODEL=gemini-2.0-flash-exp

# 처리 제한
MAX_VIDEOS_PER_BATCH=10
MAX_RESULTS_PER_SEARCH=25
```

> 계획서(`docs/IMPLEMENTATION_PLAN.md`)에는 두 API를 같은 키로 묶을 수 있다고 적혀 있지만, 실제로는 별도 키가 필요해서 `YOUTUBE_API_KEY`와 `GEMINI_API_KEY`로 분리해서 관리합니다.

**중요**:

- API 키는 절대 클라이언트 코드에 노출하지 말 것. 반드시 서버 사이드(API Routes)에서만 사용.
- `.env.local`은 `.gitignore`에 포함되어 있어야 함. 커밋 전 항상 확인.

---

## 디자인 가이드

이 프로젝트의 UI 디자인은 프로젝트 루트의 `DESIGN.md`를 따릅니다. **Notion 스타일**(따뜻한 미니멀리즘, 세리프 헤딩, 부드러운 표면)을 기반으로 합니다.

### DESIGN.md 설치 방법

```bash
# 프로젝트 루트에서 실행
npx getdesign@latest add notion
```

위 명령어로 Notion DESIGN.md가 프로젝트 루트에 자동 배치됩니다.

### 디자인 핵심 원칙

- **여백 우선**: 중요한 것에 공간을 충분히 주는 시각 논리. 정보 밀도가 높아도 답답하지 않게.
- **따뜻한 미니멀리즘**: 차가운 회색보다 따뜻한 톤. 단조롭지 않은 미니멀.
- **세리프 헤딩**: 페이지 제목, 섹션 헤딩에 세리프 폰트 사용으로 "읽는 도구"의 정체성 강조
- **부드러운 표면**: 카드, 모달, 입력창 등에 부드러운 모서리(`rounded-md`/`rounded-lg`)와 미묘한 그림자
- **절제된 색상**: 액센트 컬러는 신중하게 사용. 대부분의 UI는 뉴트럴 톤
- **장식 최소화**: 그라데이션, 화려한 효과 지양. 콘텐츠 자체가 주인공

### 적용 우선순위

1. **DESIGN.md 최우선**: DESIGN.md에 정의된 색상/타이포/간격/컴포넌트 스타일을 가장 먼저 적용
2. **Shadcn UI 커스터마이징**: Shadcn 컴포넌트는 DESIGN.md 토큰에 맞게 변형
3. **Tailwind 폴백**: DESIGN.md에 없는 부분은 Shadcn 기본값 + Tailwind로 보완

### 구현 방식

- **색상 토큰**: `app/globals.css`의 CSS 변수로 정의 (Shadcn 표준 방식)
    ```css
    :root {
        --background: ...;
        --foreground: ...;
        --primary: ...;
        /* DESIGN.md의 컬러 토큰을 여기에 반영 */
    }
    ```
- **산세리프 폰트 적용**: 헤딩(`h1`, `h2`, `h3`)에 산세리프 폰트 클래스 적용. `next/font`로 폰트 최적화 로딩.
    ```tsx
    // 예: 페이지 헤딩
    <h1 className='font-serif text-3xl'>학습 노트 검색</h1>
    ```
    Notion 스타일에 어울리는 산세리프 폰트 **Pretendard** 로 적용:
    - **Pretendard Variable** (가변 폰트로 적용, 영문/한글 모두 사용)
- **본문 폰트**: 한글 가독성 좋은 산세리프 (예: Pretendard)
- **간격**: Tailwind의 기본 간격 스케일 활용. 여백을 충분히 확보(보통 `gap-6`, `p-8` 등)
- **모서리**: 카드/모달은 `rounded-lg`, 버튼/입력은 `rounded-md` 기본

### 컴포넌트별 가이드

| 컴포넌트                                   | Notion 스타일 적용 포인트                                         |
| ------------------------------------------ | ----------------------------------------------------------------- |
| 검색 입력창 (`SearchForm`)                 | 큰 폰트, 충분한 패딩(`p-4`), 부드러운 보더, 포커스 시 미묘한 강조 |
| 영상 결과 목록 (`SearchResults`)           | 행 간격 충분히, 호버 시 부드러운 배경 변화, 정보는 위계적으로     |
| 카테고리 선택 모달 (`CategorySelectModal`) | 중앙 정렬, 충분한 패딩, 친근한 어조의 안내 문구                   |
| 진행 상황 표시 (`ProcessProgress`)         | 각 영상별 카드 형태, 부드러운 애니메이션, 색상은 절제             |
| 버튼                                       | 주 버튼은 색상으로 강조, 보조 버튼은 ghost/outline 스타일         |

### 다크 모드

Notion은 다크 모드도 따뜻한 톤을 유지합니다. 순수 검정(`#000`)이 아니라 미묘하게 따뜻한 다크 그레이를 사용하세요. CSS 변수의 `.dark` 셀렉터로 정의:

```css
.dark {
    --background: ...; /* 따뜻한 다크 톤 */
    --foreground: ...;
}
```

### 주의사항

- **새 UI를 만들거나 기존 UI를 수정할 때 항상 DESIGN.md를 먼저 참조**할 것
- DESIGN.md에 모호하거나 정의되지 않은 부분은 위의 핵심 원칙(여백, 따뜻함, 세리프 헤딩, 부드러운 표면)에 맞춰 추론
- Notion의 정확한 로고나 브랜드 자산은 사용하지 말 것 (스타일 패턴만 차용)
- 화려한 효과나 트렌디한 패턴(글래스모피즘, 네온, 강한 그라데이션 등) 지양

---

## 구현 Phase

| Phase       | 내용                                                                                                         | 상태                            |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Phase 1** | 프로젝트 셋업 + 핵심 백엔드 모듈 (YouTube 검색, 자막 추출, Gemini 요약, Dropbox 업로드) + 개발용 검증 페이지 | 진행 중 (1.1·1.2 완료, 1.3 대기) |
| **Phase 2** | 검색 UI + 결과 목록 + 카테고리 선택 모달 + 단일 영상 처리                                                    | 대기                            |
| **Phase 3** | 복수 선택 + SSE 기반 일괄 처리 + 진행 상황 표시                                                              | 대기                            |
| **Phase 4** | 카테고리 관리 UI, 인덱스 노트 자동 생성, 노트 템플릿 편집, PWA, 배포                                         | 대기                            |

> 현재 Phase는 작업 시작 전 매번 확인할 것. 각 Phase의 세부 작업 목록은 `IMPLEMENTATION_PLAN.md` 섹션 6 참조.

### 백엔드 모듈 진행 상황

| 모듈                         | 위치                                  | 상태   | 비고                                                       |
| ---------------------------- | ------------------------------------- | ------ | ---------------------------------------------------------- |
| YouTube 검색                 | `lib/youtube/search.ts`               | ✅ 완료 | 네이티브 `fetch`로 직접 호출 (`@googleapis/youtube` 미사용) |
| YouTube 타입 정의            | `lib/youtube/types.ts`                | ✅ 완료 | 응답에서 실제 읽는 필드만 좁혀서 정의                       |
| ISO 8601 duration 파서       | `lib/utils/duration.ts`               | ✅ 완료 | `parseIso8601Duration`, `formatDuration`                    |
| 언어 감지                    | `lib/utils/language.ts`               | ✅ 완료 | `defaultLanguage` 우선, 없으면 한/일/중/영 휴리스틱         |
| 검색 Route Handler           | `app/api/search/route.ts`             | ✅ 완료 | GET, 쿼리스트링 기반                                       |
| 자막 추출                    | `lib/youtube/transcript.ts`           | ⬜ 대기 | Phase 1.3                                                  |
| Gemini 요약                  | `lib/ai/gemini.ts`, `lib/ai/prompts.ts` | ⬜ 대기 | Phase 1.4                                                  |
| 슬러그/Dropbox 업로드        | `lib/utils/slugify.ts`, `lib/dropbox/upload.ts` | ⬜ 대기 | Phase 1.5                                                  |
| 개발용 검증 페이지           | `app/dev/page.tsx`                    | ⬜ 대기 | Phase 1.6                                                  |

### 주요 결정 사항

- **YouTube API 클라이언트**: 계획서는 `googleapis` 또는 `@googleapis/youtube` SDK 설치를 권장하지만, 실제로는 **네이티브 `fetch`로 직접 호출**한다. 이유: (1) API 키 인증만 쓰는 단순 REST 호출이라 SDK 이점이 적고, (2) 의존성과 번들 크기를 줄이며, (3) Next.js 캐싱·타입을 우리가 명시적으로 제어할 수 있다. 응답 타입은 `lib/youtube/types.ts`에서 우리가 실제 읽는 필드만 좁혀 정의.
- **재생목록(playlist) 검색**: Phase 1에서는 `type=video`만 처리. `type=playlist`로 호출하면 명확한 에러를 던진다 (Phase 4 또는 추후 확장).
- **검색 API의 HTTP 메서드**: GET + URL 쿼리스트링. 브라우저/curl 테스트가 쉽고 멱등하다. 프론트에서 호출할 때도 `fetch('/api/search?query=...')` 형태.

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

### Q. 자막이 없는 영상은?

A. Phase 3 MVP에서는 건너뜀. 사용자에게 알림 표시. Whisper API 폴백은 Phase 4 이후 선택 사항.

### Q. 노트가 너무 길어지면?

A. Gemini Flash의 컨텍스트는 충분히 크지만, 매우 긴 자막(2시간+)은 청크 분할 처리. `lib/ai/gemini.ts`에 분할 로직 포함.

### Q. Dropbox 업로드 실패하면?

A. 마크다운을 클라이언트로 반환해서 사용자가 직접 다운로드할 수 있도록 폴백 제공.

### Q. Vercel Hobby 플랜의 함수 실행 시간 제한(10초)에 걸리면?

A. SSE 스트리밍으로 처리 시작 즉시 응답을 시작해 timeout 회피. 영상 1편 처리는 보통 10초 내 완료되지만, 자막이 매우 길면 청크 처리 필요.

### Q. 같은 영상을 두 번 정리하면?

A. Dropbox `autorename: true` 옵션으로 파일명 뒤에 `(1)`, `(2)`가 자동으로 붙음. Phase 4에서 중복 감지 후 사용자에게 확인 UI 추가 예정.

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
