BEGIN;

-- Fix Supabase Advisor: "Function Search Path Mutable"
-- Apply a fixed search_path to user-defined public functions.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  END LOOP;
END
$$;

-- Fix Supabase Advisor: "RLS Policy Always True"
-- Tighten only policies whose USING/WITH CHECK are literal true.
DO $$
DECLARE
  pol record;
  qual_is_true boolean;
  with_check_is_true boolean;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    qual_is_true := lower(coalesce(trim(pol.qual), '')) IN ('true', '(true)', '((true))');
    with_check_is_true := lower(coalesce(trim(pol.with_check), '')) IN ('true', '(true)', '((true))');

    IF pol.cmd = 'SELECT' AND qual_is_true THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (auth.uid() IS NOT NULL)',
        pol.policyname, pol.schemaname, pol.tablename
      );
    ELSIF pol.cmd = 'INSERT' AND with_check_is_true THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = ''service_role'')',
        pol.policyname, pol.schemaname, pol.tablename
      );
    ELSIF pol.cmd = 'UPDATE' AND (qual_is_true OR with_check_is_true) THEN
      IF qual_is_true THEN
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I USING (auth.uid() IS NOT NULL)',
          pol.policyname, pol.schemaname, pol.tablename
        );
      END IF;
      IF with_check_is_true THEN
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I WITH CHECK (auth.uid() IS NOT NULL)',
          pol.policyname, pol.schemaname, pol.tablename
        );
      END IF;
    ELSIF pol.cmd = 'DELETE' AND qual_is_true THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (auth.uid() IS NOT NULL)',
        pol.policyname, pol.schemaname, pol.tablename
      );
    ELSIF pol.cmd = 'ALL' AND (qual_is_true OR with_check_is_true) THEN
      IF qual_is_true THEN
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I USING (auth.uid() IS NOT NULL)',
          pol.policyname, pol.schemaname, pol.tablename
        );
      END IF;
      IF with_check_is_true THEN
        EXECUTE format(
          'ALTER POLICY %I ON %I.%I WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = ''service_role'')',
          pol.policyname, pol.schemaname, pol.tablename
        );
      END IF;
    END IF;
  END LOOP;
END
$$;

COMMIT;
