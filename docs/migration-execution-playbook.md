# Migration Execution Playbook

This playbook defines a safe rollout sequence for SQL migrations and post-apply verification.

## Scope

Use this for production-like rollouts where security, RLS, and transactional RPCs must remain intact.

## 1) Pre-Execution Checklist

1. Confirm branch is green in CI (`lint`, tests, build).
2. Take a database backup/snapshot.
3. Confirm required env vars are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Confirm schema target is correct (`public`).
5. Notify stakeholders of migration window.

## 2) Recommended Apply Order

Apply SQL scripts in numeric order from `scripts/`.

For this repository, especially ensure these hardening blocks are included:

1. `063_security_hardening_rls.sql`
2. `064_warning_rls_policy_tightening.sql`
3. `065_security_warning_cleanup_safe.sql`
4. `066_security_hardening_rls_safe.sql`
5. `067_supabase_advisor_warning_fix.sql`
6. `068_security_workflow_integrity.sql`
7. `073_queue_call_next_transactional_rpc.sql`
8. `074_create_prescription_transactional_rpc.sql`
9. `075_create_invoice_transactional_rpc.sql`
10. `076_reconcile_insurance_batch_payment_rpc.sql`
11. `077_mark_visit_invoice_paid_transactional_rpc.sql`
12. `078_discharge_admission_transactional_rpc.sql`
13. `079_create_admission_transactional_rpc.sql`

## 3) Post-Execution Verification

Run:

- `scripts/086_post_migration_security_verification.sql`

Expected outcomes:

1. RLS enabled on all critical tables listed in the query.
2. Policies present for those critical tables.
3. Key helper/RPC functions show expected `security_definer`, `volatility`, and `proconfig` (`search_path`).
4. No unsafe `PUBLIC` execute grants on transactional RPCs.
5. Key uniqueness indexes exist for active workflow constraints.

## 4) Rollback Guidance

If verification fails:

1. Stop further writes to affected modules.
2. Re-apply last known good migration set.
3. Restore from backup if policy/function state is inconsistent.
4. Re-run `086_post_migration_security_verification.sql`.
5. Document root cause before next deploy attempt.

## 5) Operational Notes

1. Treat migration + verification as one atomic release step.
2. Keep SQL changes additive unless an explicit migration requires replacement.
3. For function signature changes, prefer `DROP FUNCTION IF EXISTS ...` before recreation when needed.

