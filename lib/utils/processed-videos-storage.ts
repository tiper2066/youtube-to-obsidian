/**
 * 정리(처리) 완료된 영상의 이력을 localStorage에 보관 (Phase 4.6).
 *
 * 저장 키: `ytobs:processedVideos` — JSON 배열, 최신 항목이 맨 앞.
 *
 * 용도:
 *   - 검색 결과 카드에 "이미 정리됨" 배지를 노출해 사용자가 처리 전에 인지하게 한다.
 *   - 카테고리 선택 모달에서 중복 처리 경고(단일 영상 처리 날짜 / 일괄 처리 시 중복 개수) 표시.
 *   - 설정 페이지의 "처리 이력" 탭에서 최근 정리한 영상 목록을 보고 필요 시 비울 수 있게 한다.
 *
 * 중복 정책: 같은 videoId가 두 번 정리되면 **기존 항목을 새 정보로 교체**(맨 앞으로 이동). 사본
 * 생성 자체를 막진 않는다(autorename 동작은 Dropbox가 처리). 이력 항목은 한 videoId당 1개로 유지.
 *
 * 무한 성장 방지: `MAX_HISTORY=500`을 넘으면 오래된 항목부터 제거. 개인 학습용 앱이라 일반적으로
 * 도달할 일은 없지만 안전 장치로 둔다.
 */

const LS_PROCESSED_VIDEOS = 'ytobs:processedVideos';
const MAX_HISTORY = 500;

export type ProcessedVideoRecord = {
  videoId: string;
  title: string;
  /** ISO 8601 timestamp — 이력에 마지막으로 추가/갱신된 시각. */
  processedAt: string;
  /** 정리 시 선택된 카테고리 폴더명. */
  category: string;
  /** 정리 시 사용된 검색어 슬러그 (하위 폴더). 빈 문자열 가능. */
  searchQuery: string;
  /** Dropbox `path_display`. 마지막으로 업로드된 노트의 위치. */
  path: string;
};

/**
 * 저장된 이력 전체를 반환. 가장 최근 항목이 인덱스 0.
 * localStorage 가용 불가/JSON 손상/배열 아님 시 빈 배열로 폴백.
 */
export function getProcessedVideos(): ProcessedVideoRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_PROCESSED_VIDEOS);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecord);
  } catch {
    return [];
  }
}

/**
 * `getProcessedVideos`의 videoId만 빠르게 lookup하려고 추출한 Set.
 * "이미 정리됨" 배지 표시 등 다수 카드를 동시에 검사할 때 O(1)로 조회 가능.
 */
export function getProcessedVideoIds(): Set<string> {
  return new Set(getProcessedVideos().map((r) => r.videoId));
}

/**
 * 한 영상의 정리 이력을 추가하거나 갱신한다. 같은 videoId가 이미 있으면 기존 항목을 제거하고
 * 새 record를 맨 앞에 넣는다 (= 가장 최근에 처리된 것이 위로).
 */
export function addProcessedVideo(record: ProcessedVideoRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getProcessedVideos();
    const filtered = current.filter((r) => r.videoId !== record.videoId);
    const next = [record, ...filtered].slice(0, MAX_HISTORY);
    window.localStorage.setItem(LS_PROCESSED_VIDEOS, JSON.stringify(next));
  } catch {
    // localStorage 비활성화/quota 초과 등은 조용히 무시 — 이력은 편의 기능이라 차단할 이유 없음.
  }
}

/**
 * 특정 videoId의 이력 record를 찾는다 (없으면 null). 카테고리 모달에서 마지막 처리 날짜 표시 등에 사용.
 */
export function findProcessedVideo(videoId: string): ProcessedVideoRecord | null {
  return getProcessedVideos().find((r) => r.videoId === videoId) ?? null;
}

/**
 * 이력 전체를 비운다. 설정 페이지의 "이력 비우기" 버튼이 호출.
 */
export function clearProcessedVideos(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LS_PROCESSED_VIDEOS);
}

function isValidRecord(value: unknown): value is ProcessedVideoRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.videoId === 'string' &&
    typeof r.title === 'string' &&
    typeof r.processedAt === 'string' &&
    typeof r.category === 'string' &&
    typeof r.searchQuery === 'string' &&
    typeof r.path === 'string'
  );
}
