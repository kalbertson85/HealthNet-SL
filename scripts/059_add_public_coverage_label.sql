ALTER TABLE public.hospital_settings
ADD COLUMN IF NOT EXISTS public_coverage_label text;

UPDATE public.hospital_settings
SET public_coverage_label = COALESCE(NULLIF(TRIM(public_coverage_label), ''), 'Public coverage')
WHERE public_coverage_label IS NULL OR TRIM(public_coverage_label) = '';
