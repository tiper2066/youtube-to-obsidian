/**
 * 폴더명 / 파일명에 안전하게 쓸 수 있도록 텍스트를 정리한다.
 *
 * 허용 문자: 한글(완성형), 영문, 숫자, 하이픈, 공백(중간에만, 결과적으로 하이픈으로 치환).
 * 그 외 특수문자(콜론, 슬래시, 따옴표 등 OS/Dropbox에서 문제될 수 있는 것들)는 모두 제거.
 *
 * 예: "파이썬 데이터 분석 기초!" → "파이썬-데이터-분석-기초"
 *     "C++ Tips & Tricks"        → "c-tips-tricks"
 */
const FORBIDDEN_CHARS = /[^\w가-힣\s-]/g;
const MULTIPLE_SPACES = /\s+/g;
const MULTIPLE_HYPHENS = /-+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function slugifyForFolder(text: string, maxLength = 50): string {
  return text
    .trim()
    .toLowerCase()
    .replace(FORBIDDEN_CHARS, '')
    .replace(MULTIPLE_SPACES, '-')
    .replace(MULTIPLE_HYPHENS, '-')
    .replace(EDGE_HYPHENS, '')
    .slice(0, maxLength);
}
