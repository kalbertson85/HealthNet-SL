-- 056_dashboard_alerts_rpc.sql
-- Aggregate helper for dashboard alert counts and low-stock snapshot.

CREATE OR REPLACE FUNCTION public.dashboard_home_alerts(
  p_low_stock_limit integer DEFAULT 12
)
RETURNS TABLE (
  pending_lab_tests bigint,
  pending_radiology_requests bigint,
  outstanding_invoices bigint,
  low_stock_items jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH low_stock AS (
    SELECT
      ms.quantity_on_hand,
      ms.reorder_level,
      COALESCE(m.name, 'Unknown medication') AS medication_name
    FROM public.medication_stock ms
    LEFT JOIN public.medications m ON m.id = ms.medication_id
    WHERE COALESCE(ms.reorder_level, 0) > 0
      AND COALESCE(ms.quantity_on_hand, 0) <= COALESCE(ms.reorder_level, 0)
    ORDER BY ms.quantity_on_hand ASC, m.name ASC
    LIMIT GREATEST(COALESCE(p_low_stock_limit, 12), 1)
  )
  SELECT
    COALESCE((SELECT COUNT(*) FROM public.lab_tests WHERE status = 'pending'), 0) AS pending_lab_tests,
    COALESCE((SELECT COUNT(*) FROM public.radiology_requests WHERE status IN ('pending', 'scheduled')), 0) AS pending_radiology_requests,
    COALESCE((
      SELECT COUNT(*)
      FROM public.invoices
      WHERE GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0) > 0
    ), 0) AS outstanding_invoices,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'quantity_on_hand', quantity_on_hand,
            'reorder_level', reorder_level,
            'medication_name', medication_name
          )
        )
        FROM low_stock
      ),
      '[]'::jsonb
    ) AS low_stock_items;
$$;

REVOKE ALL ON FUNCTION public.dashboard_home_alerts(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_home_alerts(integer) TO authenticated;
