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

- [ ] `pnpm create next-app@latest` 로 Next.js 15 + TypeScript + Tailwind + App Router 프로젝트 생성
- [ ] Shadcn UI 초기화: `pnpm dlx shadcn@latest init`
- [ ] 기본 컴포넌트 설치: `pnpm dlx shadcn@latest add button input card toast progress checkbox select`
- [ ] ESLint + Prettier 설정 (TypeScript strict mode 활성화)
- [ ] `.env.local` 파일 생성 및 `.gitignore`에 추가 확인
- [ ] Git 초기 커밋, GitHub private repo 연결
- [ ] `CLAUDE.md` 파일 작성 (프로젝트 컨텍스트 — Claude Code 참고용)
- [ ] 디렉토리 구조 잡기 (섹션 7 참조)

#### 1.2 YouTube Data API 검색 모듈

- [ ] `googleapis` 또는 `@googleapis/youtube` 패키지 설치
- [ ] `lib/youtube/search.ts` 작성:
  - `searchVideos(params: SearchParams): Promise<VideoSearchResult[]>`
  - 입력: 키워드, 업로드 날짜 범위, 영상 길이, 타입(video/playlist), 최대 결과 수
  - 출력: 표준화된 영상 정보 배열

- [ ] `SearchParams` 타입 정의:
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

- [ ] `VideoSearchResult` 타입 정의:
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

- [ ] 검색 흐름 구현:
  1. `search.list` API로 영상 ID 목록 가져오기 (100 units)
  2. `videos.list` API로 각 영상의 상세 정보 (duration, viewCount, caption 등) 일괄 조회 (1 unit per call, 최대 50개 ID 동시 조회 가능)
  3. 결과 결합 후 반환

- [ ] 언어 감지 로직 (`lib/utils/language.ts`):
  - 영상 메타데이터의 `defaultLanguage`, `defaultAudioLanguage` 우선 사용
  - 없으면 제목과 설명으로 추정 (간단한 정규식 또는 `franc` 라이브러리)
  - 그래도 모르면 'unknown' 반환

- [ ] `app/api/search/route.ts` Route Handler 작성 + Postman / Thunder Client로 호출 테스트

#### 1.3 자막 추출 모듈

- [ ] `youtube-transcript` npm 패키지 설치
- [ ] `lib/youtube/transcript.ts` 작성:
  - `extractTranscript(videoId: string): Promise<TranscriptSegment[]>`
  - 타임스탬프 + 텍스트 구조로 반환
  - 자막 없을 시 명확한 에러 throw
- [ ] 한국어/영어 자막 우선순위 로직 (한국어 있으면 한국어, 없으면 영어, 둘 다 없으면 첫 번째 사용 가능한 자막)
- [ ] 테스트 영상 2~3개로 정상 동작 확인 (한국어 강좌, 영어 강좌, 자막 없는 영상)

#### 1.4 Gemini API 요약 모듈

- [ ] `@google/generative-ai` SDK 설치
- [ ] `lib/ai/gemini.ts` 작성:
  - `summarizeTranscript(transcript: TranscriptSegment[], videoMeta: VideoMeta): Promise<string>`
  - 마크다운 형식의 노트 반환
- [ ] 프롬프트 설계 (`lib/ai/prompts.ts`):
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
- [ ] 모델: `gemini-2.0-flash-exp` 또는 안정 버전 사용
- [ ] 토큰 제한 처리 (긴 자막 분할 처리)

#### 1.5 Dropbox 업로드 모듈 (카테고리 기반 폴더 구조)

- [ ] `dropbox` SDK 설치
- [ ] `config/categories.ts` 작성 (기본 카테고리 목록 정의)

- [ ] `lib/utils/slugify.ts` 작성:
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

- [ ] `lib/dropbox/upload.ts` 작성:
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

- [ ] 파일명 규칙: `YYYY-MM-DD_채널명-슬러그_영상제목-축약.md` (특수문자 제거, 길이 제한)
- [ ] **폴더 자동 생성 활용**: Dropbox API의 `filesUpload`는 상위 폴더가 없으면 자동 생성하므로 별도 `createFolder` 호출 불필요
- [ ] vault 루트 경로 환경 변수로 관리 (예: `DROPBOX_VAULT_PATH=/Obsidian/Vault/YouTube`)
- [ ] 단위 테스트: 임의의 카테고리/검색어 조합으로 호출 시 올바른 경로에 파일 생성되는지 확인

#### 1.6 개발용 임시 검증 페이지

