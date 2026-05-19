'use client';

import { SparklesIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

type Props = {
  selectedCount: number;
  maxCount: number;
  onClear: () => void;
  onProcess: () => void;
};

/**
 * 검색 결과에서 영상이 1개 이상 선택되었을 때 화면 하단에 고정 노출되는 액션 바.
 *
 * - selectedCount === 0이면 렌더링하지 않는다.
 * - 모바일에서도 같은 위치(하단 고정)를 유지하되, 텍스트와 버튼이 좁아진 너비에 맞춰 줄바꿈된다.
 * - 부모(`app/page.tsx`)는 `<main>`에 충분한 bottom padding(예: `pb-24`)을 주어 이 바가
 *   콘텐츠를 가리지 않도록 한다.
 */
export function BatchActionBar({ selectedCount, maxCount, onClear, onProcess }: Props) {
  if (selectedCount === 0) return null;

  const atMax = selectedCount >= maxCount;

  return (
    <div
      className='supports-backdrop-blur:bg-background/80 bg-background/95 fixed right-0 bottom-0 left-0 z-40 border-t px-4 py-3 shadow-[0_-2px_12px_rgba(15,15,15,0.06)] backdrop-blur-md'
      // iOS PWA(홈 화면에 추가)에서 하단 home indicator 영역만큼 추가 padding을 확보한다.
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className='mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 sm:gap-3'>
        <p className='text-sm'>
          <span className='bg-primary/10 text-primary mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums'>
            {selectedCount}
          </span>
          개 선택됨
          {atMax && <span className='text-muted-foreground ml-1.5'>(최대 {maxCount})</span>}
        </p>
        <div className='flex items-center gap-2'>
          <Button type='button' variant='outline' size='sm' onClick={onClear}>
            전체 해제
          </Button>
          <Button type='button' size='sm' onClick={onProcess}>
            <SparklesIcon />
            <span className='sm:hidden'>{selectedCount}개 정리하기</span>
            <span className='hidden sm:inline'>선택한 {selectedCount}개 정리하기</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
