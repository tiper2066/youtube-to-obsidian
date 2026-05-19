'use client';

import { RotateCcwIcon, SaveIcon, SparklesIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DEFAULT_TEMPLATE, EXAMPLE_TEMPLATES } from '@/config/note-template';
import { cn } from '@/lib/utils';

/**
 * "노트 양식" 탭 — Phase 4.3.
 *
 * 마운트 시 `GET /api/settings/template`으로 Dropbox에 저장된 활성 양식을 가져온다.
 * 파일이 없으면 서버가 DEFAULT_TEMPLATE + 예시 파일들을 자동 시드한다.
 * 큰 textarea에서 양식 본문을 직접 편집한 뒤 "저장"으로 PUT.
 *
 * 양식의 `{{title}}`, `{{categoryTag}}` 플레이스홀더는 처리 시 실제 값으로 치환된다.
 * 하단의 참고 예시(EXAMPLE_TEMPLATES)는 코드에 내장된 상수라 추가 fetch 없이 즉시 렌더.
 * "활성 양식으로 가져오기"를 누르면 textarea 내용이 해당 예시로 교체된다(아직 저장 안 됨).
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; saved: string; source: 'remote' | 'default' }
  | { kind: 'error'; message: string };

const TEXTAREA_CLASS = cn(
  'border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50',
  'min-h-[24rem] w-full rounded-lg border px-3 py-2 font-mono text-sm leading-relaxed outline-none focus-visible:ring-3 transition-colors',
);

export function NoteTemplateTab() {
  const [load, setLoad] = React.useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const response = await fetch('/api/settings/template');
        const data = (await response.json()) as
          | { content: string; source: 'remote' | 'default' }
          | { error: string };
        if (aborted) return;
        if (!response.ok || 'error' in data) {
          const message = 'error' in data ? data.error : `HTTP ${response.status}`;
          setLoad({ kind: 'error', message });
          return;
        }
        setLoad({ kind: 'loaded', saved: data.content, source: data.source });
        setDraft(data.content);
      } catch (err) {
        if (aborted) return;
        const message = err instanceof Error ? err.message : '알 수 없는 오류';
        setLoad({ kind: 'error', message });
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const isDirty = load.kind === 'loaded' && draft !== load.saved;
  const canSave = load.kind === 'loaded' && isDirty && draft.trim() !== '' && !saving;

  async function handleSave(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    const toastId = toast.loading('Dropbox에 저장 중…');
    try {
      const response = await fetch('/api/settings/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        const message = data.error ?? `HTTP ${response.status}`;
        toast.error('저장 실패', { id: toastId, description: message, duration: 12000 });
        return;
      }
      toast.success('저장됨', {
        id: toastId,
        description: 'Dropbox `.config/note-template.md`에 반영됐습니다. 다음 처리부터 적용됩니다.',
        duration: 6000,
      });
      setLoad((prev) =>
        prev.kind === 'loaded' ? { ...prev, saved: draft, source: 'remote' } : prev,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      toast.error('네트워크 오류', { id: toastId, description: message, duration: 12000 });
    } finally {
      setSaving(false);
    }
  }

  function handleResetToDefault(): void {
    setDraft(DEFAULT_TEMPLATE);
    toast.info('기본 양식으로 채웠습니다. 저장 버튼을 눌러야 Dropbox에 반영됩니다.', {
      duration: 6000,
    });
  }

  function handleLoadExample(slug: string): void {
    const example = EXAMPLE_TEMPLATES.find((e) => e.slug === slug);
    if (!example) return;
    setDraft(example.content);
    toast.info(`"${example.name}"을 가져왔습니다. 저장해야 Dropbox에 반영됩니다.`, {
      duration: 6000,
    });
  }

  return (
    <div className='space-y-8'>
      <section className='space-y-3'>
        <div className='flex flex-wrap items-baseline justify-between gap-2'>
          <h2 className='font-heading text-lg font-medium'>활성 양식</h2>
          {load.kind === 'loaded' && (
            <span className='text-muted-foreground text-xs'>
              {load.source === 'remote'
                ? 'Dropbox에서 가져옴'
                : '저장된 양식이 없어 기본 양식이 표시됩니다 — 편집 후 저장하면 Dropbox에 반영됩니다.'}
              {isDirty && (
                <span className='text-amber-600 dark:text-amber-400'> · 변경됨 (저장 안 됨)</span>
              )}
            </span>
          )}
        </div>

        {load.kind === 'loading' && (
          <div className='border-border bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
            Dropbox에서 양식을 가져오는 중…
          </div>
        )}

        {load.kind === 'error' && (
          <div className='rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'>
            양식을 불러오지 못했습니다: {load.message}
          </div>
        )}

        {load.kind === 'loaded' && (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className={TEXTAREA_CLASS}
              aria-label='노트 양식 본문'
            />
            <p className='text-muted-foreground text-xs'>
              플레이스홀더:{' '}
              <code className='bg-muted rounded px-1 py-0.5'>{'{{title}}'}</code> (영상 제목),{' '}
              <code className='bg-muted rounded px-1 py-0.5'>{'{{categoryTag}}'}</code> (해시태그용
              슬러그). 그 외 채널/카테고리/검색어/원본 자막 언어는 프롬프트의 &ldquo;영상
              정보&rdquo; 섹션에서 따로 들어가므로 양식 안에 다시 적지 않아도 됩니다.
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              <Button type='button' onClick={handleSave} disabled={!canSave}>
                <SaveIcon />
                {saving ? '저장 중…' : '저장'}
              </Button>
              <Button type='button' variant='outline' onClick={handleResetToDefault}>
                <RotateCcwIcon />
                기본 양식으로 되돌리기
              </Button>
            </div>
          </>
        )}
      </section>

      <section className='space-y-3'>
        <div>
          <h2 className='font-heading text-lg font-medium'>참고 예시 양식</h2>
          <p className='text-muted-foreground text-sm'>
            아래 예시들도 같은 폴더(
            <code className='bg-muted rounded px-1 py-0.5 text-xs'>
              .config/note-template-examples/
            </code>
            )에 저장되어 있어 옵시디언에서 직접 열어볼 수 있습니다. 마음에 드는 예시를 그대로
            가져와서 활성 양식으로 쓰거나, 일부만 복사해서 직접 조합해도 됩니다.
          </p>
        </div>
        <ul className='space-y-4'>
          {EXAMPLE_TEMPLATES.map((example) => (
            <li
              key={example.slug}
              className='border-border bg-background space-y-2 rounded-lg border p-4'
            >
              <div className='flex flex-wrap items-baseline justify-between gap-2'>
                <div>
                  <h3 className='font-medium'>{example.name}</h3>
                  <p className='text-muted-foreground mt-1 text-xs'>{example.description}</p>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => handleLoadExample(example.slug)}
                  disabled={load.kind !== 'loaded'}
                >
                  <SparklesIcon />
                  활성 양식으로 가져오기
                </Button>
              </div>
              <pre className='bg-muted/50 max-h-72 overflow-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap'>
                {example.content}
              </pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