> ⚠️ 이 페이지는 본인 환경에서 백엔드 모듈들이 정상 동작하는지 확인하기 위한 개발용이다. Phase 2 본격 UI 완성 후 삭제하거나 비공개 처리한다.

- [ ] `app/dev/page.tsx` 작성:
  - 검색어 입력 → `/api/search` 호출 → 결과 JSON 그대로 표시 (디자인 신경 X)
  - videoId 직접 입력 + 카테고리 + 검색어 입력 → 자막추출 + 요약 + 업로드까지 한 번에 실행 → 성공/실패 메시지
  - 다양한 카테고리/검색어 조합으로 폴더가 올바르게 생성되는지 확인
- [ ] 데스크톱 옵시디언에서 생성된 노트 정상 표시 확인

#### 1.7 Phase 1 완료 기준

- [ ] 검색 API가 키워드 + 필터에 맞는 영상 목록을 정확히 반환
- [ ] 임의의 videoId 하나에 대해 자막 추출 → Gemini 요약 → Dropbox 저장이 일관되게 성공
- [ ] **카테고리 + 검색어 조합으로 Dropbox에 폴더 구조가 자동 생성**되는지 확인
  - 예: `/YouTube/프로그래밍/파이썬-기초/2026-05-14_채널A_제목.md` 경로로 파일 생성
- [ ] 한국어/영어 강좌 영상 각 1개씩 처리 성공
- [ ] 데스크톱 옵시디언에서 새 노트가 잘 보이는지 확인

---

### 🟡 Phase 2 — 검색 UI + 단일 영상 처리 (정식 사용자 흐름)

**목표**: 실제 사용자가 쓰는 검색 화면과 결과 목록을 완성하고, 결과에서 단일 영상을 선택해 정리하는 흐름까지 완성.

**예상 소요 시간**: 2~3일

#### 2.1 검색 페이지 UI

- [ ] `app/page.tsx`를 메인 검색 페이지로 구성:
  - 큰 검색 입력창 (Shadcn `Input`)
  - 필터 영역 (Shadcn `Select`, `RadioGroup`, `DatePicker`):
    - 업로드 날짜: 전체 / 1주 / 1개월 / 6개월 / 1년 / 사용자 지정
    - 영상 길이: 전체 / 짧음(<4분) / 중간(4-20분) / 김(>20분)
    - 타입: 동영상 / 재생목록
    - 정렬: 관련도 / 최신순 / 조회수
  - "검색" 버튼

- [ ] `components/SearchForm.tsx` + `components/FilterPanel.tsx`로 분리
- [ ] 검색 상태 관리 (검색 중 / 결과 / 에러)

#### 2.2 검색 결과 목록 UI

- [ ] `components/SearchResults.tsx` 작성:
  - 테이블 또는 카드 형태 (반응형 — 데스크톱은 테이블, 모바일은 카드)
  - 표시 항목: 번호, 썸네일, 제목(클릭 시 유튜브 새 탭으로 이동), 채널명, 업로드 날짜, 영상 길이, 언어 배지, 자막 유무 아이콘
  - 각 행에 "정리하기" 버튼 (단일 영상 처리)

- [ ] 클라이언트 사이드 정렬:
  - `useState`로 정렬 상태 관리
  - 헤더 클릭 시 정렬 기준 변경 (제목 / 업로드 날짜 / 영상 길이 / 조회수)
  - API 재호출 불필요

- [ ] 빈 결과 / 로딩 / 에러 상태 UI

#### 2.3 카테고리 선택 모달

- [ ] `components/CategorySelectModal.tsx` 작성:
  - Shadcn `Dialog` 기반
  - 표시 시점: 사용자가 "정리하기" 버튼을 클릭한 직후, 실제 처리 시작 전
  - UI 구성:
    - 카테고리 드롭다운 (Shadcn `Select`): `config/categories.ts`의 목록 + "기타" + "+ 새 카테고리 추가" 옵션
    - "새 카테고리 추가" 선택 시 텍스트 입력창 표시 (해당 세션에서만 사용)
    - 하위 폴더명 입력창: 검색어 슬러그가 기본값으로 자동 입력 (사용자가 수정 가능)
    - 저장 경로 미리보기: `/Vault/YouTube/{카테고리}/{하위폴더}/` 형태로 실시간 표시
    - 카테고리 미선택 옵션: "_inbox에 저장 (나중에 분류)" 체크박스
  - 버튼: "취소" / "확인하고 시작"

