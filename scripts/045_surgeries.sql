-- 045_surgeries.sql
-- Surgeries (operations) linked to visits, patients, admissions, and surgeons.

BEGIN;

CREATE TABLE IF NOT EXISTS public.surgeries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  admission_id uuid NULL REFERENCES public.admissions(id) ON DELETE SET NULL,
  surgeon_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  procedure_name text NOT NULL,
  procedure_type text NULL,
  status text NOT NULL CHECK (status IN ('planned', 'completed', 'cancelled')) DEFAULT 'planned',
  scheduled_at timestamptz NULL,
  started_at timestamptz NULL,
  ended_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Reuse the shared updated_at trigger
DROP TRIGGER IF EXISTS trg_surgeries_set_updated_at ON public.surgeries;

CREATE TRIGGER trg_surgeries_set_updated_at
  BEFORE UPDATE ON public.surgeries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS surgeries_visit_id_status_idx ON public.surgeries(visit_id, status);
CREATE INDEX IF NOT EXISTS surgeries_patient_id_status_idx ON public.surgeries(patient_id, status);
CREATE INDEX IF NOT EXISTS surgeries_surgeon_id_status_idx ON public.surgeries(surgeon_id, status);
CREATE INDEX IF NOT EXISTS surgeries_admission_id_idx ON public.surgeries(admission_id);

-- RLS
ALTER TABLE public.surgeries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view surgeries" ON public.surgeries;
DROP POLICY IF EXISTS "Staff can manage surgeries" ON public.surgeries;

CREATE POLICY "Anyone can view surgeries" ON public.surgeries
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage surgeries" ON public.surgeries
  FOR ALL USING (true);

COMMIT;
