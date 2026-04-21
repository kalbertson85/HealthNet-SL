#!/usr/bin/env bash
set -euo pipefail

echo "Verifying key rotation environment variables..."

required_vars=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "MOBILE_MONEY_WEBHOOK_SECRET"
  "MOBILE_MONEY_WEBHOOK_HEALTH_TOKEN"
  "SMS_API_KEY"
)

placeholder_pattern='(changeme|replace|example|test|dummy|placeholder)'
missing=()
weak=()

for name in "${required_vars[@]}"; do
  value="${!name-}"
  if [[ -z "${value}" ]]; then
    missing+=("${name}")
    continue
  fi

  if [[ "${#value}" -lt 16 ]]; then
    weak+=("${name}:too_short")
    continue
  fi

  if printf '%s' "${value}" | rg -qi "${placeholder_pattern}"; then
    weak+=("${name}:placeholder_like")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo
  echo "Missing required variables:"
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

if [[ ${#weak[@]} -gt 0 ]]; then
  echo
  echo "Potentially weak or placeholder values detected:"
  printf ' - %s\n' "${weak[@]}"
  exit 1
fi

echo "Key rotation environment verification passed."
