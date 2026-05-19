import type { MetadataRoute } from 'next';

/**
 * PWA 매니페스트 — Phase 4.7.
 *
 * 홈 화면에 추가하면 standalone 모드로 실행되어 브라우저 UI 없이 앱처럼 동작한다.
 * 아이콘은 같은 폴더의 `icon.svg`(Next.js가 자동으로 `/icon` 경로에 노출)를 가리킨다.
 *
 * `theme_color`/`background_color`는 globals.css의 light 테마 토큰과 같은 값
 * (`oklch(1 0 0)` ≒ #ffffff, `oklch(0.205 0 0)` ≒ #1f1f1f). 사용자가 다크 모드로 진입해도
 * 매니페스트 자체는 라이트 톤 유지 — 앱 내부 색은 CSS의 prefers-color-scheme이 알아서 처리한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YouTube 학습 노트',
    short_name: 'YT 학습 노트',
    description:
      '유튜브 영상을 검색하고 자막을 요약해 옵시디언 보관함(Dropbox)에 마크다운 노트로 저장합니다.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbfbf9',
    theme_color: '#fbfbf9',
    lang: 'ko',
    categories: ['productivity', 'education'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
