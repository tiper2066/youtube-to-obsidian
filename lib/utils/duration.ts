/**
 * ISO 8601 duration (예: PT1H23M45S) 을 초 단위로 변환한다.
 * YouTube `videos.list`의 contentDetails.duration이 이 포맷을 사용한다.
 */
const ISO_8601_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export function parseIso8601Duration(duration: string): number {
  const match = ISO_8601_DURATION.exec(duration);
  if (!match) return 0;
  const days = match[1] ? Number.parseInt(match[1], 10) : 0;
  const hours = match[2] ? Number.parseInt(match[2], 10) : 0;
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0;
  const seconds = match[4] ? Number.parseInt(match[4], 10) : 0;
  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

/**
 * 초를 사람이 읽기 좋은 형태("12:34", "1:02:03")로 변환한다.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}
