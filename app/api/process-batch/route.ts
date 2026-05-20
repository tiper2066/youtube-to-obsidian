import { INBOX_CATEGORY } from '@/config/categories';
import { summarizeTranscript } from '@/lib/ai/gemini';
import type { NoteContext } from '@/lib/ai/prompts';
import { getNoteTemplate } from '@/lib/dropbox/template';
import { uploadNote } from '@/lib/dropbox/upload';
import { generateNoteFilename } from '@/lib/utils/filename';
import { getVideoMeta } from '@/lib/youtube/search';
import { extractTranscript } from '@/lib/youtube/transcript';

/**
 * `youtube-transcript`(YouTube 페이지 스크래핑)와 `node:Buffer`(Dropbox upload payload)를 사용하므로
 * Edge 런타임이 아닌 Node.js 런타임이 필요하다. 또 SSE 스트리밍을 위해서도 Node가 필요.
 */
export const runtime = 'nodejs';

/**
 * Vercel Hobby 플랜의 함수 타임아웃 상한(60초)에 맞춰 설정. **중요한 한계**: 영상 1개당 보통
 * 15~40초가 걸리므로 60초 안에 처리할 수 있는 batch 크기는 현실적으로 **1~2개**다. 그 이상이면
 * 함수가 강제 종료되어 SSE 스트림이 끊기고 클라이언트는 진행 중이던 영상부터 시작해 끝까지 모두
 * "처리 실패" 상태로 본다. Vercel Pro로 업그레이드하면 300초(5분)까지 가능 — 10개 batch가 안정적
 * 으로 들어간다. Hobby 환경에서 안정적으로 운영하려면 `.env`의 `MAX_VIDEOS_PER_BATCH`를 2~3으로
 * 낮춰 batch 크기 자체를 줄이는 것을 권장.
 */
export const maxDuration = 60;

/**
 * POST /api/process-batch
 *
 * 복수 영상을 순차 처리하면서 진행 상황을 SSE(Server-Sent Events) 스트림으로 송신한다.
 * - 입력: `{ videoIds: string[], category?: string, searchQuery?: string }`
 * - 모든 영상은 동일한 카테고리/하위폴더에 저장된다.
 * - 순차 처리(병렬 X): Gemini 분당 15회, Dropbox/YouTube rate limit을 회피하기 위함.
 * - 한 영상의 실패는 `error` 이벤트로 전달하고, 나머지 영상은 그대로 계속 처리한다.
 *
 * 클라이언트(Phase 3.3 예정)는 EventSource 또는 fetch+Reader로 스트림을 읽으면서
 * 영상별 카드 상태를 업데이트한다. 마지막에 반드시 `done` 이벤트로 마무리한다.
 */

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const DEFAULT_MAX_VIDEOS = 10;
// 영상 사이에 의도적 짧은 휴식. 자연 처리 시간(보통 영상당 10~30초)만으로도 Gemini 분당
// 15회 한도를 거의 안 넘지만, 짧은 영상이 연속으로 빠르게 끝나는 경우를 위한 안전 마진.
// gemini.ts가 429에 대해 이미 지수 백오프 재시도를 하므로 이 값은 어디까지나 보완책.
const INTER_VIDEO_DELAY_MS = 1_000;

type ProcessStep = 'meta' | 'transcript' | 'summarize' | 'upload';

/**
 * 스트림으로 emit되는 이벤트 타입. IMPLEMENTATION_PLAN.md §3.2 스펙을 따르되,
 * `error`에 어느 단계에서 실패했는지 알리는 `step` 필드를 옵션으로 추가했다.
 * 단일 처리 라우트도 같은 라벨을 쓰므로 프론트엔드 표시 코드를 재사용할 수 있다.
 */
