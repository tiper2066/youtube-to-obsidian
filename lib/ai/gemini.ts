/**
 * Google Gemini API로 자막을 요약해 옵시디언용 마크다운 노트를 만든다.
 *
 * SDK(`@google/generative-ai` / `@google/genai`) 대신 네이티브 fetch로 호출한다.
 * 이유는 lib/youtube/search.ts와 동일: REST 호출이 단순하고 의존성을 줄일 수 있다.
 *
 * Frontmatter는 lib/ai/prompts.ts의 buildFrontmatter가 결정론적으로 만들고,
 * 모델에는 본문 마크다운만 요청한 뒤 합쳐서 반환한다.
 */
import type { TranscriptSegment } from '@/lib/youtube/transcript';

import { buildFrontmatter, buildSummaryPrompt, type NoteContext } from './prompts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-flash-latest';
// Flash는 1M 토큰 컨텍스트지만, 안전 마진을 두고 자막 50만 자에서 컷한다 (한국어 기준 대략 25만 토큰).
const MAX_TRANSCRIPT_CHARS = 500_000;

// 일시 장애(서버 과부하·rate limit)는 잠시 후 재시도하면 보통 회복된다.
// 비-재시도 에러(400 잘못된 요청, 401/403 인증 등)는 즉시 던진다.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3; // 첫 시도 + 최대 2회 재시도. 429일 땐 Gemini가 응답으로 보내는 retryDelay(예: 24s)를 그대로 따르므로 실제 대기 시간은 가변.
const RETRY_BASE_DELAY_MS = 1_000;
// Gemini가 보낸 retryDelay가 이보다 길어도 30초까지만 대기한다 — 그보다 길면 quota가 회복되기까지
// 너무 오래 막혀서 사용자가 직접 대응(모델 교체, 시간 두기)하는 게 낫다.
const MAX_RETRY_DELAY_MS = 30_000;

type GeminiContentPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiContentPart[] };
type GeminiCandidate = {
  content?: GeminiContent;
  finishReason?: string;
};
type GeminiGenerateResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
};
type GeminiErrorDetail = {
  '@type'?: string;
  retryDelay?: string;
};
type GeminiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GeminiErrorDetail[];
  };
};

export async function summarizeTranscript(
  segments: TranscriptSegment[],
  context: NoteContext,
  /**
   * 사용자 정의 노트 양식 (Phase 4.3). 호출자가 Dropbox에서 미리 읽어 넘긴다.
   * 생략 시 `buildSummaryPrompt` 안의 `DEFAULT_TEMPLATE`이 사용됨.
   */
  template?: string,
): Promise<string> {
  if (segments.length === 0) {
    throw new Error('자막이 비어 있어 요약할 수 없습니다.');
  }

  const totalChars = segments.reduce((acc, s) => acc + s.text.length, 0);
  if (totalChars > MAX_TRANSCRIPT_CHARS) {
    throw new Error(
      `자막이 너무 길어 한 번에 처리할 수 없습니다 (${totalChars.toLocaleString()}자, 한도 ${MAX_TRANSCRIPT_CHARS.toLocaleString()}자). 청크 분할 처리는 추후 추가 예정입니다.`,
    );
  }

  const apiKey = requireApiKey();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const prompt = buildSummaryPrompt(segments, context, template);

  const rawBody = await callGemini(apiKey, model, prompt);
  const frontmatter = buildFrontmatter(context);
  return `${frontmatter}\n\n${cleanBody(rawBody)}\n`;
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callGeminiOnce(apiKey, model, prompt);
    if (result.ok) return result.text;

    const isLast = attempt === MAX_ATTEMPTS;
    if (isLast || !RETRYABLE_STATUSES.has(result.status)) {
      throw new Error(formatGeminiError(result.status, result.message));
    }

    // Gemini가 RetryInfo.retryDelay를 보내주면 그 시간을 그대로 따른다 (429에서 가장 정확).
    // 없으면 지수 백오프(1s, 2s)로 폴백한다. 최대 대기 시간은 MAX_RETRY_DELAY_MS로 캡.
    const suggested = result.retryDelayMs;
    const fallback = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    const delay = Math.min(suggested ?? fallback, MAX_RETRY_DELAY_MS);
    const source = suggested !== null ? `retryDelay=${suggested}ms` : 'fallback';
    console.warn(
      `[gemini] ${result.status} (${result.message.slice(0, 80)}). ${delay}ms 후 재시도 ${attempt}/${MAX_ATTEMPTS - 1} (${source})`,
    );
    await sleep(delay);
  }
  // 위 루프가 끝나기 전에 반드시 return 또는 throw — 여기는 도달 불가지만 TypeScript 만족용.
  throw new Error('Gemini 재시도 로직 종료');
}

type GeminiCallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; message: string; retryDelayMs: number | null };

async function callGeminiOnce(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<GeminiCallResult> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const { message, retryDelayMs } = await readErrorInfo(response);
    return {
      ok: false,
      status: response.status,
      message,
      retryDelayMs,
    };
  }

  const data = (await response.json()) as GeminiGenerateResponse;

  // 차단·빈 응답은 재시도해도 같은 결과가 나오므로 여기서 바로 throw (재시도 루프 우회).
  if (data.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini가 프롬프트를 차단했습니다 (blockReason: ${data.promptFeedback.blockReason}).`,
    );
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((p) => p.text)
    .filter((t): t is string => typeof t === 'string')
    .join('')
    .trim();

  if (!text) {
    const finishReason = candidate?.finishReason ?? 'UNKNOWN';
    throw new Error(`Gemini API가 빈 응답을 반환했습니다 (finishReason: ${finishReason}).`);
  }

  return { ok: true, text };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 모델 출력에서 우리가 직접 붙일 frontmatter / 코드 펜스를 제거한다.
 * 지침으로 막아도 가끔 그대로 따라하지 않는 경우가 있어 방어적으로 정리한다.
 */
function cleanBody(text: string): string {
  let cleaned = text.trim();

  const fenceMatch = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const fmMatch = cleaned.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  if (fmMatch) {
    cleaned = fmMatch[1].trim();
  }

  return cleaned;
}

/**
 * Gemini API HTTP 상태에 따라 사용자에게 보일 한국어 메시지로 변환한다.
 * 원문 메시지는 영문이라 사용자가 즉시 원인 파악하기 어렵기 때문.
 */
function formatGeminiError(status: number, originalMessage: string): string {
  if (status === 429) {
    // 어느 한도(RPM/RPD/TPM/초당 burst)에 걸렸는지는 Gemini 원본 메시지에 들어 있다.
    // 진단을 위해 원본을 그대로 노출하고, 가능한 한도 카테고리만 짧게 안내한다.
    return `Gemini API 사용 한도 초과: ${originalMessage} (분당 호출/일일/분당 토큰/초당 burst 중 하나)`;
  }
  if (status === 401 || status === 403) {
    return 'Gemini API 인증 실패. .env.local의 GEMINI_API_KEY를 확인하세요 (키가 만료/회수되었거나 권한이 부족할 수 있습니다).';
  }
  if (status === 400) {
    return `Gemini API 요청이 잘못되었습니다: ${originalMessage}`;
  }
  return `Gemini API 오류 (${status}): ${originalMessage}`;
}

/**
 * Gemini 에러 응답에서 메시지와 retryDelay를 함께 꺼낸다.
 * 429 응답에는 `error.details`에 `google.rpc.RetryInfo`가 들어 있고 `retryDelay: "23.728s"` 형식이다.
 * body가 JSON이 아니거나 RetryInfo가 없으면 retryDelayMs는 null.
 */
async function readErrorInfo(
  response: Response,
): Promise<{ message: string; retryDelayMs: number | null }> {
  try {
    const body = (await response.json()) as GeminiErrorResponse;
    const message = body.error?.message ?? response.statusText;
    const retryDelayMs = extractRetryDelayMs(body);
    return { message, retryDelayMs };
  } catch {
    return { message: response.statusText, retryDelayMs: null };
  }
}

function extractRetryDelayMs(body: GeminiErrorResponse): number | null {
  const details = body.error?.details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    if (typeof detail['@type'] !== 'string') continue;
    if (!detail['@type'].endsWith('RetryInfo')) continue;
    if (typeof detail.retryDelay !== 'string') continue;
    const ms = parseRetryDelaySeconds(detail.retryDelay);
    if (ms > 0) return ms;
  }
  return null;
}

function parseRetryDelaySeconds(value: string): number {
  // Google Duration 문자열 형식 "23.728s" 또는 "5s". 그 외 형식은 0 반환.
  const match = /^([0-9.]+)s$/.exec(value);
  if (!match) return 0;
  const seconds = Number.parseFloat(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 0;
}

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다 (.env.local 확인).');
  }
  return key;
}
