-- 086_post_migration_security_verification.sql
-- Post-migration verification queries for security + workflow integrity.
-- Run this in Supabase SQL editor after applying migrations.

-- 1) RLS enabled on critical tables
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'patients',
    'visits',
    'invoices',
    'prescriptions',
    'facilities',
    'insurance_billing_batches',
    'insurance_billing_batch_items',
    'audit_logs'
  )
ORDER BY c.relname;

-- 2) Policy inventory for critical tables
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'patients',
    'visits',
    'invoices',
    'prescriptions',
    'facilities',
    'insurance_billing_batches',
    'insurance_billing_batch_items',
    'audit_logs'
  )
ORDER BY tablename, policyname;

-- 3) Function hardening attributes for key RPC/helpers
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
    ELSE p.provolatile::text
  END AS volatility,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_user_facility_id',
    'can_access_facility',
    'create_insurance_billing_batch',
    'queue_call_next_transactional',
    'create_prescription_transactional',
    'create_invoice_transactional',
    'reconcile_insurance_batch_payment',
    'mark_visit_invoice_paid_transactional',
    'discharge_admission_transactional',
    'create_admission_transactional'
  )
ORDER BY p.proname;

-- 4) Public execute privileges on key RPCs (should be revoked)
SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'queue_call_next_transactional',
    'create_prescription_transactional',
    'create_invoice_transactional',
    'reconcile_insurance_batch_payment',
    'mark_visit_invoice_paid_transactional',
    'discharge_admission_transactional',
    'create_admission_transactional'
  )
ORDER BY routine_name, grantee;

-- 5) Uniqueness/index enforcement checkpoints for active workflow documents
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'uq_visits_one_active_per_patient',
    'uq_invoice_items_exact_line',
    'uq_prescription_items_exact_med'
  )
ORDER BY indexname;