type ProcessEvent =
  | { type: 'start'; videoId: string; title: string }
  | { type: 'progress'; videoId: string; step: 'transcript' | 'summarize' | 'upload'; percent: number }
  | { type: 'complete'; videoId: string; filename: string; path: string }
  | {
      type: 'error';
      videoId: string;
      step?: ProcessStep;
      message: string;
      /** upload 단계 실패일 때만 동봉. 단일 처리(/api/process)와 동일한 마크다운 다운로드 폴백. */
      markdown?: string;
      filename?: string;
    }
  | { type: 'done'; totalSuccess: number; totalFailed: number };

type ProcessBatchRequestBody = {
  videoIds: string[];
  category?: string;
  searchQuery?: string;
};

export async function POST(request: Request): Promise<Response> {
  let body: ProcessBatchRequestBody;
  try {
    body = parseBody(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : '잘못된 요청 본문';
    return Response.json({ success: false, error: message }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let cancelled = false;

      const send = (event: ProcessEvent): void => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (err) {
          // 클라이언트가 이미 끊었거나 컨트롤러가 닫힌 경우. 이후 호출은 모두 무시.
          console.warn('[api/process-batch] enqueue 실패 (스트림 종료 추정):', err);
          cancelled = true;
        }
      };

      const onAbort = (): void => {
        cancelled = true;
      };
      request.signal.addEventListener('abort', onAbort);

      let totalSuccess = 0;
      let totalFailed = 0;
      try {
        // 사용자 정의 노트 양식(Phase 4.3)을 batch 시작 시 1회만 Dropbox에서 읽어 모든 영상에 재사용.
        // batch 도중 사용자가 양식을 바꿔도 진행 중 batch에는 적용 안 됨 — 일관된 양식 보장.
        // Dropbox 호출 실패 시 getNoteTemplate은 DEFAULT_TEMPLATE으로 폴백한다 (예외 던지지 않음).
        const template = await getNoteTemplate();

        for (let i = 0; i < body.videoIds.length; i++) {
          if (cancelled) break;
          if (i > 0) await sleep(INTER_VIDEO_DELAY_MS);

          const ok = await processOne(body.videoIds[i], body, send, request.signal, template);
          if (ok) totalSuccess++;
          else totalFailed++;
        }
        send({ type: 'done', totalSuccess, totalFailed });
      } finally {
        request.signal.removeEventListener('abort', onAbort);
        try {
          controller.close();
        } catch {
          // 이미 클라이언트 측에서 닫힌 경우 — 무시.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 프록시(예: nginx, Vercel edge)의 버퍼링을 막아 이벤트가 즉시 전달되도록.
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * 한 영상의 파이프라인을 실행하고 단계별 이벤트를 emit한다.
 * 모든 오류를 내부에서 catch해서 `error` 이벤트로 변환한 뒤 `false`를 반환한다.
 * → 호출자(루프)는 이 함수에서 throw가 절대 빠져나오지 않는다고 가정해도 된다.
 */
async function processOne(
  videoId: string,
  body: ProcessBatchRequestBody,
  send: (event: ProcessEvent) => void,
  signal: AbortSignal,
  /** Phase 4.3 — batch 시작 시 한 번 읽어둔 사용자 정의 노트 양식. */
  template: string,
): Promise<boolean> {
  let step: ProcessStep = 'meta';
  // upload 단계 실패 시 클라이언트가 마크다운을 로컬 다운로드할 수 있도록 outer scope에 보관.
  let producedMarkdown: string | null = null;
  let producedFilename: string | null = null;

  try {
    const meta = await getVideoMeta(videoId);
    if (!meta) {
      send({
        type: 'error',
        videoId,
        step: 'meta',
        message: `videoId "${videoId}"에 해당하는 영상을 찾을 수 없습니다.`,
      });
      return false;
    }

    send({ type: 'start', videoId, title: meta.title });

    step = 'transcript';
    send({ type: 'progress', videoId, step: 'transcript', percent: 10 });
    const transcript = await extractTranscript(videoId);

    step = 'summarize';
    send({ type: 'progress', videoId, step: 'summarize', percent: 40 });
    const noteContext: NoteContext = {
      videoId: meta.videoId,
      title: meta.title,
      channelTitle: meta.channelTitle,
      publishedAt: meta.publishedAt,
      durationSeconds: meta.durationSeconds,
      url: meta.url,
      language: transcript.language,
      category: body.category?.trim() || INBOX_CATEGORY,
      searchQuery: body.searchQuery?.trim() || '',
      processedDate: new Date().toISOString().slice(0, 10),
    };
    const markdown = await summarizeTranscript(transcript.segments, noteContext, template);
    producedMarkdown = markdown;
    producedFilename = generateNoteFilename({
      publishedDate: meta.publishedAt.slice(0, 10),
      channelTitle: meta.channelTitle,
      videoTitle: meta.title,
    });

    step = 'upload';
    // Upload는 Dropbox에 영구 사본을 만드는 유일한 단계라 abort 직전 마지막 방어선을 둔다.
    // 영상별 in-flight 단계가 끝난 직후 cancelled가 발동한 케이스(예: Strict Mode 더블 인보크,
    // 사용자가 요약 끝나갈 무렵 [취소] 클릭)에서 Dropbox 사본을 만들지 않게 한다.
    if (signal.aborted) return false;
    send({ type: 'progress', videoId, step: 'upload', percent: 80 });
    const uploadResult = await uploadNote(markdown, {
      category: body.category,
      searchQuery: body.searchQuery,
      videoTitle: meta.title,
      channelTitle: meta.channelTitle,
      publishedDate: meta.publishedAt.slice(0, 10),
    });

    send({
      type: 'complete',
      videoId,
      filename: uploadResult.filename,
      path: uploadResult.path,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[api/process-batch] step="${step}" videoId="${videoId}":`, error);
    // upload 단계만 마크다운이 이미 완성된 상태 → 다운로드 폴백 동봉. 다른 단계 실패엔 markdown이 없다.
    const fallback =
      step === 'upload' && producedMarkdown && producedFilename
        ? { markdown: producedMarkdown, filename: producedFilename }
        : {};
    send({ type: 'error', videoId, step, message, ...fallback });
    return false;
  }
}

function parseBody(input: unknown): ProcessBatchRequestBody {
  if (!input || typeof input !== 'object') {
    throw new Error('잘못된 요청: JSON 객체 본문이 필요합니다.');
  }
  const obj = input as Record<string, unknown>;

  const rawIds = obj.videoIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new Error('잘못된 요청: videoIds는 비어 있지 않은 배열이어야 합니다.');
  }

  const maxBatch = readMaxBatch();
  if (rawIds.length > maxBatch) {
    throw new Error(`한 번에 ${maxBatch}개까지만 처리할 수 있습니다 (요청: ${rawIds.length}개).`);
  }

  const videoIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    if (typeof raw !== 'string') {
      throw new Error('잘못된 요청: videoIds 항목은 문자열이어야 합니다.');
    }
    const id = raw.trim();
    if (!VIDEO_ID_REGEX.test(id)) {
      throw new Error(`잘못된 videoId 형식입니다: "${raw}"`);
    }
    // 같은 영상이 중복으로 들어오면 한 번만 처리하고 조용히 건너뛴다.
    if (seen.has(id)) continue;
    seen.add(id);
    videoIds.push(id);
  }

  const category = obj.category;
  if (category !== undefined && typeof category !== 'string') {
    throw new Error('잘못된 요청: category는 문자열이어야 합니다.');
  }
  const searchQuery = obj.searchQuery;
  if (searchQuery !== undefined && typeof searchQuery !== 'string') {
    throw new Error('잘못된 요청: searchQuery는 문자열이어야 합니다.');
  }

  return {
    videoIds,
    category: typeof category === 'string' ? category : undefined,
    searchQuery: typeof searchQuery === 'string' ? searchQuery : undefined,
  };
}

function readMaxBatch(): number {
  const raw = process.env.MAX_VIDEOS_PER_BATCH;
  if (!raw) return DEFAULT_MAX_VIDEOS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_VIDEOS;
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
