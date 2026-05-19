import { parseIso8601Duration } from '@/lib/utils/duration';
import { detectLanguage } from '@/lib/utils/language';

import type {
  SearchPage,
  SearchParams,
  VideoSearchResult,
  YouTubeApiError,
  YouTubePlaylistItem,
  YouTubePlaylistItemsListResponse,
  YouTubePlaylistsListResponse,
  YouTubeSearchListResponse,
  YouTubeVideoItem,
  YouTubeVideosListResponse,
} from './types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_MAX_RESULTS = 20;
const MIN_RESULTS = 1;
const MAX_RESULTS = 50;
const DESCRIPTION_PREVIEW_LENGTH = 200;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * 단일 videoId의 메타데이터를 가져온다.
 * 검색 결과 없이 videoId만 가지고 있을 때(예: 개발용 dev 페이지) 쓰는 헬퍼.
 * 영상이 존재하지 않거나 접근 불가하면 null을 반환한다.
 */
export async function getVideoMeta(videoId: string): Promise<VideoSearchResult | null> {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    throw new Error(`잘못된 videoId 형식입니다: "${videoId}"`);
  }
  const apiKey = requireApiKey();
  const items = await fetchVideoDetails(apiKey, [videoId]);
  if (items.length === 0) return null;
  return mapToResult(items[0]);
}

/**
 * YouTube `search.list` 호출 후, 반환된 videoId 묶음을 `videos.list`로 상세 조회해 합친다.
 * 페이지네이션 토큰(`nextPageToken`/`prevPageToken`)을 응답에 그대로 동봉해 클라이언트가
 * "다음 페이지" 클릭 시 같은 검색 파라미터 + 새 `pageToken`으로 다시 호출한다.
 *
 * `search.list`는 호출당 100 units 소비 — 페이지 이동마다 1회 발생하므로 일일 한도(10,000 units)
 * 안에서 100회 검색 가능. 무거운 작업이라 캐싱 없이 동적 응답을 그대로 돌려준다.
 */
export async function searchVideos(params: SearchParams): Promise<SearchPage> {
  const apiKey = requireApiKey();
  const type = params.type ?? 'video';

  if (type === 'playlist') {
    return searchPlaylistVideos(apiKey, params);
  }

  const searchResponse = await searchVideoIds(apiKey, params, type);
  if (searchResponse.videoIds.length === 0) {
    return {
      results: [],
      nextPageToken: searchResponse.nextPageToken,
      prevPageToken: searchResponse.prevPageToken,
      totalResults: searchResponse.totalResults,
    };
  }

  const videoItems = await fetchVideoDetails(apiKey, searchResponse.videoIds);
  const byId = new Map(videoItems.map((item) => [item.id, item] as const));

  const results = searchResponse.videoIds
    .map((id) => byId.get(id))
    .filter((item): item is YouTubeVideoItem => item !== undefined)
    .map(mapToResult);

  return {
    results,
    nextPageToken: searchResponse.nextPageToken,
    prevPageToken: searchResponse.prevPageToken,
    totalResults: searchResponse.totalResults,
  };
}

type SearchIdsResult = {
  videoIds: string[];
  nextPageToken: string | null;
  prevPageToken: string | null;
  totalResults: number;
};

async function searchVideoIds(
  apiKey: string,
  params: SearchParams,
  type: 'video' | 'playlist',
): Promise<SearchIdsResult> {
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', params.query);
  url.searchParams.set('type', type);
  url.searchParams.set('maxResults', String(clampMaxResults(params.maxResults)));
  if (params.order) url.searchParams.set('order', params.order);
  if (params.publishedAfter) url.searchParams.set('publishedAfter', params.publishedAfter);
  if (params.publishedBefore) url.searchParams.set('publishedBefore', params.publishedBefore);
  if (params.videoDuration && type === 'video') {
    url.searchParams.set('videoDuration', params.videoDuration);
  }
  if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);

  const data = await fetchYouTubeApi<YouTubeSearchListResponse>(url);
  return {
    videoIds: data.items.map((item) => item.id.videoId).filter((id): id is string => Boolean(id)),
    nextPageToken: data.nextPageToken ?? null,
    prevPageToken: data.prevPageToken ?? null,
    totalResults: data.pageInfo?.totalResults ?? 0,
  };
}

async function fetchVideoDetails(apiKey: string, videoIds: string[]): Promise<YouTubeVideoItem[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', videoIds.join(','));

  const data = await fetchYouTubeApi<YouTubeVideosListResponse>(url);
  return data.items;
}

/**
 * 재생목록 검색 흐름. 두 단계로 동작:
 *
 * (1) 첫 검색 (`params.playlistId`가 비어 있을 때):
 *     - `search.list?type=playlist&maxResults=1`로 쿼리와 가장 잘 맞는 재생목록 1개를 찾는다.
 *     - 그 재생목록의 영상들을 `playlistItems.list`로 받아 `videos.list`로 enrich.
 *     - 비용: 100(search) + 1(playlistItems) + 1(videos) = ~102 units.
 *
 * (2) 페이지 이동 (`params.playlistId` 제공됨):
 *     - `search.list`를 건너뛰고 곧장 `playlistItems.list`로 다음/이전 페이지를 받는다.
 *     - 제목은 1회 더 조회(`playlists.list`)해 응답에 동봉 — 클라이언트가 새로고침된 상태에서도
 *       배너를 그릴 수 있도록 응답을 self-contained하게 유지.
 *     - 비용: 1(playlists) + 1(playlistItems) + 1(videos) = ~3 units.
 *
 * 재생목록 자체 검색의 페이지네이션은 **하지 않는다** — 사용자 흐름은 "키워드로 매칭되는 1개 재생목록의
 * 영상을 펼쳐 보고 → 마음에 드는 영상의 링크로 YouTube에 직접 이동 → URL 입력 카드에 붙여 넣어 정리".
 * 다른 재생목록이 보고 싶으면 키워드를 바꾼다.
 */
