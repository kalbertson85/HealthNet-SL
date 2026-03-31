-- Patient photo storage hardening for user-scoped uploads.
-- NOTE: If you use a non-default patient photo bucket name, adjust 'patient-photos' below.

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-photos', 'patient-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "patient_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "patient_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "patient_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "patient_photos_delete" ON storage.objects;

-- Shared condition:
-- - bucket is patient-photos
-- - first path segment is a UUID patient id
-- - authenticated user's profile role is allowed for patient edits

CREATE POLICY "patient_photos_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'patient-photos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.patients pat
      JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE pat.id::text = split_part(name, '/', 1)
        AND actor.role::text IN ('admin', 'facility_admin', 'doctor', 'nurse', 'clerk')
    )
  );

CREATE POLICY "patient_photos_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'patient-photos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.patients pat
      JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE pat.id::text = split_part(name, '/', 1)
        AND actor.role::text IN ('admin', 'facility_admin', 'doctor', 'nurse', 'clerk')
    )
  );

CREATE POLICY "patient_photos_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'patient-photos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.patients pat
      JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE pat.id::text = split_part(name, '/', 1)
        AND actor.role::text IN ('admin', 'facility_admin', 'doctor', 'nurse', 'clerk')
    )
  )
  WITH CHECK (
    bucket_id = 'patient-photos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.patients pat
      JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE pat.id::text = split_part(name, '/', 1)
        AND actor.role::text IN ('admin', 'facility_admin', 'doctor', 'nurse', 'clerk')
    )
  );

CREATE POLICY "patient_photos_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'patient-photos'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.patients pat
      JOIN public.profiles actor ON actor.id = auth.uid()
      WHERE pat.id::text = split_part(name, '/', 1)
        AND actor.role::text IN ('admin', 'facility_admin', 'doctor', 'nurse', 'clerk')
    )
  );
