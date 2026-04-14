BEGIN;

CREATE TABLE IF NOT EXISTS public.insurance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.insurance_billing_batches(id) ON DELETE CASCADE,
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  variance numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('matched', 'underpaid', 'overpaid', 'denied', 'partial')),
  denial_reason_codes text[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_insurance_payments_batch_id
  ON public.insurance_payments(batch_id, created_at DESC);

ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can view insurance payments" ON public.insurance_payments;
DROP POLICY IF EXISTS "Billing staff can manage insurance payments" ON public.insurance_payments;

CREATE POLICY "Authenticated staff can view insurance payments" ON public.insurance_payments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Billing staff can manage insurance payments" ON public.insurance_payments
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
