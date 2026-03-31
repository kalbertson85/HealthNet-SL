-- 021_sync_queue.sql
-- Simple server-side queue to accept offline/PWA operations for later processing.

BEGIN;

CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  operation_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  created_at TIMESTAMP DEFAULT now(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created_at ON sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_id ON sync_queue(user_id);

ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can enqueue sync operations" ON sync_queue;
DROP POLICY IF EXISTS "Admins can view sync queue" ON sync_queue;

CREATE POLICY "Users can enqueue sync operations" ON sync_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view sync queue" ON sync_queue
  FOR SELECT USING (true);

COMMIT;
