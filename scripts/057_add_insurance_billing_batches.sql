CREATE TABLE IF NOT EXISTS public.insurance_billing_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  from_date date NOT NULL,
  to_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'paid')),
  subtotal numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  created_by uuid NULL,
  submitted_at timestamptz NULL,
  paid_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_billing_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.insurance_billing_batches(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  patient_id uuid NULL REFERENCES public.patients(id) ON DELETE SET NULL,
  visit_id uuid NULL REFERENCES public.visits(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_billing_batches_company_id
  ON public.insurance_billing_batches(company_id);

CREATE INDEX IF NOT EXISTS idx_insurance_billing_batches_status
  ON public.insurance_billing_batches(status);

CREATE INDEX IF NOT EXISTS idx_insurance_billing_batch_items_batch_id
  ON public.insurance_billing_batch_items(batch_id);

ALTER TABLE public.insurance_billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_billing_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can view insurance billing batches" ON public.insurance_billing_batches;
DROP POLICY IF EXISTS "Billing staff can manage insurance billing batches" ON public.insurance_billing_batches;
DROP POLICY IF EXISTS "Authenticated staff can view insurance billing batch items" ON public.insurance_billing_batch_items;
DROP POLICY IF EXISTS "Billing staff can manage insurance billing batch items" ON public.insurance_billing_batch_items;

CREATE POLICY "Authenticated staff can view insurance billing batches" ON public.insurance_billing_batches
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Billing staff can manage insurance billing batches" ON public.insurance_billing_batches
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can view insurance billing batch items" ON public.insurance_billing_batch_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Billing staff can manage insurance billing batch items" ON public.insurance_billing_batch_items
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.set_updated_at_insurance_billing_batches()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_insurance_billing_batches_updated_at
  ON public.insurance_billing_batches;

CREATE TRIGGER trg_insurance_billing_batches_updated_at
BEFORE UPDATE ON public.insurance_billing_batches
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_insurance_billing_batches();
