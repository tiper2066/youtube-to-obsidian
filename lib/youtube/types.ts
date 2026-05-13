/**
 * 도구 내부에서 사용하는 검색 파라미터/결과 타입과,
 * 응답에서 우리가 실제로 읽는 필드만 좁혀 둔 YouTube Data API v3 응답 타입을 모아둔다.
 */

export type SearchType = 'video' | 'playlist';
export type VideoDurationFilter = 'short' | 'medium' | 'long' | 'any';
export type SearchOrder = 'relevance' | 'date' | 'viewCount' | 'rating';

export type SearchParams = {
  query: string;
  publishedAfter?: string;
  publishedBefore?: string;
  videoDuration?: VideoDurationFilter;
  type?: SearchType;
  maxResults?: number;
  order?: SearchOrder;
};

export type VideoSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  duration: string;
  durationSeconds: number;
  viewCount: number;
  language: string;
  hasCaption: boolean;
  description: string;
  url: string;
};

export type YouTubeThumbnail = {
  url: string;
  width: number;
  height: number;
};

type YouTubeThumbnails = {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
};

export type YouTubeSearchItem = {
  id: {
    kind: string;
    videoId?: string;
    playlistId?: string;
    channelId?: string;
  };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    channelTitle: string;
  };
};

export type YouTubeSearchListResponse = {
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeSearchItem[];
};

export type YouTubeVideoItem = {
  id: string;
  snippet?: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    channelTitle: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  contentDetails?: {
    duration: string;
    caption: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

export type YouTubeVideosListResponse = {
  items: YouTubeVideoItem[];
};

export type YouTubeApiError = {
  error: {
    code: number;
    message: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};
