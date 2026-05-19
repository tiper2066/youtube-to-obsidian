'use client';

import { LinkIcon, SparklesIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { extractVideoId } from '@/lib/youtube/parseUrl';
import type { VideoSearchResult } from '@/lib/youtube/types';

type Props = {
  /** 메타 조회 성공 시 호출. 부모(app/page.tsx)가 단일 처리 흐름에 video를 끼워 넣는다. */
  onVideoReady: (video: VideoSearchResult) => void;
};

/**
 * "URL로 직접 정리" 카드 — 검색 흐름과 별개로 영상 URL을 붙여 넣고 바로 정리한다.
 *
 * 동작:
 * 1. 클라이언트에서 `extractVideoId`로 URL/ID 형식을 즉시 검증 (잘못되면 toast 후 종료)
 * 2. `GET /api/video?videoId=...`로 메타 조회 (loading 상태로 버튼 비활성)
 * 3. 성공 시 `onVideoReady(video)` 호출 → 부모가 `CategorySelectModal`을 단일 모드로 연다
 *
 * 검색 흐름이 main, 이 카드는 보조이므로 시각적으로 가볍게 (작은 헤더 + 1줄 입력 + 1개 버튼).
 * 모바일에선 입력과 버튼이 column으로 스택된다.
 */
export function UrlInputCard({ onVideoReady }: Props) {
  const [value, setValue] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (loading) return;
    const videoId = extractVideoId(value);
    if (!videoId) {
      toast.error('URL 형식을 확인해 주세요.', {
        description: '예: https://www.youtube.com/watch?v=… 또는 https://youtu.be/…',
      });
      return;
    }

    setLoading(true);
    const toastId = toast.loading('영상 정보 조회 중…');
    try {
      const response = await fetch(`/api/video?videoId=${encodeURIComponent(videoId)}`);
      const data = (await response.json()) as VideoSearchResult | { error: string };
      if (!response.ok || 'error' in data) {
        const message =
          'error' in data ? data.error : `영상 정보를 가져오지 못했습니다 (HTTP ${response.status})`;
        toast.error('조회 실패', { id: toastId, description: message, duration: 10000 });
        return;
      }
      toast.dismiss(toastId);
      onVideoReady(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      toast.error('네트워크 오류', { id: toastId, description: message, duration: 10000 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      // DESIGN.md의 `card-tint-lavender` 무드 — Notion 보라 액센트와 어울리는 부드러운 라벤더 표면으로
      // 검색 흐름과 보조 흐름을 시각적으로 분리한다. 라이트/다크 모두 채도를 낮춰 noise를 줄임.
      className='space-y-3 rounded-xl border border-[oklch(0.88_0.04_290)] bg-[oklch(0.97_0.018_290)] p-4 dark:border-[oklch(0.36_0.05_290)] dark:bg-[oklch(0.27_0.02_290)] sm:p-5'
    >
      <div className='flex items-center gap-2'>
        <span className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg'>
          <LinkIcon className='size-3.5' />
        </span>
        <div className='min-w-0'>
          <h2 className='text-sm leading-none font-semibold'>URL로 직접 정리</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            유튜브 영상 URL이나 11자 영상 ID를 붙여 넣으면 검색 없이 바로 정리할 수 있습니다.
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className='flex flex-col gap-2 sm:flex-row'>
        <Input
          type='text'
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='https://www.youtube.com/watch?v=…'
          className='bg-background h-11 flex-1'
          disabled={loading}
          inputMode='url'
          autoComplete='off'
          spellCheck={false}
        />
        <Button type='submit' disabled={loading || value.trim() === ''} className='h-11 px-5'>
          <SparklesIcon />
          {loading ? '조회 중…' : '정리하기'}
        </Button>
      </form>
    </section>
  );
}
