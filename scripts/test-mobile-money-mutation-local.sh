#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/test-mobile-money-mutation-local.sh --invoice-id <uuid> [--amount <value>] [--event-id <id>] [--url <webhook-url>] [--secret <secret>]

Examples:
  bash scripts/test-mobile-money-mutation-local.sh --invoice-id 11111111-2222-3333-4444-555555555555
  bash scripts/test-mobile-money-mutation-local.sh --invoice-id 11111111-2222-3333-4444-555555555555 --amount 25000.00 --event-id mm_evt_local_01

Notes:
  - Run your app first: npm run dev
  - Ensure .env.local has:
      MOBILE_MONEY_WEBHOOK_SECRET=...
      ENABLE_MOBILE_MONEY_INVOICE_MUTATION=true
EOF
}

WEBHOOK_URL="http://localhost:3000/api/webhooks/mobile-money"
INVOICE_ID=""
AMOUNT="1000.00"
EVENT_ID="mm_evt_local_$(date +%s)"
SECRET="${MOBILE_MONEY_WEBHOOK_SECRET:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --invoice-id)
      INVOICE_ID="${2:-}"
      shift 2
      ;;
    --amount)
      AMOUNT="${2:-}"
      shift 2
      ;;
    --event-id)
      EVENT_ID="${2:-}"
      shift 2
      ;;
    --url)
      WEBHOOK_URL="${2:-}"
      shift 2
      ;;
    --secret)
      SECRET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$INVOICE_ID" ]]; then
  echo "Missing required --invoice-id"
  usage
  exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "MOBILE_MONEY_WEBHOOK_SECRET is not set in the shell."
  echo "Tip: export it, or pass --secret, or run: source .env.local"
  exit 1
fi

TS="$(date +%s)"
BODY="$(cat <<EOF
{"event_id":"$EVENT_ID","event_type":"payment.completed","transaction_id":"trx_local_$TS","reference":"INV-LOCAL-$TS","invoice_id":"$INVOICE_ID","status":"success","amount":"$AMOUNT","currency":"SLE","provider":"mobile_money_local_test","customer_msisdn":"+23270000000"}
EOF
)"

SIG="$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')"

echo "Sending webhook to: $WEBHOOK_URL"
echo "Invoice ID: $INVOICE_ID"
echo "Event ID: $EVENT_ID"
echo

curl -i -sS -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Timestamp: $TS" \
  -H "X-Signature: $SIG" \
  -d "$BODY"

echo
echo "Verification SQL (run in Supabase SQL editor):"
cat <<EOF
select id, total_amount, paid_amount, status, payment_method, payment_date
from public.invoices
where id = '$INVOICE_ID';

select occurred_at, action, resource_id, metadata
from public.audit_logs
where action = 'webhook.mobile_money.invoice_mutated'
order by occurred_at desc
limit 5;
EOF
