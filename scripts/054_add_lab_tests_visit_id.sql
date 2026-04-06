-- 054_add_lab_tests_visit_id.sql
-- Add the missing visit link on lab_tests so report and workflow joins can use the current visit context.

BEGIN;

ALTER TABLE public.lab_tests
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_tests_visit_id
  ON public.lab_tests(visit_id);

COMMIT;
