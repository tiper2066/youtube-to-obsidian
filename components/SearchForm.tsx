'use client';

import * as React from 'react';
import { SearchIcon, SlidersHorizontalIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_FILTERS, FilterPanel, type Filters } from '@/components/FilterPanel';
import type { SearchParams } from '@/lib/youtube/types';

type Props = {
  onSearch: (params: SearchParams) => void;
  loading?: boolean;
};

/**
 * 메인 검색 폼: 큰 검색 입력창 + 토글 가능한 필터 패널 + 검색 버튼.
 *
 * 폼 자체가 query/filters의 진실 공급원이며, 제출 시 buildSearchParams로
 * YouTube SearchParams 형태로 변환해 onSearch로 넘긴다.
 */
export function SearchForm({ onSearch, loading }: Props) {
  const [query, setQuery] = React.useState('');
  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    onSearch(buildSearchParams(trimmed, filters));
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {/* 모바일은 input을 한 줄 차지하고 두 버튼을 그 아래 row에 두어 검색어 입력 영역을 충분히 확보한다. */}
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          type='text'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='검색어를 입력하세요 (예: 파이썬 데이터 분석 기초)'
          className='h-12 flex-1 text-base'
          disabled={loading}
          autoFocus
        />
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='outline'
            size='lg'
            onClick={() => setFiltersOpen((prev) => !prev)}
            aria-expanded={filtersOpen}
            aria-controls='search-filter-panel'
            className='h-12 flex-1 px-4 sm:flex-initial'
          >
            <SlidersHorizontalIcon />
            필터
          </Button>
          <Button
            type='submit'
            size='lg'
            disabled={loading || !query.trim()}
            className='h-12 flex-1 px-6 sm:flex-initial'
          >
            <SearchIcon />
            {loading ? '검색 중…' : '검색'}
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <div
          id='search-filter-panel'
          className='bg-card animate-in fade-in slide-in-from-top-1 rounded-xl border p-4 shadow-[0_1px_2px_rgba(15,15,15,0.04)] duration-150 sm:p-5'
        >
          <FilterPanel value={filters} onChange={setFilters} disabled={loading} />
        </div>
      )}
    </form>
  );
}

/**
 * Filters → SearchParams 변환. 업로드 날짜 프리셋은 publishedAfter ISO 문자열로 펼친다.
 * 'any' / 기본값은 명시적으로 보내지 않아 API 호출 URL을 깨끗하게 유지한다.
 */
export function buildSearchParams(query: string, filters: Filters): SearchParams {
  return {
    query,
    publishedAfter: derivePublishedAfter(filters),
    videoDuration: filters.videoDuration === 'any' ? undefined : filters.videoDuration,
    type: filters.type === 'video' ? undefined : filters.type,
    order: filters.order === 'relevance' ? undefined : filters.order,
  };
}

function derivePublishedAfter(filters: Filters): string | undefined {
  if (filters.uploadDate === 'any') return undefined;
  if (filters.uploadDate === 'custom') {
    return filters.customDate ? filters.customDate.toISOString() : undefined;
  }
  const now = new Date();
  const target = new Date(now);
  switch (filters.uploadDate) {
    case '1w':
      target.setDate(now.getDate() - 7);
      break;
    case '1m':
      target.setMonth(now.getMonth() - 1);
      break;
    case '6m':
      target.setMonth(now.getMonth() - 6);
      break;
    case '1y':
      target.setFullYear(now.getFullYear() - 1);
      break;
  }
  return target.toISOString();
}
