/**
 * 영상 메타데이터에서 사용 언어를 추정한다.
 *
 * 1순위: YouTube가 알려주는 defaultLanguage / defaultAudioLanguage (ISO 639-1, 예: 'ko', 'en-US')
 * 2순위: 제목/설명에서 한글·일본어·중문자가 보이면 그쪽으로 추정
 * 3순위: 라틴 문자만 보이면 영어로 추정
 * 그래도 모르면 'unknown'.
 */
const HANGUL_REGEX = /[ㄱ-ㆎ가-힣]/;
const HIRAGANA_KATAKANA_REGEX = /[぀-ゟ゠-ヿ]/;
const CJK_REGEX = /[一-鿿]/;
const LATIN_REGEX = /[A-Za-z]/;

type DetectInput = {
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  title?: string;
  description?: string;
};

export function detectLanguage(input: DetectInput): string {
  const explicit = normalizeLanguageCode(input.defaultLanguage ?? input.defaultAudioLanguage);
  if (explicit) return explicit;

  const sample = `${input.title ?? ''} ${input.description ?? ''}`;
  if (HANGUL_REGEX.test(sample)) return 'ko';
  if (HIRAGANA_KATAKANA_REGEX.test(sample)) return 'ja';
  if (CJK_REGEX.test(sample)) return 'zh';
  if (LATIN_REGEX.test(sample)) return 'en';
  return 'unknown';
}

function normalizeLanguageCode(code: string | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  return trimmed.split('-')[0].toLowerCase();
}
