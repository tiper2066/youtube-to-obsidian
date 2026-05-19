import { notFound } from 'next/navigation';

/**
 * `/dev` 라우트를 개발 환경에서만 노출한다.
 *
 * Phase 1.6에 만든 `app/dev/page.tsx`는 백엔드 모듈(검색·자막·요약·업로드)을 빠르게
 * 검증하기 위한 raw JSON UI다. Phase 2 본격 UI 완성 후에도 디버깅용으로 남겨두지만,
 * 프로덕션(Vercel 배포 등)에서는 노출하지 않는다.
 *
 * `next dev`(NODE_ENV === 'development')에서는 정상 렌더링되고, `next build` 후의
 * 프로덕션 런타임에서는 `notFound()`로 404 처리.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }
  return <>{children}</>;
}