- [ ] 모달 상태 관리:
  - 선택한 카테고리, 하위 폴더명을 부모 컴포넌트로 전달
  - "확인" 클릭 시 처리 API 호출 시작

- [ ] 카테고리 기억하기 (편의 기능):
  - 마지막에 선택한 카테고리를 로컬 스토리지에 저장
  - 다음 검색 시 기본값으로 제안 (반복 작업 줄이기)

#### 2.4 단일 영상 처리 흐름

- [ ] `app/api/process/route.ts` 작성:
  - POST 요청으로 `{ videoId, category, searchQuery }` 받기
  - Phase 1에서 만든 자막 추출 → 요약 → 업로드 모듈들을 순서대로 호출
  - 업로드 시 카테고리/검색어 전달하여 올바른 폴더에 저장
  - 각 단계별 상태를 응답에 포함

- [ ] 결과 화면에서 "정리하기" 클릭 시 동작:
  - 카테고리 선택 모달 표시 (2.3)
  - 모달 확인 후 처리 중 표시 (Shadcn `toast` 또는 모달)
  - 단계별 진행 상황 표시: 자막 추출중 → 요약중 → 저장중 → 완료
  - 완료 시 성공 메시지 + Dropbox 경로 표시
  - 실패 시 명확한 에러 메시지

#### 2.5 에러 처리 강화

- [ ] 자막 없는 영상 클릭 시 사전 안내 (목록에 이미 자막 유무 표시되어 있음)
- [ ] Gemini API 에러 (한도 초과, 네트워크 오류 등) 명확히 표시
- [ ] Dropbox 업로드 실패 시 마크다운 다운로드 폴백 제공

#### 2.6 마무리

- [ ] Phase 1의 개발용 페이지(`app/dev/page.tsx`) 삭제 또는 비공개 라우트로 이동

#### 2.7 Phase 2 완료 기준

- [ ] 키워드 검색 → 필터 적용 → 결과 목록 표시 → 정렬 변경이 매끄럽게 동작
- [ ] "정리하기" 클릭 → 카테고리 선택 모달 → 확인 흐름이 매끄럽게 동작
- [ ] 결과에서 단일 영상 처리 → 30초 내 **올바른 카테고리/검색어 폴더**에 노트 저장 확인
- [ ] 마지막 선택한 카테고리가 다음 검색 시 기본값으로 제안되는지 확인
- [ ] 정상 시나리오(시나리오 4.1)가 단일 영상 1개 처리 기준으로 끝까지 동작

---

### 🟠 Phase 3 — 복수 선택 및 일괄 처리

**목표**: 검색 결과에서 여러 영상을 동시에 선택하고, 진행 상황을 실시간으로 보면서 일괄 처리할 수 있는 상태.

**예상 소요 시간**: 2~3일

#### 3.1 복수 선택 UI

- [ ] 검색 결과 각 항목에 체크박스 추가 (Shadcn `Checkbox`)
- [ ] "전체 선택" / "전체 해제" 버튼
- [ ] 선택된 영상 개수 표시 (예: "3개 선택됨")
- [ ] 하단 고정 액션바: "선택한 N개 영상 정리하기" 버튼 (선택 0개일 땐 비활성화)
- [ ] 한 번에 처리 가능한 최대 개수 제한 (예: 10개) + 초과 시 경고
- [ ] Phase 2의 "정리하기" 버튼은 유지 (단일 처리도 그대로 가능)
- [ ] **카테고리 선택 모달은 Phase 2와 동일하게 재사용** (단일/복수 처리 모두 같은 모달 사용)
  - 선택된 모든 영상이 같은 카테고리/하위폴더에 저장됨
  - 추후 영상별로 다른 카테고리를 지정하고 싶다면 Phase 4에서 확장

#### 3.2 일괄 처리 백엔드 (Server-Sent Events)

- [ ] `app/api/process-batch/route.ts` 작성:
  - POST 요청으로 `{ videoIds: string[], category: string, searchQuery: string }` 받기
  - 모든 영상이 같은 카테고리/하위폴더에 저장됨
  - SSE 스트림으로 진행 상황 전송:
    ```typescript
    type ProcessEvent =
      | { type: 'start'; videoId: string; title: string }
      | { type: 'progress'; videoId: string; step: 'transcript' | 'summarize' | 'upload'; percent: number }
      | { type: 'complete'; videoId: string; filename: string }
      | { type: 'error'; videoId: string; message: string }
      | { type: 'done'; totalSuccess: number; totalFailed: number };
    ```
  - 영상별 순차 처리 (병렬 처리는 rate limit 위험)
  - Gemini API 분당 요청 한도(15회) 고려하여 간격 조정

