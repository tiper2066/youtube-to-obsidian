/**
 * 노트 분류에 사용할 기본 카테고리 목록.
 *
 * Phase 4에서 사용자가 UI로 추가/삭제할 수 있게 확장될 예정.
 * 그 전까지는 이 파일을 직접 수정해 카테고리를 늘리거나 줄인다.
 */
export const DEFAULT_CATEGORIES = [
  '프로그래밍',
  '데이터분석',
  'AI-머신러닝',
  '디자인',
  '비즈니스',
  '기타',
] as const;

export type DefaultCategory = (typeof DEFAULT_CATEGORIES)[number];

/** 사용자가 카테고리를 고르지 않았을 때 임시로 들어가는 폴더 이름. */
export const INBOX_CATEGORY = '_inbox';
