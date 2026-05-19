'use client';

import * as React from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { INBOX_CATEGORY } from '@/config/categories';
import {
  getStoredCategories,
  readLastCategory,
  writeLastCategory,
} from '@/lib/utils/categories-storage';
import { slugifyForFolder } from '@/lib/utils/slugify';

const NEW_CATEGORY_SENTINEL = '__new__';
/** UI 미리보기에서만 쓰는 시각적 prefix. 실제 업로드 경로는 서버 측 DROPBOX_VAULT_PATH가 결정한다. */
const PATH_PREVIEW_PREFIX = '/Vault/YouTube';

export type CategorySelection = {
  /** 결정된 카테고리 폴더명. `_inbox` 또는 DEFAULT_CATEGORIES 항목 또는 사용자가 새로 입력한 이름. */
  category: string;
  /** 슬러그화된 하위 폴더명. 빈 문자열이면 카테고리 폴더 바로 아래에 저장한다. */
  subfolder: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 모달을 연 시점의 검색어. 슬러그화해서 하위 폴더 기본값으로 채운다. */
  defaultSearchQuery: string;
  /** 모달 헤더에 표시할 부가 설명. 단일 처리는 영상 제목, 일괄 처리는 "N개 영상 일괄 정리" 형태로 부모가 결정. */
  subtitle?: string;
  /** YouTube가 보고하는 "업로더 직접 제공 자막" 유무. false이면 노란 고지 박스를 띄운다 (자동 자막은 처리 시점에 판별). 일괄 처리에는 보통 undefined로 둔다. */
  hasCaption?: boolean;
  /** Phase 4.6 — 단일 처리 시 이 영상이 이미 정리된 적이 있다면 마지막 처리 시각(ISO). amber 박스로 안내. */
  alreadyProcessedAt?: string;
  /** Phase 4.6 — 일괄 처리 시 선택된 영상 중 이미 정리된 개수. > 0이면 amber 박스로 안내. */
  duplicateInBatchCount?: number;
  onConfirm: (selection: CategorySelection) => void;
};

