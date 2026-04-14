-- 083_record_invoice_payment_transactional_rpc.sql
-- Atomic invoice payment recording (invoice update + billing audit).

DROP FUNCTION IF EXISTS public.record_invoice_payment_transactional(uuid, numeric, text, uuid);
CREATE FUNCTION public.record_invoice_payment_transactional(
  p_invoice_id uuid,
  p_payment_amount numeric,
  p_payment_method text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_old_status text;
  v_old_paid_amount numeric;
  v_new_paid_amount numeric;
  v_new_status public.billing_status;
  v_old_payment_method text;
  v_old_payment_date timestamptz;
  v_new_payment_date timestamptz;
BEGIN
  IF p_invoice_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers.');
  END IF;

  IF p_payment_amount IS NULL OR p_payment_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payment_amount', 'message', 'Payment amount must be greater than zero.');
  END IF;

  IF COALESCE(NULLIF(TRIM(p_payment_method), ''), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payment_method', 'message', 'Payment method is required.');
  END IF;

  SELECT id, status, total_amount, paid_amount, payment_method, payment_date
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invoice_not_found', 'message', 'Invoice not found.');
  END IF;

  v_old_status := COALESCE(v_invoice.status::text, 'pending');
  v_old_paid_amount := COALESCE(v_invoice.paid_amount, 0);
  v_old_payment_method := v_invoice.payment_method;
  v_old_payment_date := v_invoice.payment_date;

  v_new_paid_amount := v_old_paid_amount + p_payment_amount;
  IF v_new_paid_amount > COALESCE(v_invoice.total_amount, 0) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'payment_exceeds_total', 'message', 'Payment exceeds invoice total.');
  END IF;

  -- billing_status enum does not include "partial"; keep pending until fully paid.
  v_new_status := CASE
    WHEN v_new_paid_amount >= COALESCE(v_invoice.total_amount, 0) THEN 'paid'::public.billing_status
    ELSE 'pending'::public.billing_status
  END;

  v_new_payment_date := CASE
    WHEN v_new_status = 'paid'::public.billing_status THEN now()
    ELSE v_old_payment_date
  END;

  UPDATE public.invoices
  SET
    paid_amount = v_new_paid_amount,
    status = v_new_status,
    payment_date = v_new_payment_date,
    payment_method = TRIM(p_payment_method)
  WHERE id = p_invoice_id;

  INSERT INTO public.billing_audit_logs (
    invoice_id,
    actor_user_id,
    action,
    old_status,
    new_status,
    amount,
    metadata
  ) VALUES (
    p_invoice_id,
    p_actor_user_id,
    'payment_recorded',
    v_old_status,
    v_new_status::text,
    p_payment_amount,
    jsonb_build_object(
      'payment_method', TRIM(p_payment_method),
      'source', 'rpc.record_invoice_payment_transactional'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'old_status', v_old_status,
    'new_status', v_new_status::text,
    'old_paid_amount', v_old_paid_amount,
    'new_paid_amount', v_new_paid_amount,
    'old_payment_method', v_old_payment_method,
    'new_payment_method', TRIM(p_payment_method)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'payment_record_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment_transactional(uuid, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_transactional(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_transactional(uuid, numeric, text, uuid) TO service_role;
