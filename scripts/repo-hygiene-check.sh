#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Checking tracked files for forbidden paths..."

forbidden_patterns=(
  '^\.env($|\.)'
  '^\.next/'
  '^out/'
  '^build/'
  '^coverage/'
  '^qa-screenshots/'
  '^\.DS_Store$'
  '/\.DS_Store$'
  '\.pem$'
  '\.key$'
  '^id_rsa$'
  '^id_ed25519$'
)

tracked_files=$(git ls-files)
violations=()

for pattern in "${forbidden_patterns[@]}"; do
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    violations+=("$path")
  done < <(printf '%s\n' "$tracked_files" | rg -n "$pattern" --no-heading | sed 's/^[0-9]*://')
done

if [[ ${#violations[@]} -gt 0 ]]; then
  echo
  echo "Repo hygiene check failed: forbidden tracked files found"
  printf ' - %s\n' "$(printf '%s\n' "${violations[@]}" | sort -u)"
  exit 1
fi

echo "Repo hygiene check passed."
