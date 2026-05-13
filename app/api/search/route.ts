import { NextResponse } from 'next/server';

import { searchVideos } from '@/lib/youtube/search';
import type {
  SearchOrder,
  SearchParams,
  SearchType,
  VideoDurationFilter,
} from '@/lib/youtube/types';

/**
 * GET /api/search?query=...&order=...&videoDuration=...&publishedAfter=...
 *
 * Phase 1.2 검증용 엔드포인트. 브라우저 또는 Thunder Client/Postman에서 GET으로 호출.
 * 예: /api/search?query=python%20data%20analysis&videoDuration=long&order=viewCount
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const params = parseSearchParams(new URL(request.url).searchParams);
    const results = await searchVideos(params);
    return NextResponse.json({ count: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    const status = message.startsWith('잘못된 요청') ? 400 : 500;
    if (status >= 500) {
      console.error('[api/search] Error:', error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}

const VIDEO_DURATIONS: readonly VideoDurationFilter[] = ['short', 'medium', 'long', 'any'];
const SEARCH_TYPES: readonly SearchType[] = ['video', 'playlist'];
const SEARCH_ORDERS: readonly SearchOrder[] = ['relevance', 'date', 'viewCount', 'rating'];

function parseSearchParams(qs: URLSearchParams): SearchParams {
  const query = qs.get('query')?.trim();
  if (!query) {
    throw new Error('잘못된 요청: query 파라미터는 필수입니다.');
  }

  const maxResultsRaw = qs.get('maxResults');
  const maxResults = maxResultsRaw === null ? undefined : Number.parseInt(maxResultsRaw, 10);
  if (maxResults !== undefined && Number.isNaN(maxResults)) {
    throw new Error('잘못된 요청: maxResults는 정수여야 합니다.');
  }

  return {
    query,
    publishedAfter: qs.get('publishedAfter') ?? undefined,
    publishedBefore: qs.get('publishedBefore') ?? undefined,
    videoDuration: pickFrom(qs.get('videoDuration'), VIDEO_DURATIONS, 'videoDuration'),
    type: pickFrom(qs.get('type'), SEARCH_TYPES, 'type'),
    order: pickFrom(qs.get('order'), SEARCH_ORDERS, 'order'),
    maxResults,
  };
}

function pickFrom<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fieldName: string,
): T | undefined {
  if (value === null) return undefined;
  if (!allowed.includes(value as T)) {
    throw new Error(
      `잘못된 요청: ${fieldName} 값은 다음 중 하나여야 합니다 — ${allowed.join(', ')}`,
    );
  }
  return value as T;
}
