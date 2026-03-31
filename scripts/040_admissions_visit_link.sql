-- 040_admissions_visit_link.sql
-- Link admissions to visits for tighter workflow integration.

BEGIN;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admissions_visit_id_status
  ON public.admissions(visit_id, status);

COMMIT;
