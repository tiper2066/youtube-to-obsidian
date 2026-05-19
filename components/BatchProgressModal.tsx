'use client';

import { CheckCircle2, DownloadIcon, Loader2, MinusCircle, XCircle } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import type { VideoSearchResult } from '@/lib/youtube/types';

/**
 * Phase 3.3 — 일괄 처리 진행 상황 모달.
 *
 * 부모(`app/page.tsx`)는 새 batch를 시작할 때마다 `key={...}`를 바꿔 이 컴포넌트를
 * 다시 mount 한다 (CategorySelectModal과 동일한 React 19 set-state-in-effect 회피 패턴).
 * mount 직후 useEffect가 /api/process-batch를 POST 요청하고 SSE 스트림을 소비한다.
 *
 * EventSource는 GET-only라 POST body로 videoIds를 보내는 우리 백엔드와 맞지 않는다.
 * 대신 fetch + ReadableStream reader로 `data: <json>\n\n` 블록을 수동 파싱한다.
 */

type StepName = 'meta' | 'transcript' | 'summarize' | 'upload';

const STEP_LABELS: Record<StepName, string> = {
  meta: '메타 조회 중',
  transcript: '자막 추출 중',
  summarize: '요약 중',
  upload: 'Dropbox 저장 중',
};

type VideoStatus =
  | { kind: 'idle' }
  | { kind: 'running'; step: StepName; percent: number }
  | { kind: 'success'; filename: string; path: string }
  | {
      kind: 'error';
      step?: StepName;
      message: string;
      /** upload 단계 실패 시에만 채워진다. 마크다운 다운로드 폴백 (Phase 3.4). */
      markdown?: string;
      filename?: string;
    }
  | { kind: 'canceled' };

type RunStatus =
  | { kind: 'running' }
  | { kind: 'done'; totalSuccess: number; totalFailed: number }
  | { kind: 'canceled' }
  | { kind: 'fatal'; message: string };

/** 백엔드 /api/process-batch가 emit하는 SSE 이벤트와 동일한 타입. */
type ProcessEvent =
  | { type: 'start'; videoId: string; title: string }
  | {
      type: 'progress';
      videoId: string;
      step: 'transcript' | 'summarize' | 'upload';
      percent: number;
    }
  | { type: 'complete'; videoId: string; filename: string; path: string }
  | {
      type: 'error';
      videoId: string;
      step?: StepName;
      message: string;
      /** upload 단계 실패 시 백엔드가 동봉. 마크다운 다운로드 폴백용. */
      markdown?: string;
      filename?: string;
    }
  | { type: 'done'; totalSuccess: number; totalFailed: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videos: VideoSearchResult[];
  category: string;
  /** 슬러그화된 하위폴더명. 빈 문자열이면 카테고리 폴더에 바로 저장. */
  searchQuery: string;
  /** Phase 4.6 — 영상별 처리 성공 시 호출. 부모가 처리 이력에 기록할 수 있도록 정보를 전달. */
  onVideoComplete?: (videoId: string, info: { filename: string; path: string }) => void;
};

