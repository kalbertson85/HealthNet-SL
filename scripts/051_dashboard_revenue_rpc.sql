-- 051_dashboard_revenue_rpc.sql
-- Fast aggregate for dashboard revenue metric.

CREATE OR REPLACE FUNCTION public.dashboard_total_paid_revenue()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
  FROM public.invoices
  WHERE COALESCE(paid_amount, 0) > 0;
$$;

REVOKE ALL ON FUNCTION public.dashboard_total_paid_revenue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_total_paid_revenue() TO authenticated;
