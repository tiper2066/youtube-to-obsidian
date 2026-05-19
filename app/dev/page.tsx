'use client';

/**
 * Phase 1.6 개발용 검증 페이지.
 *
 * - 백엔드 모듈(검색·자막·요약·업로드) 동작 확인 전용. 디자인은 신경 쓰지 않는다.
 * - Phase 2 정식 UI 완성 후 이 라우트는 삭제 또는 비공개 처리한다.
 *
 * 두 가지 흐름을 테스트:
 *   ① `/api/search` GET — 검색어 + 필터로 영상 목록 가져오기
 *   ② `/api/process` POST — videoId + 카테고리 + 검색어로 자막→요약→Dropbox 업로드 파이프라인
 *
 * ①의 검색 결과 옆에 "② 채우기" 버튼이 있어, 한 화면에서 검색 → 처리 흐름을 검증할 수 있다.
 */
import { useState } from 'react';

import { DEFAULT_CATEGORIES } from '@/config/categories';

type Json = unknown;

type PickedVideo = {
  videoId: string;
  searchQuery?: string;
};

export default function DevPage() {
  const [videoId, setVideoId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  function handlePickVideo(picked: PickedVideo) {
    setVideoId(picked.videoId);
    if (picked.searchQuery !== undefined) setSearchQuery(picked.searchQuery);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-12 p-8 font-mono text-sm">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Dev Test Page</h1>
        <p className="text-xs text-gray-500">
          Phase 1 백엔드 모듈 동작 검증용. Phase 2 정식 UI 완성 후 삭제 예정.
        </p>
      </header>

      <SearchTester onPick={handlePickVideo} />
      <ProcessTester
        videoId={videoId}
        searchQuery={searchQuery}
        onVideoIdChange={setVideoId}
        onSearchQueryChange={setSearchQuery}
      />
    </main>
  );
}

type SearchResultItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  duration?: string;
  language?: string;
  hasCaption?: boolean;
  url?: string;
};

type SearchResponse = {
  count: number;
  results: SearchResultItem[];
};

function SearchTester({ onPick }: { onPick: (picked: PickedVideo) => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Json>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `/api/search?query=${encodeURIComponent(trimmed)}`;
      const response = await fetch(url);
      const data = (await response.json()) as Json;
      if (!response.ok) {
        setError(extractMessage(data, `HTTP ${response.status}`));
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  const items = isSearchResponse(result) ? result.results : null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">① 검색 테스트 — GET /api/search</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어 (예: 파이썬 데이터 분석)"
          className="flex-1 border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="border border-black bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          {loading ? '검색 중…' : '검색'}
        </button>
      </form>
      {error && <ErrorBox message={error} />}
      {items && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            총 {items.length}개. &lsquo;② 채우기&rsquo;를 누르면 아래 ② 처리 테스트에 videoId와 검색어가 자동 입력됩니다.
          </p>
          <ul className="divide-y divide-gray-200 border border-gray-200">
            {items.map((item) => (
              <li key={item.videoId} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{item.title}</div>
                  <div className="truncate text-xs text-gray-500">
                    {item.channelTitle} · {item.duration ?? '-'} · {item.language ?? '-'} ·
                    {item.hasCaption ? ' 자막 있음' : ' 자막 없음'} ·
                    <code className="ml-1">{item.videoId}</code>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick({ videoId: item.videoId, searchQuery: query.trim() })}
                  className="shrink-0 border border-gray-400 px-2 py-1 text-xs"
                >
                  ② 채우기
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result !== null && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500">원본 JSON 보기</summary>
          <JsonView value={result} />
        </details>
      )}
    </section>
  );
}

function ProcessTester({
  videoId,
  searchQuery,
  onVideoIdChange,
  onSearchQueryChange,
}: {
  videoId: string;
  searchQuery: string;
  onVideoIdChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
}) {
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ step?: string; message: string } | null>(null);
  const [result, setResult] = useState<Json>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = videoId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: id,
          category: category.trim() || undefined,
          searchQuery: searchQuery.trim() || undefined,
        }),
      });
      const data = (await response.json()) as Json;
      if (!response.ok) {
        const obj = isRecord(data) ? data : {};
        setError({
          step: typeof obj.step === 'string' ? obj.step : undefined,
          message: extractMessage(data, `HTTP ${response.status}`),
        });
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : '알 수 없는 오류' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">② 단일 영상 처리 — POST /api/process</h2>
      <p className="text-xs text-gray-500">
        videoId만 필수. 카테고리/검색어 비우면 `_inbox`에 검색어 폴더 없이 저장됩니다.
      </p>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <input
          type="text"
          value={videoId}
          onChange={(e) => onVideoIdChange(e.target.value)}
          placeholder="videoId (예: dQw4w9WgXcQ)"
          className="border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          list="dev-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="카테고리 (선택)"
          className="border border-gray-300 px-3 py-2"
        />
        <datalist id="dev-categories">
          {DEFAULT_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="검색어 (선택, 하위폴더명에 사용)"
          className="border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading || !videoId.trim()}
          className="border border-black bg-black px-4 py-2 text-white disabled:opacity-40 md:col-span-3"
        >
          {loading ? '처리 중…' : '자막추출 → 요약 → 업로드'}
        </button>
      </form>
      {error && (
        <ErrorBox message={error.step ? `[${error.step}] ${error.message}` : error.message} />
      )}
      {result !== null && <JsonView value={result} />}
    </section>
  );
}

function JsonView({ value }: { value: Json }) {
  return (
    <pre className="max-h-120 overflow-auto border border-gray-200 bg-gray-50 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="border border-red-200 bg-red-50 p-3 text-xs text-red-700">{message}</div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSearchResponse(value: unknown): value is SearchResponse {
  if (!isRecord(value)) return false;
  if (typeof value.count !== 'number') return false;
  if (!Array.isArray(value.results)) return false;
  return value.results.every(
    (item) =>
      isRecord(item) && typeof item.videoId === 'string' && typeof item.title === 'string',
  );
}

function extractMessage(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.error === 'string') return value.error;
  return fallback;
}
