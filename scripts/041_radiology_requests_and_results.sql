-- 041_radiology_requests_and_results.sql
-- Radiology requests and audit logs, linked to visits and patients.

BEGIN;

CREATE TABLE IF NOT EXISTS public.radiology_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  modality text NOT NULL,
  study_type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('stat', 'urgent', 'routine')),
  status text NOT NULL CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  clinical_notes text NULL,
  result_text text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_radiology_requests_set_updated_at ON public.radiology_requests;

CREATE TRIGGER trg_radiology_requests_set_updated_at
  BEFORE UPDATE ON public.radiology_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS radiology_requests_investigation_id_idx ON public.radiology_requests(investigation_id);
CREATE INDEX IF NOT EXISTS radiology_requests_visit_id_status_idx ON public.radiology_requests(visit_id, status);
CREATE INDEX IF NOT EXISTS radiology_requests_doctor_id_status_idx ON public.radiology_requests(doctor_id, status);
CREATE INDEX IF NOT EXISTS radiology_requests_patient_id_idx ON public.radiology_requests(patient_id);

-- Audit log for radiology actions
CREATE TABLE IF NOT EXISTS public.radiology_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  radiology_request_id uuid NOT NULL REFERENCES public.radiology_requests(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created', 'status_updated', 'result_entered', 'cancelled')),
  old_status text NULL,
  new_status text NULL,
  notes text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS radiology_audit_logs_request_id_idx ON public.radiology_audit_logs(radiology_request_id);
CREATE INDEX IF NOT EXISTS radiology_audit_logs_actor_user_id_idx ON public.radiology_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS radiology_audit_logs_created_at_idx ON public.radiology_audit_logs(created_at DESC);

-- RLS
ALTER TABLE public.radiology_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiology_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view radiology requests" ON public.radiology_requests;
DROP POLICY IF EXISTS "Staff can manage radiology requests" ON public.radiology_requests;
DROP POLICY IF EXISTS "Anyone can view radiology audit logs" ON public.radiology_audit_logs;
DROP POLICY IF EXISTS "Staff can manage radiology audit logs" ON public.radiology_audit_logs;

CREATE POLICY "Anyone can view radiology requests" ON public.radiology_requests
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage radiology requests" ON public.radiology_requests
  FOR ALL USING (true);

CREATE POLICY "Anyone can view radiology audit logs" ON public.radiology_audit_logs
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage radiology audit logs" ON public.radiology_audit_logs
  FOR ALL USING (true);

COMMIT;
