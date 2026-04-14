-- 069_auth_login_events.sql
-- Login audit trail for session/access security.

CREATE TABLE IF NOT EXISTS public.auth_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  failure_code text NULL,
  ip_address text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_events_created_at ON public.auth_login_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_events_user_id ON public.auth_login_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_login_events_outcome_created_at ON public.auth_login_events(outcome, created_at DESC);

ALTER TABLE public.auth_login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_login_events_admin_select ON public.auth_login_events;
CREATE POLICY auth_login_events_admin_select
ON public.auth_login_events
FOR SELECT
TO authenticated
USING (public.has_any_role(ARRAY['admin', 'facility_admin']));

DROP POLICY IF EXISTS auth_login_events_no_client_writes ON public.auth_login_events;
CREATE POLICY auth_login_events_no_client_writes
ON public.auth_login_events
FOR INSERT
TO authenticated
WITH CHECK (false);

REVOKE ALL ON TABLE public.auth_login_events FROM anon;
GRANT SELECT ON TABLE public.auth_login_events TO authenticated;
