import { NextResponse } from 'next/server';

import { getVideoMeta } from '@/lib/youtube/search';

/**
 * GET /api/video?videoId=<11자>
 *
 * URL 직접 정리 흐름에서 카테고리 모달을 열기 전에 영상 메타(제목/썸네일/길이/자막 유무)를
 * 미리 조회하기 위한 엔드포인트.
 *
 * - 잘못된 형식의 videoId는 400, 존재하지 않거나 비공개/삭제된 영상은 404.
 * - 응답 본문은 `VideoSearchResult` 그대로 (검색 결과 카드와 같은 shape) — 클라이언트가 단일 처리
 *   흐름(`processingTarget = { kind: 'single', video }`)에 그대로 끼워 넣을 수 있다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const videoId = new URL(request.url).searchParams.get('videoId')?.trim();
  if (!videoId) {
    return NextResponse.json(
      { error: '잘못된 요청: videoId 쿼리 파라미터는 필수입니다.' },
      { status: 400 },
    );
  }

  try {
    const meta = await getVideoMeta(videoId);
    if (!meta) {
      return NextResponse.json(
        { error: '해당 영상을 찾을 수 없습니다. 영상이 비공개이거나 삭제됐을 수 있습니다.' },
        { status: 404 },
      );
    }
    return NextResponse.json(meta);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    // getVideoMeta가 던지는 "잘못된 videoId 형식" 메시지는 400, 그 외는 500.
    const status = message.startsWith('잘못된 videoId') ? 400 : 500;
    if (status >= 500) {
      console.error('[api/video] Error:', error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
