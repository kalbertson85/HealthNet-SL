-- 033_triage_visit_link_and_vitals.sql
-- Extend existing triage tables so they are visit-linked and capture core vitals

BEGIN;

-- Link triage assessments to visits so triage can be part of the normal visit workflow
ALTER TABLE public.triage_assessments
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_triage_visit_id
  ON public.triage_assessments(visit_id);

-- Add explicit vital sign fields commonly used in OPD / emergency triage
ALTER TABLE public.triage_assessments
  ADD COLUMN IF NOT EXISTS bp VARCHAR(20),          -- e.g. 120/80
  ADD COLUMN IF NOT EXISTS temperature_c NUMERIC(4,1), -- degrees Celsius
  ADD COLUMN IF NOT EXISTS spo2 INTEGER,            -- oxygen saturation percentage
  ADD COLUMN IF NOT EXISTS pulse INTEGER,           -- heart rate
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);  -- patient weight in kg

-- Add a simplified triage priority field for routine hospital workflows
ALTER TABLE public.triage_assessments
  ADD COLUMN IF NOT EXISTS triage_priority TEXT;

-- Constrain triage_priority to the three core levels we use in this app.
-- PostgreSQL does not support "ADD CONSTRAINT IF NOT EXISTS" directly, so we
-- guard it with a DO block that checks pg_constraint first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'triage_assessments_priority_check'
  ) THEN
    ALTER TABLE public.triage_assessments
      ADD CONSTRAINT triage_assessments_priority_check
      CHECK (triage_priority IS NULL OR triage_priority IN ('emergency', 'urgent', 'routine'));
  END IF;
END;
$$;

COMMIT;
