# 자주 묻는 질문 / 함정

## Q. 자막이 없는 영상은?

A. Phase 3 MVP에서는 건너뜀. 사용자에게 알림 표시. Whisper API 폴백은 Phase 4 이후 선택 사항.

## Q. 노트가 너무 길어지면?

A. Gemini Flash의 컨텍스트는 충분히 크지만, 매우 긴 자막(2시간+)은 청크 분할 처리. `lib/ai/gemini.ts`에 분할 로직 포함.

## Q. Dropbox 업로드 실패하면?

A. 마크다운을 클라이언트로 반환해서 사용자가 직접 다운로드할 수 있도록 폴백 제공.

## Q. Vercel Hobby 플랜의 함수 실행 시간 제한(10초)에 걸리면?

A. SSE 스트리밍으로 처리 시작 즉시 응답을 시작해 timeout 회피. 영상 1편 처리는 보통 10초 내 완료되지만, 자막이 매우 길면 청크 처리 필요.

## Q. 같은 영상을 두 번 정리하면?

A. Dropbox `autorename: true` 옵션으로 파일명 뒤에 `(1)`, `(2)`가 자동으로 붙음. Phase 4에서 중복 감지 후 사용자에게 확인 UI 추가 예정.

## Q. 검색 결과에 "자막 없음"으로 표시된 영상도 정리되던데?

A. YouTube Data API의 `contentDetails.caption` 필드는 **업로더가 직접 업로드한 공식 자막만** true로 표시한다. YouTube가 자동 생성한 음성 인식 자막은 false다. 하지만 `youtube-transcript` 라이브러리는 자동 자막도 가져오므로, "자막 없음" 영상도 실제로는 처리 가능한 경우가 많다. Phase 2 검색 결과 UI에서는 이 차이를 라벨에 반영하거나 표시를 단순화할 예정 (자세한 내용은 `docs/IMPLEMENTATION_PLAN.md` Phase 1.7 끝의 메모 참조).

## Q. Dropbox 업로드가 400 Bad Request로 실패하면?

A. 대표 두 케이스: (1) 앱에 `files.content.write` scope가 부여되지 않음 — Dropbox 앱 콘솔 Permissions에서 체크 + Submit + **새 access token 재발급**(권한 변경 후 기존 토큰은 이전 권한 그대로) + `.env.local` 갱신 + `npm run dev` 재시작. (2) App folder 모드인데 `DROPBOX_VAULT_PATH`에 `/Apps/{앱이름}/` 접두사를 포함시킴 — App folder 모드는 앱 폴더 내부 기준 경로라 `/YouTube` 같이 짧게 적어야 함. 자세한 에러는 `lib/dropbox/upload.ts`의 `mapErrorResponse`가 서버 콘솔에 raw 응답을 찍어주므로 `npm run dev` 터미널을 확인.

## Q. Gemini API에서 503 / 429가 뜨면?

A. `lib/ai/gemini.ts`가 1초 → 2초 백오프로 최대 2회 자동 재시도한다 (재시도 대상: 429/500/502/503/504). 3번 모두 실패하면 모델 일시 다운이거나 일일 quota 초과 가능성이 크니 몇 분 후 다시 시도하거나, `.env.local`의 `GEMINI_MODEL`을 다른 stable alias (예: `gemini-2.5-flash`)로 바꿔본다.