#### 3.3 프론트엔드 — 진행 상황 표시

- [ ] `app/process/page.tsx` 또는 모달로 진행 상황 화면 구성
- [ ] EventSource API로 SSE 수신
- [ ] 각 영상별 상태 표시:
  - 대기중 / 자막 추출중 / 요약중 / 저장중 / 완료 / 실패
  - 진행률 표시 (Shadcn `Progress`)
  - 완료된 항목은 ✅, 실패는 ❌, 에러 메시지 표시
- [ ] 전체 진행률 (예: "3/5 완료")
- [ ] 완료 후 결과 요약 (성공 N건, 실패 N건)

#### 3.4 에러 처리 및 폴백

- [ ] 자막 없는 영상 처리:
  - MVP: 건너뛰고 사용자에게 알림
  - 향후 옵션: Whisper API로 폴백 (비용 발생, 별도 토글)
- [ ] Gemini API 실패 시 재시도 (최대 2회, 지수 백오프)
- [ ] Dropbox 업로드 실패 시 마크다운을 로컬 다운로드로 폴백

#### 3.5 Phase 3 완료 기준

- [ ] 5개 이상 영상 동시 선택 → 일괄 처리 → 진행 상황 실시간 표시 → 모두 Dropbox에 저장 확인
- [ ] 일부 영상이 자막 없거나 실패해도 나머지는 정상 처리되는지 확인

---

### 🟣 Phase 4 — 디테일 개선 및 사용성 향상

**목표**: 도구가 더 안정적이고 사용하기 좋아지도록 마감 작업.

**예상 소요 시간**: 1~2일 (선택 사항)

#### 4.1 검색어 개선 (선택)

- [ ] Gemini로 사용자 자연어 쿼리를 효과적인 검색 키워드로 변환하는 옵션 추가
- [ ] 토글 스위치로 켜고 끌 수 있게

#### 4.2 자막 언어 표시 강화

- [ ] 영상 선택 시 사용 가능한 자막 언어 목록 표시 (`captions.list` API 호출)
- [ ] 사용자가 요약에 사용할 자막 언어 선택 가능

#### 4.3 노트 템플릿 커스터마이징

- [ ] `app/settings/page.tsx` 추가
- [ ] 사용자가 노트 형식 프롬프트를 편집할 수 있는 UI (텍스트 영역)
- [ ] 로컬 스토리지 또는 Dropbox에 설정 저장

#### 4.4 카테고리 관리 UI

- [ ] 설정 페이지에서 카테고리 목록 관리:
  - 카테고리 추가 / 이름 변경 / 삭제 (Shadcn `Input` + 리스트)
  - 카테고리 순서 변경 (드래그 앤 드롭, 또는 위/아래 버튼)
  - 로컬 스토리지에 사용자 정의 카테고리 저장
- [ ] 카테고리 통계 표시 (선택):
  - 각 카테고리별 정리한 노트 개수
  - 마지막 정리 날짜

#### 4.5 인덱스 노트 자동 생성

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

- [ ] 최근 처리한 영상 목록 (로컬 스토리지)
- [ ] 중복 처리 방지 ("이 영상은 이미 정리되었습니다" 알림)

#### 4.7 모바일 반응형 UI

- [ ] 검색 화면이 모바일에서도 잘 보이도록 (Tailwind 반응형 클래스)
- [ ] PWA 매니페스트 추가 (홈 화면에 추가 가능하도록)

#### 4.8 배포

- [ ] Vercel에 배포
- [ ] 환경 변수 Vercel 대시보드에 등록
- [ ] 도메인 설정 (선택)

---

## 7. 디렉토리 구조

