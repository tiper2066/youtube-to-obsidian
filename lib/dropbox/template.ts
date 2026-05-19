/**
 * Dropbox vault의 `.config/note-template.md` 파일을 읽고 쓰는 헬퍼.
 *
 * 사용자가 설정 페이지(`app/settings/page.tsx`)에서 노트 양식을 편집하면 이 모듈이 Dropbox에
 * 저장하고, 처리 시점(`/api/process`, `/api/process-batch`)에 같은 파일을 읽어 프롬프트 생성에
 * 사용한다. PC와 모바일에서 같은 양식이 공유된다.
 *
 * 파일 위치: `${DROPBOX_VAULT_PATH}/.config/note-template.md` (활성 양식 1개)
 *           `${DROPBOX_VAULT_PATH}/.config/note-template-examples/<slug>.md` (참고용 예시)
 *
 * SDK 대신 네이티브 fetch로 Dropbox API를 호출한다 (`upload.ts`와 같은 결정). `Dropbox-API-Arg`
 * 헤더는 ASCII-only JSON이어야 하므로 `asciiSafeJson`으로 비-ASCII를 `\uXXXX`로 이스케이프한다.
 *
 * 메모리 캐싱은 일부러 두지 않는다 — 사용자가 설정을 바꾸면 다음 처리부터 즉시 반영되어야 하고,
 * 처리 라우트는 처음 1회만 읽기 때문에 batch에서도 부담이 작다.
 */
import {
  DEFAULT_TEMPLATE,
  EXAMPLE_TEMPLATES,
  type NoteTemplateExample,
} from '@/config/note-template';
import { getDropboxAccessToken } from '@/lib/dropbox/auth';

const DROPBOX_DOWNLOAD_ENDPOINT = 'https://content.dropboxapi.com/2/files/download';
const DROPBOX_UPLOAD_ENDPOINT = 'https://content.dropboxapi.com/2/files/upload';

const TEMPLATE_PATH = '.config/note-template.md';
const EXAMPLES_FOLDER = '.config/note-template-examples';

/**
 * 활성 노트 템플릿을 Dropbox에서 읽어온다 — 파이프라인(`/api/process`, `/api/process-batch`)용.
 *
 * 어떤 종류의 실패든 `DEFAULT_TEMPLATE`로 폴백한다 (파일 없음 / 인증 실패 / 네트워크 / rate limit ...).
 * 이유: 노트 양식은 사용자 customization이지 처리 필수 요소가 아니므로, 양식 읽기 실패가
 * 영상 처리 전체를 막아선 안 된다. 인증 문제가 진짜라면 곧이어 `uploadNote` 호출이 같은 401로
 * 실패하면서 사용자가 명확히 인지하게 된다.
 *
 * 설정 페이지처럼 "Dropbox에 저장된 내가 만든 템플릿"을 봐야 하는 곳은 `saveNoteTemplate`이 던지는
 * 에러를 GET API 핸들러가 받아 사용자에게 노출하는 방식으로 분리한다.
 */
export async function getNoteTemplate(): Promise<string> {
  try {
    const vaultRoot = requireVaultPath();
    const path = `${vaultRoot}/${TEMPLATE_PATH}`;
    const content = await downloadTextOrNull(path);
    return content ?? DEFAULT_TEMPLATE;
  } catch (error) {
    console.warn('[dropbox/template] 양식 읽기 실패, DEFAULT_TEMPLATE으로 폴백:', error);
    return DEFAULT_TEMPLATE;
  }
}

/**
 * 설정 페이지용 strict 로더 — Dropbox 실패는 예외로 던져 사용자에게 노출한다.
 * 파일이 없으면 활성/예시 파일을 한 번에 시드한 뒤 `DEFAULT_TEMPLATE`을 `source: 'default'`로 반환.
 * 시드는 신규 환경 첫 진입 시 Dropbox에 예시 파일도 함께 깔리도록 하기 위한 부수 효과.
 */
export async function loadTemplateForSettings(): Promise<{
  content: string;
  source: 'remote' | 'default';
}> {
  const vaultRoot = requireVaultPath();
  const path = `${vaultRoot}/${TEMPLATE_PATH}`;
  const existing = await downloadTextOrNull(path);
  if (existing !== null) {
    return { content: existing, source: 'remote' };
  }
  await seedTemplateFilesIfMissing();
  return { content: DEFAULT_TEMPLATE, source: 'default' };
}

/**
 * 활성 노트 템플릿을 Dropbox에 저장한다. `mode: 'overwrite'`로 항상 덮어쓴다.
 * 처음 호출이면 `.config/` 폴더는 Dropbox가 자동 생성한다.
 */
export async function saveNoteTemplate(content: string): Promise<void> {
  const vaultRoot = requireVaultPath();
  const path = `${vaultRoot}/${TEMPLATE_PATH}`;
  await uploadText(path, content);
}

