-- 052_reports_summary_rpcs.sql
-- Fast aggregate helpers for dashboard reports summary cards and top company balances.

CREATE OR REPLACE FUNCTION public.dashboard_reports_summary(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  monthly_revenue numeric,
  new_patients bigint,
  completed_visits bigint,
  pending_lab_tests bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(COALESCE(i.paid_amount, 0))
      FROM public.invoices i
      WHERE i.payment_date IS NOT NULL
        AND i.payment_date >= p_from
        AND i.payment_date <= p_to
        AND COALESCE(i.paid_amount, 0) > 0
    ), 0) AS monthly_revenue,
    (
      SELECT COUNT(*)
      FROM public.patients p
      WHERE p.created_at >= p_from
        AND p.created_at <= p_to
    ) AS new_patients,
    (
      SELECT COUNT(*)
      FROM public.visits v
      WHERE v.created_at >= p_from
        AND v.created_at <= p_to
        AND v.visit_status = 'completed'
    ) AS completed_visits,
    (
      SELECT COUNT(*)
      FROM public.lab_tests lt
      WHERE lt.status = 'pending'
    ) AS pending_lab_tests;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_report_top_company_outstanding(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  outstanding numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.company_id,
    COALESCE(c.name, 'Unknown company') AS company_name,
    SUM(GREATEST(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0), 0)) AS outstanding
  FROM public.invoices i
  LEFT JOIN public.companies c ON c.id = i.company_id
  WHERE i.payer_type = 'company'
    AND i.company_id IS NOT NULL
    AND i.created_at >= p_from
    AND i.created_at <= p_to
  GROUP BY i.company_id, c.name
  HAVING SUM(GREATEST(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0), 0)) > 0
  ORDER BY outstanding DESC
  LIMIT GREATEST(COALESCE(p_limit, 5), 1);
$$;

REVOKE ALL ON FUNCTION public.dashboard_reports_summary(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_report_top_company_outstanding(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_reports_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_report_top_company_outstanding(timestamptz, timestamptz, integer) TO authenticated;
