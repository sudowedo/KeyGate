ALTER TABLE request_logs
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS error_reason TEXT,
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12,6) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_project_provider_created_at ON request_logs(project_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_error_reason_created_at ON request_logs(error_reason, created_at DESC);
