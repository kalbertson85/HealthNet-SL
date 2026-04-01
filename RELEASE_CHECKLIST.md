# Release Checklist

Date: 2026-03-31

## 0) Governance Baseline

- Ensure branch protection is configured for `main` using `BRANCH_PROTECTION.md`.
- Ensure CODEOWNERS is active and review from code owners is required.
- Ensure `SECURITY.md` contact path is current and monitored.

## 1) Pre-Release Gate

```bash
cd /Users/kalbertjack/Desktop/HMS
npm run predeploy:check
```

## 2) Supabase Migrations (in order)

1. `scripts/046_webhook_replay_events.sql`
2. `scripts/047_webhook_replay_events_retention.sql`
3. `scripts/048_audit_logs_action_occurred_idx.sql`
4. `scripts/049_patient_photos_storage_policies.sql`

## 3) Production Environment Variables

- `MOBILE_MONEY_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENABLE_MOBILE_MONEY_INVOICE_MUTATION=false` (recommended for initial rollout)

## 4) Deploy

- Trigger production deploy from your hosting platform.

## 5) Post-Deploy Verification

1. Open `/dashboard/admin/webhook-events` and confirm:
- Accepted events section loads
- Rejected events section loads
- Invoice mutations section loads

2. Idempotency test (same payload twice):
- First response: `{"ok":true}`
- Second response: `{"ok":true,"duplicate":true}`

## 6) Controlled Feature Enablement

1. Set `ENABLE_MOBILE_MONEY_INVOICE_MUTATION=true`
2. Send one successful webhook with a valid `invoice_id`
3. Confirm:
- Invoice `paid_amount/status/payment_method/payment_date` updated
- `webhook.mobile_money.invoice_mutated` appears in monitor

## 7) Optional Ops Task

- Schedule replay retention cleanup function via `pg_cron`.
