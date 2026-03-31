-- 019_pharmacy_stock_and_dispense.sql
-- Basic medication catalogue, stock, and dispense events to support atomic dispensing.

BEGIN;

CREATE TABLE IF NOT EXISTS medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  form TEXT, -- e.g. tablet, syrup, injection
  strength TEXT, -- e.g. 500mg, 5mg/5ml
  unit TEXT, -- e.g. tablet, ml
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medication_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  location TEXT DEFAULT 'Main Pharmacy',
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispense_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
  source_stock_id UUID REFERENCES medication_stock(id) ON DELETE SET NULL,
  quantity_dispensed INTEGER NOT NULL,
  dispensed_by UUID REFERENCES auth.users(id),
  dispensed_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_medication_stock_medication_id ON medication_stock(medication_id);
CREATE INDEX IF NOT EXISTS idx_dispense_events_prescription_id ON dispense_events(prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispense_events_patient_id ON dispense_events(patient_id);

-- Simple updated_at trigger function reused across tables
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_medications_set_updated_at ON medications;
DROP TRIGGER IF EXISTS trg_medication_stock_set_updated_at ON medication_stock;

CREATE TRIGGER trg_medications_set_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_medication_stock_set_updated_at
  BEFORE UPDATE ON medication_stock
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispense_events ENABLE ROW LEVEL SECURITY;

-- Basic permissive policies (can be tightened later or aligned with roles via Supabase Auth)
DROP POLICY IF EXISTS "Anyone can view medications" ON medications;
DROP POLICY IF EXISTS "Staff can manage medications" ON medications;
DROP POLICY IF EXISTS "Anyone can view medication stock" ON medication_stock;
DROP POLICY IF EXISTS "Staff can manage medication stock" ON medication_stock;
DROP POLICY IF EXISTS "Anyone can view dispense events" ON dispense_events;
DROP POLICY IF EXISTS "Staff can insert dispense events" ON dispense_events;

CREATE POLICY "Anyone can view medications" ON medications
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage medications" ON medications
  FOR ALL USING (true);

CREATE POLICY "Anyone can view medication stock" ON medication_stock
  FOR SELECT USING (true);

CREATE POLICY "Staff can manage medication stock" ON medication_stock
  FOR ALL USING (true);

CREATE POLICY "Anyone can view dispense events" ON dispense_events
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert dispense events" ON dispense_events
  FOR INSERT WITH CHECK (true);

COMMIT;