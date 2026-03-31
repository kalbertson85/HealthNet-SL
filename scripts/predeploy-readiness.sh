#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REQUIRED_KEYS=(
  "MOBILE_MONEY_WEBHOOK_SECRET"
  "NEXT_PUBLIC_SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY"
)

ENV_FILE="$ROOT_DIR/.env.local"

is_set_in_env_file() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  local pattern="^[[:space:]]*${key}=.+$"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern" "$ENV_FILE"
  else
    grep -Eq "$pattern" "$ENV_FILE"
  fi
}

echo "Checking required environment variables..."
missing=0
for key in "${REQUIRED_KEYS[@]}"; do
  if [[ -n "${!key-}" ]]; then
    echo "  - $key: present (shell env)"
    continue
  fi

  if is_set_in_env_file "$key"; then
    echo "  - $key: present (.env.local)"
    continue
  fi

  echo "  - $key: MISSING"
  missing=1
done

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Pre-deploy readiness failed: missing required environment variables."
  exit 1
fi

echo
echo "Running test suite..."
npm test -- --run

echo
echo "Running production build..."
npm run build

echo
echo "Pre-deploy readiness check PASSED."