async function searchPlaylistVideos(apiKey: string, params: SearchParams): Promise<SearchPage> {
  const playlist = params.playlistId
    ? await fetchPlaylistMeta(apiKey, params.playlistId)
    : await findTopPlaylist(apiKey, params.query);

  if (!playlist) {
    return { results: [], nextPageToken: null, prevPageToken: null, totalResults: 0 };
  }

  const itemsResult = await fetchPlaylistVideoIds(
    apiKey,
    playlist.id,
    params.pageToken,
    clampMaxResults(params.maxResults),
  );

  if (itemsResult.videoIds.length === 0) {
    return {
      results: [],
      nextPageToken: itemsResult.nextPageToken,
      prevPageToken: itemsResult.prevPageToken,
      totalResults: itemsResult.totalResults,
      playlistContext: { playlistId: playlist.id, playlistTitle: playlist.title },
    };
  }

  const videoItems = await fetchVideoDetails(apiKey, itemsResult.videoIds);
  const byId = new Map(videoItems.map((item) => [item.id, item] as const));

  const results = itemsResult.videoIds
    .map((id) => byId.get(id))
    .filter((item): item is YouTubeVideoItem => item !== undefined)
    .map(mapToResult);

  return {
    results,
    nextPageToken: itemsResult.nextPageToken,
    prevPageToken: itemsResult.prevPageToken,
    totalResults: itemsResult.totalResults,
    playlistContext: { playlistId: playlist.id, playlistTitle: playlist.title },
  };
}

/** `search.list?type=playlist`로 쿼리와 가장 잘 매칭되는 재생목록 1개를 찾는다. 없으면 null. */
async function findTopPlaylist(
  apiKey: string,
  query: string,
): Promise<{ id: string; title: string } | null> {
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'playlist');
  url.searchParams.set('maxResults', '1');

  const data = await fetchYouTubeApi<YouTubeSearchListResponse>(url);
  const top = data.items[0];
  if (!top?.id.playlistId) return null;
  return { id: top.id.playlistId, title: top.snippet.title };
}

/** 페이지 이동 시 재생목록 제목을 다시 가져오기 위해 사용. */
async function fetchPlaylistMeta(
  apiKey: string,
  playlistId: string,
): Promise<{ id: string; title: string } | null> {
  const url = new URL(`${YOUTUBE_API_BASE}/playlists`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', playlistId);

  const data = await fetchYouTubeApi<YouTubePlaylistsListResponse>(url);
  const top = data.items[0];
  if (!top) return null;
  return { id: top.id, title: top.snippet.title };
}

type PlaylistItemsResult = {
  videoIds: string[];
  nextPageToken: string | null;
  prevPageToken: string | null;
  totalResults: number;
};

async function fetchPlaylistVideoIds(
  apiKey: string,
  playlistId: string,
  pageToken: string | undefined,
  maxResults: number,
): Promise<PlaylistItemsResult> {
  const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', String(maxResults));
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const data = await fetchYouTubeApi<YouTubePlaylistItemsListResponse>(url);
  return {
    videoIds: data.items
      .map((item: YouTubePlaylistItem) => item.snippet.resourceId.videoId)
      .filter((id): id is string => Boolean(id)),
    nextPageToken: data.nextPageToken ?? null,
    prevPageToken: data.prevPageToken ?? null,
    totalResults: data.pageInfo?.totalResults ?? 0,
  };
}

function mapToResult(item: YouTubeVideoItem): VideoSearchResult {
  const snippet = item.snippet;
  if (!snippet) {
    // snippet은 part 요청에 포함시켰으므로 비어 있을 일이 거의 없지만, 방어적으로 처리.
    throw new Error(`Video ${item.id} is missing snippet data.`);
  }

  const duration = item.contentDetails?.duration ?? 'PT0S';
  const thumbnailUrl =
    snippet.thumbnails.medium?.url ??
    snippet.thumbnails.high?.url ??
    snippet.thumbnails.default?.url ??
    '';

  return {
    videoId: item.id,
    title: snippet.title,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    thumbnailUrl,
    duration,
    durationSeconds: parseIso8601Duration(duration),
    viewCount: item.statistics?.viewCount ? Number.parseInt(item.statistics.viewCount, 10) : 0,
    language: detectLanguage({
      defaultLanguage: snippet.defaultLanguage,
      defaultAudioLanguage: snippet.defaultAudioLanguage,
      title: snippet.title,
      description: snippet.description,
    }),
    hasCaption: item.contentDetails?.caption === 'true',
    description: truncate(snippet.description, DESCRIPTION_PREVIEW_LENGTH),
    url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

async function fetchYouTubeApi<T>(url: URL): Promise<T> {
  // Route Handler에서 호출되며 매번 동적 응답을 원하므로 fetch 캐싱은 비활성화.
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`YouTube API error (${response.status}): ${message}`);
  }
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as YouTubeApiError;
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function requireApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error('YOUTUBE_API_KEY 환경 변수가 설정되어 있지 않습니다 (.env.local 확인).');
  }
  return key;
}

function clampMaxResults(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.max(Math.floor(value), MIN_RESULTS), MAX_RESULTS);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
