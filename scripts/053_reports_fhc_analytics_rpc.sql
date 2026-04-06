-- 053_reports_fhc_analytics_rpc.sql
-- Aggregate FHC report analytics in SQL so the reports page does not need to scan raw rows in Node.

CREATE OR REPLACE FUNCTION public.dashboard_reports_fhc_analytics(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  economic_cost_total numeric,
  cost_by_facility jsonb,
  care_path_by_facility jsonb,
  radiology_by_facility jsonb,
  lab_by_facility jsonb,
  admissions_by_facility jsonb,
  monthly_data_truncated boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fhc_visits AS (
    SELECT
      v.id,
      COALESCE(v.facility_id::text, '(none)') AS facility_id,
      COALESCE(f.name, 'Unknown facility') AS facility_name,
      f.code AS facility_code
    FROM public.visits v
    LEFT JOIN public.facilities f ON f.id = v.facility_id
    WHERE v.is_free_health_care = true
  ),
  fhc_cost AS (
    SELECT
      fv.facility_id,
      fv.facility_name,
      fv.facility_code,
      SUM(COALESCE(ii.quantity, 0) * COALESCE(ii.unit_price, 0))::numeric AS amount
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN fhc_visits fv ON fv.id = i.visit_id
    WHERE ii.item_type = 'fhc_covered'
      AND i.created_at >= p_from
      AND i.created_at <= p_to
    GROUP BY fv.facility_id, fv.facility_name, fv.facility_code
  ),
  care_path_events AS (
    SELECT fv.facility_id, fv.facility_name, fv.facility_code, 1 AS admissions, 0 AS surgeries, 0 AS nursing_notes
    FROM public.admissions a
    JOIN fhc_visits fv ON fv.id = a.visit_id
    WHERE a.admission_date >= p_from
      AND a.admission_date <= p_to
      AND a.status IN ('admitted', 'discharged')

    UNION ALL

    SELECT fv.facility_id, fv.facility_name, fv.facility_code, 0 AS admissions, 1 AS surgeries, 0 AS nursing_notes
    FROM public.surgeries s
    JOIN fhc_visits fv ON fv.id = s.visit_id
    WHERE s.scheduled_at >= p_from
      AND s.scheduled_at <= p_to

    UNION ALL

    SELECT fv.facility_id, fv.facility_name, fv.facility_code, 0 AS admissions, 0 AS surgeries, 1 AS nursing_notes
    FROM public.visit_nursing_notes n
    JOIN fhc_visits fv ON fv.id = n.visit_id
    WHERE n.performed_at >= p_from
      AND n.performed_at <= p_to
  ),
  care_path_by_facility_cte AS (
    SELECT
      facility_id,
      facility_name,
      facility_code,
      SUM(admissions)::int AS admissions,
      SUM(surgeries)::int AS surgeries,
      SUM(nursing_notes)::int AS nursing_notes
    FROM care_path_events
    GROUP BY facility_id, facility_name, facility_code
  ),
  radiology_by_facility_cte AS (
    SELECT
      fv.facility_id,
      fv.facility_name,
      COUNT(*)::int AS count
    FROM public.radiology_requests r
    JOIN fhc_visits fv ON fv.id = r.visit_id
    WHERE r.created_at >= p_from
      AND r.created_at <= p_to
    GROUP BY fv.facility_id, fv.facility_name
  ),
  lab_by_facility_cte AS (
    SELECT
      fv.facility_id,
      fv.facility_name,
      COUNT(*)::int AS count
    FROM public.lab_tests l
    JOIN fhc_visits fv ON fv.id = l.visit_id
    WHERE l.created_at >= p_from
      AND l.created_at <= p_to
    GROUP BY fv.facility_id, fv.facility_name
  ),
  admissions_by_facility_cte AS (
    SELECT
      fv.facility_id,
      fv.facility_name,
      fv.facility_code,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) = 'admitted')::int AS admitted_count,
      COUNT(*) FILTER (WHERE lower(COALESCE(a.status, '')) = 'discharged')::int AS discharged_count
    FROM public.admissions a
    JOIN fhc_visits fv ON fv.id = a.visit_id
    WHERE a.admission_date >= p_from
      AND a.admission_date <= p_to
      AND a.status IN ('admitted', 'discharged')
    GROUP BY fv.facility_id, fv.facility_name, fv.facility_code
  )
  SELECT
    COALESCE((SELECT SUM(amount) FROM fhc_cost), 0)::numeric AS economic_cost_total,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'facility_id', facility_id,
            'name', facility_name,
            'code', facility_code,
            'amount', amount
          )
          ORDER BY amount DESC, facility_name ASC
        )
        FROM fhc_cost
      ),
      '[]'::jsonb
    ) AS cost_by_facility,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'facility_id', facility_id,
            'name', facility_name,
            'code', facility_code,
            'admissions', admissions,
            'surgeries', surgeries,
            'nursing_notes', nursing_notes
          )
          ORDER BY facility_name ASC
        )
        FROM care_path_by_facility_cte
      ),
      '[]'::jsonb
    ) AS care_path_by_facility,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'facility_id', facility_id,
            'name', facility_name,
            'count', count
          )
          ORDER BY count DESC, facility_name ASC
        )
        FROM radiology_by_facility_cte
      ),
      '[]'::jsonb
    ) AS radiology_by_facility,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'facility_id', facility_id,
            'name', facility_name,
            'count', count
          )
          ORDER BY count DESC, facility_name ASC
        )
        FROM lab_by_facility_cte
      ),
      '[]'::jsonb
    ) AS lab_by_facility,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'facility_id', facility_id,
            'name', facility_name,
            'code', facility_code,
            'count', count,
            'admitted_count', admitted_count,
            'discharged_count', discharged_count
          )
          ORDER BY count DESC, facility_name ASC
        )
        FROM admissions_by_facility_cte
      ),
      '[]'::jsonb
    ) AS admissions_by_facility,
    false AS monthly_data_truncated;
$$;
