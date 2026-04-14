-- 077_mark_visit_invoice_paid_transactional_rpc.sql
-- Atomic billing transition: mark invoice paid + write billing audit + advance visit status.

DROP FUNCTION IF EXISTS public.mark_visit_invoice_paid_transactional(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.mark_visit_invoice_paid_transactional(
  p_visit_id uuid,
  p_next_visit_status text,
  p_actor_user_id uuid DEFAULT NULL,
  p_audit_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_total_amount numeric := 0;
  v_paid_amount numeric := 0;
  v_old_invoice_status text := NULL;
  v_current_visit_status text := NULL;
BEGIN
  IF p_visit_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'visit_id is required');
  END IF;

  IF p_next_visit_status NOT IN ('pharmacy_pending', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Unsupported next visit status');
  END IF;

  SELECT v.visit_status
  INTO v_current_visit_status
  FROM public.visits v
  WHERE v.id = p_visit_id
  LIMIT 1;

  IF v_current_visit_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'visit_not_found', 'message', 'Visit not found');
  END IF;

  IF p_next_visit_status = 'pharmacy_pending' AND v_current_visit_status <> 'billing_pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'message', 'Visit cannot transition to pharmacy_pending from current state');
  END IF;

  IF p_next_visit_status = 'completed' AND v_current_visit_status NOT IN ('billing_pending', 'admitted', 'pharmacy_pending') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'message', 'Visit cannot transition to completed from current state');
  END IF;

  SELECT i.id, COALESCE(i.total_amount, 0), COALESCE(i.paid_amount, 0), i.status::text
  INTO v_invoice_id, v_total_amount, v_paid_amount, v_old_invoice_status
  FROM public.invoices i
  WHERE i.visit_id = p_visit_id
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invoice_not_found', 'message', 'No invoice found for visit');
  END IF;

  UPDATE public.invoices
  SET
    paid_amount = v_total_amount,
    status = 'paid'::public.billing_status,
    payment_date = NOW()
  WHERE id = v_invoice_id;

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
    p_actor_user_id,
    'status_changed',
    v_old_invoice_status,
    'paid',
    v_total_amount,
    jsonb_build_object(
      'source', COALESCE(NULLIF(TRIM(p_audit_source), ''), 'rpc.mark_visit_invoice_paid_transactional'),
      'visit_id', p_visit_id,
      'next_visit_status', p_next_visit_status
    )
  );

  UPDATE public.visits
  SET visit_status = p_next_visit_status
  WHERE id = p_visit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', v_invoice_id,
    'visit_id', p_visit_id,
    'previous_visit_status', v_current_visit_status,
    'next_visit_status', p_next_visit_status,
    'previous_invoice_status', v_old_invoice_status,
    'previous_paid_amount', v_paid_amount,
    'paid_amount', v_total_amount
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'update_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_visit_invoice_paid_transactional(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_visit_invoice_paid_transactional(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_visit_invoice_paid_transactional(uuid, text, uuid, text) TO service_role;
