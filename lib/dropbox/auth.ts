/**
 * Dropbox refresh_token으로 단기 access_token을 자동 발급/갱신한다.
 *
 * 배경: 2021년 9월부터 Dropbox 신규 앱은 단기(약 4시간) access_token만 발급한다.
 * 콘솔 "Generate access token" 버튼으로 받은 토큰을 .env.local에 직접 넣는 방식은
 * 4시간마다 만료되므로, refresh_token을 한 번 발급받아 두고 호출 직전마다 새
 * access_token으로 교환하는 패턴으로 운영한다.
 *
 * refresh_token 발급은 `scripts/dropbox-exchange-code.mjs` 1회 실행 참조.
 */

const TOKEN_ENDPOINT = 'https://api.dropboxapi.com/oauth2/token';

/** 만료 직전까지 미루지 않도록 5분 여유를 두고 사전 갱신한다. */
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

type CachedToken = {
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
};

let cached: CachedToken | null = null;

export async function getDropboxAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + REFRESH_LEEWAY_MS) {
    return cached.accessToken;
  }

  const refreshToken = requireEnv('DROPBOX_REFRESH_TOKEN');
  const appKey = requireEnv('DROPBOX_APP_KEY');
  const appSecret = requireEnv('DROPBOX_APP_SECRET');

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('[dropbox/auth] refresh failed', { status: response.status, body: detail });
    // refresh_token 자체가 잘못되거나 revoke된 경우는 명확히 안내해서 재발급 유도.
    if (response.status === 400 || response.status === 401) {
      throw new Error(
        'Dropbox refresh_token이 유효하지 않습니다. scripts/dropbox-exchange-code.mjs를 다시 실행해 DROPBOX_REFRESH_TOKEN을 재발급하세요.',
      );
    }
    throw new Error(`Dropbox 토큰 갱신 실패 (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cached.accessToken;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경 변수가 설정되어 있지 않습니다 (.env.local 확인).`);
  }
  return value;
}
