-- 044_facilities_and_visit_facility.sql
-- Basic facilities/clinics dimension and link from visits.

BEGIN;

CREATE TABLE IF NOT EXISTS facilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);

CREATE INDEX IF NOT EXISTS idx_visits_facility_id ON visits(facility_id);

ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can view facilities" ON facilities;
DROP POLICY IF EXISTS "Admins can manage facilities" ON facilities;

CREATE POLICY "Authenticated staff can view facilities" ON facilities
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage facilities" ON facilities
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
