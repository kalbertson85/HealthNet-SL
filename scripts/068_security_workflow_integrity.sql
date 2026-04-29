-- 068_security_workflow_integrity.sql
-- Security + workflow integrity hardening (additive/safe).

-- 1) Facility-scoping helpers for RLS and server-side checks.
CREATE OR REPLACE FUNCTION public.current_user_facility_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_facility_id uuid;
  v_has_profiles_table boolean;
  v_has_facility_column boolean;
BEGIN
  v_has_profiles_table := to_regclass('public.profiles') IS NOT NULL;

  IF NOT v_has_profiles_table THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'profiles'
      AND c.column_name = 'facility_id'
  )
  INTO v_has_facility_column;

  IF NOT v_has_facility_column THEN
    RETURN NULL;
  END IF;

  SELECT p.facility_id
  INTO v_facility_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  RETURN v_facility_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_facility(p_facility_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_facility_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_any_role(ARRAY['admin','facility_admin']) THEN
    RETURN true;
  END IF;

  IF p_facility_id IS NULL THEN
    RETURN true;
  END IF;

  v_user_facility_id := public.current_user_facility_id();

  -- If this deployment has no user->facility mapping column yet,
  -- avoid hard-failing all non-admin access.
  IF v_user_facility_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN p_facility_id = v_user_facility_id;
END;
$$;

-- 2) Transaction-safe insurance batch creation RPC.
CREATE OR REPLACE FUNCTION public.create_insurance_billing_batch(
  p_batch_number text,
  p_company_id uuid,
  p_from_date date,
  p_to_date date,
  p_created_by uuid,
  p_invoice_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_batch_id uuid;
  v_requested_count int := COALESCE(array_length(p_invoice_ids, 1), 0);
  v_inserted_count int := 0;
BEGIN
  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'No invoices selected for insurance batch creation';
  END IF;

  INSERT INTO public.insurance_billing_batches (
    batch_number,
    company_id,
    from_date,
    to_date,
    status,
    subtotal,
    total_amount,
    paid_amount,
    created_by
  )
  VALUES (
    p_batch_number,
    p_company_id,
    p_from_date,
    p_to_date,
    'draft',
    0,
    0,
    0,
    p_created_by
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.insurance_billing_batch_items (
    batch_id,
    invoice_id,
    patient_id,
    visit_id,
    amount
  )
  SELECT
    v_batch_id,
    i.id,
    i.patient_id,
    i.visit_id,
    GREATEST(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0), 0)
  FROM public.invoices i
  WHERE i.id = ANY(p_invoice_ids)
    AND i.payer_type = 'company'
    AND i.company_id = p_company_id
    AND i.created_at >= p_from_date::timestamptz
    AND i.created_at < (p_to_date::timestamptz + interval '1 day')
    AND GREATEST(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0), 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.insurance_billing_batch_items bi
      WHERE bi.invoice_id = i.id
    );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count <> v_requested_count THEN
    RAISE EXCEPTION 'Only % of % invoice(s) were eligible for this batch. No changes were committed.', v_inserted_count, v_requested_count;
  END IF;

  UPDATE public.insurance_billing_batches b
  SET subtotal = agg.total_amount,
      total_amount = agg.total_amount,
      paid_amount = 0
  FROM (
    SELECT batch_id, COALESCE(SUM(amount), 0) AS total_amount
    FROM public.insurance_billing_batch_items
    WHERE batch_id = v_batch_id
    GROUP BY batch_id
  ) agg
  WHERE b.id = agg.batch_id;

  RETURN v_batch_id;
END;
$fn$;

-- 3) Workflow dependency + closed-visit guards.
CREATE OR REPLACE FUNCTION public.enforce_invoice_visit_dependency()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF NEW.visit_id IS NULL THEN
    RAISE EXCEPTION 'visit_id is required for invoices';
  END IF;

  SELECT v.visit_status::text INTO v_status
  FROM public.visits v
  WHERE v.id = NEW.visit_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Referenced visit does not exist';
  END IF;

  IF lower(v_status) IN ('completed', 'discharged') THEN
    RAISE EXCEPTION 'Cannot create or modify invoice on a closed visit';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_visit_dependency ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_visit_dependency
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_visit_dependency();

