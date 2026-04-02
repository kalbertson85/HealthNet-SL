#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ITERATIONS="${ITERATIONS:-5}"
COOKIE_HEADER="${COOKIE_HEADER:-}"
WARMUP_ITERATIONS="${WARMUP_ITERATIONS:-2}"
REQUIRE_ALL_200="${REQUIRE_ALL_200:-false}"

if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [ "$ITERATIONS" -lt 1 ]; then
  echo "ITERATIONS must be a positive integer"
  exit 1
fi
if ! [[ "$WARMUP_ITERATIONS" =~ ^[0-9]+$ ]] || [ "$WARMUP_ITERATIONS" -lt 0 ]; then
  echo "WARMUP_ITERATIONS must be a non-negative integer"
  exit 1
fi

ENDPOINTS=(
  "/dashboard"
  "/dashboard/reports"
  "/dashboard/nursing"
)

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

percentile_95_ms() {
  local file="$1"
  local n idx
  n="$(wc -l < "$file" | tr -d ' ')"
  if [ "$n" -eq 0 ]; then
    echo "n/a"
    return
  fi
  idx=$(( (95 * n + 99) / 100 ))
  if [ "$idx" -lt 1 ]; then idx=1; fi
  if [ "$idx" -gt "$n" ]; then idx="$n"; fi
  sort -n "$file" | sed -n "${idx}p"
}

percentile_50_ms() {
  local file="$1"
  local n idx
  n="$(wc -l < "$file" | tr -d ' ')"
  if [ "$n" -eq 0 ]; then
    echo "n/a"
    return
  fi
  idx=$(( (n + 1) / 2 ))
  if [ "$idx" -lt 1 ]; then idx=1; fi
  if [ "$idx" -gt "$n" ]; then idx="$n"; fi
  sort -n "$file" | sed -n "${idx}p"
}

printf "Perf smoke test against %s (%s runs/endpoint)\n" "$BASE_URL" "$ITERATIONS"
if [ -n "$COOKIE_HEADER" ]; then
  echo "Auth mode: enabled (COOKIE_HEADER provided)"
else
  echo "Auth mode: disabled (requests may be redirects)"
fi
if [ "$WARMUP_ITERATIONS" -gt 0 ]; then
  echo "Warmup: ${WARMUP_ITERATIONS} request(s) per endpoint (excluded from stats)"
fi
echo "Require all 200: ${REQUIRE_ALL_200}"
printf "%-30s %10s %10s %10s %12s\n" "Endpoint" "p50(ms)" "p95(ms)" "max(ms)" "statuses"
printf "%-30s %10s %10s %10s %12s\n" "------------------------------" "----------" "----------" "----------" "------------"

for endpoint in "${ENDPOINTS[@]}"; do
  : > "$tmp_file"
  statuses_file="$(mktemp)"
  trap 'rm -f "$tmp_file" "$statuses_file"' EXIT

  if [ "$WARMUP_ITERATIONS" -gt 0 ]; then
    for _ in $(seq 1 "$WARMUP_ITERATIONS"); do
      if [ -n "$COOKIE_HEADER" ]; then
        curl -sS -o /dev/null -H "Cookie: ${COOKIE_HEADER}" "${BASE_URL}${endpoint}" || true
      else
        curl -sS -o /dev/null "${BASE_URL}${endpoint}" || true
      fi
    done
  fi

  for _ in $(seq 1 "$ITERATIONS"); do
    if [ -n "$COOKIE_HEADER" ]; then
      result="$(curl -sS -o /dev/null -H "Cookie: ${COOKIE_HEADER}" -w '%{http_code} %{time_total}' "${BASE_URL}${endpoint}")"
    else
      result="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' "${BASE_URL}${endpoint}")"
    fi
    status="$(printf '%s' "$result" | awk '{print $1}')"
    ms="$(printf '%s' "$result" | awk '{ printf "%.0f", $2 * 1000 }')"
    echo "$ms" >> "$tmp_file"
    echo "$status" >> "$statuses_file"
  done

  p50="$(percentile_50_ms "$tmp_file")"
  p95="$(percentile_95_ms "$tmp_file")"
  max="$(awk 'BEGIN { m = 0 } { if ($1 > m) m = $1 } END { printf "%.0f", m }' "$tmp_file")"
  statuses="$(sort "$statuses_file" | uniq -c | awk '{printf "%s%sx%s", (NR==1?"":","), $1, $2}')"

  printf "%-30s %10s %10s %10s %12s\n" "$endpoint" "$p50" "$p95" "$max" "$statuses"

  if [ "$REQUIRE_ALL_200" = "true" ]; then
    non_200_count="$(awk '$1 != "200" { c++ } END { print c + 0 }' "$statuses_file")"
    if [ "$non_200_count" -gt 0 ]; then
      echo "ERROR: ${endpoint} returned non-200 statuses (${statuses})."
      exit 2
    fi
  fi
done

echo
echo "Tip: run with BASE_URL and ITERATIONS, e.g."
echo "  BASE_URL=http://localhost:3000 ITERATIONS=10 npm run perf:smoke"
echo "Strict mode example (fail on redirects/errors):"
echo "  REQUIRE_ALL_200=true WARMUP_ITERATIONS=2 ITERATIONS=10 npm run perf:smoke"
echo "Authenticated example:"
echo "  COOKIE_HEADER='sb-access-token=...; sb-refresh-token=...' BASE_URL=http://localhost:3000 ITERATIONS=10 npm run perf:smoke"
