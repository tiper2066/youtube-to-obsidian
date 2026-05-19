'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { SettingsIcon } from 'lucide-react';
import Link from 'next/link';

import { BatchActionBar } from '@/components/BatchActionBar';
import { BatchProgressModal } from '@/components/BatchProgressModal';
import { CategorySelectModal, type CategorySelection } from '@/components/CategorySelectModal';
import { SearchForm } from '@/components/SearchForm';
import { SearchResults, type SearchState } from '@/components/SearchResults';
import { UrlInputCard } from '@/components/UrlInputCard';
import { buttonVariants } from '@/components/ui/button';
import {
  addProcessedVideo,
  findProcessedVideo,
  getProcessedVideoIds,
} from '@/lib/utils/processed-videos-storage';
import { cn } from '@/lib/utils';
import type { SearchParams, VideoSearchResult } from '@/lib/youtube/types';

/** 한 번에 일괄 처리 가능한 최대 영상 개수. 서버측 `MAX_VIDEOS_PER_BATCH` env와 동일한 의미. */
const MAX_VIDEOS_PER_BATCH = 10;

/** 카테고리 모달이 열린 대상. 단일 영상 또는 일괄 선택된 영상 묶음. */
type ProcessingTarget =
  | { kind: 'single'; video: VideoSearchResult }
  | { kind: 'batch'; videos: VideoSearchResult[] };

/** Phase 3.3 — 일괄 처리 모달에 넘기는 활성 batch 정보. */
type ActiveBatch = {
  videos: VideoSearchResult[];
  category: string;
  searchQuery: string;
};

type SearchResponse = {
  count: number;
  results: VideoSearchResult[];
  nextPageToken: string | null;
  prevPageToken: string | null;
  totalResults: number;
  /** 재생목록 검색의 응답에만 채워짐. video 검색이면 null. */
  playlistContext: { playlistId: string; playlistTitle: string } | null;
};

type ProcessStep = 'meta' | 'transcript' | 'summarize' | 'upload';

type ProcessResponse =
  | {
      success: true;
      path: string;
      filename: string;
      size: number;
    }
  | {
      success: false;
      step?: ProcessStep;
      error: string;
      /** upload 단계 실패일 때만 채워짐. 사용자에게 로컬 다운로드 폴백을 제공한다. */
      markdown?: string;
      filename?: string;
    };

const STEP_KOREAN_LABEL: Record<ProcessStep, string> = {
  meta: '메타 조회',
  transcript: '자막 추출',
  summarize: '요약',
  upload: '저장',
};

/** Gemini 응답이 도착하기 전 사용자에게 진행 단계를 추정 표시한다. 실제 단계 전환과 정확히 일치하지는 않지만 평균 응답 시간 기반으로 자연스럽게 흐른다. */
const STEP_TIMELINE: ReadonlyArray<{ delayMs: number; message: string }> = [
  { delayMs: 3000, message: '요약 중…' },
  { delayMs: 22000, message: 'Dropbox 저장 중…' },
];