CREATE OR REPLACE FUNCTION public.enforce_prescription_visit_dependency()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF NEW.visit_id IS NULL THEN
    RAISE EXCEPTION 'visit_id is required for prescriptions';
  END IF;

  SELECT v.visit_status::text INTO v_status
  FROM public.visits v
  WHERE v.id = NEW.visit_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Referenced visit does not exist';
  END IF;

  IF lower(v_status) IN ('completed', 'discharged') THEN
    RAISE EXCEPTION 'Cannot create or modify prescription on a closed visit';
  END IF;

  RETURN NEW;
END;
$fn$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prescriptions'
      AND column_name = 'visit_id'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_prescription_visit_dependency ON public.prescriptions';
    EXECUTE 'CREATE TRIGGER trg_enforce_prescription_visit_dependency
             BEFORE INSERT OR UPDATE ON public.prescriptions
             FOR EACH ROW
             EXECUTE FUNCTION public.enforce_prescription_visit_dependency()';
  ELSE
    RAISE NOTICE 'Skipping prescription visit dependency trigger: public.prescriptions.visit_id does not exist.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_lab_visit_dependency()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF NEW.visit_id IS NULL THEN
    RAISE EXCEPTION 'visit_id is required for lab tests';
  END IF;

  SELECT v.visit_status::text INTO v_status
  FROM public.visits v
  WHERE v.id = NEW.visit_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Referenced visit does not exist';
  END IF;

  IF lower(v_status) IN ('completed', 'discharged') THEN
    RAISE EXCEPTION 'Cannot create or modify lab tests on a closed visit';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_lab_visit_dependency ON public.lab_tests;
CREATE TRIGGER trg_enforce_lab_visit_dependency
BEFORE INSERT OR UPDATE ON public.lab_tests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lab_visit_dependency();

-- 4) Duplicate prevention + consistency constraints.
DO $$
DECLARE
  v_duplicate_patients bigint;
BEGIN
  SELECT COUNT(*)
  INTO v_duplicate_patients
  FROM (
    SELECT v.patient_id
    FROM public.visits v
    WHERE v.patient_id IS NOT NULL
      AND v.visit_status IN ('triage_pending', 'doctor_pending', 'doctor_review', 'lab_pending', 'billing_pending', 'pharmacy_pending', 'admitted')
    GROUP BY v.patient_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF v_duplicate_patients = 0 THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_visits_one_active_per_patient
             ON public.visits(patient_id)
             WHERE visit_status IN (''triage_pending'', ''doctor_pending'', ''doctor_review'', ''lab_pending'', ''billing_pending'', ''pharmacy_pending'', ''admitted'')';
  ELSE
    RAISE NOTICE 'Skipped uq_visits_one_active_per_patient: % patient(s) already have duplicate active visits. Run cleanup and re-apply unique index.', v_duplicate_patients;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_visits_patient_active_status
  ON public.visits(patient_id, visit_status)
  WHERE visit_status IN ('triage_pending', 'doctor_pending', 'doctor_review', 'lab_pending', 'billing_pending', 'pharmacy_pending', 'admitted');

DO $$
BEGIN
  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_items_exact_line ON public.invoice_items (invoice_id, lower(trim(description)), quantity, unit_price)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.prescription_items') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'medication_name')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'dosage')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'frequency')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'duration')
  THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_prescription_items_exact_med ON public.prescription_items (prescription_id, lower(trim(medication_name)), lower(trim(dosage)), lower(trim(frequency)), lower(trim(duration)))';
  END IF;
END $$;

-- 5) Facility-scoped RLS policies on critical tables.
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_billing_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view visits" ON public.visits;
DROP POLICY IF EXISTS "Staff can manage visits" ON public.visits;
DROP POLICY IF EXISTS "authenticated_select_visits" ON public.visits;
DROP POLICY IF EXISTS "authenticated_insert_visits" ON public.visits;
DROP POLICY IF EXISTS "authenticated_update_visits" ON public.visits;

CREATE POLICY "Facility staff can view visits" ON public.visits
  FOR SELECT USING (public.can_access_facility(facility_id));

CREATE POLICY "Facility staff can manage visits" ON public.visits
  FOR ALL
  USING (public.has_any_role(ARRAY['admin','facility_admin','doctor','nurse','clerk','receptionist']) AND public.can_access_facility(facility_id))
  WITH CHECK (public.has_any_role(ARRAY['admin','facility_admin','doctor','nurse','clerk','receptionist']) AND public.can_access_facility(facility_id));

