import { NextResponse } from 'next/server';

import { INBOX_CATEGORY } from '@/config/categories';
import { summarizeTranscript } from '@/lib/ai/gemini';
import type { NoteContext } from '@/lib/ai/prompts';
import { getNoteTemplate } from '@/lib/dropbox/template';
import { uploadNote } from '@/lib/dropbox/upload';
import { generateNoteFilename } from '@/lib/utils/filename';
import { getVideoMeta } from '@/lib/youtube/search';
import { extractTranscript } from '@/lib/youtube/transcript';

/**
 * POST /api/process
 *
 * 단일 영상을 처리하는 파이프라인 엔드포인트.
 * - 입력: `{ videoId: string, category?: string, searchQuery?: string }`
 * - 흐름: 메타 조회 → 자막 추출 → Gemini 요약 → Dropbox 업로드
 * - 실패 응답에는 어느 단계에서 죽었는지 알려주는 `step` 필드를 포함해
 *   Phase 1.6 dev 페이지에서 디버깅하기 쉽게 한다. Phase 2 정식 UI도 같은 엔드포인트를 사용한다.
 */
type ProcessStep = 'meta' | 'transcript' | 'summarize' | 'upload';

type ProcessRequestBody = {
  videoId: string;
  category?: string;
  searchQuery?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: ProcessRequestBody;
  try {
    body = parseBody(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : '잘못된 요청 본문';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  let step: ProcessStep = 'meta';
  // upload 단계 실패 시 클라이언트가 마크다운을 로컬 다운로드할 수 있도록 outer-scope에 보관.
  let producedMarkdown: string | null = null;
  let producedFilename: string | null = null;

  try {
    const meta = await getVideoMeta(body.videoId);
    if (!meta) {
      throw new Error(`videoId "${body.videoId}"에 해당하는 영상을 찾을 수 없습니다.`);
    }

    step = 'transcript';
    const transcript = await extractTranscript(body.videoId);

    step = 'summarize';
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
    // 사용자 정의 노트 양식 (Phase 4.3). Dropbox에서 읽어오며, 파일 없거나 실패 시 DEFAULT_TEMPLATE로 폴백.
    const template = await getNoteTemplate();
    const markdown = await summarizeTranscript(transcript.segments, noteContext, template);
    producedMarkdown = markdown;
    producedFilename = generateNoteFilename({
      publishedDate: meta.publishedAt.slice(0, 10),
      channelTitle: meta.channelTitle,
      videoTitle: meta.title,
    });

    step = 'upload';
    const uploadResult = await uploadNote(markdown, {
      category: body.category,
      searchQuery: body.searchQuery,
      videoTitle: meta.title,
      channelTitle: meta.channelTitle,
      publishedDate: meta.publishedAt.slice(0, 10),
    });

    return NextResponse.json({
      success: true,
      path: uploadResult.path,
      filename: uploadResult.filename,
      size: uploadResult.size,
      meta: {
        title: meta.title,
        channel: meta.channelTitle,
        duration: meta.duration,
        hasCaption: meta.hasCaption,
      },
      transcript: {
        language: transcript.language,
        segmentCount: transcript.segments.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[api/process] step="${step}" error:`, error);
    const payload: Record<string, unknown> = { success: false, step, error: message };
    // upload 단계 실패만 마크다운이 이미 완성된 상태 → 다운로드 폴백 제공.
    if (step === 'upload' && producedMarkdown && producedFilename) {
      payload.markdown = producedMarkdown;
      payload.filename = producedFilename;
    }
    return NextResponse.json(payload, { status: 500 });
  }
}

function parseBody(input: unknown): ProcessRequestBody {
  if (!input || typeof input !== 'object') {
    throw new Error('잘못된 요청: JSON 객체 본문이 필요합니다.');
  }
  const obj = input as Record<string, unknown>;
  const videoId = obj.videoId;
  if (typeof videoId !== 'string' || videoId.trim() === '') {
    throw new Error('잘못된 요청: videoId는 비어 있지 않은 문자열이어야 합니다.');
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
    videoId: videoId.trim(),
    category: typeof category === 'string' ? category : undefined,
    searchQuery: typeof searchQuery === 'string' ? searchQuery : undefined,
  };
}
