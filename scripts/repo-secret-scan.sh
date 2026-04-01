#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Scanning tracked text files for likely secrets..."

# Only scan tracked files; skip binary/assets and lockfiles to reduce false positives.
tracked_files=$(git ls-files \
  ':!:pnpm-lock.yaml' \
  ':!:package-lock.json' \
  ':!:yarn.lock' \
  ':!:tests/**' \
  ':!:scripts/test-mobile-money-mutation-local.sh' \
  ':!:public/*' \
  ':!:**/*.png' \
  ':!:**/*.jpg' \
  ':!:**/*.jpeg' \
  ':!:**/*.gif' \
  ':!:**/*.webp' \
  ':!:**/*.pdf')

if [[ -z "$tracked_files" ]]; then
  echo "No tracked files to scan."
  exit 0
fi

# High-signal patterns only.
patterns=(
  'ghp_[A-Za-z0-9]{36}'
  'github_pat_[A-Za-z0-9_]{50,}'
  'AKIA[0-9A-Z]{16}'
  '-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  '(?i)(api[_-]?key|service[_-]?role[_-]?key|private[_-]?key|access[_-]?token)\s*[:=]\s*["'"'"'][^"'"'"'\n]{20,}["'"'"']'
  'Bearer\s+[A-Za-z0-9._-]{20,}'
)

violations=()
for pattern in "${patterns[@]}"; do
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    violations+=("$match")
  done < <(printf '%s\n' "$tracked_files" | xargs rg -n -H -P "$pattern" 2>/dev/null || true)
done

if [[ ${#violations[@]} -gt 0 ]]; then
  echo
  echo "Secret scan failed: potential secrets found"
  printf '%s\n' "${violations[@]}" | sort -u
  echo
  echo "If this is a false positive, rotate/mask the value or move it out of tracked files."
  exit 1
fi

echo "Secret scan passed."
