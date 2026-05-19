/**
 * 사용자 정의 카테고리 목록을 localStorage에 저장하고 읽는 헬퍼 (Phase 4.4).
 *
 * 저장 키: `ytobs:categories` (다른 ytobs:* 키와 같은 prefix)
 * 값: JSON `string[]` — 순서 그대로 카테고리 선택 드롭다운에 노출됨.
 *
 * Dropbox 대신 localStorage를 고른 이유: 카테고리는 PC에서 영상을 처리할 때만 쓰이고 모바일
 * 옵시디언은 결과 노트만 읽으므로 cross-device 동기화 가치가 §4.3 노트 양식보다 훨씬 낮다.
 * 또한 모달 열 때 동기적으로 읽혀 UX가 빠르다.
 *
 * `INBOX_CATEGORY`(`_inbox`)는 항상 시스템이 별도로 다루는 폴백 카테고리라 사용자 목록에서
 * 제외된다 — 추가/삭제 불가하며 모달의 별도 옵션으로 노출됨 (`CategorySelectModal` 참고).
 */
import { DEFAULT_CATEGORIES, INBOX_CATEGORY } from '@/config/categories';

const LS_CATEGORIES = 'ytobs:categories';
const LS_LAST_CATEGORY = 'ytobs:lastCategory';

/** Dropbox 경로에 들어가면 폴더 구조를 깨뜨리는 문자들. */
const INVALID_NAME_CHARS = /[/\\:*?"<>|]/;

export type CategoryValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * 카테고리 이름을 정규화하고 유효성을 검사한다.
 * - 양끝 공백 제거.
 * - 빈 문자열, `_inbox`, 폴더에 못 쓰는 특수문자는 거부.
 * - 중복 검사는 호출자가 한다 (현재 목록에 따라 다르므로).
 */
export function validateCategoryName(raw: string): CategoryValidation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: '카테고리 이름이 비어 있습니다.' };
  }
  if (trimmed === INBOX_CATEGORY) {
    return { ok: false, error: `"${INBOX_CATEGORY}"는 시스템 예약 이름이라 사용할 수 없습니다.` };
  }
  if (INVALID_NAME_CHARS.test(trimmed)) {
    return {
      ok: false,
      error: '카테고리 이름에는 / \\ : * ? " < > | 문자를 사용할 수 없습니다 (Dropbox 폴더 구조 보호).',
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * 저장된 카테고리 목록을 가져온다.
 * - localStorage 가용 불가(서버 사이드/SSR) 또는 키 없음/JSON 손상/배열 아님 → `DEFAULT_CATEGORIES`로 폴백.
 * - 폴백된 결과는 `DEFAULT_CATEGORIES` 배열을 그대로 반환 (readonly로 캐스트).
 */
export function getStoredCategories(): readonly string[] {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  try {
    const raw = window.localStorage.getItem(LS_CATEGORIES);
    if (raw === null) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
    // 비ASCII 안전성·문자열 타입 보장만 검사. 사용자가 직접 localStorage를 손댔거나 이전 버전과의
    // 호환을 위해 손상된 항목은 조용히 거른다.
    const cleaned = parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    return cleaned;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

/**
 * 카테고리 목록을 localStorage에 저장한다.
 * 저장 전 호출자가 모든 항목을 `validateCategoryName`으로 검증하고 중복을 제거해야 한다.
 */
export function saveStoredCategories(categories: readonly string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LS_CATEGORIES, JSON.stringify(categories));
}

/**
 * 사용자 정의 카테고리 저장을 제거해 `DEFAULT_CATEGORIES`로 되돌린다.
 */
export function resetStoredCategories(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LS_CATEGORIES);
}

/**
 * 마지막으로 선택한 카테고리 (`CategorySelectModal`이 다음 번 모달 prefill에 사용).
 * 카테고리 *목록*과는 다른 데이터 — 사용자가 가장 최근에 고른 하나의 값.
 * 저장이 없거나 localStorage 접근 실패 시 `null`.
 */
export function readLastCategory(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LS_LAST_CATEGORY);
  } catch {
    return null;
  }
}

export function writeLastCategory(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_LAST_CATEGORY, value);
  } catch {
    // localStorage 비활성화/quota 초과 등은 조용히 무시 (편의 기능이므로 차단할 이유 없음).
  }
}

/**
 * "기본 카테고리로 되돌리기" 같이 카테고리 환경을 초기화할 때 함께 호출해 다음 모달이
 * stale한 prefill을 띄우지 않도록 한다.
 */
export function clearLastCategory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LS_LAST_CATEGORY);
}
