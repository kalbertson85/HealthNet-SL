-- 034_nursing_visit_notes_and_procedures.sql
-- Add visit-level nursing notes and procedures with staff and timestamps.

BEGIN;

CREATE TABLE IF NOT EXISTS public.visit_nursing_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES auth.users(id),
  note_type TEXT, -- general, pre-procedure, post-procedure, observation, incident
  note TEXT NOT NULL,
  procedure_type TEXT, -- injection, dressing, wound_cleaning, other
  procedure_details TEXT,
  performed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_nursing_notes_visit_id_created_at
  ON public.visit_nursing_notes(visit_id, created_at DESC);

ALTER TABLE public.visit_nursing_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view visit nursing notes" ON public.visit_nursing_notes;
DROP POLICY IF EXISTS "Staff can insert visit nursing notes" ON public.visit_nursing_notes;

CREATE POLICY "Anyone can view visit nursing notes" ON public.visit_nursing_notes
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert visit nursing notes" ON public.visit_nursing_notes
  FOR INSERT WITH CHECK (true);

COMMIT;
