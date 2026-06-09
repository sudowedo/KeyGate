CREATE TABLE IF NOT EXISTS app_error_logs (
  id UUID PRIMARY KEY,
  request_id TEXT,
  method TEXT,
  path TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at_desc ON app_error_logs(created_at DESC);
