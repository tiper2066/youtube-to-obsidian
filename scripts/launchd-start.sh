#!/usr/bin/env bash
# launchd가 호출하는 진입점. macOS 로그인 시 자동으로 `npm run start`를 띄우기 위한 wrapper.
#
# launchd는 사용자의 셸 rc(.zshrc 등)를 읽지 않으므로 nvm을 직접 source해 node 환경을 구성한다.
# 이 스크립트 자체의 위치를 기준으로 PROJECT_DIR을 계산하기 때문에 어디서 체크아웃했든 그대로 동작.
#
# 동작:
# 1. PROJECT_DIR 계산 (이 스크립트 위치의 한 단계 상위)
# 2. nvm 로드 후 .nvmrc(있으면) / nvm default 노드 활성화
# 3. `.next` 빌드 산출물이 없으면 먼저 `npm run build`
# 4. `npm run start`로 프로덕션 모드 서버 실행
#
# 로그는 plist의 StandardOutPath / StandardErrorPath로 흘러간다.

set -eo pipefail

# 스크립트 자기 위치 → 프로젝트 루트
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# ── nvm 로드 ─────────────────────────────────────────────────────────────────
# 사용자가 nvm으로 node를 관리한다는 가정. Homebrew/system node를 쓰는 환경이면 이 블록을 통째로
# 제거하고 plist의 EnvironmentVariables.PATH에 해당 node 위치를 추가하면 된다.
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
else
  echo "[$(date '+%F %T')] nvm을 찾지 못했습니다 (\$NVM_DIR/$NVM_DIR/nvm.sh)" >&2
  exit 1
fi

# .nvmrc가 있으면 그 버전, 아니면 default. nvm use는 자동 install을 안 하므로 미설치 버전이면 실패한다.
if [ -f .nvmrc ]; then
  nvm use --silent
else
  nvm use --silent default
fi

# ── 빌드 산출물 확인 ───────────────────────────────────────────────────────────
# .next가 없으면 첫 실행이거나 사용자가 의도적으로 정리한 상태 — 자동 빌드로 복구.
if [ ! -d .next ]; then
  echo "[$(date '+%F %T')] .next 디렉토리 없음 — npm run build 실행"
  npm run build
fi

# ── 프로덕션 서버 시작 ─────────────────────────────────────────────────────────
echo "[$(date '+%F %T')] npm run start (port 3000)"
exec npm run start
