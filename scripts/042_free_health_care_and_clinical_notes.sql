-- 042_free_health_care_and_clinical_notes.sql
-- Sierra Leone Free Health Care tagging and structured doctor consultation fields.

BEGIN;

-- Patients: mark eligibility for Free Health Care (FHC)
-- Values:
--   'none'       - not in FHC
--   'u5'         - under five
--   'pregnant'   - pregnant woman
--   'lactating'  - lactating mother
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS free_health_category TEXT CHECK (free_health_category IN ('none', 'u5', 'pregnant', 'lactating'));

-- Default existing patients to 'none' to avoid NULLs for new logic
UPDATE patients
SET free_health_category = 'none'
WHERE free_health_category IS NULL;

-- Visits: tag if this encounter is being treated as Free Health Care
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS is_free_health_care BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payer_category TEXT,
  -- Structured doctor consultation fields
  ADD COLUMN IF NOT EXISTS symptoms TEXT,
  ADD COLUMN IF NOT EXISTS history TEXT,
  ADD COLUMN IF NOT EXISTS exam_findings TEXT,
  ADD COLUMN IF NOT EXISTS treatment_plan TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_codes TEXT[],
  ADD COLUMN IF NOT EXISTS referral_type TEXT;

-- Optional helper index for querying FHC visits
CREATE INDEX IF NOT EXISTS idx_visits_fhc_status ON visits(is_free_health_care, visit_status);

COMMIT;
