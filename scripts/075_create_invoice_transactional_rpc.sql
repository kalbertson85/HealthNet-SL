-- 075_create_invoice_transactional_rpc.sql
-- Atomic invoice creation (invoice + items + audit log) to prevent partial writes.

DROP FUNCTION IF EXISTS public.create_invoice_transactional(uuid, uuid, uuid, numeric, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.create_invoice_transactional(
  p_patient_id uuid,
  p_visit_id uuid,
  p_created_by uuid,
  p_total_amount numeric,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_has_open_invoice boolean := false;
BEGIN
  IF p_patient_id IS NULL OR p_visit_id IS NULL OR p_created_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers.');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Invoice items payload must be a non-empty array.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.visit_id = p_visit_id
      AND (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
  )
  INTO v_has_open_invoice;

  IF v_has_open_invoice THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_open_invoice', 'message', 'An open invoice already exists for this visit.');
  END IF;

  INSERT INTO public.invoices (
    invoice_number,
    patient_id,
    visit_id,
    total_amount,
    paid_amount,
    notes,
    status,
    created_by
  ) VALUES (
    COALESCE(NULLIF(TRIM(p_invoice_number), ''), CONCAT('INV-', RIGHT(REPLACE(gen_random_uuid()::text, '-', ''), 6))),
    p_patient_id,
    p_visit_id,
    COALESCE(p_total_amount, 0),
    0,
    p_notes,
    'pending'::public.billing_status,
    p_created_by
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    amount
  )
  SELECT
    v_invoice_id,
    TRIM(COALESCE(i.description, '')),
    COALESCE(i.quantity, 0),
    COALESCE(i.unit_price, 0),
    COALESCE(i.amount, COALESCE(i.quantity, 0) * COALESCE(i.unit_price, 0))
  FROM jsonb_to_recordset(p_items) AS i(
    description text,
    quantity integer,
    unit_price numeric,
    amount numeric
  );

  IF NOT EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = v_invoice_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'No valid invoice items were supplied.');
  END IF;

  INSERT INTO public.billing_audit_logs (
    invoice_id,
    actor_user_id,
    action,
    old_status,
    new_status,
    amount,
    metadata
  ) VALUES (
    v_invoice_id,
    p_created_by,
    'created',
    NULL,
    'pending',
    COALESCE(p_total_amount, 0),
    jsonb_build_object('source', 'rpc.create_invoice_transactional', 'visit_id', p_visit_id, 'line_item_count', jsonb_array_length(p_items))
  );

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate_open_invoice', 'message', 'An open invoice already exists for this visit.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invoice_create_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_transactional(uuid, uuid, uuid, numeric, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_transactional(uuid, uuid, uuid, numeric, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_transactional(uuid, uuid, uuid, numeric, jsonb, text, text) TO service_role;
