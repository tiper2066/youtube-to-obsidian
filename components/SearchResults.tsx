'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ListVideoIcon,
  Loader2Icon,
  SparklesIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/duration';
import type { VideoSearchResult } from '@/lib/youtube/types';

export type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string; pageNumber: number }
  | {
      kind: 'success';
      query: string;
      results: VideoSearchResult[];
      pageNumber: number;
      nextPageToken: string | null;
      prevPageToken: string | null;
      /** YouTube가 보고하는 추정 총 결과수. UI에 "약 N개"로만 표기. */
      totalResults: number;
      /**
       * type='playlist' 검색의 결과일 때만 채워진다. 채워져 있으면:
       * (1) 결과 위에 재생목록 컨텍스트 배너를 표시,
       * (2) 각 VideoCard의 체크박스/정리하기 버튼을 비활성으로 렌더,
       * (3) 부모(`app/page.tsx`)는 페이지 이동 시 `playlistId`를 그대로 전달.
       */
      playlistContext?: { playlistId: string; playlistTitle: string };
    }
  | { kind: 'error'; query: string; message: string };

type SortKey = 'default' | 'title' | 'date' | 'duration' | 'viewCount';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'default', label: '관련도 (기본)' },
  { value: 'title', label: '제목순' },
  { value: 'date', label: '최신순' },
  { value: 'duration', label: '영상 길이' },
  { value: 'viewCount', label: '조회수' },
];

const LANG_LABELS: Record<string, string> = {
  ko: '한국어',
  en: '영어',
  ja: '일본어',
  zh: '중국어',
  unknown: '기타',
};

type Props = {
  state: SearchState;
  onProcessClick: (video: VideoSearchResult) => void;
  /** 일괄 처리용 선택 상태. 부모(`app/page.tsx`)가 소유한다. */
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (videoId: string) => void;
  onToggleSelectAll: () => void;
  /** 페이지 이동 — `direction`에 따라 부모가 nextPageToken/prevPageToken으로 재검색. */
  onChangePage: (direction: 'next' | 'prev') => void;
  /** Phase 4.6 — 이미 정리된 영상의 videoId 집합. 카드에 "이미 정리됨" 배지를 띄운다. */
  processedVideoIds?: ReadonlySet<string>;
};

