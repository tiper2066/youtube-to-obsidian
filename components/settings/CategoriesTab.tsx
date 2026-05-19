'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  XIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_CATEGORIES } from '@/config/categories';
import {
  clearLastCategory,
  getStoredCategories,
  resetStoredCategories,
  saveStoredCategories,
  validateCategoryName,
} from '@/lib/utils/categories-storage';

/**
 * "카테고리 관리" 탭 — Phase 4.4.
 *
 * localStorage `ytobs:categories`에 저장된 카테고리 목록을 편집한다. 각 행은 inline 이름 편집 +
 * ▲/▼/✕ 버튼, 하단에 새 카테고리 추가 input. "저장"이 호출되면 검증 후 localStorage에 반영,
 * "기본 카테고리로 되돌리기"는 사용자 정의 목록과 `ytobs:lastCategory`를 모두 비운다.
 *
 * 설정 페이지의 다른 탭과 격리된 상태(이 컴포넌트만의 useState)로 관리되어 탭 추가 시 영향이 없다.
 */

type CategoryDraftEntry = { id: string; name: string };

function newClientId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function CategoriesTab() {
  const [categoriesDraft, setCategoriesDraft] = React.useState<CategoryDraftEntry[]>([]);
  const [categoriesSnapshot, setCategoriesSnapshot] = React.useState<readonly string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = React.useState('');
  const [categoriesLoaded, setCategoriesLoaded] = React.useState(false);

  React.useEffect(() => {
    // localStorage는 클라이언트에서만 접근 가능하므로 mount 이후 1회 hydration 한다.
    // `useState` lazy initializer로 옮기면 SSR 시 빈 배열을 그리고 hydrate 시 다른 값으로 갱신해
    // hydration mismatch가 발생한다. `useSyncExternalStore` 대안도 검토했지만 ID가 붙은 draft
    // 항목을 다루기 어려워 의도적으로 set-state-in-effect 패턴을 사용한다.
    const stored = getStoredCategories();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategoriesSnapshot(stored);
    setCategoriesDraft(stored.map((name) => ({ id: newClientId(), name })));
    setCategoriesLoaded(true);
  }, []);

  const isDirty =
    categoriesDraft.length !== categoriesSnapshot.length ||
    categoriesDraft.some((entry, i) => entry.name.trim() !== categoriesSnapshot[i]);

  function handleRenameInDraft(id: string, name: string): void {
    setCategoriesDraft((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  }

  function handleMoveCategory(id: string, direction: -1 | 1): void {
    setCategoriesDraft((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function handleRemoveFromDraft(id: string): void {
    setCategoriesDraft((prev) => prev.filter((e) => e.id !== id));
  }

  function handleAddCategory(): void {
    const validation = validateCategoryName(newCategoryInput);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    const name = validation.value;
    if (categoriesDraft.some((e) => e.name.trim() === name)) {
      toast.error(`이미 "${name}" 카테고리가 있습니다.`);
      return;
    }
    setCategoriesDraft((prev) => [...prev, { id: newClientId(), name }]);
    setNewCategoryInput('');
  }

  function handleSaveCategories(): void {
    const cleaned: string[] = [];
    for (const entry of categoriesDraft) {
      const validation = validateCategoryName(entry.name);
      if (!validation.ok) {
        toast.error(`"${entry.name}": ${validation.error}`);
        return;
      }
      if (cleaned.includes(validation.value)) {
        toast.error(`중복 카테고리: "${validation.value}"`);
        return;
      }
      cleaned.push(validation.value);
    }
    saveStoredCategories(cleaned);
    setCategoriesSnapshot(cleaned);
    // 이름이 trim 등으로 정규화됐을 수 있으므로 표시 값도 동기화 (key는 유지해서 re-mount 회피).
    setCategoriesDraft((prev) =>
      prev.map((entry, i) => ({ ...entry, name: cleaned[i] ?? entry.name })),
    );
    toast.success('카테고리 저장됨', {
      description: '다음 정리하기 모달부터 새 목록이 반영됩니다.',
      duration: 6000,
    });
  }

  function handleResetCategoriesToDefault(): void {
    resetStoredCategories();
    // 함께 `ytobs:lastCategory`도 비운다 — 옛 사용자 정의 카테고리가 다음 모달에 stale prefill로
    // 떠올라 사용자가 의도치 않게 같은 폴더에 재저장하는 케이스를 막는다.
    clearLastCategory();
    const defaults = [...DEFAULT_CATEGORIES];
    setCategoriesSnapshot(defaults);
    setCategoriesDraft(defaults.map((name) => ({ id: newClientId(), name })));
    setNewCategoryInput('');
    toast.success('기본 카테고리로 초기화했습니다.', {
      description: '사용자 정의 카테고리 목록과 마지막 선택 기록을 모두 비웠습니다.',
      duration: 6000,
    });
  }

  return (
    <section className='space-y-3'>
      <div>
        <h2 className='font-heading text-lg font-medium'>카테고리 관리</h2>
        <p className='text-muted-foreground text-sm'>
          카테고리는 영상 정리 시 폴더 분류에 쓰입니다. 추가/이름 변경/순서 변경/삭제 후 저장하면
          다음에 열리는 카테고리 선택 모달부터 새 목록이 반영됩니다.{' '}
          <span className='text-muted-foreground/80'>
            이름을 바꿔도 기존 Dropbox 폴더는 자동으로 옮겨지지 않습니다 — 이전 노트는 옛 이름 폴더에
            그대로 있고, 새 정리부터 새 이름 폴더가 생성됩니다.
          </span>
        </p>
      </div>

      {!categoriesLoaded ? (
        <div className='border-border bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm'>
          카테고리 불러오는 중…
        </div>
      ) : categoriesDraft.length === 0 ? (
        <p className='text-muted-foreground bg-muted/30 rounded-lg border border-dashed p-4 text-center text-sm'>
          카테고리가 비어 있습니다. 아래에서 추가하거나 &ldquo;기본 카테고리로 되돌리기&rdquo;를
          누르세요.
        </p>
      ) : (
        <ul className='space-y-1.5'>
          {categoriesDraft.map((entry, i) => (
            <li key={entry.id} className='flex items-center gap-1.5'>
              <Input
                value={entry.name}
                onChange={(e) => handleRenameInDraft(entry.id, e.target.value)}
                aria-label={`카테고리 ${i + 1} 이름`}
                className='flex-1'
              />
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                disabled={i === 0}
                onClick={() => handleMoveCategory(entry.id, -1)}
                aria-label='위로 이동'
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                disabled={i === categoriesDraft.length - 1}
                onClick={() => handleMoveCategory(entry.id, 1)}
                aria-label='아래로 이동'
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type='button'
                variant='outline'
                size='icon-sm'
                onClick={() => handleRemoveFromDraft(entry.id)}
                aria-label='삭제'
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddCategory();
        }}
        className='flex items-center gap-1.5'
      >
        <Input
          value={newCategoryInput}
          onChange={(e) => setNewCategoryInput(e.target.value)}
          placeholder='새 카테고리명'
          aria-label='새 카테고리명'
          className='flex-1'
        />
        <Button type='submit' variant='outline' disabled={!categoriesLoaded}>
          <PlusIcon />
          추가
        </Button>
      </form>

      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          onClick={handleSaveCategories}
          disabled={!isDirty || !categoriesLoaded}
        >
          <SaveIcon />
          저장
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={handleResetCategoriesToDefault}
          disabled={!categoriesLoaded}
        >
          <RotateCcwIcon />
          기본 카테고리로 되돌리기
        </Button>
        {isDirty && (
          <span className='text-xs text-amber-600 dark:text-amber-400'>변경됨 (저장 안 됨)</span>
        )}
      </div>
    </section>
  );
}
