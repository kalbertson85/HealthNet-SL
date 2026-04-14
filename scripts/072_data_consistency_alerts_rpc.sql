-- 072_data_consistency_alerts_rpc.sql
-- Data consistency checks for workflow integrity monitoring.

DROP FUNCTION IF EXISTS public.admin_data_consistency_alerts();
CREATE FUNCTION public.admin_data_consistency_alerts()
RETURNS TABLE (
  visits_without_billing bigint,
  open_prescriptions_without_dispense bigint,
  queue_in_progress_without_visit bigint,
  insurance_batches_without_totals bigint,
  insurance_batches_with_mismatch bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_queues_visit_id boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'queues'
      AND c.column_name = 'visit_id'
  )
  INTO v_has_queues_visit_id;

  RETURN QUERY
  WITH batch_totals AS (
    SELECT
      b.id AS batch_id,
      COALESCE(b.total_amount, 0) AS recorded_total,
      COALESCE(SUM(i.amount), 0) AS item_total,
      COUNT(i.id) AS item_count
    FROM public.insurance_billing_batches b
    LEFT JOIN public.insurance_billing_batch_items i ON i.batch_id = b.id
    GROUP BY b.id, b.total_amount
  )
  SELECT
    COALESCE((
      SELECT COUNT(*)
      FROM public.visits v
      WHERE v.visit_status IN ('billing_pending', 'pharmacy_pending', 'completed', 'discharged')
        AND COALESCE(v.is_free_health_care, false) = false
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoices inv
          WHERE inv.visit_id = v.id
        )
    ), 0) AS visits_without_billing,
    COALESCE((
      SELECT COUNT(*)
      FROM public.prescriptions p
      WHERE p.status::text IN ('pending', 'partially_dispensed', 'partially-dispensed', 'partial_dispensed')
    ), 0) AS open_prescriptions_without_dispense,
    CASE
      WHEN v_has_queues_visit_id THEN COALESCE((
        SELECT COUNT(*)
        FROM public.queues q
        WHERE q.status = 'in_progress'
          AND q.visit_id IS NULL
      ), 0)
      ELSE 0
    END AS queue_in_progress_without_visit,
    COALESCE((
      SELECT COUNT(*)
      FROM batch_totals bt
      WHERE bt.item_count = 0
         OR (bt.item_total > 0 AND bt.recorded_total <= 0)
    ), 0) AS insurance_batches_without_totals,
    COALESCE((
      SELECT COUNT(*)
      FROM batch_totals bt
      WHERE bt.item_count > 0
        AND ABS(bt.recorded_total - bt.item_total) > 0.01
    ), 0) AS insurance_batches_with_mismatch;
END;
$$;

DROP FUNCTION IF EXISTS public.insurance_batch_total_mismatches_fallback();
CREATE FUNCTION public.insurance_batch_total_mismatches_fallback()
RETURNS TABLE (
  insurance_batches_without_totals bigint,
  insurance_batches_with_mismatch bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH batch_totals AS (
    SELECT
      b.id AS batch_id,
      COALESCE(b.total_amount, 0) AS recorded_total,
      COALESCE(SUM(i.amount), 0) AS item_total,
      COUNT(i.id) AS item_count
    FROM public.insurance_billing_batches b
    LEFT JOIN public.insurance_billing_batch_items i ON i.batch_id = b.id
    GROUP BY b.id, b.total_amount
  )
  SELECT
    COALESCE(COUNT(*) FILTER (
      WHERE bt.item_count = 0
         OR (bt.item_total > 0 AND bt.recorded_total <= 0)
    ), 0) AS insurance_batches_without_totals,
    COALESCE(COUNT(*) FILTER (
      WHERE bt.item_count > 0
        AND ABS(bt.recorded_total - bt.item_total) > 0.01
    ), 0) AS insurance_batches_with_mismatch
  FROM batch_totals bt;
$$;

REVOKE ALL ON FUNCTION public.admin_data_consistency_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insurance_batch_total_mismatches_fallback() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_data_consistency_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.insurance_batch_total_mismatches_fallback() TO authenticated;