export function SearchResults({
  state,
  onProcessClick,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onChangePage,
  processedVideoIds,
}: Props) {
  const [sort, setSort] = React.useState<SortKey>('default');

  const sorted = React.useMemo(
    () => (state.kind === 'success' ? sortResults(state.results, sort) : []),
    [state, sort],
  );
  const resultCount = state.kind === 'success' ? state.results.length : 0;

  if (state.kind === 'idle') {
    return (
      <p className='text-muted-foreground text-sm'>
        검색어를 입력하고 검색 버튼을 누르면 결과가 여기에 표시됩니다.
      </p>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Loader2Icon className='size-4 animate-spin' />
        “{state.query}”
        {state.pageNumber > 1 ? ` ${state.pageNumber}페이지 ` : ' '}
        검색 중…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className='border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm'>
        <p className='font-medium'>검색 실패</p>
        <p className='mt-1'>{state.message}</p>
      </div>
    );
  }

  if (resultCount === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        “{state.query}” 검색 결과가 없습니다. 다른 검색어나 필터를 시도해 보세요.
      </p>
    );
  }

  const selectionLabel = selectedIds.size === 0 ? '전체 선택' : '전체 해제';

  const pageNumber = state.pageNumber;
  const totalResults = state.totalResults;
  const startIndex = (pageNumber - 1) * resultCount + 1;
  const endIndex = (pageNumber - 1) * resultCount + resultCount;
  // 재생목록 모드 — 카드의 체크박스/정리하기 버튼 모두 비활성. 사용자 흐름은 "링크로 YouTube 이동 →
  // 영상 URL을 위쪽 URL 입력 카드에 붙여 넣어 정리"라 일괄/단일 처리 컨트롤을 전부 비운다.
  const playlistContext = state.playlistContext;
  const isPlaylistMode = playlistContext !== undefined;

  return (
    <section className='space-y-4'>
      {isPlaylistMode && (
        <div className='flex items-start gap-3 rounded-xl border border-[oklch(0.88_0.04_290)] bg-[oklch(0.97_0.018_290)] p-4 dark:border-[oklch(0.36_0.05_290)] dark:bg-[oklch(0.27_0.02_290)]'>
          <span className='bg-primary/10 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg'>
            <ListVideoIcon className='size-3.5' />
          </span>
          <div className='min-w-0 space-y-1'>
            <p className='text-sm leading-snug font-semibold'>
              <span className='text-muted-foreground font-normal'>재생목록 · </span>
              {playlistContext.playlistTitle}
            </p>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              재생목록의 영상 중 마음에 드는 것의 링크를 열어 YouTube에서 URL을 복사한 뒤, 위쪽
              &ldquo;URL로 직접 정리&rdquo; 카드에 붙여 넣어 정리하세요. 이 화면의 정리하기 버튼은
              비활성됩니다.
            </p>
          </div>
        </div>
      )}
      <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-3'>
        <div className='flex items-center gap-3'>
          <p className='text-sm'>
            <span className='text-foreground font-semibold tabular-nums'>
              {startIndex}–{endIndex}
            </span>
            <span className='text-muted-foreground'>
              {' · '}약 {formatTotalResults(totalResults)}개 중
            </span>
          </p>
          {!isPlaylistMode && (
            <>
              <span className='text-muted-foreground/60'>·</span>
              <Button type='button' variant='ghost' size='sm' onClick={onToggleSelectAll}>
                {selectionLabel}
              </Button>
            </>
          )}
        </div>
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>정렬</span>
          <Select<SortKey>
            value={sort}
            onValueChange={(next) => {
              if (next !== null) setSort(next);
            }}
          >
            <SelectTrigger className='w-36 sm:w-44'>
              <SelectValue>
                {(current) =>
                  SORT_OPTIONS.find((opt) => opt.value === current)?.label ?? '정렬 선택'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ul className='space-y-3'>
        {sorted.map((video, index) => (
          <VideoCard
            key={video.videoId}
            index={startIndex + index}
            video={video}
            selected={selectedIds.has(video.videoId)}
            alreadyProcessed={processedVideoIds?.has(video.videoId) ?? false}
            disabled={isPlaylistMode}
            onToggleSelect={onToggleSelect}
            onProcessClick={onProcessClick}
          />
        ))}
      </ul>

      <PaginationFooter
        pageNumber={pageNumber}
        prevDisabled={state.prevPageToken === null}
        nextDisabled={state.nextPageToken === null}
        onChangePage={onChangePage}
      />
    </section>
  );
}

function PaginationFooter({
  pageNumber,
  prevDisabled,
  nextDisabled,
  onChangePage,
}: {
  pageNumber: number;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onChangePage: (direction: 'next' | 'prev') => void;
}): React.ReactElement | null {
  // 첫 페이지에서 다음 페이지가 없으면(=결과가 한 페이지에 다 들어가면) 푸터 자체를 숨긴다.
  if (pageNumber === 1 && nextDisabled) return null;
  return (
    <nav
      aria-label='검색 결과 페이지'
      className='flex items-center justify-between gap-3 border-t pt-4'
    >
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={prevDisabled}
        onClick={() => onChangePage('prev')}
      >
        <ChevronLeftIcon />
        이전
      </Button>
      <p className='text-muted-foreground text-xs tabular-nums sm:text-sm'>
        <span className='text-foreground font-semibold'>{pageNumber}</span>페이지
      </p>
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={nextDisabled}
        onClick={() => onChangePage('next')}
      >
        다음
        <ChevronRightIcon />
      </Button>
    </nav>
  );
}

type VideoCardProps = {
  index: number;
  video: VideoSearchResult;
  selected: boolean;
  alreadyProcessed: boolean;
  /**
   * 재생목록 모드에서 카드의 액션(체크박스, 정리하기 버튼)을 비활성화. 썸네일/제목 링크는 그대로 클릭 가능 —
   * 사용자는 링크로 YouTube에 들어가 영상을 골라 위쪽 URL 입력 카드로 처리한다.
   */
  disabled?: boolean;
  onToggleSelect: (videoId: string) => void;
  onProcessClick: (video: VideoSearchResult) => void;
};