export function CategorySelectModal({
  open,
  onOpenChange,
  defaultSearchQuery,
  subtitle,
  hasCaption,
  alreadyProcessedAt,
  duplicateInBatchCount,
  onConfirm,
}: Props) {
  // 초기 상태는 useState lazy initializer로 한 번만 계산한다. 정리하기 버튼을 누를 때마다
  // 부모(`app/page.tsx`)가 `key`를 바꿔 이 컴포넌트를 다시 mount 하므로, 매번 새 검색어/마지막
  // 카테고리 선택이 반영된다 (React 19의 `react-hooks/set-state-in-effect` 규칙 회피).
  //
  // Phase 4.4: 카테고리 목록은 더 이상 모듈 상수가 아니라 localStorage에서 읽어오는 사용자 정의
  // 목록이다. mount 시 1회 로드 후 mount 동안 고정 — 사용자가 설정 페이지에서 카테고리를 바꿔도
  // 진행 중인 모달은 그대로 두고, 모달이 다시 열릴 때(부모 key 재변경) 새 목록이 반영된다.
  const categories = React.useMemo(() => getStoredCategories(), []);
  const isKnown = React.useCallback(
    (value: string): boolean => value === INBOX_CATEGORY || categories.includes(value),
    [categories],
  );

  const [categoryValue, setCategoryValue] = React.useState<string>(() => {
    const stored = readLastCategory();
    if (stored === null) return INBOX_CATEGORY;
    if (isKnown(stored)) return stored;
    return NEW_CATEGORY_SENTINEL;
  });
  const [newCategoryText, setNewCategoryText] = React.useState<string>(() => {
    const stored = readLastCategory();
    return stored !== null && !isKnown(stored) ? stored : '';
  });
  const [subfolder, setSubfolder] = React.useState<string>(() =>
    defaultSearchQuery ? slugifyForFolder(defaultSearchQuery) : '',
  );

  const resolvedCategory =
    categoryValue === NEW_CATEGORY_SENTINEL ? newCategoryText.trim() : categoryValue;

  const canConfirm = resolvedCategory.length > 0;

  function handleConfirm() {
    if (!resolvedCategory) return;
    writeLastCategory(resolvedCategory);
    onConfirm({ category: resolvedCategory, subfolder: subfolder.trim() });
    onOpenChange(false);
  }

  const pathPreview = buildPathPreview(resolvedCategory || '카테고리', subfolder);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>카테고리 선택</DialogTitle>
          {subtitle && (
            <DialogDescription className='line-clamp-2'>{subtitle}</DialogDescription>
          )}
        </DialogHeader>

        <div className='space-y-4'>
          {alreadyProcessedAt && (
            <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'>
              이 영상은 {alreadyProcessedAt.slice(0, 10)}에 이미 정리된 적이 있습니다. 다시 처리하면
              Dropbox에 사본(<code className='bg-amber-100 dark:bg-amber-900/40 rounded px-1'>(1)</code>)이
              생성됩니다.
            </div>
          )}

          {typeof duplicateInBatchCount === 'number' && duplicateInBatchCount > 0 && (
            <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'>
              선택한 영상 중 {duplicateInBatchCount}개는 이미 정리된 적이 있습니다. 다시 처리하면
              Dropbox에 사본이 생성됩니다.
            </div>
          )}

          {hasCaption === false && (
            <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'>
              공식 자막이 없는 영상입니다. 자동 자막이 있으면 정상 정리되지만, 자동 자막도 없으면
              자막 추출 단계에서 실패할 수 있습니다.
            </div>
          )}

          <Field label='카테고리'>
            <Select<string>
              value={categoryValue}
              onValueChange={(next) => {
                if (next !== null) setCategoryValue(next);
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue>{(current) => categoryLabel(current)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INBOX_CATEGORY}>나중에 분류 ({INBOX_CATEGORY})</SelectItem>
                <SelectSeparator />
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW_CATEGORY_SENTINEL}>+ 새 카테고리 추가</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {categoryValue === NEW_CATEGORY_SENTINEL && (
            <Field label='새 카테고리 이름'>
              <Input
                value={newCategoryText}
                onChange={(e) => setNewCategoryText(e.target.value)}
                placeholder='예: 데일리 영어'
                autoFocus
              />
              <p className='text-muted-foreground text-xs'>
                이번 세션에서만 사용됩니다. 영구 등록하려면 <code>config/categories.ts</code>에
                추가하세요.
              </p>
            </Field>
          )}

          <Field label='하위 폴더 (선택)'>
            <Input
              value={subfolder}
              onChange={(e) => setSubfolder(e.target.value)}
              placeholder='비우면 카테고리 폴더 바로 아래에 저장'
            />
            <p className='text-muted-foreground text-xs'>
              검색어를 슬러그화한 값이 자동 입력되어 있습니다. 필요하면 수정하세요.
            </p>
          </Field>

          <div className='space-y-1.5'>
            <div className='text-foreground text-xs font-medium tracking-wide uppercase'>
              저장 경로 미리보기
            </div>
            <code className='bg-muted block overflow-x-auto rounded-md px-2.5 py-2 text-xs'>
              {pathPreview}
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            확인하고 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1.5'>
      <div className='text-foreground text-xs font-medium tracking-wide uppercase'>{label}</div>
      {children}
    </div>
  );
}

function categoryLabel(value: string | null): string {
  if (value === null) return '선택';
  if (value === INBOX_CATEGORY) return `나중에 분류 (${INBOX_CATEGORY})`;
  if (value === NEW_CATEGORY_SENTINEL) return '+ 새 카테고리 추가';
  return value;
}

function buildPathPreview(category: string, subfolder: string): string {
  const trimmedSub = subfolder.trim();
  if (trimmedSub) {
    return `${PATH_PREVIEW_PREFIX}/${category}/${trimmedSub}/YYYY-MM-DD_채널명_제목.md`;
  }
  return `${PATH_PREVIEW_PREFIX}/${category}/YYYY-MM-DD_채널명_제목.md`;
}

