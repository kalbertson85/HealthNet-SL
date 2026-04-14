-- 023_patient_insurance_and_company_employees.sql
-- Extend patients with insurance fields and add company_employees / employee_dependents tables.

BEGIN;

-- Extend patients with insurance-related fields
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS insurance_type TEXT CHECK (insurance_type IN ('employee', 'dependent')),
  ADD COLUMN IF NOT EXISTS insurance_card_number TEXT,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_card_serial TEXT,
  ADD COLUMN IF NOT EXISTS insurance_card_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS insurance_mobile TEXT,
  ADD COLUMN IF NOT EXISTS employee_id UUID;

-- Ensure company_id exists (from previous migration) but don't error if it already does
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Unique insurance card number per company (only when both are present)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_company_insurance_card
  ON patients (company_id, insurance_card_number)
  WHERE company_id IS NOT NULL AND insurance_card_number IS NOT NULL;

-- Company employees table
CREATE TABLE IF NOT EXISTS company_employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  insurance_card_number TEXT,
  insurance_card_serial TEXT,
  insurance_expiry_date DATE NOT NULL,
  card_photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, expired, missing
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Dependents linked to employees
CREATE TABLE IF NOT EXISTS employee_dependents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES company_employees(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT,
  insurance_card_number TEXT,
  insurance_card_serial TEXT,
  insurance_expiry_date DATE NOT NULL,
  card_photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, expired, missing
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_company_employees_company_id ON company_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_company_employees_status ON company_employees(status);
CREATE INDEX IF NOT EXISTS idx_employee_dependents_employee_id ON employee_dependents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_dependents_status ON employee_dependents(status);

ALTER TABLE company_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_dependents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can view company employees" ON company_employees;
DROP POLICY IF EXISTS "Authenticated staff can manage company employees" ON company_employees;
DROP POLICY IF EXISTS "Authenticated staff can view employee dependents" ON employee_dependents;
DROP POLICY IF EXISTS "Authenticated staff can manage employee dependents" ON employee_dependents;

CREATE POLICY "Authenticated staff can view company employees" ON company_employees
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can manage company employees" ON company_employees
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can view employee dependents" ON employee_dependents
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can manage employee dependents" ON employee_dependents
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
