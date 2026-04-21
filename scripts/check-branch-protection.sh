#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install GitHub CLI first."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login"
  exit 1
fi

repo="${1:-}"
branch="${2:-main}"

if [[ -z "${repo}" ]]; then
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi

echo "Checking branch protection for ${repo}:${branch}..."

payload="$(gh api "repos/${repo}/branches/${branch}/protection" 2>/dev/null || true)"
if [[ -z "${payload}" ]]; then
  echo "Branch protection not found or inaccessible for ${repo}:${branch}"
  exit 1
fi

missing=()

required_checks_len="$(printf '%s' "${payload}" | jq '.required_status_checks.checks | length')"
if [[ "${required_checks_len}" -lt 1 ]]; then
  missing+=("required status checks")
fi

if ! printf '%s' "${payload}" | jq -e '.required_pull_request_reviews != null' >/dev/null; then
  missing+=("required pull request reviews")
fi

if ! printf '%s' "${payload}" | jq -e '.enforce_admins.enabled == true' >/dev/null; then
  missing+=("enforce admins")
fi

if ! printf '%s' "${payload}" | jq -e '.allow_force_pushes.enabled == false' >/dev/null; then
  missing+=("force pushes disabled")
fi

if ! printf '%s' "${payload}" | jq -e '.allow_deletions.enabled == false' >/dev/null; then
  missing+=("deletions disabled")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo
  echo "Branch protection is incomplete:"
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

echo "Branch protection baseline check passed."
