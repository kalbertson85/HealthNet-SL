#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Step 1/2: Running predeploy readiness check..."
npm run predeploy:check

echo
echo "Step 2/2: Running lint..."
npm run lint

echo
echo "Release check PASSED."