export default function HomePage() {
  const [state, setState] = React.useState<SearchState>({ kind: 'idle' });
  // 현재 결과 페이지를 만들 때 사용된 SearchParams (필터/정렬 등). prev/next 클릭 시 같은 파라미터에
  // pageToken만 갈아 끼워 재요청하기 위해 보관한다. ref는 setState 직후에도 즉시 읽혀야 하므로 채택.
  const currentSearchRef = React.useRef<SearchParams | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [processingTarget, setProcessingTarget] = React.useState<ProcessingTarget | null>(null);
  const [activeBatch, setActiveBatch] = React.useState<ActiveBatch | null>(null);
  // Phase 4.6 — 이미 처리한 영상의 videoId set. localStorage에서 mount 시 hydrate, 처리 성공 시 추가.
  const [processedVideoIds, setProcessedVideoIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  React.useEffect(() => {
    // localStorage는 클라이언트 전용이라 effect로 hydrate (SSR mismatch 회피).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcessedVideoIds(getProcessedVideoIds());
  }, []);

  /** 단일/일괄 처리 성공 시 호출 — 이력에 저장하고 set state도 즉시 업데이트해 다음 카드 렌더가 반영. */
  function recordProcessed(args: {
    video: VideoSearchResult;
    category: string;
    searchQuery: string;
    path: string;
  }): void {
    addProcessedVideo({
      videoId: args.video.videoId,
      title: args.video.title,
      processedAt: new Date().toISOString(),
      category: args.category,
      searchQuery: args.searchQuery,
      path: args.path,
    });
    setProcessedVideoIds((prev) => {
      if (prev.has(args.video.videoId)) return prev;
      const next = new Set(prev);
      next.add(args.video.videoId);
      return next;
    });
  }

  async function handleSearch(params: SearchParams): Promise<void> {
    // 새 검색은 항상 1페이지부터 시작 — pageToken과 (이전 검색의) playlistId는 명시적으로 제거.
    const freshParams: SearchParams = { ...params, pageToken: undefined, playlistId: undefined };
    currentSearchRef.current = freshParams;
    await runSearch(freshParams, 1);
  }

  /**
   * 페이지 이동 — `direction`이 'next'면 nextPageToken, 'prev'면 prevPageToken으로 같은 검색을 재실행.
   * `currentSearchRef`에 직전 검색 파라미터가 보관되어 있으므로 필터/정렬은 그대로 유지된다.
   * 재생목록 모드(`state.playlistContext`가 있음)면 그 `playlistId`도 함께 보내 백엔드의 search.list
   * 재호출(100 units)을 건너뛴다.
   * 선택 상태(`selectedIds`)는 페이지 이동 시 일관되게 초기화 — 페이지 내부에서만 일괄 처리하는
   * 흐름이 단순하고 `MAX_VIDEOS_PER_BATCH=10` 한도와도 자연스럽게 들어맞는다.
   */
  async function handleChangePage(direction: 'next' | 'prev'): Promise<void> {
    if (state.kind !== 'success' || currentSearchRef.current === null) return;
    const token = direction === 'next' ? state.nextPageToken : state.prevPageToken;
    if (!token) return;
    const nextPageNumber = direction === 'next' ? state.pageNumber + 1 : state.pageNumber - 1;
    const nextParams: SearchParams = {
      ...currentSearchRef.current,
      pageToken: token,
      playlistId: state.playlistContext?.playlistId,
    };
    await runSearch(nextParams, nextPageNumber);
  }

  async function runSearch(params: SearchParams, pageNumber: number): Promise<void> {
    setState({ kind: 'loading', query: params.query, pageNumber });
    // 새 검색/페이지 이동 모두 선택은 초기화하고 진행 중인 모달도 닫는다.
    setSelectedIds(new Set());
    setProcessingTarget(null);
    setActiveBatch(null);
    try {
      const response = await fetch(`/api/search?${buildQueryString(params)}`);
      const data = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(extractMessage(data, `HTTP ${response.status}`));
      }
      const parsed = data as SearchResponse;
      setState({
        kind: 'success',
        query: params.query,
        results: parsed.results,
        pageNumber,
        nextPageToken: parsed.nextPageToken,
        prevPageToken: parsed.prevPageToken,
        totalResults: parsed.totalResults,
        playlistContext: parsed.playlistContext ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setState({ kind: 'error', query: params.query, message });
    }
  }

  function handleProcessClick(video: VideoSearchResult) {
    setProcessingTarget({ kind: 'single', video });
  }

  function handleToggleSelect(videoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
        return next;
      }
      if (next.size >= MAX_VIDEOS_PER_BATCH) {
        toast.warning(`한 번에 ${MAX_VIDEOS_PER_BATCH}개까지만 선택할 수 있습니다.`);
        return prev;
      }
      next.add(videoId);
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (state.kind !== 'success') return;
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      return;
    }
    const eligible = state.results.slice(0, MAX_VIDEOS_PER_BATCH).map((v) => v.videoId);
    setSelectedIds(new Set(eligible));
    if (state.results.length > MAX_VIDEOS_PER_BATCH) {
      toast.info(`${state.results.length}개 중 처음 ${MAX_VIDEOS_PER_BATCH}개만 선택됐습니다.`);
    }
  }

  function handleBatchProcessClick() {
    if (state.kind !== 'success' || selectedIds.size === 0) return;
    const videos = state.results.filter((v) => selectedIds.has(v.videoId));
    if (videos.length === 0) return;
    setProcessingTarget({ kind: 'batch', videos });
  }

  async function handleCategoryConfirm(selection: CategorySelection) {
    const target = processingTarget;
    setProcessingTarget(null);
    if (!target) return;
    if (target.kind === 'single') {
      await processVideo(target.video, selection, ({ path }) => {
        recordProcessed({
          video: target.video,
          category: selection.category,
          searchQuery: selection.subfolder,
          path,
        });
      });
      return;
    }
    // 일괄 처리 — Phase 3.3에서 BatchProgressModal이 /api/process-batch SSE를 소비한다.
    setSelectedIds(new Set());
    setActiveBatch({
      videos: target.videos,
      category: selection.category,
      searchQuery: selection.subfolder,
    });
  }

  const modalSubtitle =
    processingTarget?.kind === 'single'
      ? processingTarget.video.title
      : processingTarget?.kind === 'batch'
        ? `선택된 ${processingTarget.videos.length}개 영상 일괄 정리`
        : undefined;
  const modalKey = !processingTarget
    ? 'closed'
    : processingTarget.kind === 'single'
      ? `single-${processingTarget.video.videoId}`
      : `batch-${processingTarget.videos.map((v) => v.videoId).join(',')}`;

  return (
    <main className='mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 pt-10 pb-28 sm:pt-16'>
      <header className='space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='space-y-2'>
            <span className='border-border bg-card text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium'>
              <span className='bg-primary inline-block size-1.5 rounded-full' />
              YouTube → Obsidian
            </span>
            <h1 className='text-foreground text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl'>
              YouTube 학습 노트
            </h1>
          </div>
          <Link
            href='/settings'
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-mt-1 shrink-0')}
          >
            <SettingsIcon />
            <span className='hidden sm:inline'>설정</span>
          </Link>
        </div>
        <p className='text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base'>
          유튜브 영상을 검색하거나 URL을 붙여 넣으면, 자막을 요약해 옵시디언 보관함에 마크다운
          노트로 저장합니다.
        </p>
      </header>

      {/*
        URL로 직접 정리하는 카드는 검색 흐름 위에 배치한다. 짧은 단축 경로(붙여 넣고 정리 한 번)이라
        먼저 시야에 들어오는 게 자연스럽다. 메타 조회 성공 시 검색 결과 카드의 "정리하기" 버튼과
        동일한 단일 처리 흐름(`handleProcessClick`)으로 그대로 흘려보낸다.
      */}
      <UrlInputCard onVideoReady={handleProcessClick} />

      <SearchForm onSearch={handleSearch} loading={state.kind === 'loading'} />

      <SearchResults
        state={state}
        onProcessClick={handleProcessClick}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        onChangePage={handleChangePage}
        processedVideoIds={processedVideoIds}
      />

      <CategorySelectModal
        key={modalKey}
        open={processingTarget !== null}
        onOpenChange={(open) => {
          if (!open) setProcessingTarget(null);
        }}
        defaultSearchQuery={state.kind === 'idle' ? '' : state.query}
        subtitle={modalSubtitle}
        hasCaption={
          processingTarget?.kind === 'single' ? processingTarget.video.hasCaption : undefined
        }
        alreadyProcessedAt={
          processingTarget?.kind === 'single'
            ? (findProcessedVideo(processingTarget.video.videoId)?.processedAt ?? undefined)
            : undefined
        }
        duplicateInBatchCount={
          processingTarget?.kind === 'batch'
            ? processingTarget.videos.filter((v) => processedVideoIds.has(v.videoId)).length
            : undefined
        }
        onConfirm={handleCategoryConfirm}
      />

      <BatchActionBar
        selectedCount={selectedIds.size}
        maxCount={MAX_VIDEOS_PER_BATCH}
        onClear={() => setSelectedIds(new Set())}
        onProcess={handleBatchProcessClick}
      />

      {activeBatch !== null && (
        <BatchProgressModal
          key={`batch-${activeBatch.videos.map((v) => v.videoId).join(',')}`}
          open
          onOpenChange={(open) => {
            if (!open) setActiveBatch(null);
          }}
          videos={activeBatch.videos}
          category={activeBatch.category}
          searchQuery={activeBatch.searchQuery}
          onVideoComplete={(videoId, info) => {
            const video = activeBatch.videos.find((v) => v.videoId === videoId);
            if (!video) return;
            recordProcessed({
              video,
              category: activeBatch.category,
              searchQuery: activeBatch.searchQuery,
              path: info.path,
            });
          }}
        />
      )}
    </main>
  );
}

