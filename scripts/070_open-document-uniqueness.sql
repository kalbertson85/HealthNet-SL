-- 070_open-document-uniqueness.sql
-- Enforce one open invoice and one open prescription per visit where safely possible.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT visit_id
      FROM public.invoices
      WHERE visit_id IS NOT NULL
        AND COALESCE(total_amount, 0) > COALESCE(paid_amount, 0)
      GROUP BY visit_id
      HAVING COUNT(*) > 1
    ) conflicts
  ) THEN
    EXECUTE '
      CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_one_open_per_visit
      ON public.invoices(visit_id)
      WHERE visit_id IS NOT NULL
        AND COALESCE(total_amount, 0) > COALESCE(paid_amount, 0)
    ';
  ELSE
    RAISE NOTICE 'Skipped uq_invoices_one_open_per_visit: existing duplicate open invoices detected.';
  END IF;
END
$$;

DO $$
DECLARE
  has_prescription_visit_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prescriptions'
      AND column_name = 'visit_id'
  )
  INTO has_prescription_visit_id;

  IF NOT has_prescription_visit_id THEN
    RAISE NOTICE 'Skipped uq_prescriptions_one_open_per_visit: prescriptions.visit_id does not exist.';
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT visit_id
        FROM public.prescriptions
        WHERE visit_id IS NOT NULL
          AND status IN ('pending', 'partially_dispensed')
        GROUP BY visit_id
        HAVING COUNT(*) > 1
      ) conflicts
    ) THEN
      EXECUTE '
        CREATE UNIQUE INDEX IF NOT EXISTS uq_prescriptions_one_open_per_visit
        ON public.prescriptions(visit_id)
        WHERE visit_id IS NOT NULL
          AND status IN (''pending'', ''partially_dispensed'')
      ';
    ELSE
      RAISE NOTICE 'Skipped uq_prescriptions_one_open_per_visit: existing duplicate open prescriptions detected.';
    END IF;
  END IF;
END
$$;
