-- 076_reconcile_insurance_batch_payment_rpc.sql
-- Atomic insurance reconciliation write path.

DROP FUNCTION IF EXISTS public.reconcile_insurance_batch_payment(uuid, numeric, numeric, text[], text, uuid, text);

CREATE OR REPLACE FUNCTION public.reconcile_insurance_batch_payment(
  p_batch_id uuid,
  p_expected_amount numeric,
  p_paid_amount numeric,
  p_denial_reason_codes text[] DEFAULT '{}'::text[],
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_admin_audit_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.insurance_billing_batches%ROWTYPE;
  v_payment_id uuid;
  v_variance numeric := COALESCE(p_paid_amount, 0) - COALESCE(p_expected_amount, 0);
  v_status text;
  v_batch_status text;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.insurance_billing_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'batch_not_found', 'message', 'Insurance batch not found.');
  END IF;

  IF COALESCE(array_length(p_denial_reason_codes, 1), 0) > 0 AND COALESCE(p_paid_amount, 0) <= 0 THEN
    v_status := 'denied';
  ELSIF COALESCE(p_paid_amount, 0) = COALESCE(p_expected_amount, 0) THEN
    v_status := 'matched';
  ELSIF COALESCE(p_paid_amount, 0) <= 0 THEN
    v_status := 'partial';
  ELSIF COALESCE(p_paid_amount, 0) < COALESCE(p_expected_amount, 0) THEN
    v_status := 'underpaid';
  ELSIF COALESCE(p_paid_amount, 0) > COALESCE(p_expected_amount, 0) THEN
    v_status := 'overpaid';
  ELSE
    v_status := 'partial';
  END IF;

  INSERT INTO public.insurance_payments (
    batch_id,
    expected_amount,
    paid_amount,
    variance,
    status,
    denial_reason_codes,
    notes,
    created_by
  ) VALUES (
    p_batch_id,
    COALESCE(p_expected_amount, 0),
    COALESCE(p_paid_amount, 0),
    v_variance,
    v_status,
    COALESCE(p_denial_reason_codes, '{}'::text[]),
    p_notes,
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  IF v_status = 'matched' THEN
    UPDATE public.insurance_billing_batches
    SET status = 'paid',
        paid_amount = COALESCE(p_paid_amount, 0),
        paid_at = timezone('utc'::text, now())
    WHERE id = p_batch_id;

    UPDATE public.invoices i
    SET paid_amount = COALESCE(i.total_amount, 0),
        status = 'paid'::public.billing_status,
        payment_date = timezone('utc'::text, now()),
        payment_method = 'insurance_batch'
    WHERE i.id IN (
      SELECT bi.invoice_id
      FROM public.insurance_billing_batch_items bi
      WHERE bi.batch_id = p_batch_id
    );

    v_batch_status := 'paid';
  ELSE
    UPDATE public.insurance_billing_batches
    SET status = 'submitted',
        paid_amount = COALESCE(p_paid_amount, 0)
    WHERE id = p_batch_id;

    v_batch_status := 'submitted';
  END IF;

  IF p_created_by IS NOT NULL THEN
    INSERT INTO public.admin_audit_logs (
      actor_user_id,
      target_user_id,
      action,
      notes
    ) VALUES (
      p_created_by,
      p_created_by,
      'insurance_batch_reconciliation',
      COALESCE(p_admin_audit_note, CONCAT('Batch ', p_batch_id, ' reconciled as ', v_status, '.'))
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'payment_status', v_status,
    'batch_status', v_batch_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'reconciliation_failed',
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_insurance_batch_payment(uuid, numeric, numeric, text[], text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_insurance_batch_payment(uuid, numeric, numeric, text[], text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_insurance_batch_payment(uuid, numeric, numeric, text[], text, uuid, text) TO service_role;
