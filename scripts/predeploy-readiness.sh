#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REQUIRED_KEYS=(
  "MOBILE_MONEY_WEBHOOK_SECRET"
  "NEXT_PUBLIC_SUPABASE_URL"
  "SUPABASE_SERVICE_ROLE_KEY"
)

REQUIRED_MIGRATIONS=(
  "scripts/046_webhook_replay_events.sql"
  "scripts/047_webhook_replay_events_retention.sql"
  "scripts/048_audit_logs_action_occurred_idx.sql"
  "scripts/049_patient_photos_storage_policies.sql"
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

read_env_value_from_file() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  printf "%s" "${line#*=}"
}

is_placeholder_like() {
  local value
  value="$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == *"your_"* || "$value" == *"your-real"* || "$value" == *"actual_value"* || "$value" == *"replace_me"* ]]
}

echo "Checking required environment variables..."
missing=0
warned=0
for key in "${REQUIRED_KEYS[@]}"; do
  value=""
  if [[ -n "${!key-}" ]]; then
    echo "  - $key: present (shell env)"
    value="${!key}"
  elif is_set_in_env_file "$key"; then
    echo "  - $key: present (.env.local)"
    value="$(read_env_value_from_file "$key" || true)"
  else
    echo "  - $key: MISSING"
    missing=1
    continue
  fi

  if [[ -n "$value" ]] && is_placeholder_like "$value"; then
    echo "    warning: $key appears to contain placeholder text."
    warned=1
  fi

  if [[ "$key" == "MOBILE_MONEY_WEBHOOK_SECRET" && -n "$value" && "${#value}" -lt 16 ]]; then
    echo "    warning: MOBILE_MONEY_WEBHOOK_SECRET is short (${#value} chars). Consider >= 32 chars."
    warned=1
  fi
done

echo
echo "Checking required migration files..."
for file in "${REQUIRED_MIGRATIONS[@]}"; do
  if [[ -f "$ROOT_DIR/$file" ]]; then
    echo "  - $file: found"
  else
    echo "  - $file: MISSING"
    missing=1
  fi
done

if [[ "$warned" -ne 0 ]]; then
  echo
  echo "Warning: one or more environment values look unsafe/placeholders."
  echo "Readiness checks will continue, but fix warnings before production deploy."
fi

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Pre-deploy readiness failed: missing required environment variables or migration files."
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
