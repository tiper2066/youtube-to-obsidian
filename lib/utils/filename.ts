/**
 * 옵시디언 노트 파일명 규칙: `YYYY-MM-DD_채널명슬러그_제목슬러그.md`
 *
 * 채널명과 제목은 각각 짧게 자른다 (옵시디언/Dropbox에서 너무 긴 파일명을 피하기 위함).
 * 같은 이름이 이미 있어도 Dropbox `autorename: true` 옵션으로 `(1)`, `(2)`가 자동으로 붙으므로
 * 여기서는 충돌 처리를 하지 않는다.
 */
import { slugifyForFolder } from './slugify';

const CHANNEL_SLUG_MAX = 24;
const TITLE_SLUG_MAX = 60;

export type GenerateNoteFilenameInput = {
  publishedDate: string; // 'YYYY-MM-DD' (또는 ISO 문자열 — 앞 10자만 사용)
  channelTitle: string;
  videoTitle: string;
};

export function generateNoteFilename(input: GenerateNoteFilenameInput): string {
  const date = normalizeDate(input.publishedDate);
  const channel = slugifyForFolder(input.channelTitle, CHANNEL_SLUG_MAX) || 'channel';
  const title = slugifyForFolder(input.videoTitle, TITLE_SLUG_MAX) || 'untitled';
  return `${date}_${channel}_${title}.md`;
}

function normalizeDate(value: string): string {
  // 'YYYY-MM-DD' 또는 ISO 8601의 첫 10자를 그대로 쓴다. 그 외 형식은 오늘 날짜로 폴백.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}
