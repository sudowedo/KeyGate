CREATE TABLE IF NOT EXISTS health_daily (
  day DATE PRIMARY KEY,
  internal_ok BOOLEAN NOT NULL DEFAULT false,
  db_ok BOOLEAN NOT NULL DEFAULT false,
  redis_ok BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_daily_day_desc ON health_daily(day DESC);
