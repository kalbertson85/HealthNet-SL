-- 018_create_nursing_notes.sql
-- Creates a simple nursing notes table linked to inpatient admissions.

BEGIN;

CREATE TABLE IF NOT EXISTS nursing_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES auth.users(id),
  note_type VARCHAR(50), -- routine, pain, incident, handover, etc.
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Basic index to speed up admission timeline queries
CREATE INDEX IF NOT EXISTS idx_nursing_notes_admission_id_created_at
  ON nursing_notes(admission_id, created_at DESC);

-- Enable RLS and permissive policies similar to other clinical tables
ALTER TABLE nursing_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view nursing notes" ON nursing_notes;
DROP POLICY IF EXISTS "Staff can insert nursing notes" ON nursing_notes;

CREATE POLICY "Anyone can view nursing notes" ON nursing_notes
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert nursing notes" ON nursing_notes
  FOR INSERT WITH CHECK (true);

COMMIT;