function buildQueryString(params: SearchParams): string {
  const qs = new URLSearchParams();
  qs.set('query', params.query);
  if (params.publishedAfter) qs.set('publishedAfter', params.publishedAfter);
  if (params.publishedBefore) qs.set('publishedBefore', params.publishedBefore);
  if (params.videoDuration) qs.set('videoDuration', params.videoDuration);
  if (params.type) qs.set('type', params.type);
  if (params.order) qs.set('order', params.order);
  if (typeof params.maxResults === 'number') qs.set('maxResults', String(params.maxResults));
  if (params.pageToken) qs.set('pageToken', params.pageToken);
  if (params.playlistId) qs.set('playlistId', params.playlistId);
  return qs.toString();
}

function extractMessage(value: unknown, fallback: string): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  ) {
    return (value as { error: string }).error;
  }
  return fallback;
}

/**
 * 단일 영상 처리 흐름. 모달 확정 직후 호출되어 sticky sonner toast로 진행 상황을
 * 보여주고, 응답에 따라 success/error toast로 전환한다.
 *
 * /api/process는 한 번에 모든 단계를 수행하고 최종 결과만 반환하므로, 단계 표시는
 * 평균 응답 시간 기반의 setTimeout 전환으로 추정한다. 응답이 일찍 오면 타이머를
 * 모두 정리한 뒤 곧장 success/error toast로 넘어가서 부자연스러운 잔상을 피한다.
 */
