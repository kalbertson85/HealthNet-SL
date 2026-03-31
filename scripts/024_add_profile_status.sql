-- Add status column to profiles for staff account control
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Ensure any NULL statuses are set to active
UPDATE public.profiles
SET status = 'active'
WHERE status IS NULL;

-- Optional: add a simple constraint to limit allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'blocked'));
  END IF;
END;
$$;
