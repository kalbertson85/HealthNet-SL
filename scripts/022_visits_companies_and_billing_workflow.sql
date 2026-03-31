-- 022_visits_companies_and_billing_workflow.sql
-- Core visit workflow, investigations, companies, and hospital settings.

BEGIN;

-- Companies table for corporate billing
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  terms TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Extend patients with optional company_id
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Visits table to track patient through workflow stages
CREATE TABLE IF NOT EXISTS visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_status TEXT NOT NULL,
  diagnosis TEXT,
  prescription_list JSONB,
  assigned_company_id UUID REFERENCES companies(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Investigations associated with a visit (lab, xray, mri, etc.)
CREATE TABLE IF NOT EXISTS investigations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  notes TEXT,
  attachments JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Hospital settings for billing logo and name
CREATE TABLE IF NOT EXISTS hospital_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_name TEXT NOT NULL,
  billing_logo_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Extend invoices to link to visits and hold structured line items
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES visits(id),
  ADD COLUMN IF NOT EXISTS line_items JSONB,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC,
  ADD COLUMN IF NOT EXISTS tax NUMERIC,
  ADD COLUMN IF NOT EXISTS total NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_status TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Simple indexes
CREATE INDEX IF NOT EXISTS idx_visits_patient_id_status ON visits(patient_id, visit_status);
CREATE INDEX IF NOT EXISTS idx_investigations_visit_id_status ON investigations(visit_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_visit_id ON invoices(visit_id);

-- Basic RLS enablement (policies can be refined later or handled via Supabase dashboard)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view companies" ON companies;
DROP POLICY IF EXISTS "Staff can manage companies" ON companies;
DROP POLICY IF EXISTS "Anyone can view visits" ON visits;
DROP POLICY IF EXISTS "Staff can manage visits" ON visits;
DROP POLICY IF EXISTS "Anyone can view investigations" ON investigations;
DROP POLICY IF EXISTS "Staff can manage investigations" ON investigations;
DROP POLICY IF EXISTS "Anyone can view hospital settings" ON hospital_settings;
DROP POLICY IF EXISTS "Admins can manage hospital settings" ON hospital_settings;

CREATE POLICY "Anyone can view companies" ON companies
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage companies" ON companies
  FOR ALL USING (true);

CREATE POLICY "Anyone can view visits" ON visits
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage visits" ON visits
  FOR ALL USING (true);

CREATE POLICY "Anyone can view investigations" ON investigations
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage investigations" ON investigations
  FOR ALL USING (true);

CREATE POLICY "Anyone can view hospital settings" ON hospital_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage hospital settings" ON hospital_settings
  FOR ALL USING (true);

COMMIT;
