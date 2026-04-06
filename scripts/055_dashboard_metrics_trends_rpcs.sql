-- 055_dashboard_metrics_trends_rpcs.sql
-- Aggregate helpers for dashboard metrics and 7-day trends.

CREATE OR REPLACE FUNCTION public.dashboard_home_metrics(
  p_today date
)
RETURNS TABLE (
  total_patients bigint,
  today_appointments bigint,
  pending_prescriptions bigint,
  active_admissions bigint,
  pending_lab_tests bigint,
  total_revenue numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT COUNT(*) FROM public.patients), 0) AS total_patients,
    COALESCE((SELECT COUNT(*) FROM public.appointments WHERE appointment_date = p_today AND status <> 'cancelled'), 0) AS today_appointments,
    COALESCE((SELECT COUNT(*) FROM public.prescriptions WHERE status = 'pending'), 0) AS pending_prescriptions,
    COALESCE((SELECT COUNT(*) FROM public.admissions WHERE status = 'active'), 0) AS active_admissions,
    COALESCE((SELECT COUNT(*) FROM public.lab_tests WHERE status = 'pending'), 0) AS pending_lab_tests,
    COALESCE((
      SELECT SUM(COALESCE(i.paid_amount, 0))
      FROM public.invoices i
      WHERE i.payment_date IS NOT NULL
        AND COALESCE(i.paid_amount, 0) > 0
    ), 0) AS total_revenue;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_seven_day_trends(
  p_start date,
  p_end date
)
RETURNS TABLE (
  day date,
  patient_count bigint,
  appointment_count bigint,
  revenue_total numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH day_window AS (
    SELECT generate_series(p_start, p_end, interval '1 day')::date AS day
  ),
  patient_counts AS (
    SELECT DATE(created_at) AS day, COUNT(*)::bigint AS count
    FROM public.patients
    WHERE DATE(created_at) >= p_start
      AND DATE(created_at) <= p_end
    GROUP BY DATE(created_at)
  ),
  appointment_counts AS (
    SELECT appointment_date AS day, COUNT(*)::bigint AS count
    FROM public.appointments
    WHERE appointment_date >= p_start
      AND appointment_date <= p_end
      AND status <> 'cancelled'
    GROUP BY appointment_date
  ),
  revenue_counts AS (
    SELECT DATE(payment_date) AS day, SUM(COALESCE(paid_amount, 0))::numeric AS total
    FROM public.invoices
    WHERE payment_date IS NOT NULL
      AND DATE(payment_date) >= p_start
      AND DATE(payment_date) <= p_end
      AND COALESCE(paid_amount, 0) > 0
    GROUP BY DATE(payment_date)
  )
  SELECT
    d.day,
    COALESCE(pc.count, 0) AS patient_count,
    COALESCE(ac.count, 0) AS appointment_count,
    COALESCE(rc.total, 0) AS revenue_total
  FROM day_window d
  LEFT JOIN patient_counts pc ON pc.day = d.day
  LEFT JOIN appointment_counts ac ON ac.day = d.day
  LEFT JOIN revenue_counts rc ON rc.day = d.day
  ORDER BY d.day ASC;
$$;

REVOKE ALL ON FUNCTION public.dashboard_home_metrics(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_seven_day_trends(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_home_metrics(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_seven_day_trends(date, date) TO authenticated;