DROP POLICY IF EXISTS "authenticated_select_invoices" ON public.invoices;
DROP POLICY IF EXISTS "authenticated_insert_invoices" ON public.invoices;
DROP POLICY IF EXISTS "authenticated_update_invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff_select_invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff_insert_invoices" ON public.invoices;
DROP POLICY IF EXISTS "staff_update_invoices" ON public.invoices;

CREATE POLICY "Facility staff can view invoices" ON public.invoices
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = invoices.visit_id
        AND public.can_access_facility(v.facility_id)
    )
  );

CREATE POLICY "Billing staff can manage invoices" ON public.invoices
  FOR ALL
  USING (
    public.has_any_role(ARRAY['admin','facility_admin','cashier'])
    AND EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = invoices.visit_id
        AND public.can_access_facility(v.facility_id)
    )
  )
  WITH CHECK (
    public.has_any_role(ARRAY['admin','facility_admin','cashier'])
    AND EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = invoices.visit_id
        AND public.can_access_facility(v.facility_id)
    )
  );

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_select_prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_insert_prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_update_prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "staff_select_prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "staff_insert_prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "staff_update_prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "Facility staff can view prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "Clinical staff can manage prescriptions" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "Staff can view prescriptions (no visit link)" ON public.prescriptions';
  EXECUTE 'DROP POLICY IF EXISTS "Clinical staff can manage prescriptions (no visit link)" ON public.prescriptions';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prescriptions'
      AND column_name = 'visit_id'
  ) THEN
    EXECUTE 'CREATE POLICY "Facility staff can view prescriptions" ON public.prescriptions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.visits v
          WHERE v.id = prescriptions.visit_id
            AND public.can_access_facility(v.facility_id)
        )
      )';

    EXECUTE 'CREATE POLICY "Clinical staff can manage prescriptions" ON public.prescriptions
      FOR ALL
      USING (
        public.has_any_role(ARRAY[''admin'',''facility_admin'',''doctor'',''pharmacist''])
        AND EXISTS (
          SELECT 1
          FROM public.visits v
          WHERE v.id = prescriptions.visit_id
            AND public.can_access_facility(v.facility_id)
        )
      )
      WITH CHECK (
        public.has_any_role(ARRAY[''admin'',''facility_admin'',''doctor'',''pharmacist''])
        AND EXISTS (
          SELECT 1
          FROM public.visits v
          WHERE v.id = prescriptions.visit_id
            AND public.can_access_facility(v.facility_id)
        )
      )';
  ELSE
    EXECUTE 'CREATE POLICY "Staff can view prescriptions (no visit link)" ON public.prescriptions
      FOR SELECT
      USING (public.has_any_role(ARRAY[''admin'',''facility_admin'',''doctor'',''nurse'',''pharmacist'',''lab_tech'',''cashier'',''clerk'',''receptionist'']))';

    EXECUTE 'CREATE POLICY "Clinical staff can manage prescriptions (no visit link)" ON public.prescriptions
      FOR ALL
      USING (public.has_any_role(ARRAY[''admin'',''facility_admin'',''doctor'',''pharmacist'']))
      WITH CHECK (public.has_any_role(ARRAY[''admin'',''facility_admin'',''doctor'',''pharmacist'']))';
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated staff can view insurance billing batches" ON public.insurance_billing_batches;
DROP POLICY IF EXISTS "Billing staff can manage insurance billing batches" ON public.insurance_billing_batches;

CREATE POLICY "Facility staff can view insurance billing batches" ON public.insurance_billing_batches
  FOR SELECT
  USING (
    public.has_any_role(ARRAY['admin','facility_admin','cashier'])
    AND EXISTS (
      SELECT 1
      FROM public.insurance_billing_batch_items bi
      JOIN public.visits v ON v.id = bi.visit_id
      WHERE bi.batch_id = insurance_billing_batches.id
        AND public.can_access_facility(v.facility_id)
    )
  );

CREATE POLICY "Billing staff can manage insurance billing batches" ON public.insurance_billing_batches
  FOR ALL
  USING (
    public.has_any_role(ARRAY['admin','facility_admin','cashier'])
    AND EXISTS (
      SELECT 1
      FROM public.insurance_billing_batch_items bi
      JOIN public.visits v ON v.id = bi.visit_id
      WHERE bi.batch_id = insurance_billing_batches.id
        AND public.can_access_facility(v.facility_id)
    )
  )
  WITH CHECK (public.has_any_role(ARRAY['admin','facility_admin','cashier']));

