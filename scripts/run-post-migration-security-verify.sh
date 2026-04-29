#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${1:-scripts/086_post_migration_security_verification.sql}"
DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

if [[ -z "${DB_URL}" ]]; then
  echo "Missing database URL. Set SUPABASE_DB_URL or DATABASE_URL." >&2
  exit 1
fi

if [[ ! -f "${SCRIPT_PATH}" ]]; then
  echo "Verification script not found: ${SCRIPT_PATH}" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed." >&2
  exit 1
fi

psql "${DB_URL}" --set ON_ERROR_STOP=1 --file "${SCRIPT_PATH}"

echo "Post-migration security verification completed: ${SCRIPT_PATH}"
