-- 036_pharmacy_ward_requests_and_controlled_drugs.sql
-- Adds ward medication request workflow and a controlled drug register.

BEGIN;

-- Ward medication requests: header table
CREATE TABLE IF NOT EXISTS public.ward_medication_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ward_name TEXT NOT NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, dispensed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ward medication request line items
CREATE TABLE IF NOT EXISTS public.ward_medication_request_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.ward_medication_requests(id) ON DELETE CASCADE,
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
  dose TEXT, -- e.g. 500mg, 10mg/ml
  frequency TEXT, -- e.g. 8-hourly
  route TEXT, -- e.g. IV, IM, PO
  duration TEXT, -- e.g. 3 days
  quantity_requested INTEGER NOT NULL,
  quantity_approved INTEGER,
  quantity_dispensed INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ward_requests_status_created_at
  ON public.ward_medication_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ward_request_items_request_id
  ON public.ward_medication_request_items(request_id);

-- Simple updated_at trigger for ward_medication_requests
CREATE OR REPLACE FUNCTION public.set_ward_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ward_requests_set_updated_at ON public.ward_medication_requests;

CREATE TRIGGER trg_ward_requests_set_updated_at
  BEFORE UPDATE ON public.ward_medication_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ward_request_updated_at();

-- Controlled drug register
CREATE TABLE IF NOT EXISTS public.controlled_drug_register (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  ward_name TEXT,
  transaction_type TEXT NOT NULL, -- issue, return, adjustment
  quantity INTEGER NOT NULL,
  balance_after INTEGER,
  dose TEXT,
  route TEXT,
  reason TEXT,
  administered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  witnessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_controlled_drug_medication_id_created_at
  ON public.controlled_drug_register(medication_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_controlled_drug_patient_visit
  ON public.controlled_drug_register(patient_id, visit_id);

-- Enable RLS and basic policies
ALTER TABLE public.ward_medication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_medication_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_drug_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view ward medication requests" ON public.ward_medication_requests;
DROP POLICY IF EXISTS "Staff can manage ward medication requests" ON public.ward_medication_requests;
DROP POLICY IF EXISTS "Anyone can view ward medication request items" ON public.ward_medication_request_items;
DROP POLICY IF EXISTS "Staff can manage ward medication request items" ON public.ward_medication_request_items;
DROP POLICY IF EXISTS "Anyone can view controlled drug register" ON public.controlled_drug_register;
DROP POLICY IF EXISTS "Staff can insert controlled drug entries" ON public.controlled_drug_register;

CREATE POLICY "Anyone can view ward medication requests" ON public.ward_medication_requests
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage ward medication requests" ON public.ward_medication_requests
  FOR ALL USING (true);

CREATE POLICY "Anyone can view ward medication request items" ON public.ward_medication_request_items
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage ward medication request items" ON public.ward_medication_request_items
  FOR ALL USING (true);

CREATE POLICY "Anyone can view controlled drug register" ON public.controlled_drug_register
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert controlled drug entries" ON public.controlled_drug_register
  FOR INSERT WITH CHECK (true);

COMMIT;
