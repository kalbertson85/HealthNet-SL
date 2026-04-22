#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v pnpm >/dev/null 2>&1; then
  RUNNER="pnpm run"
elif command -v npm >/dev/null 2>&1; then
  RUNNER="npm run"
else
  echo "Release check failed: neither pnpm nor npm is available in PATH."
  exit 1
fi

echo "Step 1/3: Running predeploy readiness check..."
$RUNNER predeploy:check

echo
echo "Step 2/3: Running API v1 contract verifier..."
$RUNNER api:v1:verify

echo
echo "Step 3/3: Running lint..."
$RUNNER lint

echo
echo "Release check PASSED."