/**
 * 참고용 예시 템플릿 목록을 반환한다.
 * 코드 상의 `EXAMPLE_TEMPLATES` 그대로. 설정 페이지에서 활성 양식으로 가져오기 버튼이 보여준다.
 */
export function listExampleTemplates(): readonly NoteTemplateExample[] {
  return EXAMPLE_TEMPLATES;
}

/**
 * 초기 시드 — Dropbox에 활성 템플릿과 예시 파일들이 없으면 한 번에 생성한다.
 * 설정 페이지가 처음 열릴 때 호출되어 사용자가 모바일 옵시디언에서도 예시를 바로 볼 수 있게 한다.
 *
 * 이미 존재하는 파일은 건드리지 않는다 — `existsInDropbox`로 확인 후 skip.
 */
export async function seedTemplateFilesIfMissing(): Promise<void> {
  const vaultRoot = requireVaultPath();

  const activePath = `${vaultRoot}/${TEMPLATE_PATH}`;
  if (!(await existsInDropbox(activePath))) {
    await uploadText(activePath, DEFAULT_TEMPLATE);
  }

  for (const example of EXAMPLE_TEMPLATES) {
    const examplePath = `${vaultRoot}/${EXAMPLES_FOLDER}/${example.slug}.md`;
    if (!(await existsInDropbox(examplePath))) {
      await uploadText(examplePath, example.content);
    }
  }
}

async function downloadTextOrNull(path: string): Promise<string | null> {
  const token = await getDropboxAccessToken();
  const apiArg = asciiSafeJson({ path });
  const response = await fetch(DROPBOX_DOWNLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': apiArg,
    },
    cache: 'no-store',
  });

  if (response.status === 409) {
    // 409 + `path/not_found`이 Dropbox의 "파일 없음" 응답. 기타 409는 다른 path 오류일 수 있으나
    // 모두 fallback으로 처리해도 안전 (사용자에겐 DEFAULT_TEMPLATE이 보인다).
    return null;
  }
  if (!response.ok) {
    throw await mapDropboxError(response, { path });
  }
  return response.text();
}

async function uploadText(path: string, content: string): Promise<void> {
  const token = await getDropboxAccessToken();
  const apiArg = asciiSafeJson({
    path,
    mode: 'overwrite',
    autorename: false,
    mute: true,
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
    throw await mapDropboxError(response, { path });
  }
}

/**
 * Dropbox에 파일이 존재하는지 확인한다. 메타데이터 API를 사용.
 * 404(409 + not_found)면 false, 그 외 실패는 throw.
 */
async function existsInDropbox(path: string): Promise<boolean> {
  const token = await getDropboxAccessToken();
  const response = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
    cache: 'no-store',
  });
  if (response.ok) return true;
  if (response.status === 409) {
    // path/not_found 등 path 관련 에러는 모두 "없음"으로 취급.
    await response.text().catch(() => '');
    return false;
  }
  throw await mapDropboxError(response, { path });
}

async function mapDropboxError(response: Response, ctx: { path: string }): Promise<Error> {
  const raw = await response.text().catch(() => '');
  console.error('[dropbox/template] failure', {
    status: response.status,
    statusText: response.statusText,
    rawBody: raw,
    path: ctx.path,
  });
  if (response.status === 401) {
    return new Error(
      'Dropbox 인증 실패. refresh_token이 revoke되었거나 권한이 부족할 수 있습니다. scripts/dropbox-exchange-code.mjs로 재발급해주세요.',
    );
  }
  if (response.status === 429) {
    return new Error('Dropbox 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
  }
  return new Error(`Dropbox 호출 실패 (${response.status}): ${raw.trim() || response.statusText}`);
}

/**
 * Dropbox-API-Arg 헤더는 ASCII-only JSON이어야 한다 (`upload.ts`와 같은 처리).
 * `.config/note-template.md` 경로는 ASCII만이라 사실상 노옵이지만, 추후 한국어 경로 확장에
 * 대비해 동일한 패턴으로 유지.
 */
function asciiSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[-￿]/g, (ch) => {
    return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

function requireVaultPath(): string {
  const raw = process.env.DROPBOX_VAULT_PATH;
  if (!raw) {
    throw new Error('DROPBOX_VAULT_PATH 환경 변수가 설정되어 있지 않습니다 (.env.local 확인).');
  }
  const trimmed = raw.replace(/\/+$/, '');
  if (!trimmed.startsWith('/')) {
    throw new Error(
      `DROPBOX_VAULT_PATH는 '/'로 시작해야 합니다 (현재 값: "${raw}"). 예: /Apps/youtube-obsidian-sync/YouTube`,
    );
  }
  return trimmed;
}
