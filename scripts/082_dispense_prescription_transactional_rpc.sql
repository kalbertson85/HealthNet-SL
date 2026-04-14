-- 082_dispense_prescription_transactional_rpc.sql
-- Atomic prescription dispense: stock deduction + dispense events + prescription status + audit + optional visit completion.

DROP FUNCTION IF EXISTS public.dispense_prescription_transactional(uuid, uuid, boolean);
CREATE FUNCTION public.dispense_prescription_transactional(
  p_prescription_id uuid,
  p_actor_user_id uuid,
  p_complete_visit boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription record;
  v_stock_missing_count integer := 0;
  v_invalid_qty_count integer := 0;
  v_insufficient_count integer := 0;
BEGIN
  IF p_prescription_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers.');
  END IF;

  SELECT id, patient_id, prescription_number, status, visit_id
  INTO v_prescription
  FROM public.prescriptions
  WHERE id = p_prescription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'prescription_not_found', 'message', 'Prescription not found.');
  END IF;

  IF COALESCE(v_prescription.status::text, '') <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_pending', 'message', 'Prescription is not pending.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.prescription_items pi WHERE pi.prescription_id = p_prescription_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_items', 'message', 'Prescription has no items.');
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_qty_count
  FROM public.prescription_items pi
  WHERE pi.prescription_id = p_prescription_id
    AND (pi.quantity IS NULL OR pi.quantity <= 0);

  IF v_invalid_qty_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_quantity', 'message', 'One or more prescription item quantities are invalid.');
  END IF;

  CREATE TEMP TABLE _rx_required ON COMMIT DROP AS
  SELECT
    m.id AS medication_id,
    SUM(pi.quantity)::integer AS required_qty
  FROM public.prescription_items pi
  LEFT JOIN public.medications m ON m.name = pi.medication_name
  WHERE pi.prescription_id = p_prescription_id
  GROUP BY m.id;

  SELECT COUNT(*)
  INTO v_stock_missing_count
  FROM _rx_required r
  WHERE r.medication_id IS NULL;

  IF v_stock_missing_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'medication_not_found', 'message', 'One or more medications could not be resolved.');
  END IF;

  CREATE TEMP TABLE _rx_stock_choice ON COMMIT DROP AS
  WITH ranked_stock AS (
    SELECT
      s.id AS stock_id,
      s.medication_id,
      s.quantity_on_hand,
      ROW_NUMBER() OVER (PARTITION BY s.medication_id ORDER BY s.created_at ASC, s.id ASC) AS rn
    FROM public.medication_stock s
    JOIN _rx_required r ON r.medication_id = s.medication_id
  )
  SELECT
    rs.stock_id,
    rs.medication_id,
    rs.quantity_on_hand
  FROM ranked_stock rs
  WHERE rs.rn = 1;

  PERFORM 1
  FROM public.medication_stock s
  JOIN _rx_stock_choice c ON c.stock_id = s.id
  FOR UPDATE OF s;

  SELECT COUNT(*)
  INTO v_stock_missing_count
  FROM _rx_required r
  LEFT JOIN _rx_stock_choice s ON s.medication_id = r.medication_id
  WHERE s.stock_id IS NULL;

  IF v_stock_missing_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stock_error', 'message', 'Medication stock record missing.');
  END IF;

  SELECT COUNT(*)
  INTO v_insufficient_count
  FROM _rx_required r
  JOIN _rx_stock_choice s ON s.medication_id = r.medication_id
  WHERE COALESCE(s.quantity_on_hand, 0) < COALESCE(r.required_qty, 0);

  IF v_insufficient_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'message', 'Insufficient stock to dispense this prescription.');
  END IF;

  UPDATE public.medication_stock s
  SET quantity_on_hand = s.quantity_on_hand - r.required_qty
  FROM _rx_required r
  JOIN _rx_stock_choice sc ON sc.medication_id = r.medication_id
  WHERE s.id = sc.stock_id;

  INSERT INTO public.dispense_events (
    prescription_id,
    patient_id,
    medication_id,
    source_stock_id,
    quantity_dispensed,
    dispensed_by
  )
  SELECT
    p_prescription_id,
    v_prescription.patient_id,
    m.id,
    sc.stock_id,
    pi.quantity,
    p_actor_user_id
  FROM public.prescription_items pi
  JOIN public.medications m ON m.name = pi.medication_name
  JOIN _rx_stock_choice sc ON sc.medication_id = m.id
  WHERE pi.prescription_id = p_prescription_id;

  UPDATE public.prescriptions
  SET
    status = 'dispensed'::public.prescription_status,
    dispensed_at = now(),
    dispensed_by = p_actor_user_id
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
    'dispensed',
    'pending',
    'dispensed',
    NULL,
    jsonb_build_object(
      'source', 'rpc.dispense_prescription_transactional',
      'patient_id', v_prescription.patient_id,
      'prescription_number', v_prescription.prescription_number
    )
  );

  IF p_complete_visit AND v_prescription.visit_id IS NOT NULL THEN
    UPDATE public.visits
    SET visit_status = 'completed'::public.visit_status
    WHERE id = v_prescription.visit_id
      AND visit_status = 'pharmacy_pending'::public.visit_status;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'prescription_id', p_prescription_id,
    'visit_id', v_prescription.visit_id,
    'visit_completed', CASE WHEN p_complete_visit AND v_prescription.visit_id IS NOT NULL THEN true ELSE false END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'dispense_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.dispense_prescription_transactional(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispense_prescription_transactional(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispense_prescription_transactional(uuid, uuid, boolean) TO service_role;
