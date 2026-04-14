BEGIN;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(
    coalesce(
      (SELECT p.role::text FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1),
      auth.jwt() ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_app_role() = ANY (ARRAY(SELECT lower(value) FROM unnest(required_roles) AS value))
$$;

DO $$
BEGIN
  -- Core flagged tables
  IF to_regclass('public.insurance_billing_batches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.insurance_billing_batches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated staff can view insurance billing batches" ON public.insurance_billing_batches';
    EXECUTE 'DROP POLICY IF EXISTS "Billing staff can manage insurance billing batches" ON public.insurance_billing_batches';
    EXECUTE 'CREATE POLICY "Authenticated staff can view insurance billing batches" ON public.insurance_billing_batches FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Billing staff can manage insurance billing batches" ON public.insurance_billing_batches FOR ALL USING (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier''])) WITH CHECK (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier'']))';
  END IF;

  IF to_regclass('public.insurance_billing_batch_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.insurance_billing_batch_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated staff can view insurance billing batch items" ON public.insurance_billing_batch_items';
    EXECUTE 'DROP POLICY IF EXISTS "Billing staff can manage insurance billing batch items" ON public.insurance_billing_batch_items';
    EXECUTE 'CREATE POLICY "Authenticated staff can view insurance billing batch items" ON public.insurance_billing_batch_items FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Billing staff can manage insurance billing batch items" ON public.insurance_billing_batch_items FOR ALL USING (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier''])) WITH CHECK (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier'']))';
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs';
    EXECUTE 'CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.has_any_role(ARRAY[''admin'',''facility_admin'']))';
    EXECUTE 'CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = ''service_role'')';
  END IF;

  -- High-impact policy tightening (safe on mixed migration states)
  IF to_regclass('public.sync_queue') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can enqueue sync operations" ON public.sync_queue';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view sync queue" ON public.sync_queue';
    EXECUTE 'CREATE POLICY "Users can enqueue sync operations" ON public.sync_queue FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "Admins can view sync queue" ON public.sync_queue FOR SELECT USING (public.has_any_role(ARRAY[''admin'',''facility_admin'']))';
  END IF;

  IF to_regclass('public.password_reset_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.password_reset_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "No direct access to password reset events" ON public.password_reset_events';
    EXECUTE 'CREATE POLICY "No direct access to password reset events" ON public.password_reset_events FOR ALL USING (false) WITH CHECK (false)';
  END IF;

  IF to_regclass('public.tariffs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view tariffs" ON public.tariffs';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can manage tariffs" ON public.tariffs';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated staff can view tariffs" ON public.tariffs';
    EXECUTE 'DROP POLICY IF EXISTS "Billing staff can manage tariffs" ON public.tariffs';
    EXECUTE 'CREATE POLICY "Authenticated staff can view tariffs" ON public.tariffs FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Billing staff can manage tariffs" ON public.tariffs FOR ALL USING (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier''])) WITH CHECK (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier'']))';
  END IF;

  IF to_regclass('public.insurance_payments') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can view insurance payments" ON public.insurance_payments';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated staff can view insurance payments" ON public.insurance_payments';
    EXECUTE 'DROP POLICY IF EXISTS "Billing staff can manage insurance payments" ON public.insurance_payments';
    EXECUTE 'CREATE POLICY "Authenticated staff can view insurance payments" ON public.insurance_payments FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Billing staff can manage insurance payments" ON public.insurance_payments FOR ALL USING (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier''])) WITH CHECK (public.has_any_role(ARRAY[''admin'',''facility_admin'',''cashier'']))';
  END IF;

  -- Common "USING(true)" legacy tables
  IF to_regclass('public.queues') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view queues" ON public.queues';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can insert queues" ON public.queues';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can update queues" ON public.queues';
    EXECUTE 'CREATE POLICY "Anyone can view queues" ON public.queues FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Staff can insert queues" ON public.queues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Staff can update queues" ON public.queues FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;

  IF to_regclass('public.queue_settings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view queue settings" ON public.queue_settings';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can update queue settings" ON public.queue_settings';
    EXECUTE 'CREATE POLICY "Anyone can view queue settings" ON public.queue_settings FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Admins can update queue settings" ON public.queue_settings FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;

  IF to_regclass('public.radiology_requests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.radiology_requests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view radiology requests" ON public.radiology_requests';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can manage radiology requests" ON public.radiology_requests';
    EXECUTE 'CREATE POLICY "Anyone can view radiology requests" ON public.radiology_requests FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Staff can manage radiology requests" ON public.radiology_requests FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;

  IF to_regclass('public.radiology_audit_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.radiology_audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view radiology audit logs" ON public.radiology_audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can manage radiology audit logs" ON public.radiology_audit_logs';
    EXECUTE 'CREATE POLICY "Anyone can view radiology audit logs" ON public.radiology_audit_logs FOR SELECT USING (auth.uid() IS NOT NULL)';
    EXECUTE 'CREATE POLICY "Staff can manage radiology audit logs" ON public.radiology_audit_logs FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;
END
$$;

COMMIT;
