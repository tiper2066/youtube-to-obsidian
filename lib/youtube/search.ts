import { parseIso8601Duration } from '@/lib/utils/duration';
import { detectLanguage } from '@/lib/utils/language';

import type {
  SearchParams,
  VideoSearchResult,
  YouTubeApiError,
  YouTubeSearchListResponse,
  YouTubeVideoItem,
  YouTubeVideosListResponse,
} from './types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_MAX_RESULTS = 25;
const MIN_RESULTS = 1;
const MAX_RESULTS = 50;
const DESCRIPTION_PREVIEW_LENGTH = 200;

export async function searchVideos(params: SearchParams): Promise<VideoSearchResult[]> {
  const apiKey = requireApiKey();
  const type = params.type ?? 'video';

  if (type === 'playlist') {
    throw new Error('재생목록 검색은 아직 지원하지 않습니다 (현재 Phase에서는 video만 처리).');
  }

  const videoIds = await searchVideoIds(apiKey, params, type);
  if (videoIds.length === 0) return [];

  const videoItems = await fetchVideoDetails(apiKey, videoIds);
  const byId = new Map(videoItems.map((item) => [item.id, item] as const));

  return videoIds
    .map((id) => byId.get(id))
    .filter((item): item is YouTubeVideoItem => item !== undefined)
    .map(mapToResult);
}

async function searchVideoIds(
  apiKey: string,
  params: SearchParams,
  type: 'video' | 'playlist',
): Promise<string[]> {
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

  const data = await fetchYouTubeApi<YouTubeSearchListResponse>(url);
  return data.items.map((item) => item.id.videoId).filter((id): id is string => Boolean(id));
}

async function fetchVideoDetails(apiKey: string, videoIds: string[]): Promise<YouTubeVideoItem[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', videoIds.join(','));

  const data = await fetchYouTubeApi<YouTubeVideosListResponse>(url);
  return data.items;
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
