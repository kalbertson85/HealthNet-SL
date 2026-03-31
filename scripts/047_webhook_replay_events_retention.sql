-- Retention helper for webhook replay deduplication records
-- Keeps table size bounded by removing old entries.

CREATE OR REPLACE FUNCTION public.cleanup_webhook_replay_events(max_age_days integer DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.webhook_replay_events
  WHERE created_at < NOW() - make_interval(days => GREATEST(max_age_days, 1));

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
