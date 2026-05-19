/**
 * YouTube URL 또는 영상 ID 문자열에서 11자 videoId를 추출한다.
 *
 * 지원하는 입력 형태:
 * - https://www.youtube.com/watch?v=VIDEO_ID  (+ &t=, &list= 등 임의 쿼리)
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - VIDEO_ID 자체 (11자 [A-Za-z0-9_-])
 *
 * 형식이 맞지 않으면 null. 호출자는 null을 사용자에게 "URL 형식을 확인해 주세요" 안내로
 * 노출하면 된다.
 *
 * 스킴이 없는 입력(`youtube.com/watch?...`, `youtu.be/...`)도 받아들여서 사용자가 모바일에서
 * 주소를 부분적으로 복사해 붙여 넣어도 동작한다 — 내부에서 `https://`를 prepend해 URL 객체로 파싱.
 */

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 11자 ID 자체로 들어온 경우 즉시 반환.
  if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

  const url = toUrl(trimmed);
  if (!url) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  // youtu.be/<id> 단축 링크: pathname 첫 segment가 videoId.
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && VIDEO_ID_REGEX.test(id) ? id : null;
  }

  // youtube.com 계열 — m./music./www. 모두 정규화 후 처리.
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    // /watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID_REGEX.test(v)) return v;

    // /shorts/<id>, /live/<id>, /embed/<id>, /v/<id>
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const [prefix, id] = segments;
      if (
        (prefix === 'shorts' || prefix === 'live' || prefix === 'embed' || prefix === 'v') &&
        VIDEO_ID_REGEX.test(id)
      ) {
        return id;
      }
    }
  }

  return null;
}

function toUrl(input: string): URL | null {
  // 스킴이 없으면 https://를 붙여 본다. 그래도 호스트가 youtube/youtu.be가 아니면 결과적으로 null이 될 것.
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}
