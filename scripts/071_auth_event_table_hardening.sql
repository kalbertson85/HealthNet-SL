-- 071_auth_event_table_hardening.sql
-- Tighten auth-event table privileges and preserve RLS protection.

DO $$
BEGIN
  IF to_regclass('public.auth_login_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.auth_login_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.auth_login_events FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.auth_login_events FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.auth_login_events TO authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.password_reset_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.password_reset_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.password_reset_events FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.password_reset_events FROM authenticated';
  END IF;
END $$;
