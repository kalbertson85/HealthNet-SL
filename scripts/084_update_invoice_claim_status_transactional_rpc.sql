-- 084_update_invoice_claim_status_transactional_rpc.sql
-- Atomic insurance claim status update for an invoice.

DROP FUNCTION IF EXISTS public.update_invoice_claim_status_transactional(uuid, text, uuid);
CREATE FUNCTION public.update_invoice_claim_status_transactional(
  p_invoice_id uuid,
  p_new_status text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_existing_claim record;
  v_claim_id uuid;
  v_previous_claim_status text;
  v_previous_claim_id uuid;
  v_claimed_amount numeric;
BEGIN
  IF p_invoice_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload', 'message', 'Missing required identifiers.');
  END IF;

  IF COALESCE(NULLIF(TRIM(p_new_status), ''), '') NOT IN ('prepared', 'submitted', 'paid', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'message', 'Unsupported claim status.');
  END IF;

  SELECT id, payer_type, company_id, total_amount, claim_id, claim_status, patient_id, visit_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invoice_not_found', 'message', 'Invoice not found.');
  END IF;

  IF COALESCE(v_invoice.payer_type, '') <> 'company' OR v_invoice.company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invoice_not_company', 'message', 'Only company invoices can have insurance claims.');
  END IF;

  SELECT id, status
  INTO v_existing_claim
  FROM public.insurance_claims
  WHERE invoice_id = p_invoice_id
  LIMIT 1
  FOR UPDATE;

  v_previous_claim_status := COALESCE(v_existing_claim.status, v_invoice.claim_status, NULL);
  v_previous_claim_id := COALESCE(v_invoice.claim_id, v_existing_claim.id, NULL);
  v_claimed_amount := COALESCE(v_invoice.total_amount, 0);

  IF v_existing_claim.id IS NULL THEN
    INSERT INTO public.insurance_claims (
      invoice_id,
      company_id,
      claimed_amount,
      status
    ) VALUES (
      p_invoice_id,
      v_invoice.company_id,
      v_claimed_amount,
      TRIM(p_new_status)
    )
    RETURNING id INTO v_claim_id;
  ELSE
    v_claim_id := v_existing_claim.id;
    UPDATE public.insurance_claims
    SET status = TRIM(p_new_status)
    WHERE id = v_claim_id;
  END IF;

  UPDATE public.invoices
  SET
    claim_status = TRIM(p_new_status),
    claim_id = v_claim_id
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
    'claim_status_updated',
    v_previous_claim_status,
    TRIM(p_new_status),
    v_claimed_amount,
    jsonb_build_object(
      'claim_id', v_claim_id,
      'source', 'rpc.update_invoice_claim_status_transactional'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', p_invoice_id,
    'claim_id', v_claim_id,
    'old_status', v_previous_claim_status,
    'new_status', TRIM(p_new_status),
    'claimed_amount', v_claimed_amount,
    'patient_id', v_invoice.patient_id,
    'visit_id', v_invoice.visit_id,
    'company_id', v_invoice.company_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_status_update_failed', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_claim_status_transactional(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_claim_status_transactional(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_claim_status_transactional(uuid, text, uuid) TO service_role;
