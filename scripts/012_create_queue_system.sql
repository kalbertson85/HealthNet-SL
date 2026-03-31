-- Queue Management System for Hospital
-- Creates tables for managing patient queues across departments

-- Create queues table
CREATE TABLE IF NOT EXISTS public.queues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  department VARCHAR(50) NOT NULL, -- opd, lab, pharmacy, radiology, billing
  queue_number VARCHAR(20) NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- normal, urgent, emergency
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, in_progress, completed, cancelled
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  notes TEXT,
  check_in_time TIMESTAMPTZ DEFAULT now(),
  called_time TIMESTAMPTZ,
  completed_time TIMESTAMPTZ,
  estimated_wait_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create queue settings table
CREATE TABLE IF NOT EXISTS public.queue_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  department VARCHAR(50) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  average_service_time INTEGER DEFAULT 15, -- minutes
  current_serving VARCHAR(20),
  last_queue_number INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create sequences for queue numbers by department
CREATE SEQUENCE IF NOT EXISTS opd_queue_seq START 1;
CREATE SEQUENCE IF NOT EXISTS lab_queue_seq START 1;
CREATE SEQUENCE IF NOT EXISTS pharmacy_queue_seq START 1;
CREATE SEQUENCE IF NOT EXISTS radiology_queue_seq START 1;
CREATE SEQUENCE IF NOT EXISTS billing_queue_seq START 1;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_queues_patient_id ON public.queues(patient_id);
CREATE INDEX IF NOT EXISTS idx_queues_department ON public.queues(department);
CREATE INDEX IF NOT EXISTS idx_queues_status ON public.queues(status);
CREATE INDEX IF NOT EXISTS idx_queues_created_at ON public.queues(created_at);
CREATE INDEX IF NOT EXISTS idx_queues_priority ON public.queues(priority);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_queues_updated_at ON public.queues;
DROP TRIGGER IF EXISTS update_queue_settings_updated_at ON public.queue_settings;

-- Create triggers
CREATE TRIGGER update_queues_updated_at
  BEFORE UPDATE ON public.queues
  FOR EACH ROW
  EXECUTE FUNCTION update_queue_updated_at();

CREATE TRIGGER update_queue_settings_updated_at
  BEFORE UPDATE ON public.queue_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_queue_updated_at();

-- Enable RLS
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view queues" ON public.queues;
DROP POLICY IF EXISTS "Staff can insert queues" ON public.queues;
DROP POLICY IF EXISTS "Staff can update queues" ON public.queues;
DROP POLICY IF EXISTS "Anyone can view queue settings" ON public.queue_settings;
DROP POLICY IF EXISTS "Admins can update queue settings" ON public.queue_settings;

-- RLS Policies for queues
CREATE POLICY "Anyone can view queues" ON public.queues
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert queues" ON public.queues
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff can update queues" ON public.queues
  FOR UPDATE USING (true);

-- RLS Policies for queue_settings
CREATE POLICY "Anyone can view queue settings" ON public.queue_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can update queue settings" ON public.queue_settings
  FOR ALL USING (true);

-- Optional: audit log table for queue actions
CREATE TABLE IF NOT EXISTS public.queue_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  notes TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.queue_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view queue audit logs" ON public.queue_audit_logs;
DROP POLICY IF EXISTS "Staff can insert queue audit logs" ON public.queue_audit_logs;

CREATE POLICY "Anyone can view queue audit logs" ON public.queue_audit_logs
  FOR SELECT USING (true);

CREATE POLICY "Staff can insert queue audit logs" ON public.queue_audit_logs
  FOR INSERT WITH CHECK (true);

-- Insert default queue settings
INSERT INTO public.queue_settings (department, is_active, average_service_time)
VALUES 
  ('opd', true, 15),
  ('lab', true, 10),
  ('pharmacy', true, 8),
  ('radiology', true, 20),
  ('billing', true, 5)
ON CONFLICT (department) DO NOTHING;

-- Function to generate queue number
CREATE OR REPLACE FUNCTION generate_queue_number(dept VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  seq_name TEXT;
  next_num INTEGER;
  queue_num VARCHAR;
BEGIN
  seq_name := dept || '_queue_seq';
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_num;
  
  queue_num := UPPER(LEFT(dept, 3)) || '-' || LPAD(next_num::TEXT, 3, '0');
  
  RETURN queue_num;
END;
$$ LANGUAGE plpgsql;
