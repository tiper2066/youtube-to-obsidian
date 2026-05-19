import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

/*
 * Pretendard Variable은 [app/globals.css]에서 CDN @import로 로드한다 (영문+한글 dynamic-subset).
 * next/font를 쓰지 않는 이유: Pretendard는 Google Fonts에 없고 로컬 woff2 파일을 직접 관리하기보다
 * 잘 관리된 jsdelivr CDN을 그대로 활용하는 게 의존성 관리 측면에서 가볍기 때문.
 */

export const metadata: Metadata = {
  title: 'YouTube 학습 노트',
  description:
    '유튜브 영상을 검색하고 자막을 요약해 옵시디언 보관함(Dropbox)에 마크다운 노트로 저장합니다.',
  applicationName: 'YouTube 학습 노트',
  appleWebApp: {
    capable: true,
    title: 'YT 학습 노트',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    // globals.css의 light/dark `--background`와 시각적으로 같은 값. 16진수로 굳혀서 매니페스트와 정합.
    { media: '(prefers-color-scheme: light)', color: '#fbfbf9' },
    { media: '(prefers-color-scheme: dark)', color: '#2b2926' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='ko' className='h-full antialiased' suppressHydrationWarning>
      <body className='flex min-h-full flex-col font-sans' suppressHydrationWarning>
        {children}
        <Toaster position='top-center' richColors />
      </body>
    </html>
  );
}
