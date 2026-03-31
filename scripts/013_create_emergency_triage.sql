-- Emergency & Triage System for Hospital
-- Creates tables for managing emergency cases and triage assessment

-- Create triage_assessments table
CREATE TABLE IF NOT EXISTS public.triage_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  triage_level VARCHAR(20) NOT NULL, -- red (critical), orange (emergency), yellow (urgent), green (minor), blue (non-urgent)
  arrival_mode VARCHAR(50), -- ambulance, walk-in, police, referral
  chief_complaint TEXT NOT NULL,
  vital_signs JSONB, -- {bp, heart_rate, respiratory_rate, temperature, spo2, pain_level}
  assessment_notes TEXT,
  assessed_by UUID REFERENCES auth.users(id),
  reassessment_time TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending', -- pending, in_treatment, admitted, discharged, transferred
  arrival_time TIMESTAMPTZ DEFAULT now(),
  treatment_start_time TIMESTAMPTZ,
  disposition_time TIMESTAMPTZ,
  disposition VARCHAR(50), -- discharged, admitted, transferred, deceased, left_ama
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create emergency_cases table (extends triage)
CREATE TABLE IF NOT EXISTS public.emergency_cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  triage_id UUID NOT NULL REFERENCES public.triage_assessments(id) ON DELETE CASCADE,
  case_number VARCHAR(50) UNIQUE NOT NULL,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  presenting_problem TEXT NOT NULL,
  medical_history TEXT,
  allergies TEXT,
  current_medications TEXT,
  treatment_plan TEXT,
  procedures_performed JSONB, -- array of {procedure, time, performed_by}
  investigations_ordered JSONB, -- array of {test, status, result}
  diagnosis TEXT,
  outcome VARCHAR(50),
  attending_doctor UUID REFERENCES auth.users(id),
  admitting_diagnosis TEXT,
  ward_assigned VARCHAR(100),
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create emergency_vitals_log table for continuous monitoring
CREATE TABLE IF NOT EXISTS public.emergency_vitals_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  emergency_case_id UUID NOT NULL REFERENCES public.emergency_cases(id) ON DELETE CASCADE,
  blood_pressure VARCHAR(20),
  heart_rate INTEGER,
  respiratory_rate INTEGER,
  temperature DECIMAL(4,1),
  spo2 INTEGER,
  pain_level INTEGER,
  consciousness_level VARCHAR(50), -- alert, verbal, pain, unresponsive
  recorded_by UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Create sequence for case numbers
CREATE SEQUENCE IF NOT EXISTS emergency_case_seq START 1;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_triage_patient_id ON public.triage_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_level ON public.triage_assessments(triage_level);
CREATE INDEX IF NOT EXISTS idx_triage_status ON public.triage_assessments(status);
CREATE INDEX IF NOT EXISTS idx_triage_arrival_time ON public.triage_assessments(arrival_time);
CREATE INDEX IF NOT EXISTS idx_emergency_cases_patient_id ON public.emergency_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_emergency_cases_triage_id ON public.emergency_cases(triage_id);
CREATE INDEX IF NOT EXISTS idx_emergency_vitals_case_id ON public.emergency_vitals_log(emergency_case_id);

-- Create trigger functions
CREATE OR REPLACE FUNCTION update_triage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_emergency_case_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_triage_assessments_updated_at ON public.triage_assessments;
DROP TRIGGER IF EXISTS update_emergency_cases_updated_at ON public.emergency_cases;

-- Create triggers
CREATE TRIGGER update_triage_assessments_updated_at
  BEFORE UPDATE ON public.triage_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_triage_updated_at();

CREATE TRIGGER update_emergency_cases_updated_at
  BEFORE UPDATE ON public.emergency_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_emergency_case_updated_at();

-- Enable RLS
ALTER TABLE public.triage_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_vitals_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view triage assessments" ON public.triage_assessments;
DROP POLICY IF EXISTS "Staff can insert triage assessments" ON public.triage_assessments;
DROP POLICY IF EXISTS "Staff can update triage assessments" ON public.triage_assessments;
DROP POLICY IF EXISTS "Anyone can view emergency cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Staff can manage emergency cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Anyone can view vitals log" ON public.emergency_vitals_log;
DROP POLICY IF EXISTS "Staff can insert vitals log" ON public.emergency_vitals_log;

-- RLS Policies
CREATE POLICY "Anyone can view triage assessments" ON public.triage_assessments
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert triage assessments" ON public.triage_assessments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff can update triage assessments" ON public.triage_assessments
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can view emergency cases" ON public.emergency_cases
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage emergency cases" ON public.emergency_cases
  FOR ALL USING (true);

CREATE POLICY "Anyone can view vitals log" ON public.emergency_vitals_log
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert vitals log" ON public.emergency_vitals_log
  FOR INSERT WITH CHECK (true);

-- Function to generate emergency case number
CREATE OR REPLACE FUNCTION generate_emergency_case_number()
RETURNS VARCHAR AS $$
DECLARE
  next_num INTEGER;
  case_num VARCHAR;
BEGIN
  SELECT nextval('emergency_case_seq') INTO next_num;
  case_num := 'EM-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN case_num;
END;
$$ LANGUAGE plpgsql;
