-- 074_create_prescription_transactional_rpc.sql
-- Atomic prescription creation (header + items + audit log) to prevent partial writes.

DROP FUNCTION IF EXISTS public.create_prescription_transactional(uuid, uuid, uuid, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.create_prescription_transactional(
  p_patient_id uuid,
  p_doctor_id uuid,
  p_visit_id uuid,
  p_notes text DEFAULT NULL,
  p_medications jsonb DEFAULT '[]'::jsonb,
  p_prescription_number text DEFAULT NULL,
  p_status text DEFAULT 'pending'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription_id uuid;
  v_open_exists boolean := false;
BEGIN
  IF p_patient_id IS NULL OR p_doctor_id IS NULL OR p_visit_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers.');
  END IF;

  IF p_medications IS NULL OR jsonb_typeof(p_medications) <> 'array' OR jsonb_array_length(p_medications) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Medications payload must be a non-empty array.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.prescriptions p
    WHERE p.visit_id = p_visit_id
      AND p.status::text IN ('pending', 'partially_dispensed', 'partially-dispensed', 'partial_dispensed')
  )
  INTO v_open_exists;

  IF v_open_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_open_prescription', 'message', 'An open prescription already exists for this visit.');
  END IF;

  INSERT INTO public.prescriptions (
    patient_id,
    doctor_id,
    visit_id,
    prescription_number,
    notes,
    status
  ) VALUES (
    p_patient_id,
    p_doctor_id,
    p_visit_id,
    COALESCE(NULLIF(TRIM(p_prescription_number), ''), CONCAT('RX-', RIGHT(REPLACE(gen_random_uuid()::text, '-', ''), 6))),
    p_notes,
    COALESCE(NULLIF(TRIM(p_status), ''), 'pending')::public.prescription_status
  )
  RETURNING id INTO v_prescription_id;

  INSERT INTO public.prescription_items (
    prescription_id,
    medication_name,
    dosage,
    frequency,
    duration,
    quantity,
    instructions
  )
  SELECT
    v_prescription_id,
    TRIM(COALESCE(m.medication_name, '')),
    TRIM(COALESCE(m.dosage, '')),
    TRIM(COALESCE(m.frequency, '')),
    TRIM(COALESCE(m.duration, '')),
    COALESCE(m.quantity, 0),
    COALESCE(TRIM(m.instructions), '')
  FROM jsonb_to_recordset(p_medications) AS m(
    medication_name text,
    dosage text,
    frequency text,
    duration text,
    quantity integer,
    instructions text
  );

  IF NOT EXISTS (SELECT 1 FROM public.prescription_items WHERE prescription_id = v_prescription_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'No valid prescription items were supplied.');
  END IF;

  INSERT INTO public.pharmacy_audit_logs (
    prescription_id,
    actor_user_id,
    action,
    old_status,
    new_status,
    notes
  ) VALUES (
    v_prescription_id,
    p_doctor_id,
    'created',
    NULL,
    'pending',
    p_notes
  );

  RETURN jsonb_build_object('ok', true, 'prescription_id', v_prescription_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_open_prescription', 'message', 'An open prescription already exists for this visit.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'prescription_create_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_prescription_transactional(uuid, uuid, uuid, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_prescription_transactional(uuid, uuid, uuid, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_prescription_transactional(uuid, uuid, uuid, text, jsonb, text, text) TO service_role;
