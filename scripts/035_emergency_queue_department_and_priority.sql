-- 035_emergency_queue_department_and_priority.sql
-- Ensure emergency department and emergency priority are first-class in the queue system.

BEGIN;

-- Create a sequence for emergency queue numbers if it does not exist
CREATE SEQUENCE IF NOT EXISTS emergency_queue_seq START 1;

-- Register emergency department in queue_settings with a sensible default service time
INSERT INTO public.queue_settings (department, is_active, average_service_time)
VALUES ('emergency', true, 10)
ON CONFLICT (department) DO NOTHING;

-- Optionally, add gentle CHECK constraints to document allowed values while
-- staying compatible with any existing rows. Only enforce when the field is non-null.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'queues_priority_check'
  ) THEN
    ALTER TABLE public.queues
      ADD CONSTRAINT queues_priority_check
      CHECK (priority IS NULL OR priority IN ('normal', 'urgent', 'emergency'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'queue_settings_department_check'
  ) THEN
    ALTER TABLE public.queue_settings
      ADD CONSTRAINT queue_settings_department_check
      CHECK (department IN ('opd', 'lab', 'pharmacy', 'radiology', 'billing', 'emergency'));
  END IF;
END;
$$;

COMMIT;
