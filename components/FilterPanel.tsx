'use client';

import * as React from 'react';

import { DatePicker } from '@/components/ui/date-picker';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SearchOrder, SearchType, VideoDurationFilter } from '@/lib/youtube/types';

export type UploadDatePreset = 'any' | '1w' | '1m' | '6m' | '1y' | 'custom';

export type Filters = {
  uploadDate: UploadDatePreset;
  customDate?: Date;
  videoDuration: VideoDurationFilter;
  type: SearchType;
  order: SearchOrder;
};

export const DEFAULT_FILTERS: Filters = {
  uploadDate: 'any',
  videoDuration: 'any',
  type: 'video',
  order: 'relevance',
};

const UPLOAD_DATE_OPTIONS: Array<{ value: UploadDatePreset; label: string }> = [
  { value: 'any', label: '전체' },
  { value: '1w', label: '1주' },
  { value: '1m', label: '1개월' },
  { value: '6m', label: '6개월' },
  { value: '1y', label: '1년' },
  { value: 'custom', label: '사용자 지정' },
];

const VIDEO_DURATION_OPTIONS: Array<{ value: VideoDurationFilter; label: string }> = [
  { value: 'any', label: '전체' },
  { value: 'short', label: '짧음 (<4분)' },
  { value: 'medium', label: '중간 (4-20분)' },
  { value: 'long', label: '김 (>20분)' },
];

const SEARCH_TYPE_OPTIONS: Array<{ value: SearchType; label: string }> = [
  { value: 'video', label: '동영상' },
  { value: 'playlist', label: '재생목록' },
];

const SEARCH_ORDER_OPTIONS: Array<{ value: SearchOrder; label: string }> = [
  { value: 'relevance', label: '관련도' },
  { value: 'date', label: '최신순' },
  { value: 'viewCount', label: '조회수' },
];

type Props = {
  value: Filters;
  onChange: (filters: Filters) => void;
  disabled?: boolean;
};

/**
 * 검색 필터 패널.
 *
 * - 업로드 날짜는 프리셋(전체/1주/1개월/6개월/1년) + 사용자 지정 캘린더로 구성.
 *   상위 컴포넌트(SearchForm)가 제출 시점에 publishedAfter로 변환한다.
 * - 영상 길이, 타입은 RadioGroup, 정렬은 Select로 표현.
 * - 재생목록(playlist) 타입은 백엔드가 현재 미지원이라 검색 시 명확한 에러를 던지지만,
 *   UI에는 옵션으로 노출만 해 둔다 (Phase 4 확장 대비).
 */
export function FilterPanel({ value, onChange, disabled }: Props) {
  function update<K extends keyof Filters>(key: K, next: Filters[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className='space-y-5'>
      <Field label='업로드 날짜'>
        <RadioGroup<UploadDatePreset>
          value={value.uploadDate}
          onValueChange={(next) => {
            const cleared: Filters = { ...value, uploadDate: next };
            if (next !== 'custom') cleared.customDate = undefined;
            onChange(cleared);
          }}
          disabled={disabled}
        >
          {UPLOAD_DATE_OPTIONS.map((opt) => (
            <RadioGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
        {value.uploadDate === 'custom' && (
          <div className='pt-2'>
            <DatePicker
              value={value.customDate}
              onChange={(next) => update('customDate', next)}
              placeholder='시작 날짜 선택'
              disabled={(date) => date > new Date()}
            />
            <p className='text-muted-foreground pt-1 text-xs'>
              선택한 날짜 이후 업로드된 영상만 검색합니다.
            </p>
          </div>
        )}
      </Field>

      <Field label='영상 길이'>
        <RadioGroup<VideoDurationFilter>
          value={value.videoDuration}
          onValueChange={(next) => update('videoDuration', next)}
          disabled={disabled}
        >
          {VIDEO_DURATION_OPTIONS.map((opt) => (
            <RadioGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </Field>

      <Field label='타입'>
        <RadioGroup<SearchType>
          value={value.type}
          onValueChange={(next) => update('type', next)}
          disabled={disabled}
        >
          {SEARCH_TYPE_OPTIONS.map((opt) => (
            <RadioGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </Field>

      <Field label='정렬'>
        <Select<SearchOrder>
          value={value.order}
          onValueChange={(next) => {
            if (next !== null) update('order', next);
          }}
          disabled={disabled}
        >
          <SelectTrigger className='w-40'>
            <SelectValue>
              {(current) =>
                SEARCH_ORDER_OPTIONS.find((opt) => opt.value === current)?.label ?? '정렬 선택'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SEARCH_ORDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-2'>
      <div className='text-foreground text-xs font-medium tracking-wide uppercase'>{label}</div>
      {children}
    </div>
  );
}
