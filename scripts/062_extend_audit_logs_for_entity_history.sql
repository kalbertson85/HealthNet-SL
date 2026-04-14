-- 062_extend_audit_logs_for_entity_history.sql
-- Extend the central audit log with before/after state and entity aliases for broader traceability.

BEGIN;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS before_state jsonb,
  ADD COLUMN IF NOT EXISTS after_state jsonb;

UPDATE public.audit_logs
SET
  created_at = COALESCE(created_at, occurred_at, now()),
  entity_type = COALESCE(entity_type, resource_type),
  entity_id = COALESCE(entity_id, resource_id)
WHERE created_at IS NULL
   OR entity_type IS NULL
   OR entity_id IS NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

COMMIT;
