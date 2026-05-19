/**
 * 유튜브 영상에서 자막을 추출한다.
 *
 * 자막 선택 우선순위: 한국어(ko) → 영어(en) → 영상의 기본 자막.
 * 자막이 전혀 없거나 비활성화된 영상은 명확한 한국어 메시지로 에러를 던진다.
 *
 * 의존 라이브러리(`youtube-transcript`)는 유튜브 페이지/내부 API를 스크래핑하므로
 * 정책 변경에 취약하다는 점에 유의 (IMPLEMENTATION_PLAN.md 11.1 위험요소 참고).
 */
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type TranscriptResponse,
} from 'youtube-transcript';

export type TranscriptSegment = {
  text: string;
  offsetSeconds: number;
  durationSeconds: number;
};

export type TranscriptResult = {
  videoId: string;
  language: string;
  segments: TranscriptSegment[];
};

const PREFERRED_LANGUAGES = ['ko', 'en'] as const;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
// youtube-transcript가 ms 단위(srv3 포맷)를 반환했는지 판별하는 임계값. 자막 한 조각 길이는
// 보통 1~10초이므로 duration 최대가 30을 넘으면 ms 단위로 본다.
const SECONDS_NORMALIZE_THRESHOLD = 30;

export async function extractTranscript(videoId: string): Promise<TranscriptResult> {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    throw new Error(`잘못된 videoId 형식입니다: "${videoId}"`);
  }

  for (const lang of PREFERRED_LANGUAGES) {
    const result = await tryFetch(videoId, lang);
    if (result) return result;
  }

  const fallback = await tryFetch(videoId, undefined);
  if (fallback) return fallback;

  throw new Error(`영상에 사용 가능한 자막이 없습니다 (videoId: ${videoId}).`);
}

async function tryFetch(
  videoId: string,
  lang: string | undefined,
): Promise<TranscriptResult | null> {
  try {
    const raw = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
    if (raw.length === 0) return null;
    return {
      videoId,
      language: lang ?? raw[0]?.lang ?? 'unknown',
      segments: normalizeSegments(raw),
    };
  } catch (error) {
    // 해당 언어만 없는 경우는 다음 후보로 넘어간다. 그 외(비활성화, 영상 없음, rate limit 등)는 즉시 던진다.
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      return null;
    }
    throw mapToFriendlyError(error, videoId);
  }
}

/**
 * youtube-transcript는 YouTube 응답이 srv3 포맷이면 ms, classic 포맷이면 초를 그대로 반환한다.
 * 호출자가 단위를 신경 쓰지 않도록 모두 초로 정규화한다.
 */
function normalizeSegments(raw: TranscriptResponse[]): TranscriptSegment[] {
  const maxDuration = raw.reduce((acc, segment) => Math.max(acc, segment.duration), 0);
  const inMs = maxDuration > SECONDS_NORMALIZE_THRESHOLD;
  const divisor = inMs ? 1000 : 1;
  return raw.map((segment) => ({
    text: segment.text,
    offsetSeconds: segment.offset / divisor,
    durationSeconds: segment.duration / divisor,
  }));
}

function mapToFriendlyError(error: unknown, videoId: string): Error {
  if (error instanceof YoutubeTranscriptDisabledError) {
    return new Error(`이 영상은 자막이 비활성화되어 있습니다 (videoId: ${videoId}).`);
  }
  if (error instanceof YoutubeTranscriptNotAvailableError) {
    return new Error(`영상에 사용 가능한 자막이 없습니다 (videoId: ${videoId}).`);
  }
  if (error instanceof YoutubeTranscriptVideoUnavailableError) {
    return new Error(`영상을 찾을 수 없거나 접근이 제한되어 있습니다 (videoId: ${videoId}).`);
  }
  if (error instanceof YoutubeTranscriptTooManyRequestError) {
    return new Error('YouTube가 요청 빈도를 제한하고 있습니다. 잠시 후 다시 시도해주세요.');
  }
  if (error instanceof Error) {
    return new Error(`자막 추출 중 오류가 발생했습니다: ${error.message}`);
  }
  return new Error('자막 추출 중 알 수 없는 오류가 발생했습니다.');
}
