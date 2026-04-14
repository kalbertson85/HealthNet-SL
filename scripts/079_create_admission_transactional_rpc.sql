-- 079_create_admission_transactional_rpc.sql
-- Atomic inpatient admission creation across admission, bed, ward, and visit state.

DROP FUNCTION IF EXISTS public.create_admission_transactional(uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_admission_transactional(
  p_patient_id uuid,
  p_bed_id uuid,
  p_admitting_doctor_id uuid,
  p_admission_date text,
  p_admission_reason text,
  p_diagnosis text,
  p_treatment_plan text,
  p_emergency_admission boolean DEFAULT false,
  p_created_by uuid DEFAULT NULL,
  p_visit_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bed_id uuid;
  v_ward_id uuid;
  v_admission_id uuid;
  v_visit_status text := NULL;
BEGIN
  IF p_patient_id IS NULL OR p_bed_id IS NULL OR p_admitting_doctor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers');
  END IF;

  SELECT b.id, b.ward_id
  INTO v_bed_id, v_ward_id
  FROM public.beds b
  WHERE b.id = p_bed_id
    AND b.status = 'available'
  LIMIT 1;

  IF v_bed_id IS NULL OR v_ward_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bed_unavailable', 'message', 'Selected bed is unavailable');
  END IF;

  IF p_visit_id IS NOT NULL THEN
    SELECT v.visit_status::text
    INTO v_visit_status
    FROM public.visits v
    WHERE v.id = p_visit_id
    LIMIT 1;

    IF v_visit_status IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'visit_not_found', 'message', 'Linked visit not found');
    END IF;

    IF v_visit_status NOT IN ('doctor_pending', 'doctor_review', 'billing_pending', 'admitted') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'message', 'Visit cannot transition to admitted');
    END IF;
  END IF;

  INSERT INTO public.admissions (
    patient_id,
    ward_id,
    bed_id,
    admitting_doctor_id,
    admission_date,
    admission_reason,
    diagnosis,
    treatment_plan,
    emergency_admission,
    status,
    created_by,
    visit_id
  ) VALUES (
    p_patient_id,
    v_ward_id,
    v_bed_id,
    p_admitting_doctor_id,
    p_admission_date,
    p_admission_reason,
    p_diagnosis,
    p_treatment_plan,
    COALESCE(p_emergency_admission, false),
    'admitted',
    p_created_by,
    p_visit_id
  )
  RETURNING id INTO v_admission_id;

  UPDATE public.beds
  SET status = 'occupied'
  WHERE id = v_bed_id;

  UPDATE public.wards
  SET available_beds = GREATEST(0, COALESCE(available_beds, 0) - 1)
  WHERE id = v_ward_id;

  IF p_visit_id IS NOT NULL AND v_visit_status <> 'admitted' THEN
    UPDATE public.visits
    SET visit_status = 'admitted'
    WHERE id = p_visit_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'admission_id', v_admission_id,
    'bed_id', v_bed_id,
    'ward_id', v_ward_id,
    'visit_id', p_visit_id,
    'previous_visit_status', v_visit_status,
    'next_visit_status', CASE WHEN p_visit_id IS NULL THEN NULL ELSE 'admitted' END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'create_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_admission_transactional(uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_admission_transactional(uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admission_transactional(uuid, uuid, uuid, text, text, text, text, boolean, uuid, uuid) TO service_role;