DROP POLICY IF EXISTS "Authenticated staff can view insurance billing batch items" ON public.insurance_billing_batch_items;
DROP POLICY IF EXISTS "Billing staff can manage insurance billing batch items" ON public.insurance_billing_batch_items;

CREATE POLICY "Facility staff can view insurance billing batch items" ON public.insurance_billing_batch_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = insurance_billing_batch_items.visit_id
        AND public.can_access_facility(v.facility_id)
    )
  );

CREATE POLICY "Billing staff can manage insurance billing batch items" ON public.insurance_billing_batch_items
  FOR ALL
  USING (
    public.has_any_role(ARRAY['admin','facility_admin','cashier'])
    AND EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = insurance_billing_batch_items.visit_id
        AND public.can_access_facility(v.facility_id)
    )
  )
  WITH CHECK (
    public.has_any_role(ARRAY['admin','facility_admin','cashier'])
    AND EXISTS (
      SELECT 1
      FROM public.visits v
      WHERE v.id = insurance_billing_batch_items.visit_id
        AND public.can_access_facility(v.facility_id)
    )
  );

DROP POLICY IF EXISTS "authenticated_select_patients" ON public.patients;
DROP POLICY IF EXISTS "authenticated_insert_patients" ON public.patients;
DROP POLICY IF EXISTS "authenticated_update_patients" ON public.patients;
DROP POLICY IF EXISTS "staff_select_patients" ON public.patients;
DROP POLICY IF EXISTS "staff_insert_patients" ON public.patients;
DROP POLICY IF EXISTS "staff_update_patients" ON public.patients;

CREATE POLICY "Staff can view patients" ON public.patients
  FOR SELECT
  USING (
    public.has_any_role(ARRAY['admin','facility_admin','doctor','nurse','pharmacist','lab_tech','cashier','clerk','receptionist'])
    AND public.can_access_facility(facility_id)
  );

CREATE POLICY "Authorized staff can create patients" ON public.patients
  FOR INSERT
  WITH CHECK (
    public.has_any_role(ARRAY['admin','facility_admin','doctor','nurse','clerk','receptionist'])
    AND public.can_access_facility(facility_id)
  );

CREATE POLICY "Authorized staff can update patients" ON public.patients
  FOR UPDATE
  USING (
    public.has_any_role(ARRAY['admin','facility_admin','doctor','nurse','clerk'])
    AND public.can_access_facility(facility_id)
  )
  WITH CHECK (
    public.has_any_role(ARRAY['admin','facility_admin','doctor','nurse','clerk'])
    AND public.can_access_facility(facility_id)
  );

DROP POLICY IF EXISTS "Facility access" ON public.facilities;
CREATE POLICY "Facility access" ON public.facilities
  FOR SELECT
  USING (
    public.has_any_role(ARRAY['admin','facility_admin'])
    OR id = public.current_user_facility_id()
  );

-- 6) Background consistency checks surfaced to admin.
CREATE OR REPLACE FUNCTION public.admin_data_consistency_alerts()
RETURNS TABLE (
  visits_without_billing bigint,
  prescriptions_without_dispense bigint,
  insurance_batches_without_totals bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT COUNT(*)
      FROM public.visits v
      LEFT JOIN public.invoices i ON i.visit_id = v.id
      WHERE v.visit_status = 'billing_pending'
        AND public.can_access_facility(v.facility_id)
        AND i.id IS NULL
    ), 0) AS visits_without_billing,
    COALESCE((
      SELECT COUNT(*)
      FROM public.prescriptions p
      WHERE lower(COALESCE(p.status::text, '')) IN ('pending', 'ready', 'in_progress')
    ), 0) AS prescriptions_without_dispense,
    COALESCE((
      SELECT COUNT(*)
      FROM public.insurance_billing_batches b
      WHERE COALESCE(b.total_amount, 0) <= 0
         OR COALESCE((SELECT SUM(amount) FROM public.insurance_billing_batch_items bi WHERE bi.batch_id = b.id), 0) <= 0
    ), 0) AS insurance_batches_without_totals;
$$;

REVOKE ALL ON FUNCTION public.current_user_facility_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_facility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_insurance_billing_batch(text, uuid, date, date, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_data_consistency_alerts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_facility_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_facility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_insurance_billing_batch(text, uuid, date, date, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_data_consistency_alerts() TO authenticated;
