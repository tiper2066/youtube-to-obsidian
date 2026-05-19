'use client';

import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';

import { CategoriesTab } from '@/components/settings/CategoriesTab';
import { NoteTemplateTab } from '@/components/settings/NoteTemplateTab';
import { ProcessedHistoryTab } from '@/components/settings/ProcessedHistoryTab';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';

/**
 * 설정 페이지 셸.
 *
 * 실제 설정 UI는 탭별로 `components/settings/<Name>Tab.tsx`에 분리되어 있다 — 각 탭은 자기
 * 상태/effect/handler를 자체 보관하므로 탭을 추가/제거할 때 다른 탭에 영향이 가지 않는다.
 * 새 설정이 생기면 (1) `components/settings/`에 `<Name>Tab.tsx` 추가, (2) 아래 `TABS` 배열에
 * 한 줄 추가하면 끝.
 *
 * base-ui Tabs는 비활성 패널을 unmount하지 않고 `hidden`으로 숨긴다 — 탭 전환 시 작성 중인
 * 변경(예: 노트 양식 textarea의 미저장 텍스트)이 유지되어 UX가 자연스럽다. 다만 모든 탭이
 * 초기 mount 시 동시에 fetch/useEffect를 실행하니, 향후 무거운 탭이 생기면 lazy mount를 검토.
 */
const TABS: ReadonlyArray<{ value: string; label: string; Component: React.ComponentType }> = [
  { value: 'categories', label: '카테고리 관리', Component: CategoriesTab },
  { value: 'note-template', label: '노트 양식', Component: NoteTemplateTab },
  { value: 'history', label: '처리 이력', Component: ProcessedHistoryTab },
];

export default function SettingsPage() {
  return (
    <main className='mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 pt-10 pb-16 sm:pt-16'>
      <header className='space-y-3'>
        <Link
          href='/'
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors'
        >
          <ArrowLeftIcon className='size-3.5' />
          검색으로 돌아가기
        </Link>
        <h1 className='text-foreground text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl'>
          설정
        </h1>
        <p className='text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base'>
          영상 정리 흐름과 노트 생성을 제어하는 설정입니다. 탭으로 분리되어 한 번에 한 가지에만
          집중할 수 있습니다.
        </p>
      </header>

      <Tabs defaultValue={TABS[0].value}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTab key={t.value} value={t.value}>
              {t.label}
            </TabsTab>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsPanel key={t.value} value={t.value}>
            <t.Component />
          </TabsPanel>
        ))}
      </Tabs>
    </main>
  );
}
