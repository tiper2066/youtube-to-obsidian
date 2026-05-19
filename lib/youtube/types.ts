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
  /** YouTube Data API의 페이지네이션 토큰. 첫 페이지는 undefined, 이후 응답의 `nextPageToken`/`prevPageToken`을 그대로 전달. */
  pageToken?: string;
  /**
   * type='playlist'에서 페이지 이동 시 직전 응답의 `playlistContext.playlistId`를 그대로 보낸다.
   * 이게 채워지면 백엔드는 `search.list` 재호출(100 units)을 건너뛰고 바로 해당 재생목록의
   * `playlistItems.list`로 영상 페이지만 받는다 — 다음 페이지 비용이 ~100 → ~2 units로 떨어진다.
   */
  playlistId?: string;
};

/**
 * `searchVideos`의 페이지네이션 응답 shape. API route(`/api/search`)와 클라이언트가 공유한다.
 *
 * YouTube의 `pageInfo.totalResults`는 정확한 값이 아니라 "추정치"이고, 일부 검색에서 큰 숫자를
 * 돌려준다 (수십만~수백만). UI에는 "약 N개" 정도로만 가볍게 노출.
 */
export type SearchPage = {
  results: VideoSearchResult[];
  /** 다음 페이지가 있으면 토큰, 없으면 null. */
  nextPageToken: string | null;
  /** 이전 페이지가 있으면 토큰, 없으면 null (첫 페이지에서는 null). */
  prevPageToken: string | null;
  /** YouTube가 보고하는 추정 결과 총 개수. UI에는 가볍게 "약 N개"로만 노출. */
  totalResults: number;
  /**
   * type='playlist' 응답에만 채워짐. UI는 이 값으로 (1) 재생목록 컨텍스트 배너 표시,
   * (2) 카드의 체크박스/정리하기 버튼 비활성, (3) 다음 페이지 요청에 `playlistId` 재사용을 결정.
   */
  playlistContext?: { playlistId: string; playlistTitle: string };
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
  /** 다음 페이지 토큰. 없으면 키 자체가 응답에서 빠짐. */
  nextPageToken?: string;
  /** 이전 페이지 토큰. 첫 페이지에서는 응답에서 빠짐. */
  prevPageToken?: string;
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

/** `playlistItems.list?part=snippet&playlistId=...` 응답 — 한 재생목록 안의 영상 목록. */
export type YouTubePlaylistItem = {
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: YouTubeThumbnails;
    channelTitle: string;
    playlistId: string;
    position: number;
    /** `kind === 'youtube#video'`이면 `videoId`가 채워진다. 비공개/삭제된 영상은 keys가 비어 올 수 있음. */
    resourceId: {
      kind: string;
      videoId?: string;
    };
  };
};

export type YouTubePlaylistItemsListResponse = {
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  nextPageToken?: string;
  prevPageToken?: string;
  items: YouTubePlaylistItem[];
};

/** `playlists.list?part=snippet&id=...` — 재생목록 자체의 메타. 제목을 가져올 때만 사용. */
export type YouTubePlaylistsListResponse = {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
    };
  }>;
};

export type YouTubeApiError = {
  error: {
    code: number;
    message: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};