async function processVideo(
  video: VideoSearchResult,
  selection: CategorySelection,
  onSuccess?: (info: { path: string; filename: string }) => void,
): Promise<void> {
  const toastId = toast.loading('자막 추출 중…', {
    description: video.title,
    duration: Infinity,
  });
  const timers = STEP_TIMELINE.map(({ delayMs, message }) =>
    window.setTimeout(() => {
      toast.loading(message, { id: toastId, description: video.title, duration: Infinity });
    }, delayMs),
  );

  try {
    const response = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: video.videoId,
        category: selection.category,
        // 모달의 subfolder는 이미 슬러그화된 값이지만, slugifyForFolder는 idempotent해서
        // 서버에서 한 번 더 통과시켜도 동일한 결과가 나온다.
        searchQuery: selection.subfolder || undefined,
      }),
    });
    const data = (await response.json()) as ProcessResponse;
    timers.forEach(window.clearTimeout);

    if (!response.ok || !data.success) {
      const message = data.success === false ? data.error : `HTTP ${response.status}`;
      const stepPrefix = data.success === false && data.step ? `[${STEP_KOREAN_LABEL[data.step]}] ` : '';
      // upload 실패 + markdown이 응답에 동봉된 경우: 로컬 다운로드 폴백을 액션 버튼으로 제공.
      const fallback =
        data.success === false && data.step === 'upload' && data.markdown && data.filename
          ? { markdown: data.markdown, filename: data.filename }
          : null;
      toast.error('처리 실패', {
        id: toastId,
        description: `${stepPrefix}${message}\n${video.title}`,
        duration: fallback ? 30000 : 12000,
        action: fallback
          ? {
              label: '마크다운 다운로드',
              onClick: () => downloadMarkdown(fallback.filename, fallback.markdown),
            }
          : undefined,
      });
      return;
    }

    toast.success('저장 완료', {
      id: toastId,
      description: `${data.filename}\n${data.path}`,
      duration: 10000,
    });
    onSuccess?.({ path: data.path, filename: data.filename });
  } catch (err) {
    timers.forEach(window.clearTimeout);
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    toast.error('네트워크 오류', {
      id: toastId,
      description: `${message}\n${video.title}`,
      duration: 12000,
    });
  }
}

/** Dropbox 업로드만 실패한 경우의 폴백. 브라우저에서 마크다운을 .md 파일로 직접 다운받게 한다. */
function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
