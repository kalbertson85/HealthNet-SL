-- 078_discharge_admission_transactional_rpc.sql
-- Atomic inpatient discharge update across admission, bed, ward, and visit records.

DROP FUNCTION IF EXISTS public.discharge_admission_transactional(uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.discharge_admission_transactional(
  p_admission_id uuid,
  p_discharge_summary text,
  p_discharge_instructions text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admission_record public.admissions%ROWTYPE;
  v_visit_status text := NULL;
BEGIN
  IF p_admission_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'admission_id is required');
  END IF;

  IF COALESCE(NULLIF(TRIM(p_discharge_summary), ''), '') = '' OR COALESCE(NULLIF(TRIM(p_discharge_instructions), ''), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Discharge summary and instructions are required');
  END IF;

  SELECT a.*
  INTO v_admission_record
  FROM public.admissions a
  WHERE a.id = p_admission_id
  LIMIT 1;

  IF v_admission_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'admission_not_found', 'message', 'Admission not found');
  END IF;

  IF COALESCE(v_admission_record.status, '') <> 'admitted' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'admission_not_active', 'message', 'Admission is not active');
  END IF;

  IF v_admission_record.visit_id IS NOT NULL THEN
    SELECT v.visit_status::text
    INTO v_visit_status
    FROM public.visits v
    WHERE v.id = v_admission_record.visit_id
    LIMIT 1;

    IF v_visit_status IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'visit_not_found', 'message', 'Linked visit not found');
    END IF;

    IF v_visit_status IN ('completed', 'discharged') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'message', 'Visit is already terminal');
    END IF;
  END IF;

  UPDATE public.admissions
  SET
    status = 'discharged',
    discharge_date = NOW(),
    discharge_summary = TRIM(p_discharge_summary),
    discharge_instructions = TRIM(p_discharge_instructions)
  WHERE id = v_admission_record.id;

  IF v_admission_record.bed_id IS NOT NULL THEN
    UPDATE public.beds
    SET status = 'available'
    WHERE id = v_admission_record.bed_id;
  END IF;

  IF v_admission_record.ward_id IS NOT NULL THEN
    UPDATE public.wards
    SET available_beds = COALESCE(available_beds, 0) + 1
    WHERE id = v_admission_record.ward_id;
  END IF;

  IF v_admission_record.visit_id IS NOT NULL THEN
    UPDATE public.visits
    SET visit_status = 'completed'
    WHERE id = v_admission_record.visit_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'admission_id', v_admission_record.id,
    'visit_id', v_admission_record.visit_id,
    'bed_id', v_admission_record.bed_id,
    'ward_id', v_admission_record.ward_id,
    'previous_visit_status', v_visit_status,
    'next_visit_status', CASE WHEN v_admission_record.visit_id IS NULL THEN NULL ELSE 'completed' END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'discharge_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.discharge_admission_transactional(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discharge_admission_transactional(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discharge_admission_transactional(uuid, text, text, uuid) TO service_role;
