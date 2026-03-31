-- 016_add_patient_fields.sql
-- Adds national_id, next_of_kin, photo_url, and updated_at columns to patients table.
-- Idempotent: uses IF NOT EXISTS and COALESCE to preserve existing data.

BEGIN;

-- national_id: optional, unique per facility in future phases
ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS national_id varchar(50);

-- next_of_kin: structured JSON (name, relationship, phone, address)
ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS next_of_kin jsonb;

-- photo_url: path or URL to patient photo in storage
ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS photo_url text;

-- updated_at: track last modification time if not already present
ALTER TABLE IF EXISTS public.patients
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Optional: keep updated_at in sync via trigger if not already defined in schema.
-- This is written defensively; if the function/trigger already exist, they are not recreated.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_proc
    WHERE  proname = 'set_updated_at_patients'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at_patients()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_trigger
    WHERE  tgname = 'trg_patients_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_patients_set_updated_at
    BEFORE UPDATE ON public.patients
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_patients();
  END IF;
END;
$$;

COMMIT;