```
youtube-obsidian-notes/
├── app/
│   ├── page.tsx                    # 검색 페이지 (메인)
│   ├── process/
│   │   └── page.tsx                # 처리 진행 상황 페이지
│   ├── settings/
│   │   └── page.tsx                # 설정 페이지 (Phase 4 — 카테고리 관리, 프롬프트 편집)
│   ├── dev/
│   │   └── page.tsx                # 개발용 임시 페이지 (Phase 1, Phase 2 후 제거)
│   ├── api/
│   │   ├── search/
│   │   │   └── route.ts            # YouTube 검색 API
│   │   ├── process/
│   │   │   └── route.ts            # 단일 영상 처리 API
│   │   └── process-batch/
│   │       └── route.ts            # 복수 영상 처리 API (SSE)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                         # Shadcn UI 컴포넌트
│   ├── SearchForm.tsx              # 검색 입력 폼
│   ├── SearchResults.tsx           # 검색 결과 목록
│   ├── VideoCard.tsx               # 영상 카드 컴포넌트
│   ├── CategorySelectModal.tsx     # 카테고리 + 하위폴더 선택 모달
│   ├── ProcessProgress.tsx         # 진행 상황 표시
│   └── FilterPanel.tsx             # 필터 UI
├── config/
│   └── categories.ts               # 기본 카테고리 목록 정의
├── lib/
│   ├── youtube/
│   │   ├── search.ts               # YouTube Data API 검색
│   │   ├── transcript.ts           # 자막 추출
│   │   └── types.ts                # YouTube 관련 타입
│   ├── ai/
│   │   ├── gemini.ts               # Gemini API 호출
│   │   └── prompts.ts              # 프롬프트 템플릿
│   ├── dropbox/
│   │   ├── upload.ts               # Dropbox 업로드 (카테고리/검색어 기반 폴더)
│   │   └── index-note.ts           # 인덱스 노트 생성/업데이트 (Phase 4)
│   └── utils/
│       ├── language.ts             # 언어 감지
│       ├── slugify.ts              # 안전한 폴더/파일명 슬러그화
│       ├── filename.ts             # 안전한 파일명 생성
│       └── duration.ts             # ISO 8601 duration 파싱
├── types/
│   └── index.ts                    # 전역 타입 정의
├── .env.local                      # 환경 변수 (Git 제외)
├── .env.example                    # 환경 변수 템플릿
├── CLAUDE.md                       # Claude Code 컨텍스트
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 8. 환경 변수

`.env.local` 파일 구성:

```bash
# Google APIs (YouTube + Gemini, 같은 키 사용 가능)
GOOGLE_API_KEY=AIzaSy...
# Gemini 전용 키 분리 시 (선택)
# GEMINI_API_KEY=AIzaSy...
# YOUTUBE_API_KEY=AIzaSy...

# Dropbox
DROPBOX_ACCESS_TOKEN=sl.B...
# vault 루트 경로 (이 아래에 카테고리/검색어 폴더가 자동 생성됨)
DROPBOX_VAULT_PATH=/Apps/youtube-obsidian-sync/YouTube   # App folder 사용 시
# 또는
# DROPBOX_VAULT_PATH=/Obsidian/Vault/YouTube              # Full Dropbox 사용 시

# Gemini 모델 설정
GEMINI_MODEL=gemini-2.0-flash-exp

# 처리 제한
MAX_VIDEOS_PER_BATCH=10
MAX_RESULTS_PER_SEARCH=25
```

`.env.example`을 별도로 만들어 Git에 포함 (실제 값은 비워둠).

---

## 9. API 사용량 및 비용

### 9.1 일일 사용량 추정 (개인 학습용, 하루 5편 정리 가정)

| API | 호출 패턴 | 일일 사용량 | 한도 | 여유율 |
|---|---|---|---|---|
| YouTube Data API | 검색 5회 + 메타데이터 조회 5회 | ~510 units | 10,000 units | 95% 여유 |
| Gemini API | 영상당 1~2회 호출 | 5~10 요청 | 1,500 요청/일 | 99% 여유 |
| Dropbox API | 영상당 1회 업로드 | 5 요청 | 사실상 무제한 | - |

**결론**: 본인 사용량 수준에서는 **완전 무료** 운영 가능.

### 9.2 비용 발생 시점

- **Gemini 무료 한도 초과 시**: 입력 $1/100만 토큰, 출력 $3/100만 토큰 (Gemini 2.0 Flash 기준, 변동 가능)
- **YouTube API 쿼터 초과 시**: 추가 쿼터 요청 가능 (대부분 무료, 상업적 용도면 유료)
- **Whisper API 사용 시 (선택)**: 분당 $0.006

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

- [ ] Phase 1 완료 — 날짜:
- [ ] Phase 2 완료 — 날짜:
- [ ] Phase 3 완료 — 날짜:
- [ ] Phase 4 완료 — 날짜:

---

*이 문서는 프로젝트 진행 중 자유롭게 수정·보완해도 좋습니다. Claude Code에게 작업을 요청할 때 "구현 계획 문서 6.X 항목을 진행해줘"와 같이 참조하면 효율적입니다.*
