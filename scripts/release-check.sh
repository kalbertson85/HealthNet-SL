#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Step 1/3: Running predeploy readiness check..."
npm run predeploy:check

echo
echo "Step 2/3: Running API v1 contract verifier..."
npm run api:v1:verify

echo
echo "Step 3/3: Running lint..."
npm run lint

echo
echo "Release check PASSED."
