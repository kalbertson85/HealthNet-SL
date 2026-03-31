-- Persistent replay protection for webhook event IDs

CREATE TABLE IF NOT EXISTS public.webhook_replay_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_replay_events_provider_event_key UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_replay_events_created_at
  ON public.webhook_replay_events (created_at DESC);

ALTER TABLE public.webhook_replay_events ENABLE ROW LEVEL SECURITY;

-- Service role inserts for webhook handling; no end-user access needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'webhook_replay_events'
      AND policyname = 'webhook_replay_events_no_user_access'
  ) THEN
    CREATE POLICY webhook_replay_events_no_user_access
      ON public.webhook_replay_events
      FOR ALL
      USING (FALSE)
      WITH CHECK (FALSE);
  END IF;
END
$$;
