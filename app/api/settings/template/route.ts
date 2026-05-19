import { NextResponse } from 'next/server';

import { loadTemplateForSettings, saveNoteTemplate } from '@/lib/dropbox/template';

/**
 * GET /api/settings/template
 * 설정 페이지가 활성 노트 양식을 가져올 때 호출.
 * - 응답: `{ content: string, source: 'remote' | 'default' }`
 * - 신규 환경(파일 없음)이면 자동으로 예시 파일까지 Dropbox에 시드하고 `source: 'default'` 반환.
 * - Dropbox 인증/네트워크 실패는 500으로 노출 (사용자가 인지하고 대응할 수 있도록).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await loadTemplateForSettings();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[api/settings/template] GET error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/settings/template
 * 설정 페이지 저장 버튼이 호출. 본문: `{ content: string }`.
 * 빈 문자열/공백만 있는 본문은 400으로 거부 — DEFAULT_TEMPLATE으로 리셋하려면 클라이언트가 직접
 * 기본 양식 문자열을 보내야 한다 (의도가 명시적이게).
 */
export async function PUT(request: Request): Promise<NextResponse> {
  let content: string;
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object' || !('content' in body)) {
      return NextResponse.json(
        { error: '잘못된 요청 본문 — { content: string } 형식이 필요합니다.' },
        { status: 400 },
      );
    }
    const raw = (body as { content: unknown }).content;
    if (typeof raw !== 'string') {
      return NextResponse.json({ error: 'content는 문자열이어야 합니다.' }, { status: 400 });
    }
    content = raw;
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 본문' }, { status: 400 });
  }

  if (content.trim() === '') {
    return NextResponse.json({ error: '템플릿 내용이 비어 있습니다.' }, { status: 400 });
  }

  try {
    await saveNoteTemplate(content);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[api/settings/template] PUT error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
