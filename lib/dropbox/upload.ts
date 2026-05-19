/**
 * 옵시디언 노트(.md)를 Dropbox vault에 업로드한다.
 *
 * - SDK(`dropbox`) 대신 네이티브 fetch로 REST 호출 (검색·Gemini 모듈과 같은 결정).
 * - `files/upload` 엔드포인트는 상위 폴더가 없으면 자동 생성하므로 `createFolder` 호출 불필요.
 * - `autorename: true`로 같은 파일명 충돌 시 `(1)`, `(2)`가 자동으로 붙는다.
 *
 * 주의: `Dropbox-API-Arg` 헤더는 ASCII-only JSON이어야 한다. JSON.stringify는 한글을
 * 그대로 두기 때문에 비 ASCII 문자를 수동으로 `\uXXXX`로 이스케이프해야 한국어 카테고리/검색어/제목이 들어간 경로에서도 깨지지 않는다.
 */
import { INBOX_CATEGORY } from '@/config/categories';
import { getDropboxAccessToken } from '@/lib/dropbox/auth';
import { generateNoteFilename } from '@/lib/utils/filename';
import { slugifyForFolder } from '@/lib/utils/slugify';

const DROPBOX_UPLOAD_ENDPOINT = 'https://content.dropboxapi.com/2/files/upload';

export type UploadNoteOptions = {
  category?: string; // 미지정 시 INBOX_CATEGORY 사용
  searchQuery?: string; // 미지정 시 카테고리 폴더에 바로 저장
  videoTitle: string;
  channelTitle: string;
  publishedDate: string; // 'YYYY-MM-DD' 또는 ISO 8601 문자열
};

export type UploadNoteResult = {
  path: string;
  filename: string;
  size: number;
};

type DropboxFileMetadata = {
  name: string;
  path_display: string;
  size: number;
};

type DropboxErrorBody = {
  error_summary?: string;
  error?: { '.tag'?: string };
  user_message?: { text?: string };
};

export async function uploadNote(
  content: string,
  options: UploadNoteOptions,
): Promise<UploadNoteResult> {
  const token = await getDropboxAccessToken();
  const vaultRoot = requireVaultPath();

  const category = options.category?.trim() || INBOX_CATEGORY;
  const querySlug = options.searchQuery ? slugifyForFolder(options.searchQuery) : '';

  const folder = querySlug
    ? `${vaultRoot}/${category}/${querySlug}`
    : `${vaultRoot}/${category}`;
  const filename = generateNoteFilename({
    publishedDate: options.publishedDate,
    channelTitle: options.channelTitle,
    videoTitle: options.videoTitle,
  });
  const targetPath = `${folder}/${filename}`;

  const apiArg = asciiSafeJson({
    path: targetPath,
    mode: 'add',
    autorename: true,
    mute: false,
    strict_conflict: false,
  });

  const response = await fetch(DROPBOX_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': apiArg,
      'Content-Type': 'application/octet-stream',
    },
    body: new TextEncoder().encode(content),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await mapErrorResponse(response, { targetPath, apiArg });
  }

  const metadata = (await response.json()) as DropboxFileMetadata;
  return {
    path: metadata.path_display,
    filename: metadata.name,
    size: metadata.size,
  };
}

/**
 * Dropbox는 `Dropbox-API-Arg` 헤더가 ASCII-only JSON일 것을 요구한다.
 * JSON.stringify의 결과에서 U+0080 이상의 모든 문자를 `\uXXXX`로 이스케이프한다.
 */
function asciiSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[-￿]/g, (ch) => {
    return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

async function mapErrorResponse(
  response: Response,
  context: { targetPath: string; apiArg: string },
): Promise<Error> {
  // 응답을 항상 text로 먼저 읽는다 (400은 JSON이 아닌 plain text로 오는 경우가 잦음).
  const rawText = await response.text();

  // 서버 콘솔에 raw 응답·요청 컨텍스트 남기기 — dev 페이지에서는 첫 에러 메시지만 보이므로 깊은 디버깅용.
  console.error('[dropbox/upload] failure', {
    status: response.status,
    statusText: response.statusText,
    rawBody: rawText,
    targetPath: context.targetPath,
    apiArg: context.apiArg,
  });

  if (response.status === 401) {
    // 정상 흐름이라면 getDropboxAccessToken()이 직전에 새 토큰을 받아왔으므로 이 401은
    // refresh_token이 revoke되었거나 권한(scope)이 부족할 때 주로 발생한다.
    return new Error(
      'Dropbox 인증 실패. refresh_token이 revoke되었거나 권한이 부족할 수 있습니다. scripts/dropbox-exchange-code.mjs로 재발급해주세요.',
    );
  }
  if (response.status === 429) {
    return new Error('Dropbox 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
  }

  let detail = rawText.trim() || response.statusText;
  try {
    const body = JSON.parse(rawText) as DropboxErrorBody;
    detail = body.user_message?.text ?? body.error_summary ?? detail;
  } catch {
    // JSON 파싱 실패 시 raw text 그대로 사용
  }
  return new Error(`Dropbox 업로드 실패 (${response.status}): ${detail}`);
}

function requireVaultPath(): string {
  const raw = process.env.DROPBOX_VAULT_PATH;
  if (!raw) {
    throw new Error('DROPBOX_VAULT_PATH 환경 변수가 설정되어 있지 않습니다 (.env.local 확인).');
  }
  // Dropbox 경로는 '/'로 시작해야 한다. 끝에 슬래시가 있으면 제거.
  const trimmed = raw.replace(/\/+$/, '');
  if (!trimmed.startsWith('/')) {
    throw new Error(
      `DROPBOX_VAULT_PATH는 '/'로 시작해야 합니다 (현재 값: "${raw}"). 예: /Apps/youtube-obsidian-sync/YouTube`,
    );
  }
  return trimmed;
}