export function BatchProgressModal({
  open,
  onOpenChange,
  videos,
  category,
  searchQuery,
  onVideoComplete,
}: Props) {
  const [statuses, setStatuses] = React.useState<Record<string, VideoStatus>>(() => {
    const m: Record<string, VideoStatus> = {};
    for (const v of videos) m[v.videoId] = { kind: 'idle' };
    return m;
  });
  const [run, setRun] = React.useState<RunStatus>({ kind: 'running' });
  const abortRef = React.useRef<AbortController | null>(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    // React Strict Mode 가드 — dev 모드에서 mount useEffect가 두 번 invoke될 때 batch가
    // 두 번 처리되는 버그를 막는다. 정상 cleanup→remount 시퀀스에서 첫 fetch가 abort되어도
    // 서버는 이미 진행 중인 영상의 Dropbox 업로드까지 끝낸 뒤에야 cancelled를 검사하기 때문에
    // 결과적으로 첫 영상이 두 번 업로드되어 `(1)` autorename 사본이 생긴다.
    //
    // 해법: ref 가드로 시작을 1회로 묶고, cleanup에서 abort를 호출하지 않는다.
    // - 사용자 [취소]는 handleCancel이 abortRef.current.abort()로 직접 처리.
    // - 처리 도중 모달이 unmount되는 경우(예: 새 검색)는 매우 드물고, 그땐 서버가 자연 종료될
    //   때까지 처리할 뿐이라 사용자엔 영향 없음 (어차피 새 화면이 노출됨).
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    void startBatch({
      videoIds: videos.map((v) => v.videoId),
      category,
      searchQuery,
      signal: controller.signal,
      onEvent: (event) => {
        applyEvent(event, setStatuses, setRun);
        // 영상별 정리 성공 시 부모(`app/page.tsx`)에 알려 이력에 기록한다. effect는 startedRef
        // 가드로 1회만 실행되므로 이 onVideoComplete 참조는 mount 시점의 값으로 고정되지만,
        // 부모가 onVideoComplete 안에서 참조하는 activeBatch도 batch 동안 변하지 않아 안전하다.
        if (event.type === 'complete') {
          onVideoComplete?.(event.videoId, {
            filename: event.filename,
            path: event.path,
          });
        }
      },
      onFatal: (message) => setRun({ kind: 'fatal', message }),
    });

    // 의도적으로 cleanup을 반환하지 않는다. 위 주석 참고.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRunning = run.kind === 'running';
  const completedCount = Object.values(statuses).filter(
    (s) => s.kind === 'success' || s.kind === 'error' || s.kind === 'canceled',
  ).length;
  const overallPercent = videos.length === 0 ? 0 : (completedCount / videos.length) * 100;

  function handleCancel(): void {
    abortRef.current?.abort();
    setRun({ kind: 'canceled' });
    setStatuses((prev) => {
      const next: Record<string, VideoStatus> = { ...prev };
      for (const [id, status] of Object.entries(prev)) {
        if (status.kind === 'idle' || status.kind === 'running') {
          next[id] = { kind: 'canceled' };
        }
      }
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 처리 중 외부 클릭/ESC로 닫는 것은 차단. 명시적 [취소] 버튼으로만 중단 가능.
        if (!next && isRunning) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-2xl' showCloseButton={!isRunning}>
        <DialogHeader>
          <DialogTitle>일괄 정리 진행 상황</DialogTitle>
          <DialogDescription>
            카테고리: <span className='text-foreground font-medium'>{category}</span>
            {searchQuery ? (
              <>
                {' · '}하위폴더:{' '}
                <span className='text-foreground font-medium'>{searchQuery}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-1.5'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>
              {completedCount} / {videos.length} 완료
            </span>
            <span className='text-muted-foreground tabular-nums'>
              {Math.round(overallPercent)}%
            </span>
          </div>
          <Progress value={overallPercent} />
        </div>

        <ul className='max-h-[60vh] space-y-2 overflow-y-auto pr-1'>
          {videos.map((v) => (
            <li
              key={v.videoId}
              className='border-border bg-background flex items-start gap-3 rounded-xl border p-2.5 transition-colors'
            >
              <div className='bg-muted relative aspect-video w-20 shrink-0 overflow-hidden rounded'>
                {v.thumbnailUrl ? (
                  <Image
                    src={v.thumbnailUrl}
                    alt=''
                    fill
                    unoptimized
                    sizes='80px'
                    className='object-cover'
                  />
                ) : null}
              </div>
              <div className='min-w-0 flex-1 space-y-1'>
                <p className='line-clamp-2 text-sm leading-snug font-medium'>{v.title}</p>
                <StatusLine status={statuses[v.videoId]} />
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          {isRunning ? (
            <Button type='button' variant='outline' onClick={handleCancel}>
              취소
            </Button>
          ) : (
            <div className='flex w-full items-center justify-between gap-3'>
              <p className='text-muted-foreground text-sm'>{summaryLabel(run)}</p>
              <Button type='button' onClick={() => onOpenChange(false)}>
                닫기
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ status }: { status: VideoStatus | undefined }): React.ReactElement {
  if (!status || status.kind === 'idle') {
    return (
      <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
        <span className='bg-muted-foreground/40 h-1.5 w-1.5 rounded-full' />
        대기 중
      </p>
    );
  }
  if (status.kind === 'running') {
    return (
      <div className='space-y-1'>
        <p className='text-foreground/80 flex items-center gap-1.5 text-xs'>
          <Loader2 className='size-3.5 animate-spin' />
          {STEP_LABELS[status.step]}
        </p>
        <Progress value={status.percent} />
      </div>
    );
  }
  if (status.kind === 'success') {
    return (
      <p className='flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400'>
        <CheckCircle2 className='size-3.5 shrink-0' />
        <span className='truncate'>완료 · {status.filename}</span>
      </p>
    );
  }
  if (status.kind === 'canceled') {
    return (
      <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
        <MinusCircle className='size-3.5 shrink-0' />
        취소됨
      </p>
    );
  }
  return (
    <div className='space-y-1'>
      <p className='flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400'>
        <XCircle className='mt-px size-3.5 shrink-0' />
        <span>
          {status.step ? `[${STEP_LABELS[status.step]}] ` : ''}
          {status.message}
        </span>
      </p>
      {status.markdown && status.filename ? (
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-7 gap-1.5 text-xs'
          onClick={() => downloadMarkdown(status.filename!, status.markdown!)}
        >
          <DownloadIcon className='size-3.5' />
          마크다운 다운로드
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Dropbox 업로드만 실패한 경우의 폴백. 브라우저에서 마크다운을 .md 파일로 직접 다운받게 한다.
 * 단일 처리의 `app/page.tsx::downloadMarkdown`과 동일한 패턴.
 */
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

function summaryLabel(run: RunStatus): string {
  if (run.kind === 'done') return `성공 ${run.totalSuccess}건 · 실패 ${run.totalFailed}건`;
  if (run.kind === 'canceled') return '처리가 취소되었습니다.';
  if (run.kind === 'fatal') return `연결 오류: ${run.message}`;
  return '';
}

function applyEvent(
  event: ProcessEvent,
  setStatuses: React.Dispatch<React.SetStateAction<Record<string, VideoStatus>>>,
  setRun: React.Dispatch<React.SetStateAction<RunStatus>>,
): void {
  if (event.type === 'done') {
    setRun({ kind: 'done', totalSuccess: event.totalSuccess, totalFailed: event.totalFailed });
    return;
  }
  setStatuses((prev) => {
    const next = { ...prev };
    switch (event.type) {
      case 'start':
        // meta 단계는 이미 통과한 시점이므로 다음 단계(transcript)를 작은 percent로 미리 표시.
        next[event.videoId] = { kind: 'running', step: 'transcript', percent: 5 };
        break;
      case 'progress':
        next[event.videoId] = { kind: 'running', step: event.step, percent: event.percent };
        break;
      case 'complete':
        next[event.videoId] = {
          kind: 'success',
          filename: event.filename,
          path: event.path,
        };
        break;
      case 'error':
        next[event.videoId] = {
          kind: 'error',
          step: event.step,
          message: event.message,
          markdown: event.markdown,
          filename: event.filename,
        };
        break;
    }
    return next;
  });
}

async function startBatch(args: {
  videoIds: string[];
  category: string;
  searchQuery: string;
  signal: AbortSignal;
  onEvent: (event: ProcessEvent) => void;
  onFatal: (message: string) => void;
}): Promise<void> {
  const { videoIds, category, searchQuery, signal, onEvent, onFatal } = args;
  try {
    const response = await fetch('/api/process-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds, category, searchQuery: searchQuery || undefined }),
      signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      const parsed = tryParseError(text);
      onFatal(parsed || `HTTP ${response.status}`);
      return;
    }
    await consumeSse(response.body, onEvent);
  } catch (err) {
    // 사용자 취소(AbortError)는 fatal로 표시하지 않는다 — handleCancel이 이미 상태를 set한다.
    if (signal.aborted) return;
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    onFatal(message);
  }
}

function tryParseError(text: string): string {
  try {
    const obj = JSON.parse(text) as { error?: unknown };
    if (typeof obj.error === 'string') return obj.error;
  } catch {
    // not JSON
  }
  return text.slice(0, 200);
}

/**
 * SSE 본문을 `data: <json>\n\n` 블록 단위로 잘라 파싱한다.
 * `\n\n` 경계가 chunk 사이에 걸칠 수 있으므로 직전 경계 위치까지만 flush하고
 * 나머지는 다음 chunk와 합쳐서 다시 시도한다.
 */
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ProcessEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) flushEvents(buffer, onEvent);
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const lastBoundary = buffer.lastIndexOf('\n\n');
    if (lastBoundary === -1) continue;
    const processable = buffer.slice(0, lastBoundary + 2);
    buffer = buffer.slice(lastBoundary + 2);
    flushEvents(processable, onEvent);
  }
}

function flushEvents(chunk: string, onEvent: (event: ProcessEvent) => void): void {
  for (const block of chunk.split('\n\n')) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // SSE는 멀티라인 data 라인을 허용한다. 표준대로 줄 단위로 모은 뒤 합친다.
    const dataLines: string[] = [];
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const json = dataLines.join('');
    try {
      const event = JSON.parse(json) as ProcessEvent;
      onEvent(event);
    } catch (err) {
      console.warn('[BatchProgressModal] SSE JSON 파싱 실패:', json, err);
    }
  }
}
