-- 039_insurance_claims_and_statuses.sql
-- Add insurance claim tracking linked to invoices and companies.

BEGIN;

-- Claims table, one claim per invoice (for invoices where payer_type = 'company')
CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, prepared, submitted, paid, rejected, cancelled
  claimed_amount NUMERIC,
  approved_amount NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_insurance_claims_invoice_id
  ON public.insurance_claims(invoice_id);

CREATE INDEX IF NOT EXISTS idx_insurance_claims_company_status
  ON public.insurance_claims(company_id, status);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_insurance_claim_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insurance_claims_set_updated_at ON public.insurance_claims;

CREATE TRIGGER trg_insurance_claims_set_updated_at
  BEFORE UPDATE ON public.insurance_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.set_insurance_claim_updated_at();

-- Optional: extend invoices with a simple claim_status shortcut
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS claim_status TEXT,
  ADD COLUMN IF NOT EXISTS claim_id UUID REFERENCES public.insurance_claims(id);

-- Basic RLS for claims
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view insurance claims" ON public.insurance_claims;
DROP POLICY IF EXISTS "Billing staff can manage insurance claims" ON public.insurance_claims;

CREATE POLICY "Anyone can view insurance claims" ON public.insurance_claims
  FOR SELECT USING (true);

CREATE POLICY "Billing staff can manage insurance claims" ON public.insurance_claims
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin')
    )
  );

COMMIT;
