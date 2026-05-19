# YouTube → Obsidian 학습 노트 자동화 도구 구현 계획

> 유튜브 강좌 영상을 검색·요약하여 옵시디언 보관함에 자동으로 마크다운 노트를 생성하는 개인 학습용 웹 애플리케이션

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [사용자 시나리오](#4-사용자-시나리오)
5. [사전 준비 사항](#5-사전-준비-사항)
6. [Phase별 구현 계획](#6-phase별-구현-계획)
7. [디렉토리 구조](#7-디렉토리-구조)
8. [환경 변수](#8-환경-변수)
9. [API 사용량 및 비용](#9-api-사용량-및-비용)
10. [모바일 동기화 설정](#10-모바일-동기화-설정)
11. [위험 요소 및 대응 방안](#11-위험-요소-및-대응-방안)
12. [향후 확장 아이디어](#12-향후-확장-아이디어)

---

## 1. 프로젝트 개요

### 1.1 목적

출퇴근 시간 및 자투리 시간을 활용해 유튜브 강좌 영상을 효율적으로 학습하기 위한 개인용 도구. 사용자가 검색어와 필터로 강좌를 찾고, 원하는 영상들을 선택하면 AI가 자동으로 핵심 내용을 정리해 옵시디언 보관함(Dropbox 기반)에 마크다운 노트로 저장한다.

### 1.2 핵심 가치

- **검색부터 정리까지 한 번에**: 영상 찾기 → 자막 추출 → AI 요약 → 옵시디언 저장을 일원화
- **데스크톱 생성, 모바일 학습**: 데스크톱에서 노트를 생성하고 모바일 옵시디언으로 출퇴근 중 학습
- **비용 최소화**: 무료 LLM(Gemini Flash) 우선 사용, 유료 전환은 옵션

### 1.3 주요 사용자

본인 1명 (개인 학습용 도구)

---

## 2. 기술 스택

### 2.1 프론트엔드

- **Next.js 15+** (App Router, 안정 버전)
- **TypeScript** (strict mode)
- **Tailwind CSS** (v4 안정 버전)
- **Shadcn UI** (Radix UI + Tailwind 기반 컴포넌트 라이브러리)

### 2.2 백엔드

- **Next.js API Routes** (별도 백엔드 서버 불필요)
- **Server-Sent Events (SSE)** 또는 Route Handler 스트리밍 (다중 영상 진행 상황 표시용)

### 2.3 외부 API / 라이브러리

| 용도 | 기술 | 비용 |
|---|---|---|
| 영상 검색 | YouTube Data API v3 | 무료 (일 10,000 units) |
| 자막 추출 | `youtube-transcript` (npm) | 무료 |
| AI 요약 | Google Gemini API (Gemini 2.0 Flash) | 무료 (일 1,500 요청) |
| 옵시디언 저장 | Dropbox API (`dropbox` SDK) | 무료 |
| 음성 인식 (폴백) | OpenAI Whisper API 또는 무료 STT | 사용 시 유료 (선택) |

### 2.4 개발 환경

- **IDE**: VS Code + Claude Code 공식 확장
- **Node.js**: 20 LTS 이상
- **패키지 매니저**: pnpm (또는 npm)
- **버전 관리**: Git + GitHub (private repo)
- **배포**: Vercel (무료 hobby 플랜)

---

## 3. 시스템 아키텍처

### 3.1 전체 흐름도

```
┌─────────────────────────────────────────────────────────────┐
│                      [사용자 브라우저]                       │
│  ① 검색어 + 필터 입력 → ② 영상 목록 확인 → ③ 복수 선택      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              [Next.js App (Vercel 배포)]                    │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │  검색 페이지     │    │  /api/search                  │    │
│  │  (Client)       │───▶│  → YouTube Data API 호출      │    │
│  └─────────────────┘    │  → 결과 가공 후 반환          │    │
│                         └──────────────────────────────┘    │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │  처리 진행       │    │  /api/process (SSE 스트림)   │    │
│  │  화면 (Client)  │◀──▶│  각 영상별로 순차 처리:        │    │
│  └─────────────────┘    │   1. 자막 추출                │    │
│                         │   2. Gemini 요약              │    │
│                         │   3. 마크다운 변환            │    │
│                         │   4. Dropbox 업로드           │    │
│                         └──────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Dropbox (vault 폴더)  │
                    │   /Obsidian/Vault/...   │
                    └────────────┬───────────┘
                                 │ 동기화
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
   ┌──────────────────┐                  ┌──────────────────┐
   │  데스크톱        │                  │  안드로이드 폰    │
   │  Dropbox 앱      │                  │  FolderSync →    │
   │  → 옵시디언      │                  │  로컬 폴더 →     │
   │     데스크톱     │                  │  옵시디언 모바일  │
   └──────────────────┘                  └──────────────────┘
```

### 3.2 컴포넌트 책임 분리

- **프론트엔드 (Client Components)**: 검색 UI, 결과 표시, 정렬/필터링, 영상 선택 체크박스, 카테고리 선택, 진행 상황 표시
- **백엔드 (API Routes)**: 외부 API 호출, 비밀 키 보호, 영상 처리 파이프라인 실행, SSE 스트리밍
- **외부 서비스**: YouTube Data API (검색), Gemini API (요약), Dropbox API (저장)

### 3.3 옵시디언 Vault 폴더 구조

생성되는 노트는 **카테고리 + 검색어 기반 하이브리드 구조**로 자동 분류된다. 사용자가 카테고리를 선택하고, 검색어는 슬러그화되어 하위 폴더로 자동 생성된다.

```
/Obsidian/Vault/YouTube/                 ← 도구가 관리하는 루트
├── _inbox/                               ← 카테고리 미선택 시 임시 보관
│   └── 2026-05-14_채널A_제목.md
├── 프로그래밍/                            ← 사용자가 선택한 카테고리
│   ├── 파이썬-데이터-분석-기초/          ← 검색어 슬러그 자동 생성
│   │   ├── _index.md                    ← 학습 세션 인덱스 (Phase 4)
│   │   ├── 2026-05-14_노마드코더_파이썬-입문.md
│   │   └── 2026-05-14_생활코딩_데이터분석.md
│   └── React-Hook-심화/
│       └── 2026-05-15_...md
├── AI-머신러닝/
│   └── LLM-파인튜닝-실습/
│       └── ...
├── 데이터분석/
├── 디자인/
├── 비즈니스/
└── 기타/
```

#### 폴더 구조 설계 원칙

1. **카테고리는 사용자가 선택**: 처리 시작 전 모달에서 기존 카테고리 선택 또는 새 카테고리 추가
2. **검색어 하위 폴더는 자동 생성**: 검색어를 슬러그화해서 카테고리 아래에 자동 폴더 생성 (예: "파이썬 데이터 분석 기초" → `파이썬-데이터-분석-기초`)
3. **카테고리 미선택 시 `_inbox/`로**: 분류 결정을 미루고 나중에 옵시디언에서 직접 이동 가능
4. **Dropbox API가 폴더 자동 생성**: 별도 `createFolder` 호출 불필요, 파일 업로드 시 상위 폴더 없으면 자동 생성됨
5. **검색 행동 = 학습 세션**: 한 번의 검색에서 정리한 영상들이 자연스럽게 한 폴더에 묶임

#### 카테고리 설정

카테고리 목록은 설정 파일로 관리하여 추가/수정이 용이하게 함:

```typescript
// config/categories.ts
export const DEFAULT_CATEGORIES = [
  '프로그래밍',
  '데이터분석',
  'AI-머신러닝',
  '디자인',
  '비즈니스',
  '기타',
] as const;

export const INBOX_CATEGORY = '_inbox';
```

Phase 4에서는 사용자가 UI에서 직접 카테고리를 추가/삭제할 수 있도록 확장 예정 (로컬 스토리지 또는 Dropbox에 사용자 설정 저장).

---

## 4. 사용자 시나리오

### 4.1 메인 시나리오 — "파이썬 데이터 분석 강좌 정리"

1. 사용자가 데스크톱에서 웹사이트 접속
2. 검색창에 "파이썬 데이터 분석 기초" 입력
3. 필터 설정: 업로드 날짜 = "지난 1년", 영상 길이 = "20분 초과", 타입 = "동영상"
4. "검색" 버튼 클릭
5. 결과 목록 확인 (번호, 제목, 업로드 날짜, 사용 언어, 자막 유/무 표시)
6. 정렬 기준을 "조회수 높은 순"으로 변경
7. 관심 있는 영상 3편을 체크박스로 선택
8. "선택한 영상 정리하기" 버튼 클릭
9. **카테고리 선택 모달이 표시됨**:
   - 카테고리 드롭다운에서 "프로그래밍" 선택 (또는 "+ 새 카테고리 추가")
   - 검색어 기반 하위 폴더명 자동 표시 (`파이썬-데이터-분석-기초`, 수정 가능)
   - 저장 경로 미리보기 확인: `/Vault/YouTube/프로그래밍/파이썬-데이터-분석-기초/`
   - "확인하고 시작" 클릭
10. 진행 상황 화면에서 영상별로 자막 추출 → 요약 → 저장 진행 상황 확인
11. 완료 후 Dropbox vault의 지정한 폴더에 3개의 .md 노트 생성 확인
12. 출퇴근 시 안드로이드 폰 옵시디언 모바일 앱에서 동기화된 노트로 학습

### 4.2 예외 시나리오

- **자막 없는 영상 선택 시**: 사용자에게 "자막이 없습니다. 건너뛸까요?" 알림 (MVP에서는 건너뛰기)
- **API 한도 초과**: 명확한 에러 메시지 + 대기 시간 안내
- **Dropbox 업로드 실패**: 마크다운을 다운로드 가능한 형태로 폴백 제공

---

## 5. 사전 준비 사항

### 5.1 발급해야 할 API 키 목록

| 서비스 | 발급 위치 | 비고 |
|---|---|---|
| **Google Cloud (Gemini + YouTube)** | https://console.cloud.google.com | 두 API를 같은 프로젝트에서 활성화, API 키 하나로 사용 가능 |
| **Dropbox App Key** | https://www.dropbox.com/developers/apps | "Scoped access" 앱 생성, `files.content.write` 권한 필요 |
| **Anthropic API (Claude Code용)** | https://console.anthropic.com | 개발 도구용, 프로젝트 자체에선 미사용 |

### 5.2 단계별 키 발급 절차

#### Google Cloud (Gemini + YouTube Data API)

1. https://console.cloud.google.com 접속, 새 프로젝트 생성 (예: `youtube-obsidian-notes`)
2. "API 및 서비스 → 라이브러리"에서 다음 두 API 활성화:
   - **YouTube Data API v3**
   - **Generative Language API** (Gemini용)
3. "API 및 서비스 → 사용자 인증 정보"에서 **API 키** 생성
4. 보안 권장: API 키 제한 설정 (HTTP 리퍼러 제한 또는 API 제한)
5. 별도로 Gemini용 키만 발급받으려면 https://aistudio.google.com 에서도 가능

#### Dropbox

1. https://www.dropbox.com/developers/apps 접속
2. "Create app" 클릭
3. 다음 설정 선택:
   - API: **Scoped access**
   - Access type: **App folder** (보안상 권장) 또는 **Full Dropbox** (기존 vault 사용 시)
   - App name: `youtube-obsidian-sync` (또는 원하는 이름)
4. "Permissions" 탭에서 다음 권한 체크:
   - `files.content.write` (필수)
   - `files.content.read` (중복 파일 확인용)
5. "Submit" 후 OAuth 2 섹션에서 **Access Token** 생성 (개인용이므로 단순 토큰으로 충분)

### 5.3 로컬 개발 환경 준비

```bash
# Node.js 20+ 설치 확인
node --version  # v20.x.x 이상

# pnpm 설치 (선택)
npm install -g pnpm

# VS Code 확장 설치
# - Claude Code (공식, Anthropic)
# - ESLint
# - Prettier
# - Tailwind CSS IntelliSense
# - GitLens
```

---

## 6. Phase별 구현 계획

전체 구현은 **4개의 Phase**로 나누어 진행한다. 사용자 흐름(검색 → 선택 → 정리 → 저장)을 그대로 따르되, 먼저 단일 영상 처리로 안정화한 후 복수 처리로 확장하는 전략이다.

각 Phase가 끝날 때마다 "동작하는 도구"가 손에 있도록 설계되어 있다.

---

### 🟢 Phase 1 — 프로젝트 셋업 + 핵심 백엔드 모듈

**목표**: 프로젝트 기본 구조를 잡고, 외부 API(YouTube/Gemini/Dropbox) 연동 모듈 4가지를 개별 검증한다. 본격 UI는 다음 Phase에서 만들고, 이 Phase에서는 최소한의 개발용 테스트 페이지로 동작만 확인한다.

**예상 소요 시간**: 2~3일

**왜 이렇게 나누나**: 외부 API 의존성이 많은 프로젝트라서, UI를 본격적으로 만들기 전에 각 API가 본인 환경에서 정상 동작하는지 먼저 확인해두는 게 안전하다. 여기서 만든 모듈들은 Phase 2 이후에도 그대로 재사용되므로 버려지는 코드가 아니다.

#### 1.1 프로젝트 초기 셋업

- [x] `pnpm create next-app@latest` 로 Next.js 15 + TypeScript + Tailwind + App Router 프로젝트 생성
- [x] Shadcn UI 초기화: `pnpm dlx shadcn@latest init`
- [x] 기본 컴포넌트 설치: `pnpm dlx shadcn@latest add button input card toast progress checkbox select`
- [x] ESLint + Prettier 설정 (TypeScript strict mode 활성화)
- [x] `.env.local` 파일 생성 및 `.gitignore`에 추가 확인
- [x] Git 초기 커밋, GitHub private repo 연결
- [x] `CLAUDE.md` 파일 작성 (프로젝트 컨텍스트 — Claude Code 참고용)
- [x] 디렉토리 구조 잡기 (섹션 7 참조)

#### 1.2 YouTube Data API 검색 모듈

- [x] `googleapis` 또는 `@googleapis/youtube` 패키지 설치
- [x] `lib/youtube/search.ts` 작성:
  - `searchVideos(params: SearchParams): Promise<VideoSearchResult[]>`
  - 입력: 키워드, 업로드 날짜 범위, 영상 길이, 타입(video/playlist), 최대 결과 수
  - 출력: 표준화된 영상 정보 배열

- [x] `SearchParams` 타입 정의:
  ```typescript
  type SearchParams = {
    query: string;
    publishedAfter?: string;  // ISO 8601
    publishedBefore?: string; // ISO 8601
    videoDuration?: 'short' | 'medium' | 'long' | 'any';
    type?: 'video' | 'playlist';
    maxResults?: number;  // 기본 25
    order?: 'relevance' | 'date' | 'viewCount' | 'rating';
  };
  ```

- [x] `VideoSearchResult` 타입 정의:
  ```typescript
  type VideoSearchResult = {
    videoId: string;
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl: string;
    duration: string;       // ISO 8601 duration (PT15M33S)
    durationSeconds: number; // 정렬용
    viewCount: number;
    language: string;       // 'ko' | 'en' | 'unknown'
    hasCaption: boolean;
    description: string;    // 처음 200자
    url: string;            // https://youtube.com/watch?v=...
  };
  ```

- [x] 검색 흐름 구현:
  1. `search.list` API로 영상 ID 목록 가져오기 (100 units)
  2. `videos.list` API로 각 영상의 상세 정보 (duration, viewCount, caption 등) 일괄 조회 (1 unit per call, 최대 50개 ID 동시 조회 가능)
  3. 결과 결합 후 반환

- [x] 언어 감지 로직 (`lib/utils/language.ts`):
  - 영상 메타데이터의 `defaultLanguage`, `defaultAudioLanguage` 우선 사용
  - 없으면 제목과 설명으로 추정 (간단한 정규식 또는 `franc` 라이브러리)
  - 그래도 모르면 'unknown' 반환

- [x] `app/api/search/route.ts` Route Handler 작성 + Postman / Thunder Client로 호출 테스트

#### 1.3 자막 추출 모듈

- [x] `youtube-transcript` npm 패키지 설치
- [x] `lib/youtube/transcript.ts` 작성:
  - `extractTranscript(videoId: string): Promise<TranscriptResult>` — `{ videoId, language, segments }` 반환
  - 각 세그먼트는 `{ text, offsetSeconds, durationSeconds }` (라이브러리가 ms/초를 혼용해 반환하므로 모듈 경계에서 초로 정규화)
  - 자막 없을 시 명확한 한국어 에러 throw (비활성화 / 영상 없음 / rate limit / 알 수 없음 분기)
- [x] 한국어/영어 자막 우선순위 로직 (ko → en → 영상 기본 자막)
- [ ] 테스트 영상 2~3개로 정상 동작 확인 (한국어 강좌, 영어 강좌, 자막 없는 영상) — Phase 1.6 dev 페이지에서 함께 검증

#### 1.4 Gemini API 요약 모듈

- [x] ~~`@google/generative-ai` SDK 설치~~ → **네이티브 fetch로 REST API 직접 호출** (검색 모듈과 같은 결정, SDK 의존성 줄이기)
- [x] `lib/ai/gemini.ts` 작성:
  - `summarizeTranscript(segments: TranscriptSegment[], context: NoteContext): Promise<string>`
  - 마크다운 형식의 노트(frontmatter + 본문) 반환
  - Frontmatter는 우리가 결정론적으로 생성, AI에는 본문만 요청 (YAML 파손 방지)
  - 코드펜스/frontmatter 중복 출력 등 모델 변덕은 `cleanBody`에서 방어적으로 제거
- [x] 프롬프트 설계 (`lib/ai/prompts.ts`):
  ```
  당신은 학습용 노트를 만드는 전문가입니다.
  아래 유튜브 강좌 영상의 자막을 바탕으로 옵시디언 노트를 작성해주세요.

  요구 형식:
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
  ### 개념 2: ...

  ## 타임스탬프별 정리
  - **00:00 - 02:30**: ...
  - **02:30 - 05:00**: ...

  ## 핵심 인사이트
  ...

  ## 추가 학습 키워드
  - [[키워드1]]
  - [[키워드2]]

  ## 태그
  #youtube #학습 #[카테고리] #[주제관련태그]
  ```
  > frontmatter는 옵시디언 Dataview 플러그인과 시너지 효과가 있어 "지난주 정리한 프로그래밍 노트" 같은 쿼리가 가능해진다.
- [x] 모델: `GEMINI_MODEL` 환경 변수로 지정. 기본값은 `gemini-flash-latest` (현재 .env.local 값과 일치). 계획서의 `gemini-2.0-flash-exp`는 실험 모델이라 stable alias로 교체
- [x] 토큰 제한 처리: Flash가 1M 컨텍스트라 단일 호출로 99% 영상 커버. 자막 50만 자 초과 시 명확한 한국어 에러 throw. 실제 청크 분할은 필요해질 때 추가 (Phase 4 이후)

#### 1.5 Dropbox 업로드 모듈 (카테고리 기반 폴더 구조)

- [x] ~~`dropbox` SDK 설치~~ → **네이티브 fetch로 REST 직접 호출** (검색·Gemini와 같은 결정, 의존성 축소)
- [x] `config/categories.ts` 작성 (`DEFAULT_CATEGORIES`, `INBOX_CATEGORY`, `DefaultCategory` 타입)

- [x] `lib/utils/slugify.ts` 작성:
  ```typescript
  export function slugifyForFolder(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')  // 한글/영문/숫자/공백/하이픈만 허용
      .replace(/\s+/g, '-')            // 공백 → 하이픈
      .replace(/-+/g, '-')             // 연속 하이픈 정리
      .slice(0, 50);                   // 길이 제한
  }
  // 예: "파이썬 데이터 분석 기초!" → "파이썬-데이터-분석-기초"
  ```

- [x] `lib/dropbox/upload.ts` 작성:
  ```typescript
  type UploadOptions = {
    category?: string;        // 카테고리 (없으면 _inbox)
    searchQuery?: string;     // 검색어 (하위 폴더 생성에 사용)
    videoTitle: string;
    videoChannel: string;
    publishedDate: string;
  };

  async function uploadNote(
    content: string,
    options: UploadOptions
  ): Promise<DropboxUploadResult> {
    const category = options.category || INBOX_CATEGORY;  // 기본값: _inbox
    const queryFolder = options.searchQuery
      ? slugifyForFolder(options.searchQuery)
      : '';

    // 폴더 경로 조립
    const folderPath = queryFolder
      ? `${VAULT_PATH}/${category}/${queryFolder}`
      : `${VAULT_PATH}/${category}`;

    // 파일명: YYYY-MM-DD_채널명_영상제목축약.md
    const filename = generateFilename(options);
    const fullPath = `${folderPath}/${filename}`;

    return await dbx.filesUpload({
      path: fullPath,
      contents: content,
      mode: { '.tag': 'add' },
      autorename: true,  // 중복 시 자동으로 (1), (2) 붙임
    });
  }
  ```

- [x] 파일명 규칙: `YYYY-MM-DD_채널명-슬러그_영상제목-축약.md` 구현 (`lib/utils/filename.ts`의 `generateNoteFilename`, 채널 24자 / 제목 60자 제한)
- [x] **폴더 자동 생성 활용**: Dropbox `files/upload` 엔드포인트가 상위 폴더 자동 생성
- [x] vault 루트 경로 환경 변수로 관리: `DROPBOX_VAULT_PATH` (`requireVaultPath`가 빈 값/`/`로 시작 안 함 케이스를 한국어 에러로 차단)
- [x] ASCII-only 헤더 처리: `Dropbox-API-Arg` 헤더가 ASCII JSON을 요구하므로 `asciiSafeJson`이 비-ASCII 문자를 `\uXXXX`로 이스케이프 (한글 카테고리/검색어/제목 안전성 확보)
- [ ] 단위 테스트: 임의의 카테고리/검색어 조합으로 호출 시 올바른 경로에 파일 생성되는지 확인 — Phase 1.6 dev 페이지에서 함께 검증

#### 1.6 개발용 임시 검증 페이지

> ⚠️ 이 페이지는 본인 환경에서 백엔드 모듈들이 정상 동작하는지 확인하기 위한 개발용이다. Phase 2 본격 UI 완성 후 삭제하거나 비공개 처리한다.

- [x] `app/dev/page.tsx` 작성:
  - 검색어 입력 → `/api/search` 호출 → 결과 JSON `<pre>`로 그대로 표시
  - videoId + 카테고리(`DEFAULT_CATEGORIES` datalist 힌트) + 검색어 입력 → `/api/process` POST → 자막추출 → 요약 → Dropbox 업로드까지 한 번에 실행 → 성공 시 path/filename/size + 메타 표시, 실패 시 `step` 라벨과 함께 에러 표시
  - 카테고리 비우면 `_inbox`로, 검색어 비우면 카테고리 폴더 바로 아래로 저장됨을 직접 확인할 수 있는 형태
- [x] 정식 `app/api/process/route.ts` 동시 작성 (Phase 2.4에서 그대로 재사용). 파이프라인: `getVideoMeta` → `extractTranscript` → `summarizeTranscript` → `uploadNote`. 실패 응답에 `step: 'meta'|'transcript'|'summarize'|'upload'` 포함
- [x] `lib/youtube/search.ts`에 `getVideoMeta(videoId)` 헬퍼 추가 (단일 videoId로 메타 조회 — dev 페이지 + Phase 2/3 단일 처리 흐름에서 재사용)
- [x] 데스크톱 옵시디언에서 생성된 노트 정상 표시 확인 — 한국어/영어 영상 각 1편으로 frontmatter, 섹션 헤더, `[[위키링크]]`, `#태그` 모두 정상 렌더링 확인

#### 1.7 Phase 1 완료 기준

- [x] 검색 API가 키워드 + 필터에 맞는 영상 목록을 정확히 반환
- [x] 임의의 videoId 하나에 대해 자막 추출 → Gemini 요약 → Dropbox 저장이 일관되게 성공
- [x] **카테고리 + 검색어 조합으로 Dropbox에 폴더 구조가 자동 생성**되는지 확인
  - 실제 생성된 경로: `/Obsidian/Vault/YouTube/프로그래밍/claude-code-튜토리얼/2025-10-27_아이티커넥트_30분-만에-...md`
- [x] 한국어/영어 강좌 영상 각 1개씩 처리 성공 (영어 영상도 한국어 노트로 자연스럽게 정리됨)
- [x] 데스크톱 옵시디언에서 새 노트가 잘 보이는지 확인

**Phase 1.6 진행 중 확보된 추가 사항** (Phase 2에서 그대로 재사용):

- `/api/process` POST 정식 엔드포인트 — 메타 → 자막 → 요약 → 업로드 파이프라인 + `step` 라벨 에러
- `getVideoMeta(videoId)` 헬퍼 — 단일 videoId로 메타 조회 (Phase 2/3 단일/복수 처리 흐름에서 재사용)
- Gemini 호출에 지수 백오프 재시도 (429/500/502/503/504 대상, 최대 2회) — Phase 3 plan에서 예정됐던 작업을 1.6 검증 중 503 만나면서 미리 당김

**Phase 2 진입 시 주의 (검색 결과 목록 UI 설계):**

`VideoSearchResult.hasCaption`은 YouTube API `contentDetails.caption` 그대로 — **업로더가 직접 올린 자막만** true, 자동 생성 자막은 false다. 우리 `extractTranscript`는 자동 자막도 가져오므로 검색 결과에 "자막 없음" 배지를 그대로 노출하면 오해를 부른다. Phase 2.2에서는 라벨을 "공식 자막" 정도로 바꾸거나, 자막 유무 표시를 아예 빼고 처리 시점에 판별하는 식으로 정리할 것.

---

### 🟡 Phase 2 — 검색 UI + 단일 영상 처리 (정식 사용자 흐름)

**목표**: 실제 사용자가 쓰는 검색 화면과 결과 목록을 완성하고, 결과에서 단일 영상을 선택해 정리하는 흐름까지 완성.

**예상 소요 시간**: 2~3일

#### 2.1 검색 페이지 UI

- [x] `app/page.tsx`를 메인 검색 페이지로 구성:
  - 큰 검색 입력창 (Shadcn `Input`)
  - 필터 영역 (Shadcn `Select`, `RadioGroup`, `DatePicker` — base-ui 기반으로 직접 래핑, `react-day-picker` 10 도입):
    - 업로드 날짜: 전체 / 1주 / 1개월 / 6개월 / 1년 / 사용자 지정
    - 영상 길이: 전체 / 짧음(<4분) / 중간(4-20분) / 김(>20분)
    - 타입: 동영상 / 재생목록
    - 정렬: 관련도 / 최신순 / 조회수
  - "검색" 버튼

- [x] `components/SearchForm.tsx` + `components/FilterPanel.tsx`로 분리. `SearchForm`이 `buildSearchParams`로 프리셋을 `publishedAfter` ISO 문자열로 변환
- [x] 검색 상태 관리 (idle / loading / success / error discriminated union). Phase 2.2 정식 목록 UI 전까지 임시로 한 줄 리스트 표시

#### 2.2 검색 결과 목록 UI

- [x] `components/SearchResults.tsx` 작성:
  - **카드 리스트** 채택 (반응형: 데스크톱은 가로 — 썸네일/내용/버튼, `sm` 이하는 세로 스택). 계획서의 "테이블 또는 카드" 중 카드 단일안으로 정리
  - 표시 항목: 번호, 썸네일(`next/image`, `i.ytimg.com` 허용, `unoptimized`), 제목(YouTube 새 탭 링크 + 외부 링크 hover 아이콘), 채널명, 업로드 날짜(YYYY-MM-DD), 영상 길이(썸네일 우하단 오버레이), 조회수(`formatViewCount` 한국식 만/억 표기), 언어 배지, "공식 자막" 배지
  - **자막 배지 처리**: Phase 2 진입 시 주의사항대로 `hasCaption=true`일 때만 초록 톤 "공식 자막" 배지를 띄우고, false일 때는 아무 표시 안 함 (자동 자막은 처리 시점에 판별)
  - 각 행에 "정리하기" 버튼 — Phase 2.2에서는 placeholder (toast + console.log), 실제 모달/처리 연결은 Phase 2.3에서

- [x] 클라이언트 사이드 정렬:
  - `useState<SortKey>`로 정렬 상태 관리. `useMemo`로 결과 재정렬
  - 카드 레이아웃이라 **헤더 클릭 대신 Select 드롭다운**으로 변경 (관련도 / 제목순 / 최신순 / 영상 길이 / 조회수). 기본값 '관련도(기본)' = 서버 응답 순서 보존
  - 정렬 함수에 `localeCompare(other, 'ko')` 로케일 명시 — 한글 가나다순 정렬
  - API 재호출 없음

- [x] 빈 결과 / 로딩 / 에러 상태 UI — `SearchState` discriminated union을 받아 `SearchResults` 내부에서 분기. idle / loading(spinner) / error(붉은 박스) / empty / success(목록) 5가지 케이스

#### 2.3 카테고리 선택 모달

- [x] `components/CategorySelectModal.tsx` 작성:
  - Shadcn `Dialog` 기반 (base-ui 래핑)
  - 표시 시점: `app/page.tsx`가 `processingVideo` 상태로 모달 열림/닫힘 제어
  - UI 구성:
    - 카테고리 드롭다운 (Shadcn `Select`): `DEFAULT_CATEGORIES` + 구분선 + `+ 새 카테고리 추가`
    - **"_inbox에 저장"은 별도 체크박스가 아니라 Select 맨 위 옵션 "나중에 분류 (_inbox)"으로 통합** (계획서 안에서 변경 — 상호 배타 상태 관리가 사라져 UX/구현이 더 단순함)
    - "새 카테고리 추가" 선택 시 텍스트 입력창 노출 (해당 세션 내에서만 사용, `config/categories.ts`에 영구 추가 안 됨)
    - 하위 폴더명 입력창: `slugifyForFolder(검색어)`가 기본값으로 자동 입력, 비우면 카테고리 폴더 바로 아래에 저장
    - 저장 경로 미리보기: `/Vault/YouTube/{카테고리}/{하위폴더}/YYYY-MM-DD_채널명_제목.md` 실시간 표시 (시각적 prefix만 — 실제 경로는 서버 `DROPBOX_VAULT_PATH`)
  - 버튼: "취소" / "확인하고 시작"

- [x] 모달 상태 관리:
  - `CategorySelection = { category, subfolder }` 타입을 `onConfirm` 콜백으로 부모(`app/page.tsx`)에 전달
  - Phase 2.3에서는 toast로 선택값과 경로 미리보기만 표시 (실제 `/api/process` 호출은 Phase 2.4)
  - **React 19 `react-hooks/set-state-in-effect` 회피**: open prop 변화에 따른 reset 로직을 `useEffect` 대신 부모의 `key={processingVideo?.videoId ?? 'closed'}` remount 패턴으로 처리. 자식은 `useState` lazy initializer로 한 번만 계산

- [x] 카테고리 기억하기 (편의 기능):
  - 마지막 확정 카테고리를 `localStorage['ytobs:lastCategory']`에 저장
  - 다음 mount 시 lazy initializer가 읽어 prefill. 사용자가 직접 입력했던 커스텀 카테고리(예: "데일리 영어")도 그대로 저장되며, 다음에 열 때는 "+ 새 카테고리 추가" 모드로 자동 복원 + 텍스트 prefill

#### 2.4 단일 영상 처리 흐름

- [x] `app/api/process/route.ts` — **Phase 1.6에서 이미 작성됨, 그대로 재사용**:
  - POST `{ videoId, category?, searchQuery? }` 수신
  - 파이프라인 `getVideoMeta` → `extractTranscript` → `summarizeTranscript` → `uploadNote`
  - 성공: `{ success: true, path, filename, size, meta, transcript }`
  - 실패: `{ success: false, step: 'meta'|'transcript'|'summarize'|'upload', error }`
  - 모달의 `subfolder`(이미 슬러그화)를 `searchQuery`로 넘기면 서버의 `slugifyForFolder`가 idempotent하게 동일 결과를 만든다 — 별도 분기 불필요

- [x] 결과 화면에서 "정리하기" 클릭 시 동작:
  - 카테고리 선택 모달 표시 (2.3에서 이미 연결됨)
  - 모달 확인 후 sonner `toast.loading`을 sticky(`duration: Infinity`)로 띄움. `app/page.tsx`의 `processVideo` 함수가 흐름 담당
  - **단계 표시 — 시간 기반 추정 전환**: 자막 추출 중 (t=0) → 요약 중 (t=3s) → Dropbox 저장 중 (t=22s). `setTimeout` 두 개를 잡고 응답이 일찍 오면 모두 `clearTimeout`. 실제 단계 전환과 100% 일치하진 않지만 평균 응답 시간에서 자연스럽게 흐름. (정확한 단계 스트림은 Phase 3 SSE에서)
  - 완료 시 `toast.success`로 filename + path 표시 (10초간 유지)
  - 실패 시 `toast.error`에 `[${STEP_KOREAN_LABEL[step]}] ${error}` 형태로 어느 단계 실패인지 한국어 라벨로 표시

#### 2.5 에러 처리 강화

- [x] 자막 없는 영상 클릭 시 사전 안내 — `CategorySelectModal`에 `hasCaption` prop 추가, `false`일 때 상단에 amber 톤 안내 박스 노출 ("공식 자막이 없는 영상입니다. 자동 자막이 있으면 정상 정리되지만, 자동 자막도 없으면 자막 추출 단계에서 실패할 수 있습니다.")
- [x] Gemini API 에러 한국어화 — `lib/ai/gemini.ts`의 `formatGeminiError`가 429(한도 초과 + 분당/일일 제한 안내), 401/403(키 인증 실패 + GEMINI_API_KEY 확인 안내), 400(원문 메시지 동봉)을 분기 처리. 5xx는 기존 재시도 로직(Phase 1.6 도입) 통과.
- [x] Dropbox 업로드 실패 시 마크다운 다운로드 폴백 — `/api/process`가 upload 단계 실패 시 응답에 `markdown` + `filename` 동봉. `app/page.tsx`의 `processVideo`가 sonner `toast.error`의 `action` 슬롯에 "마크다운 다운로드" 버튼을 띄우고, 클릭 시 Blob + 임시 `<a>` 클릭으로 `.md` 파일 직접 다운로드. 다른 단계 실패에는 마크다운이 없으므로 액션 버튼이 안 붙음.

#### 2.6 마무리

- [x] Phase 1의 개발용 페이지(`app/dev/page.tsx`)를 **개발 환경 전용으로 게이팅** — `app/dev/layout.tsx`를 새로 추가해 Server Component에서 `process.env.NODE_ENV !== 'development'`이면 `notFound()` 호출. 로컬(`next dev`)에서는 백엔드 raw JSON 디버깅용으로 그대로 쓰지만, `next build` 후 프로덕션 런타임에서는 자동 404. 코드 자체는 보존(Phase 3 SSE 작업 시 백엔드 디버깅에 다시 쓸 가능성).

#### 2.7 Phase 2 완료 기준

- [x] 키워드 검색 → 필터 적용 → 결과 목록 표시 → 정렬 변경이 매끄럽게 동작 (브라우저 테스트 완료)
- [x] "정리하기" 클릭 → 카테고리 선택 모달 → 확인 흐름이 매끄럽게 동작
- [x] 결과에서 단일 영상 처리 → 30초 내 **올바른 카테고리/검색어 폴더**에 노트 저장 확인 (옵시디언에서 확인 완료)
- [x] 마지막 선택한 카테고리가 다음 검색 시 기본값으로 제안되는지 확인 (`ytobs:lastCategory` localStorage prefill)
- [x] 정상 시나리오(시나리오 4.1)가 단일 영상 1개 처리 기준으로 끝까지 동작

**Phase 2 진행 중 추가 확보된 사항** (Phase 3 이후에서도 그대로 재사용):

- `lib/dropbox/auth.ts` (`getDropboxAccessToken()`) — refresh_token 자동 갱신 (Dropbox 2021-09 정책 변경 대응). Phase 1 계획서엔 없었지만 단기 토큰 만료가 발견되어 도입.
- `scripts/dropbox-exchange-code.mjs` — OAuth code → refresh_token 1회성 교환 헬퍼 (gitignored, 실 SECRET 박힌 채로 commit 방지).
- sonner toast의 `action` 슬롯 + Blob 다운로드 — Dropbox 업로드만 실패하는 경우의 폴백 패턴. Phase 3 일괄 처리에서도 영상별 폴백에 같은 패턴 재사용 가능.

---

### 🟠 Phase 3 — 복수 선택 및 일괄 처리

**목표**: 검색 결과에서 여러 영상을 동시에 선택하고, 진행 상황을 실시간으로 보면서 일괄 처리할 수 있는 상태.

**예상 소요 시간**: 2~3일

#### 3.1 복수 선택 UI

- [x] 검색 결과 각 항목에 체크박스 추가 — `SearchResults`의 `VideoCard`가 좌측에 Shadcn `Checkbox`를 가짐. `app/page.tsx`의 `selectedIds: ReadonlySet<string>` 상태가 진실 공급원
- [x] "전체 선택" / "전체 해제" 토글 — 결과 헤더에 단일 ghost 버튼. 0개일 땐 "전체 선택"(최대 `MAX_VIDEOS_PER_BATCH=10`개까지), 1개 이상이면 "전체 해제"
- [x] 선택된 영상 개수 표시 — 하단 액션바의 "N개 선택됨" + 최대치 도달 시 "(최대 10)" 부기. 카드 자체도 `border-primary/50 bg-primary/5`로 시각 강조
- [x] 하단 고정 액션바 — 새 `components/BatchActionBar.tsx` (`fixed bottom-0` + backdrop-blur). 선택 0개일 땐 렌더링 자체를 안 함. `<main>`에 `pb-24`로 콘텐츠 가림 방지
- [x] 한 번에 처리 가능한 최대 개수 제한 (10개) — `handleToggleSelect`에서 하드 블록 + `toast.warning("한 번에 10개까지만 선택할 수 있습니다.")`. "전체 선택"으로 슬라이스될 땐 `toast.info("N개 중 처음 10개만 선택됐습니다.")` 안내
- [x] Phase 2의 단일 "정리하기" 버튼 유지 — 카드 우측 버튼은 그대로 단일 처리 흐름(`/api/process` POST + toast 단계 전환) 호출
- [x] **카테고리 선택 모달 재사용** — `videoTitle` prop을 `subtitle`로 일반화. 단일은 영상 제목, 일괄은 "선택된 N개 영상 일괄 정리". `processingTarget`이 `{ kind: 'single', video } | { kind: 'batch', videos }` 유니온으로 두 흐름 모두 같은 모달이 받음. 일괄 처리 확정 시 Phase 3.1 단계에서는 `toast.info` 플레이스홀더 + `setSelectedIds(new Set())`만 수행 (실제 SSE는 3.2에서 연결)

#### 3.2 일괄 처리 백엔드 (Server-Sent Events)

- [x] `app/api/process-batch/route.ts` 작성:
  - POST 요청으로 `{ videoIds: string[], category?: string, searchQuery?: string }` 받기 (`category`/`searchQuery`는 단일 처리(`/api/process`)와 일관성을 위해 optional로 완화 — 미지정 시 `_inbox` + 카테고리 폴더 바로 아래에 저장)
  - 모든 영상이 같은 카테고리/하위폴더에 저장됨
  - SSE 스트림으로 진행 상황 전송:
    ```typescript
    type ProcessEvent =
      | { type: 'start'; videoId: string; title: string }
      | { type: 'progress'; videoId: string; step: 'transcript' | 'summarize' | 'upload'; percent: number }
      | { type: 'complete'; videoId: string; filename: string; path: string }
      | { type: 'error'; videoId: string; step?: 'meta' | 'transcript' | 'summarize' | 'upload'; message: string }
      | { type: 'done'; totalSuccess: number; totalFailed: number };
    ```
    스펙 대비 두 가지 확장: `complete`에 Dropbox `path` 추가(완료 카드에서 저장 위치 표시용), `error`에 optional `step` 추가(어느 단계에서 죽었는지 프론트 라벨 표시용 — 단일 처리 `/api/process`가 이미 같은 라벨을 쓰므로 한국어 표가 그대로 재사용됨).
  - 영상별 순차 처리 (병렬 처리는 rate limit 위험)
  - Gemini API 분당 요청 한도(15회) 고려하여 간격 조정 — 영상 사이 `INTER_VIDEO_DELAY_MS = 1000ms`. 보통 영상당 처리 시간이 10~30s라 자연스럽게 한도 안에 들지만, 짧은 영상이 연속으로 빠르게 끝나는 케이스의 안전 마진. `lib/ai/gemini.ts`의 429 지수 백오프(Phase 1.6)가 한 번 더 보호.
  - 클라이언트 연결이 끊기면(`request.signal.abort`) 다음 영상 진입을 막고 루프 탈출. 진행 중인 영상은 끝까지 가지만 이후 `controller.enqueue` 호출이 cancelled 플래그로 무시됨 (try/catch로 닫힌 스트림도 안전).
  - 입력 검증: 11자 videoId 정규식, `MAX_VIDEOS_PER_BATCH`(env, 기본 10) 초과 시 400, 중복 videoId는 조용히 dedup.

#### 3.3 프론트엔드 — 진행 상황 표시

- [x] `app/process/page.tsx` 또는 모달로 진행 상황 화면 구성 — **모달 채택** (`components/BatchProgressModal.tsx`). 별도 라우트는 batch 영상/카테고리 정보를 라우트 간에 전달해야 하는데 새로고침 의미 없는 휘발 상태라 모달이 더 자연스러움. `app/page.tsx`가 `activeBatch` 상태로 보관하고 `key={'batch-' + videoIds.join(',')}`로 새 batch마다 깨끗하게 remount (CategorySelectModal과 동일한 React 19 set-state-in-effect 회피 패턴).
- [x] EventSource API로 SSE 수신 — **EventSource 대신 fetch + ReadableStream reader로 수동 파싱**. 이유: EventSource는 GET만 지원하는데 우리 백엔드는 videoIds 배열을 POST body로 받음. `data: <json>\n\n` 블록 단위로 잘라 파싱하며 chunk 경계가 블록 중간에 떨어지는 케이스도 보정(buffer의 마지막 `\n\n` 위치까지만 flush, 나머지는 다음 chunk와 합쳐 재시도). SSE 멀티라인 data 라인도 표준대로 줄 단위로 모은 뒤 합친다.
- [x] 각 영상별 상태 표시:
  - `VideoStatus` discriminated union: `idle | running{step, percent} | success{filename, path} | error{step?, message} | canceled`. 각 카드는 16:9 썸네일(80px, `next/image unoptimized`) + 2줄 clamp 제목 + 상태 라인 구성.
  - 진행률 표시 (Shadcn `Progress`) — running 상태 카드 안에 per-video progress, 헤더에 overall progress 두 단으로 분리.
  - 완료 ✅(emerald `CheckCircle2`), 실패 ❌(red `XCircle`), 취소 ⊖(muted `MinusCircle`), 실행 중 🌀(`Loader2 animate-spin`). 실패 라인은 `[단계라벨] 메시지` 형태로 어느 단계 실패인지 즉시 식별.
- [x] 전체 진행률 — 헤더에 `N / M 완료` + 백분율 + Progress 바 (완료/실패/취소된 항목을 모두 진행 카운트에 포함).
- [x] 완료 후 결과 요약 — `done` 이벤트 수신 시 푸터에 `성공 N건 · 실패 M건` 표시 + `[닫기]` 버튼. 처리 중에는 `[취소]` 버튼만 노출되고 외부 클릭/ESC로 닫기는 차단(`onOpenChange` 가드 + `showCloseButton={!isRunning}`). 취소 시 `AbortController.abort()`로 백엔드 `request.signal` 발동, 남은 idle/running 영상은 `canceled`로 일괄 표시 후 다음 영상 진입 차단.

#### 3.4 에러 처리 및 폴백

- [x] 자막 없는 영상 처리:
  - MVP: 건너뛰고 사용자에게 알림 — `lib/youtube/transcript.ts`가 자막 비활성화/없음/접근 불가/rate limit을 모두 한국어 에러로 변환. 단일은 `/api/process` 500 응답 + toast.error, 일괄은 `error` SSE 이벤트(`step: 'transcript'`) 후 다음 영상 계속 처리
  - 향후 옵션: Whisper API로 폴백 (비용 발생, 별도 토글) — Phase 4 이후로 보류
- [x] Gemini API 실패 시 재시도 (최대 2회, 지수 백오프) — Phase 1.6에서 미리 구현. `lib/ai/gemini.ts`의 `MAX_ATTEMPTS=3`(첫 시도 + 최대 2회 재시도), `RETRY_BASE_DELAY_MS=1000` × `2**(attempt-1)`, 대상 상태 `[429, 500, 502, 503, 504]`. 2026-05-18 보강: 429 응답의 `error.details[].retryDelay`(예: `"23.728s"`)를 파싱해서 그대로 따른다 (`extractRetryDelayMs` + `MAX_RETRY_DELAY_MS=30s` 캡). `gemini-flash-latest` alias가 가리키는 모델의 free tier RPM이 바뀌어도 자동 적응. 429 에러 메시지에는 Gemini 원본을 노출해서 어느 metric에 걸렸는지(RPM/RPD/TPM/free_tier_requests) 즉시 확인 가능.
- [x] Dropbox 업로드 실패 시 마크다운을 로컬 다운로드로 폴백 — 단일은 Phase 2.5에서 `app/api/process/route.ts`가 `markdown`/`filename` 동봉 + `app/page.tsx`의 toast.error `action`으로 다운로드. 일괄은 Phase 3.3에서 `app/api/process-batch/route.ts`의 `error` 이벤트에 같은 필드 동봉 + `BatchProgressModal`이 인라인 `[마크다운 다운로드]` 버튼 렌더

#### 3.5 Phase 3 완료 기준

- [x] 5개 이상 영상 동시 선택 → 일괄 처리 → 진행 상황 실시간 표시 → 모두 Dropbox에 저장 확인 — 2026-05-18 사용자 테스트에서 선택한 영상 개수만큼 노트가 Dropbox에 정확히 생성됨을 확인. 초기 테스트에서 발견된 Strict Mode 더블 인보크로 인한 video #1 중복 업로드(`(1)` autorename 사본)는 클라이언트 `startedRef` 가드 + 서버 upload 직전 `signal.aborted` 검사로 수정 후 재확인.
- [x] 일부 영상이 자막 없거나 실패해도 나머지는 정상 처리되는지 확인 — 2026-05-18 일괄 처리 테스트 중 한 영상에서 Gemini 429(요약 단계)가 발생했을 때 같은 batch의 다른 영상은 그대로 정상 처리됨을 자연스러운 시나리오로 확인. 이후 `GEMINI_MODEL`을 stable 버전(`gemini-2.5-flash` 등)으로 pin하고 재테스트한 결과(2026-05-19)도 동일하게 부분 실패가 batch 전체를 멈추지 않음. 자막 비활성/없음 케이스는 백엔드 `processOne`이 한 영상 실패를 `error` 이벤트(`step: 'transcript'`)로 emit하고 루프를 계속 도는 같은 구조라 동일한 동작이 보장된다.

---

### 🟣 Phase 4 — 디테일 개선 및 사용성 향상

**목표**: 도구가 더 안정적이고 사용하기 좋아지도록 마감 작업.

**예상 소요 시간**: 1~2일 (선택 사항)

#### 4.1 검색어 개선 (선택) — 🟤 보류 (2026-05-19)

> 사용자 판단으로 보류. 현재 흐름(사용자가 직접 검색어를 입력 → YouTube API에 그대로 전달)이 단순하고 충분히 만족스러워서 Gemini 변환 단계를 추가할 필요성이 낮다고 결정. 추후 검색 품질이 문제가 되면 재검토.

- [ ] Gemini로 사용자 자연어 쿼리를 효과적인 검색 키워드로 변환하는 옵션 추가
- [ ] 토글 스위치로 켜고 끌 수 있게

#### 4.2 자막 언어 표시 강화 — 🟤 보류 (2026-05-19)

> 사용자 판단으로 보류. 두 가지 이유: (1) YouTube Data API의 `captions.list`는 **OAuth 2.0 인증을 요구**해서 현재의 API 키 기반 아키텍처와 맞지 않음. (2) `lib/ai/prompts.ts`가 어떤 자막 언어로 들어와도 노트 출력은 한국어로 강제하므로 사용자가 자막 언어를 미리 고를 실익이 작다. 현재 `lib/youtube/transcript.ts`의 ko→en→기본 자막 폴백으로 사실상 충분. 원본 자막 fidelity 차이가 문제가 되면 재검토.

- [ ] 영상 선택 시 사용 가능한 자막 언어 목록 표시 (`captions.list` API 호출)
- [ ] 사용자가 요약에 사용할 자막 언어 선택 가능

#### 4.3 노트 템플릿 커스터마이징

- [x] `app/settings/page.tsx` 추가 — 메인 페이지 헤더의 "설정" 버튼으로 진입. 활성 양식 textarea + 저장/기본 양식 리셋 버튼 + 참고용 예시 양식 2종(실무 적용 강조, 친근한 어조)을 인라인으로 보여주는 페이지.
- [x] 사용자가 노트 형식 프롬프트를 편집할 수 있는 UI (텍스트 영역) — monospace textarea로 마크다운 양식 본문을 직접 편집. 플레이스홀더 `{{title}}`(영상 제목), `{{categoryTag}}`(슬러그) 지원. 저장 안 된 변경이 있으면 "변경됨 (저장 안 됨)" 인디케이터 노출.
- [x] 로컬 스토리지 또는 Dropbox에 설정 저장 — **Dropbox 채택**. `${DROPBOX_VAULT_PATH}/.config/note-template.md`에 활성 양식 1개 + `.config/note-template-examples/{practical,friendly}.md`에 참고 예시 2종 시드. 모바일 옵시디언에서도 양식을 직접 읽고 편집 가능. 처리 시점(`/api/process`, `/api/process-batch`)에 `lib/dropbox/template.ts::getNoteTemplate()`이 활성 양식을 1회 로드해 `summarizeTranscript`에 전달. 읽기 실패 시 `config/note-template.ts::DEFAULT_TEMPLATE`로 폴백되어 처리 흐름이 막히지 않음. localStorage 대신 Dropbox를 고른 이유는 PC/모바일 양식 공유 + 옵시디언 vault에 자연스럽게 들어가는 위치라서.

#### 4.4 카테고리 관리 UI

> 2026-05-19 사용자가 브라우저에서 CRUD/순서 변경/저장/리셋/CategorySelectModal 반영을 모두 검증 완료. 추가로 4.4 작업 직후 설정 페이지를 base-ui Tabs로 분리하는 리팩토링이 이어졌고(`components/settings/<Name>Tab.tsx` 패턴), `TabsPanel`의 `keepMounted` 기본값을 `true`로 두는 작업까지 같은 날 진행됨.

- [x] 설정 페이지에서 카테고리 목록 관리:
  - 카테고리 추가 / 이름 변경 / 삭제 (Shadcn `Input` + 리스트) — `app/settings/page.tsx`에 "카테고리 관리" 섹션 추가. 각 행은 `Input` + ▲/▼/✕ 아이콘 버튼. 추가는 별도 input + "추가" 버튼. 빈 이름 / `_inbox` / 폴더 안전 문자 위반(`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)은 `validateCategoryName`이 거부.
  - 카테고리 순서 변경 (드래그 앤 드롭, 또는 위/아래 버튼) — **위/아래 버튼 채택**. 드래그앤드롭은 모바일 UX/번들 크기 부담이 카테고리 개수(보통 5~15개) 대비 과해서 보류.
  - 로컬 스토리지에 사용자 정의 카테고리 저장 — `ytobs:categories` 키, `string[]` JSON. `lib/utils/categories-storage.ts`의 `getStoredCategories`/`saveStoredCategories`/`resetStoredCategories`. SSR 안전(`typeof window` 가드). `CategorySelectModal`이 mount 시 `useMemo`로 1회 로드해 모달이 열려있는 동안 일관된 목록 노출 — 설정 페이지에서 변경 시 모달이 다시 열릴 때(부모 key 재변경) 반영. 노트 양식과 달리 Dropbox 동기화 안 함: 카테고리는 PC 처리 시점에만 쓰이고 모바일 옵시디언에선 결과 노트만 읽으므로 cross-device 가치가 작다.
- [ ] 카테고리 통계 표시 (선택) — 미구현. 카테고리당 Dropbox `files/list_folder` 호출이 필요해 추가 복잡도가 있고, 현재 흐름에 critical하지 않아 후속으로 분리.
  - 각 카테고리별 정리한 노트 개수
  - 마지막 정리 날짜

#### 4.5 인덱스 노트 자동 생성 — 🟤 보류 (2026-05-19)

> 사용자 판단으로 보류. 폴더 단위 회고 습관이 없으면 `_index.md`의 가치가 작고, 기존 `_index.md`의 "학습 메모" 섹션을 부수지 않고 영상 목록만 갱신하려면 파싱·재생성 로직(중복 링크 제거, 검색 조건 conflict 처리)이 단순하지 않다. 폴더별 표지 노트와 학습 메모가 실제로 필요해지면 재검토.

- [ ] 각 검색어 폴더의 루트에 `_index.md` 자동 생성/업데이트:
  ```markdown
  # 파이썬 데이터 분석 기초

  > 2026-05-14에 검색해서 정리한 영상들

  ## 검색 조건
  - **검색어**: 파이썬 데이터 분석 기초
  - **카테고리**: 프로그래밍
  - **필터**: 업로드 1년 이내, 20분 초과, 동영상

  ## 정리된 영상 목록
  - [[2026-05-14_노마드코더_파이썬-입문]]
  - [[2026-05-14_생활코딩_데이터분석]]
  - [[2026-05-14_조코딩_pandas-기초]]

  ## 학습 메모
  (사용자가 직접 작성하는 영역)
  ```
- [ ] 같은 검색어/카테고리로 추가 영상을 정리하면 인덱스 노트에 자동 추가
- [ ] 인덱스 노트의 "학습 메모" 영역은 사용자가 직접 작성한 내용 보존 (덮어쓰지 않음)

#### 4.6 처리 이력 관리

> 2026-05-19 사용자가 브라우저에서 단일/일괄 처리 후 즉시 배지 노출, 카테고리 모달의 중복 경고(단일 날짜 박스 + 일괄 개수 박스), 처리 이력 탭의 목록 표시와 "이력 모두 비우기" 2단계 확인까지 모두 검증 완료.

- [x] 최근 처리한 영상 목록 (로컬 스토리지) — `lib/utils/processed-videos-storage.ts`가 `ytobs:processedVideos` 키에 `{videoId, title, processedAt, category, searchQuery, path}` JSON 배열을 보관. 같은 videoId는 dedup되어 한 줄로 합쳐지고 최대 500건까지 LRU. 단일 처리(`app/page.tsx::processVideo` 성공 콜백)와 일괄 처리(`BatchProgressModal::onVideoComplete` 콜백 → 부모) 양쪽에서 동일하게 기록.
- [x] 중복 처리 방지 ("이 영상은 이미 정리되었습니다" 알림) — **soft warning**: 검색 결과 카드에 `<Badge variant='warning'>이미 정리됨</Badge>` 표시 + 카테고리 선택 모달에 amber 박스(단일은 마지막 처리 날짜, 일괄은 "선택한 영상 중 N개는 이미 정리"). 사용자가 의도적으로 재처리할 수 있도록 흐름 자체는 차단하지 않음(Dropbox는 `autorename: true`로 `(1)` 사본 생성).
- [x] (보너스) 처리 이력 조회/삭제 UI — 설정 페이지 "처리 이력" 탭(`components/settings/ProcessedHistoryTab.tsx`) 신설. 최근 정리한 영상 목록 표시 + "이력 모두 비우기" 2단계 확인 버튼. 탭 추가 절차(4.4의 분리 패턴)를 그대로 검증.

#### 4.7 모바일 반응형 UI

- [x] 검색 화면이 모바일에서도 잘 보이도록 (Tailwind 반응형 클래스) — `SearchForm`은 좁은 화면에서 input/버튼 row가 `flex-col → sm:flex-row`로 스택, 버튼 두 개는 모바일에서 `flex-1`로 한 줄을 균등 분할. `SearchResults`의 정렬 Select는 `w-36 sm:w-44`로 좁아지고, `VideoCard`의 제목+`정리하기` 버튼 row는 모바일에서 `flex-col → sm:flex-row`로 분리되어 버튼이 자체 row를 가짐. `BatchActionBar`는 모바일에서 버튼 라벨을 단축(`선택한 N개 정리하기` → `N개 정리하기`)하고 iOS PWA를 위해 `paddingBottom: max(0.75rem, env(safe-area-inset-bottom))`을 인라인 style로 적용. `TabsList`(설정 페이지)는 `overflow-x-auto scrollbar-none`으로 좁은 화면에서 가로 스크롤, `TabsTab`은 `shrink-0 whitespace-nowrap`으로 줄바꿈 방지.
- [x] PWA 매니페스트 추가 (홈 화면에 추가 가능하도록) — `app/manifest.ts`에서 Next.js `MetadataRoute.Manifest`로 정의 (`/manifest.webmanifest`로 자동 노출), `display: 'standalone'`, `start_url: '/'`, 라이트 톤 `theme_color/background_color`, 한국어 `lang`. 아이콘은 `public/icon.svg` 1개로 `any` + `maskable` purpose 모두 사용. `app/layout.tsx`에 `viewport.themeColor`(라이트/다크 둘 다 정의), `viewportFit: 'cover'`(노치 활용), `appleWebApp.capable: true`, `metadata.icons` 추가. 기존 boilerplate title `Create Next App` → 실제 앱 이름으로 교체, `lang` 속성도 `en` → `ko`.

#### 4.9 Phase 4.7 이후 추가 기능 (계획서 외 확장)

> 2026-05-19~05-20 사용자 요구로 추가된 기능들. 원래 계획서에 없던 항목이라 4.9로 묶어 정리한다.

##### 4.9.1 URL 직접 정리 흐름

- [x] **검색 없이 영상 URL/ID를 붙여 넣어 바로 정리** — [components/UrlInputCard.tsx](../components/UrlInputCard.tsx)는 메인 페이지 검색 폼 위에 배치되는 라벤더 톤 카드. 사용자가 영상 URL이나 11자 ID를 붙여 넣으면 클라이언트에서 [lib/youtube/parseUrl.ts](../lib/youtube/parseUrl.ts)::`extractVideoId`로 즉시 형식 검증 → `GET /api/video?videoId=...`로 메타 조회 → 성공 시 부모(`app/page.tsx`)의 `handleProcessClick`에 그대로 전달해 **검색 결과 단일 처리 흐름과 완전히 동일한 경로**(같은 `CategorySelectModal` + 같은 `processVideo`)로 진입.
- [x] **URL 파서** ([lib/youtube/parseUrl.ts](../lib/youtube/parseUrl.ts)) — `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `/live/`, `/embed/`, `/v/` + `m.`/`music.` 서브도메인 + 스킴 없는 호스트(`youtube.com/...`, `youtu.be/...`)도 처리. `new URL()` 파싱 기반 순수 함수라 서버/클라이언트 양쪽에서 import 가능. 형식이 안 맞으면 null.
- [x] **단일 영상 메타 Route Handler** ([app/api/video/route.ts](../app/api/video/route.ts)) — `GET /api/video?videoId=<11자>`. `getVideoMeta` wrapper로 잘못된 ID 400, 미존재 영상 404. 응답 본문은 `VideoSearchResult` shape 그대로 — 클라이언트가 검색 결과와 동일한 모양으로 단일 처리 흐름에 끼워 넣을 수 있도록.

##### 4.9.2 Pretendard Variable + Notion 톤 리디자인

- [x] **Pretendard Variable 폰트 적용 (영문/한글 통합)** — [app/globals.css](../app/globals.css) 최상단에서 jsdelivr CDN의 `pretendardvariable-dynamic-subset.min.css`를 `@import url(...)`로 로드. **반드시 `@import 'tailwindcss'`보다 위**에 둬야 함 — Tailwind v4의 `@import`가 빌드 시 ruleset으로 확장되어 CDN @import가 뒤로 밀리면 CSS 사양 위반(`next build`가 경고하고 일부 브라우저가 폰트 로드를 건너뜀). 기존 Geist 의존 완전 제거. `--font-sans`/`--font-heading` 모두 Pretendard로.
- [x] **Notion warm 컬러 토큰** — 모노크롬 oklch에서 **따뜻한 hue 60~85, chroma 0.005~0.012**의 warm-neutral로 교체. light는 `oklch(0.99 0.004 85)` 캔버스 + `oklch(0.24 0.01 60)` 잉크, dark는 순수 검정 대신 `oklch(0.21 0.006 80)` 따뜻한 다크. primary는 Notion 시그니처 보라(hue 280, light `0.55 0.21`, dark `0.7 0.19`).
- [x] **모서리 12px 정렬** — `--radius`를 0.625rem → **0.75rem(12px)**로 키워 DESIGN.md의 `rounded.lg` 카드 사양과 정합. 결과적으로 카드/모달/입력창의 모서리가 한 단계 부드러워짐.
- [x] **헤딩 자동 위계** — 모든 헤딩(`h1`~`h6`)에 base layer에서 `font-heading tracking-tight`를 자동 적용해 페이지마다 같은 클래스를 반복하지 않아도 위계가 일관 유지. 메인/설정 페이지 헤더는 `text-4xl sm:text-5xl leading-[1.1] font-semibold`로 Notion 마케팅 페이지 톤의 디스플레이 위계.
- [x] **UrlInputCard 라벤더 액센트** — DESIGN.md의 `card-tint-lavender` 무드(`oklch(0.97 0.018 290)`) 표면 + primary 보라 아이콘 칩으로 검색 흐름과 보조 흐름을 시각적으로 분리.

##### 4.9.3 검색 결과 페이지네이션

- [x] **한 페이지당 20개, prev/next 토큰 기반** — [lib/youtube/search.ts](../lib/youtube/search.ts)의 `DEFAULT_MAX_RESULTS`를 25 → 20으로 조정. [SearchParams.pageToken](../lib/youtube/types.ts)을 받아 `search.list`의 `pageToken` 파라미터로 전달, 응답에 `nextPageToken`/`prevPageToken`/`totalResults`를 동봉.
- [x] **상태 관리** — [app/page.tsx](../app/page.tsx)에 `currentSearchRef`(useRef) 추가. 페이지 이동 시 직전 검색 파라미터를 그대로 재사용해 필터/정렬 유지. `handleChangePage('next'|'prev')`가 토큰만 갈아 끼워 `runSearch` 재호출. 페이지 전환 시 `selectedIds` 자동 초기화 (`MAX_VIDEOS_PER_BATCH=10` 한도와 자연스럽게 정합).
- [x] **페이지네이션 UI** — [components/SearchResults.tsx](../components/SearchResults.tsx) 하단 `PaginationFooter`에 ← 이전 / 페이지 번호 / 다음 → 버튼. 1페이지에 다음이 없으면 푸터 자동 숨김. 결과 카드 번호는 페이지 가로질러 누적(`21–40` 형태). 결과수 헤더는 "21–40 · 약 1.2만개 중" 약식 표기 — YouTube `pageInfo.totalResults`가 부정확한 추정치라 페이지 점프 UI(1, 2, 3...) 대신 prev/next로 단순화.
- 비용: `search.list` 100 units/호출 × 일일 10,000 units = **하루 100회**(검색 + 페이지 이동 합산) 가능.

##### 4.9.4 재생목록 검색 (`type=playlist`)

- [x] **Top 1 재생목록의 영상을 영상 목록처럼 펼침** — 기존에 에러를 던지던 `searchVideos`의 playlist 분기를 [searchPlaylistVideos](../lib/youtube/search.ts)로 구현. 2단계 호출:
  - 첫 검색: `search.list?type=playlist&maxResults=1`로 쿼리와 가장 잘 맞는 재생목록 1개 찾고(100u), `playlistItems.list`(1u) + `videos.list`(1u) = **~102 units**
  - 페이지 이동: 클라이언트가 [SearchParams.playlistId](../lib/youtube/types.ts)에 직전 응답의 playlistId를 그대로 보내면 `search.list`를 건너뛰고 `playlists.list`(1u) + `playlistItems.list`(1u) + `videos.list`(1u) = **~3 units** (1/30 비용)
- [x] **정리하기/체크박스 비활성** — 응답의 `playlistContext`가 있으면 [components/SearchResults.tsx](../components/SearchResults.tsx)가 (1) 상단 라벤더 톤 배너("재생목록 · 제목" + 사용법 안내) 표시, (2) `VideoCard`의 체크박스 + 정리하기 버튼을 `disabled`로 렌더, (3) "전체 선택" 버튼 헤더에서 숨김. 썸네일/제목 링크는 그대로 작동.
- 사용자 흐름: "재생목록 영상 목록에서 마음에 드는 영상 링크로 YouTube 이동 → URL 복사 → 위쪽 URL 입력 카드(§4.9.1)에 붙여 넣어 정리". 재생목록 영상이 수백 개일 수 있어 일괄 처리는 위험하다고 보고 명시적으로 닫아둠.
- 재생목록 자체 페이지네이션(여러 매칭 재생목록 사이 이동)은 하지 않음 — 다른 재생목록을 보고 싶으면 키워드를 바꿔 다시 검색.

#### 4.8 배포

- [ ] Vercel에 배포
- [ ] 환경 변수 Vercel 대시보드에 등록
- [ ] 도메인 설정 (선택)

---

## 7. 디렉토리 구조

```
youtube-to-obsidian/
├── app/
│   ├── page.tsx                    # 검색 + URL 직접 정리 (메인)
│   ├── settings/
│   │   └── page.tsx                # 설정 페이지 셸 (base-ui Tabs로 탭 분리)
│   ├── dev/
│   │   ├── layout.tsx              # NODE_ENV !== 'development' 시 notFound() (Phase 2.6)
│   │   └── page.tsx                # 개발용 raw JSON 디버깅 (dev 전용 게이팅)
│   ├── api/
│   │   ├── search/route.ts         # YouTube 검색 API (+페이지네이션, +재생목록)
│   │   ├── process/route.ts        # 단일 영상 처리 API
│   │   ├── process-batch/route.ts  # 복수 영상 처리 API (SSE)
│   │   ├── video/route.ts          # 단일 영상 메타 GET (§4.9.1 URL 직접 정리용)
│   │   └── settings/template/route.ts # 노트 양식 GET/PUT (Phase 4.3)
│   ├── manifest.ts                 # PWA 매니페스트 (Phase 4.7)
│   ├── layout.tsx                  # Pretendard 적용 (§4.9.2)
│   └── globals.css                 # Pretendard @import + Notion warm 토큰 (§4.9.2)
├── components/
│   ├── ui/                         # Shadcn UI 컴포넌트 (base-ui 기반, `tabs.tsx` 포함)
│   ├── settings/                   # 설정 페이지의 탭별 컴포넌트 (Phase 4.4 분리 패턴)
│   │   ├── CategoriesTab.tsx
│   │   ├── NoteTemplateTab.tsx
│   │   └── ProcessedHistoryTab.tsx
│   ├── SearchForm.tsx
│   ├── SearchResults.tsx           # +페이지네이션 footer +재생목록 배너/disabled (§4.9.3, §4.9.4)
│   ├── UrlInputCard.tsx            # URL 직접 정리 카드 (§4.9.1)
│   ├── CategorySelectModal.tsx
│   ├── BatchActionBar.tsx          # 하단 고정 일괄 처리 액션바 (Phase 3.1)
│   ├── BatchProgressModal.tsx      # SSE 진행 상황 모달 (Phase 3.3)
│   └── FilterPanel.tsx
├── config/
│   ├── categories.ts               # 기본 카테고리 목록 (Phase 4.4부터 사용자 정의는 localStorage)
│   └── note-template.ts            # DEFAULT_TEMPLATE + EXAMPLE_TEMPLATES (Phase 4.3)
├── lib/
│   ├── youtube/
│   │   ├── search.ts               # 검색 + 페이지네이션 + 재생목록 분기 (§4.9.3, §4.9.4)
│   │   ├── transcript.ts           # 자막 추출
│   │   ├── parseUrl.ts             # URL/ID → videoId 추출 (§4.9.1)
│   │   └── types.ts                # `SearchParams`/`SearchPage`/YouTube 응답 타입
│   ├── ai/
│   │   ├── gemini.ts               # Gemini REST 호출 + 양식 인자 받음
│   │   └── prompts.ts              # 프롬프트 + 양식 플레이스홀더 치환
│   ├── dropbox/
│   │   ├── auth.ts                 # refresh_token 기반 access_token 자동 갱신
│   │   ├── upload.ts               # 카테고리/검색어 기반 폴더에 업로드
│   │   └── template.ts             # 노트 양식 read/write/seed (Phase 4.3)
│   └── utils/
│       ├── language.ts             # 언어 감지
│       ├── slugify.ts              # 폴더/파일명 슬러그화
│       ├── filename.ts             # 노트 파일명 생성
│       ├── duration.ts             # ISO 8601 duration 파싱
│       ├── categories-storage.ts   # ytobs:categories + lastCategory localStorage (Phase 4.4)
│       └── processed-videos-storage.ts # 정리 이력 localStorage (Phase 4.6)
├── public/
│   └── icon.svg                    # PWA 아이콘 (Phase 4.7)
├── scripts/
│   └── dropbox-exchange-code.mjs   # OAuth code → refresh_token 1회성 교환
├── docs/
│   ├── IMPLEMENTATION_PLAN.md      # 이 문서
│   ├── DESIGN_GUIDE.md             # Notion 스타일 디자인 가이드
│   ├── NOTE_FORMAT.md              # 노트 마크다운 포맷 원형
│   └── FAQ.md                      # 함정/예외 케이스 메모
├── .env.local                      # 환경 변수 (Git 제외)
├── CLAUDE.md                       # Claude Code 컨텍스트 (주요 결정 사항 누적)
├── package.json
├── tsconfig.json
└── next.config.ts
```

> Phase 1.6 시점의 `app/process/page.tsx`, `components/ProcessProgress.tsx`, `components/VideoCard.tsx`(별도 파일), `types/index.ts`, `lib/dropbox/index-note.ts`는 실제 구현에서는 만들지 않거나 다른 파일에 흡수됨 (예: VideoCard는 `SearchResults.tsx` 내부 함수, 진행 표시는 sonner toast + `BatchProgressModal`로 대체, index-note는 §4.5 보류).

---

## 8. 환경 변수

`.env.local` 파일 구성:

```bash
# YouTube Data API v3 (Google Cloud Console에서 발급)
YOUTUBE_API_KEY=AIzaSy...

# Gemini API (Google AI Studio 또는 Google Cloud Console에서 발급)
# 계획서 초안에는 두 API를 하나의 GOOGLE_API_KEY로 묶을 수 있다고 적었지만,
# 실제로는 별도 키가 필요해서 두 환경 변수로 분리됨.
GEMINI_API_KEY=AIzaSy...

# Dropbox (refresh_token 기반 자동 갱신)
# 2021-09 이후 Dropbox 신규 앱의 access_token은 단기(~4시간)만 발급되어
# 콘솔에서 받은 토큰을 정적으로 박아두면 4시간마다 만료됨.
# 대신 `scripts/dropbox-exchange-code.mjs`로 1회성 OAuth 교환 후 refresh_token 발급 →
# `lib/dropbox/auth.ts`가 호출 직전마다 새 access_token을 받아 메모리 캐시.
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_REFRESH_TOKEN=...

# vault 루트 경로 (이 아래에 카테고리/검색어 폴더가 자동 생성됨)
DROPBOX_VAULT_PATH=/Apps/youtube-obsidian-sync/YouTube   # App folder 사용 시
# 또는
# DROPBOX_VAULT_PATH=/Obsidian/Vault/YouTube              # Full Dropbox 사용 시

# Gemini 모델 (기본값: gemini-flash-latest)
GEMINI_MODEL=gemini-flash-latest

# 처리 제한
MAX_VIDEOS_PER_BATCH=10
MAX_RESULTS_PER_SEARCH=20      # §4.9.3 페이지네이션: 한 페이지당 20개
```

`.env.example`을 별도로 만들어 Git에 포함 (실제 값은 비워둠).

---

## 9. API 사용량 및 비용

### 9.1 일일 사용량 추정 (개인 학습용, 하루 5편 정리 + 페이지네이션 5회 정도 가정)

| API | 호출 패턴 | 일일 사용량 | 한도 | 여유율 |
|---|---|---|---|---|
| YouTube Data API | 검색 5회 + 페이지 이동 5회 + 단일 메타 5회 | ~1,015 units | 10,000 units | 90% 여유 |
| Gemini API | 영상당 1회 호출 + 재시도 마진 | 5~10 요청 | 1,500 요청/일 | 99% 여유 |
| Dropbox API | 영상당 1회 업로드 + 양식 로드 1회 | ~6 요청 | 사실상 무제한 | - |

**결론**: 본인 사용량 수준에서는 **완전 무료** 운영 가능.

#### YouTube Data API 호출별 비용

| 엔드포인트 | 단가 | 호출 시점 |
|---|---|---|
| `search.list` | 100 units | 영상/재생목록 검색의 첫 페이지 |
| `playlistItems.list` | 1 unit | 재생목록 페이지 이동 (§4.9.4) |
| `playlists.list` | 1 unit | 재생목록 제목 재조회 (§4.9.4) |
| `videos.list` | 1 unit | 영상 메타 일괄 조회 (단일 메타 포함) |

- **영상 검색 페이지네이션** (§4.9.3): 한 페이지 = `search.list` 1회 + `videos.list` 1회 = **~101 units**. 일일 10,000 units 안에서 100회 검색/이동 가능.
- **재생목록 모드** (§4.9.4): 첫 검색은 `search.list?type=playlist` + `playlistItems.list` + `videos.list` = **~102 units**. 페이지 이동은 `playlists.list` + `playlistItems.list` + `videos.list` = **~3 units**. (search.list 100u를 한 번만 부담하고 이후 30배 저렴)
- **URL 직접 정리** (§4.9.1): `videos.list` 1회 = **1 unit**. 검색을 건너뛰는 가장 가벼운 경로.

### 9.2 비용 발생 시점

- **Gemini 무료 한도 초과 시**: 입력 $1/100만 토큰, 출력 $3/100만 토큰 (Gemini 2.0 Flash 기준, 변동 가능). `lib/ai/gemini.ts`는 429 응답의 `retryDelay`를 존중하므로 한도 회복까지 자동 대기.
- **YouTube API 쿼터 초과 시**: 추가 쿼터 요청 가능 (대부분 무료, 상업적 용도면 유료)
- **Whisper API 사용 시 (선택)**: 분당 $0.006 — 본 프로젝트는 미도입

### 9.3 비용 모니터링

- Google Cloud Console에서 사용량 알림 설정 (예: 80% 도달 시 이메일)
- Vercel 대시보드에서 함수 실행 횟수 모니터링

---

## 10. 모바일 동기화 설정

### 10.1 안드로이드 폰 셋업 (1회성, 30분~1시간 소요)

#### 사전 조건
- 데스크톱 Dropbox 앱이 vault 폴더를 동기화하고 있음
- 안드로이드 폰에 Dropbox 앱 이미 설치되어 있음

#### 절차

1. **FolderSync Lite** 설치 (Google Play Store, 무료)
2. FolderSync 첫 실행 시 계정 추가:
   - "Accounts" → "Add account" → "Dropbox" 선택
   - OAuth 인증 진행
3. 동기화 페어(폴더쌍) 생성:
   - "Folderpairs" → "Create folderpair"
   - **Sync type**: 양방향 (Two-way) — 폰에서 메모 추가 시
   - **Sync type**: 원격→로컬 단방향 (To local folder only) — 읽기 전용일 때 (추천)
   - **Remote folder**: Dropbox의 vault 경로 (예: `/Apps/youtube-obsidian-sync/`)
   - **Local folder**: 폰 내부저장소의 새 폴더 (예: `/storage/emulated/0/Documents/ObsidianVault/`)
4. 동기화 옵션:
   - **Sync interval**: 15분 또는 파일 변경 감지 시
   - **Sync on Wi-Fi only**: 데이터 절약하려면 켜기
5. 첫 동기화 실행 (시간이 좀 걸림)
6. 옵시디언 모바일 앱 실행:
   - "Open folder as vault" 선택
   - 위에서 만든 로컬 폴더 지정
7. 동기화 확인:
   - 데스크톱에서 vault에 파일 추가
   - 폰의 FolderSync 강제 동기화 → 옵시디언 모바일에서 노트 확인

### 10.2 동기화 충돌 방지 팁

- 데스크톱과 모바일에서 **동시에 같은 노트 편집 금지**
- 본 도구가 생성한 노트는 모바일에서는 **읽기 위주**로 사용
- 메모 추가는 가능한 데스크톱에서

---

## 11. 위험 요소 및 대응 방안

### 11.1 기술적 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| `youtube-transcript` 라이브러리가 유튜브 정책 변경으로 동작 안 함 | 자막 추출 불가 | 대체 라이브러리(`youtubei.js` 등) 또는 Whisper API 폴백 |
| Gemini API 한도 변경 | 비용 발생 또는 사용 중단 | OpenRouter 무료 모델로 전환 가능한 인터페이스 설계 |
| YouTube Data API 쿼터 부족 | 검색 일시 중단 | 결과 캐싱, 사용자에게 명확한 안내 |
| Dropbox 토큰 만료 | 업로드 실패 | 토큰 만료 시 재발급 안내, 또는 OAuth refresh token 사용 |

### 11.2 사용성 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| 요약 품질이 기대 이하 | 학습 효과 저하 | 프롬프트 개선, 모델 업그레이드 옵션 (Gemini Pro 또는 Claude API) |
| 처리 시간이 너무 김 | 사용자 답답함 | 진행 상황 명확히 표시, 백그라운드 처리 고려 |
| 모바일 동기화 지연 | 출퇴근 시 노트 없음 | 출발 전 옵시디언 앱 한 번 열어 동기화 트리거 |

### 11.3 비용 위험

- **API 키 유출**: 환경 변수만 사용, GitHub 푸시 전 확인, Google Cloud에서 API 키 제한 설정
- **무한 루프로 인한 과다 호출**: 단일 영상 처리 최대 시간 제한 (timeout), rate limiter

### 11.4 추후 확장 시 고려

- 본인만 사용하므로 인증 시스템 불필요. 만약 다른 사람과 공유할 경우 인증 추가 필요
- Vercel 함수 실행 시간 제한 (Hobby 플랜: 10초, Pro: 60초). 자막이 매우 길면 timeout 가능성 → 청크 처리 또는 백그라운드 작업 큐 고려

---

## 12. 향후 확장 아이디어

Phase 4 이후 여유 있을 때 시도해볼 만한 것들:

### 12.1 콘텐츠 강화

- 영상 썸네일을 노트에 임베드
- 영상 캡처 이미지 추가 (특정 타임스탬프의 프레임 추출)
- 관련 영상 추천 (검색 결과 기반)

### 12.2 학습 도구

- 자동 퀴즈 생성 (Gemini로 영상 내용 기반 객관식 문제 생성)
- 플래시카드 형식 노트 옵션
- 학습 진도 추적 (어떤 영상을 봤는지)

### 12.3 통합

- Notion 동기화 옵션
- Anki 카드 자동 생성
- 캘린더 연동 (학습 일정 자동 추가)

### 12.4 멀티 LLM 지원

- 코드에서 LLM 추상화 레이어 도입
- 사용자가 Gemini / Claude / OpenAI / OpenRouter 무료 모델 중 선택 가능
- 비교 모드 (같은 영상을 다른 모델로 정리해서 비교)

### 12.5 자동화

- 특정 채널의 새 영상 자동 감지 및 정리
- 재생목록 통째로 처리
- 영상별로 다른 카테고리 지정 가능하게 (현재는 일괄 처리 시 모두 같은 카테고리)

---

## 📌 시작 체크리스트

내일 작업 시작 시 순서:

1. [ ] Google Cloud 프로젝트 생성, YouTube Data API + Gemini API 활성화, API 키 발급
2. [ ] Dropbox 개발자 앱 생성, Access Token 발급
3. [ ] VS Code에 Claude Code 공식 확장 설치 및 인증
4. [ ] `pnpm create next-app@latest` 로 프로젝트 생성
5. [ ] Shadcn UI 초기화
6. [ ] `.env.local` 작성, `.env.example` 작성, `.gitignore` 확인
7. [ ] `CLAUDE.md` 작성 (이 문서 요약본 + 기술 스택 + 현재 Phase 명시)
8. [ ] Git 초기 커밋, GitHub private repo 생성
9. [ ] **Phase 1.2 YouTube 검색 모듈부터** 구현 시작

---

## 🚦 진행 상황 추적

각 Phase 완료 시 이 섹션에 날짜와 메모를 기록:

- [x] Phase 1 완료 — 날짜: 2026-05-13
- [x] Phase 2 완료 — 날짜: 2026-05-14
- [x] Phase 3 완료 — 날짜: 2026-05-19
- [ ] Phase 4 완료 — 날짜:

---

*이 문서는 프로젝트 진행 중 자유롭게 수정·보완해도 좋습니다. Claude Code에게 작업을 요청할 때 "구현 계획 문서 6.X 항목을 진행해줘"와 같이 참조하면 효율적입니다.*
