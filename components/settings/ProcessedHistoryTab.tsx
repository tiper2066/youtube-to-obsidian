'use client';

import { ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  clearProcessedVideos,
  getProcessedVideos,
  type ProcessedVideoRecord,
} from '@/lib/utils/processed-videos-storage';

/**
 * "처리 이력" 탭 — Phase 4.6.
 *
 * localStorage `ytobs:processedVideos`에 쌓인 처리 이력을 표시한다. 가장 최근 항목이 위에 오고,
 * "이력 모두 비우기" 버튼으로 전부 삭제 가능 (개별 삭제는 아직 안 만듦 — 필요해지면 추가).
 *
 * 이 탭은 데이터 표시만 하며, 메인 페이지의 "이미 정리됨" 배지와 카테고리 모달의 중복 경고 박스가
 * 같은 storage를 읽는다 — 여기서 이력을 비우면 즉시 모든 표시가 reset된다 (다음 페이지 진입 시).
 */
export function ProcessedHistoryTab() {
  const [records, setRecords] = React.useState<ProcessedVideoRecord[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [confirmingClear, setConfirmingClear] = React.useState(false);

  React.useEffect(() => {
    // localStorage는 클라이언트 전용 — SSR mismatch 회피를 위해 mount 이후 hydrate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords(getProcessedVideos());
    setLoaded(true);
  }, []);

  function handleClearAll(): void {
    if (!confirmingClear) {
      setConfirmingClear(true);
      // 자기 자신을 다시 false로 만드는 timer — 사용자가 한 번 더 누르지 않으면 3초 후 취소.
      window.setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    clearProcessedVideos();
    setRecords([]);
    setConfirmingClear(false);
    toast.success('처리 이력을 모두 비웠습니다.', {
      description: '검색 결과 카드의 "이미 정리됨" 배지도 함께 사라집니다.',
      duration: 6000,
    });
  }

  return (
    <section className='space-y-3'>
      <div>
        <h2 className='font-heading text-lg font-medium'>처리 이력</h2>
        <p className='text-muted-foreground text-sm'>
          이 브라우저에서 정리한 영상의 기록입니다. 검색 결과에 &ldquo;이미 정리됨&rdquo; 배지를
          표시하고, 카테고리 선택 모달의 중복 경고에도 사용됩니다. 같은 영상을 여러 번 처리하면
          이력이 한 줄로 합쳐지며 가장 최근 정보로 갱신됩니다 (최대 500건 보관).
        </p>
      </div>

      {!loaded ? (
        <div className='border-border bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm'>
          이력 불러오는 중…
        </div>
      ) : records.length === 0 ? (
        <p className='text-muted-foreground bg-muted/30 rounded-lg border border-dashed p-4 text-center text-sm'>
          아직 정리한 영상이 없습니다.
        </p>
      ) : (
        <>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-muted-foreground text-xs'>총 {records.length}건</p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleClearAll}
              className={
                confirmingClear
                  ? 'text-destructive border-destructive/40 hover:bg-destructive/10'
                  : ''
              }
            >
              <Trash2Icon />
              {confirmingClear ? '한 번 더 눌러 확정' : '이력 모두 비우기'}
            </Button>
          </div>

          <ul className='space-y-1.5'>
            {records.map((r) => (
              <li
                key={r.videoId}
                className='border-border bg-background flex items-start gap-3 rounded-lg border p-3 text-sm'
              >
                <div className='min-w-0 flex-1'>
                  <a
                    href={`https://www.youtube.com/watch?v=${r.videoId}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:text-primary inline-flex items-start gap-1.5 font-medium'
                  >
                    <span className='line-clamp-2'>{r.title}</span>
                    <ExternalLinkIcon className='text-muted-foreground mt-0.5 size-3.5 shrink-0' />
                  </a>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {r.category}
                    {r.searchQuery && <> · {r.searchQuery}</>} ·{' '}
                    {formatRelativeDate(r.processedAt)}
                  </p>
                  <p className='text-muted-foreground/80 mt-0.5 truncate font-mono text-[11px]'>
                    {r.path}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function formatRelativeDate(iso: string): string {
  // 단순화: YYYY-MM-DD HH:MM 형태로 표시. 사용자 로컬 타임존으로 변환.
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