function VideoCard({
  index,
  video,
  selected,
  alreadyProcessed,
  disabled,
  onToggleSelect,
  onProcessClick,
}: VideoCardProps) {
  return (
    <li
      className={cn(
        'group bg-card flex flex-row items-start gap-3 rounded-xl border p-3 transition-all',
        // 선택된 카드는 primary 보라 톤으로 강조, 그렇지 않으면 hover 시 가벼운 elevation을 준다.
        selected
          ? 'border-primary/40 bg-primary/4 shadow-[0_1px_2px_rgba(15,15,15,0.04)]'
          : 'hover:border-border hover:bg-card hover:shadow-[0_2px_8px_rgba(15,15,15,0.04)]',
      )}
    >
      <Checkbox
        checked={selected}
        disabled={disabled}
        onCheckedChange={() => onToggleSelect(video.videoId)}
        className='mt-2 shrink-0'
        aria-label={`${video.title} 선택`}
      />

      <div className='flex min-w-0 flex-1 flex-col gap-3 sm:flex-row'>
        <a
          href={video.url}
          target='_blank'
          rel='noopener noreferrer'
          className='shrink-0 self-start'
          aria-label={`${video.title} (YouTube에서 열기)`}
        >
          <div className='relative aspect-video w-full overflow-hidden rounded-md bg-black/5 sm:w-40'>
            {video.thumbnailUrl ? (
              <Image
                src={video.thumbnailUrl}
                alt=''
                fill
                sizes='160px'
                className='object-cover'
                unoptimized
              />
            ) : null}
            <span className='absolute right-1 bottom-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium text-white'>
              {formatDuration(video.durationSeconds)}
            </span>
          </div>
        </a>

        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3'>
            <div className='min-w-0 flex-1'>
              <a
                href={video.url}
                target='_blank'
                rel='noopener noreferrer'
                className='hover:text-primary group/title flex items-start gap-1.5 text-sm leading-snug font-medium'
              >
                <span className='text-muted-foreground shrink-0 tabular-nums'>{index}.</span>
                <span className='line-clamp-2'>{video.title}</span>
                <ExternalLinkIcon className='text-muted-foreground mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover/title:opacity-100' />
              </a>
              <div className='text-muted-foreground mt-1 truncate text-xs'>
                {video.channelTitle} · {formatPublishedDate(video.publishedAt)} ·{' '}
                {formatViewCount(video.viewCount)}
              </div>
            </div>
            <Button
              type='button'
              size='sm'
              disabled={disabled}
              onClick={() => onProcessClick(video)}
              className='shrink-0 self-start'
              // 재생목록 모드에서 버튼 자체는 보여 주되 비활성. 카드가 비활성처럼 보이게 하지 않으면
              // 사용자가 왜 안 되는지 혼란스러울 수 있어 일부러 노출.
            >
              <SparklesIcon />
              정리하기
            </Button>
          </div>

          <div className='flex flex-wrap gap-1.5'>
            <Badge>{languageLabel(video.language)}</Badge>
            {video.hasCaption && <Badge variant='success'>공식 자막</Badge>}
            {alreadyProcessed && <Badge variant='warning'>이미 정리됨</Badge>}
          </div>
        </div>
      </div>
    </li>
  );
}

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        variant === 'success'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : variant === 'warning'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

function sortResults(results: VideoSearchResult[], key: SortKey): VideoSearchResult[] {
  if (key === 'default') return results;
  const copy = [...results];
  switch (key) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    case 'date':
      return copy.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    case 'duration':
      return copy.sort((a, b) => b.durationSeconds - a.durationSeconds);
    case 'viewCount':
      return copy.sort((a, b) => b.viewCount - a.viewCount);
  }
}

function formatPublishedDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatTotalResults(count: number): string {
  // YouTube의 `pageInfo.totalResults`는 추정치라 수십만~수백만으로 부정확하게 부풀려질 수 있다.
  // 사용자에게 정확한 숫자를 약속하지 않도록 만 단위 위는 "만"으로 잘라 가볍게 노출.
  if (count >= 10_000) {
    const value = count / 10_000;
    const rounded = value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '');
    return `${rounded}만`;
  }
  return count.toLocaleString('ko-KR');
}

function formatViewCount(count: number): string {
  if (count >= 100_000_000) return `조회수 ${(count / 100_000_000).toFixed(1)}억회`;
  if (count >= 10_000) {
    const value = count / 10_000;
    const rounded = value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '');
    return `조회수 ${rounded}만회`;
  }
  return `조회수 ${count.toLocaleString('ko-KR')}회`;
}

function languageLabel(code: string): string {
  return LANG_LABELS[code] ?? code.toUpperCase();
}
