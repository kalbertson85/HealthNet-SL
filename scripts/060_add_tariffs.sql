BEGIN;

CREATE TABLE IF NOT EXISTS public.tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL CHECK (service_type IN ('inpatient', 'surgery', 'nursing', 'lab', 'radiology')),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  insurer_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  base_price numeric(12,2) NOT NULL CHECK (base_price >= 0),
  unit_type text NOT NULL CHECK (unit_type IN ('per_day', 'per_hour', 'per_service')),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tariffs_service_facility_insurer_unique
  ON public.tariffs(service_type, facility_id, COALESCE(insurer_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_tariffs_facility_service
  ON public.tariffs(facility_id, service_type);

CREATE INDEX IF NOT EXISTS idx_tariffs_insurer
  ON public.tariffs(insurer_id);

ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can view tariffs" ON public.tariffs;
DROP POLICY IF EXISTS "Billing staff can manage tariffs" ON public.tariffs;

CREATE POLICY "Authenticated staff can view tariffs" ON public.tariffs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Billing staff can manage tariffs" ON public.tariffs
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
