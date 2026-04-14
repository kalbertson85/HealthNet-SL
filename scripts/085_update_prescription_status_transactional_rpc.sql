-- 085_update_prescription_status_transactional_rpc.sql
-- Atomic prescription status transition + pharmacy audit.

DROP FUNCTION IF EXISTS public.update_prescription_status_transactional(uuid, text, uuid, text);
CREATE FUNCTION public.update_prescription_status_transactional(
  p_prescription_id uuid,
  p_new_status text,
  p_actor_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription record;
  v_old_status text;
BEGIN
  IF p_prescription_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers.');
  END IF;

  IF COALESCE(NULLIF(TRIM(p_new_status), ''), '') NOT IN ('in_progress', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'message', 'Unsupported prescription status transition target.');
  END IF;

  SELECT id, status, patient_id, prescription_number
  INTO v_prescription
  FROM public.prescriptions
  WHERE id = p_prescription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'prescription_not_found', 'message', 'Prescription not found.');
  END IF;

  v_old_status := COALESCE(v_prescription.status::text, 'pending');

  IF v_old_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_pending', 'message', 'Prescription is no longer pending.');
  END IF;

  UPDATE public.prescriptions
  SET status = TRIM(p_new_status)::public.prescription_status
  WHERE id = p_prescription_id;

  INSERT INTO public.pharmacy_audit_logs (
    prescription_id,
    actor_user_id,
    action,
    old_status,
    new_status,
    notes,
    metadata
  ) VALUES (
    p_prescription_id,
    p_actor_user_id,
    CASE
      WHEN TRIM(p_new_status) = 'cancelled' THEN 'cancelled'
      ELSE 'status_updated'
    END,
    v_old_status,
    TRIM(p_new_status),
    p_notes,
    jsonb_build_object(
      'source', 'rpc.update_prescription_status_transactional',
      'patient_id', v_prescription.patient_id,
      'prescription_number', v_prescription.prescription_number
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'prescription_id', p_prescription_id,
    'old_status', v_old_status,
    'new_status', TRIM(p_new_status),
    'patient_id', v_prescription.patient_id,
    'prescription_number', v_prescription.prescription_number
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'prescription_status_update_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.update_prescription_status_transactional(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_prescription_status_transactional(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_prescription_status_transactional(uuid, text, uuid, text) TO service_role;
