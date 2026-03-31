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

COMMIT;
