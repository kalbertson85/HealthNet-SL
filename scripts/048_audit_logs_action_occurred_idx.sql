-- Index for fast webhook/security audit lookups by action and time.

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_occurred_at
  ON public.audit_logs (action, occurred_at DESC);
