-- 073_queue_call_next_transactional_rpc.sql
-- Transactional queue call-next operation to prevent partial writes.

DROP FUNCTION IF EXISTS public.queue_call_next_transactional(text, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.queue_call_next_transactional(
  p_department text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_facility_id uuid DEFAULT NULL,
  p_is_global_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
  v_queue_number text;
  v_current_status text;
BEGIN
  SELECT q.id, q.queue_number, q.status
  INTO v_queue_id, v_queue_number, v_current_status
  FROM public.queues q
  LEFT JOIN public.patients p ON p.id = q.patient_id
  WHERE q.department = p_department
    AND q.status = 'waiting'
    AND (
      p_is_global_admin
      OR p_actor_facility_id IS NULL
      OR p.facility_id IS NULL
      OR p.facility_id = p_actor_facility_id
    )
  ORDER BY
    CASE q.priority
      WHEN 'emergency' THEN 3
      WHEN 'urgent' THEN 2
      ELSE 1
    END DESC,
    q.check_in_time ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_queue_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', CASE WHEN p_actor_facility_id IS NULL OR p_is_global_admin THEN 'not_found' ELSE 'forbidden' END,
      'message', CASE WHEN p_actor_facility_id IS NULL OR p_is_global_admin THEN 'No waiting patient found for this department.' ELSE 'No queue items available for your facility.' END
    );
  END IF;

  IF COALESCE(v_current_status, '') <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'Queue item is no longer in waiting state.');
  END IF;

  UPDATE public.queues
  SET status = 'in_progress',
      called_time = timezone('utc'::text, now())
  WHERE id = v_queue_id;

  INSERT INTO public.queue_audit_logs (queue_id, action, old_status, new_status, actor_user_id)
  VALUES (v_queue_id, 'call_next', v_current_status, 'in_progress', p_actor_user_id);

  UPDATE public.queue_settings
  SET current_serving = v_queue_number
  WHERE department = p_department;

  RETURN jsonb_build_object('ok', true, 'queue_id', v_queue_id, 'queue_number', v_queue_number);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_call_next_transactional(text, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_call_next_transactional(text, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_call_next_transactional(text, uuid, uuid, boolean) TO service_role;
