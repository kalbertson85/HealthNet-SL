-- 038_ward_request_status_and_rls.sql
-- Add per-item status for ward medication requests and tighten RLS.

BEGIN;

-- Add status and audit columns to ward_medication_request_items
ALTER TABLE public.ward_medication_request_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'; -- pending, approved, rejected

ALTER TABLE public.ward_medication_request_items
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ward_medication_request_items
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Tighten RLS policies using the profiles.role field
-- Allow everyone to SELECT for now, but restrict INSERT/UPDATE to clinical/pharmacy/admin roles.

ALTER TABLE public.ward_medication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_medication_request_items ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies if present
DROP POLICY IF EXISTS "Anyone can view ward medication requests" ON public.ward_medication_requests;
DROP POLICY IF EXISTS "Staff can manage ward medication requests" ON public.ward_medication_requests;
DROP POLICY IF EXISTS "Anyone can view ward medication request items" ON public.ward_medication_request_items;
DROP POLICY IF EXISTS "Staff can manage ward medication request items" ON public.ward_medication_request_items;

-- Helper expression for staff roles:
--   nurse, doctor, pharmacist, admin, facility_admin

CREATE POLICY "Anyone can view ward medication requests" ON public.ward_medication_requests
  FOR SELECT USING (true);

CREATE POLICY "Nursing and clinicians can insert ward requests" ON public.ward_medication_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('nurse', 'doctor', 'admin')
    )
  );

CREATE POLICY "Pharmacy and admins can update ward requests" ON public.ward_medication_requests
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pharmacist', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pharmacist', 'admin')
    )
  );

CREATE POLICY "Anyone can view ward medication request items" ON public.ward_medication_request_items
  FOR SELECT USING (true);

CREATE POLICY "Nursing and clinicians can insert ward request items" ON public.ward_medication_request_items
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('nurse', 'doctor', 'admin')
    )
  );

CREATE POLICY "Pharmacy and admins can update ward request items" ON public.ward_medication_request_items
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pharmacist', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pharmacist', 'admin')
    )
  );

COMMIT;
