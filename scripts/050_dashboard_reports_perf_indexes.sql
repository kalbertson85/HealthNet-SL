-- 050_dashboard_reports_perf_indexes.sql
-- Performance indexes for dashboard/reports/nursing query patterns.
-- Safe for partially migrated environments: each index is gated by table existence.

DO $$
BEGIN
  IF to_regclass('public.visits') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_visits_status_created_at ON public.visits(visit_status, created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.appointments') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_appointments_date_status ON public.appointments(appointment_date, status)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.prescriptions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON public.prescriptions(status)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.lab_tests') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lab_tests_status ON public.lab_tests(status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_lab_tests_created_at ON public.lab_tests(created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_payment_date ON public.invoices(payment_date DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.patients') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_patients_created_at ON public.patients(created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.admissions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_admissions_admission_date ON public.admissions(admission_date DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surgeries') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_surgeries_scheduled_at ON public.surgeries(scheduled_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.radiology_requests') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_radiology_requests_created_at ON public.radiology_requests(created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.visit_nursing_notes') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_visit_nursing_notes_performed_at ON public.visit_nursing_notes(performed_at DESC)';
  END IF;
END $$;
