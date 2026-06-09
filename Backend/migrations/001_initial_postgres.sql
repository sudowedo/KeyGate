CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_keys (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT,
  key_masked TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  auth_tag_b64 TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subkeys (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  token_ciphertext_b64 TEXT,
  token_iv_b64 TEXT,
  token_auth_tag_b64 TEXT,
  token_key_version INTEGER,
  provider TEXT NOT NULL,
  master_key_id UUID REFERENCES master_keys(id) ON DELETE SET NULL,
  auto_route_on_exhausted BOOLEAN NOT NULL DEFAULT false,
  monthly_token_limit INTEGER DEFAULT 100000,
  requests_per_minute_limit INTEGER DEFAULT 2,
  tokens_used INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  spend_limit_usd NUMERIC(12,4),
  max_requests INTEGER DEFAULT 5000,
  request_count INTEGER DEFAULT 0,
  allowed_models JSONB DEFAULT '"all"'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subkey_id UUID,
  subkey_name TEXT,
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  status TEXT,
  source TEXT DEFAULT 'external',
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quota_requests (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subkey_id UUID NOT NULL REFERENCES subkeys(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  amount TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_keys_project_id ON master_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_master_keys_provider_project ON master_keys(project_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subkeys_project_id ON subkeys(project_id);
CREATE INDEX IF NOT EXISTS idx_subkeys_token_hash ON subkeys(token_hash);
CREATE INDEX IF NOT EXISTS idx_subkeys_master_key_id ON subkeys(master_key_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_project_id_created_at ON request_logs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_subkey_id_created_at ON request_logs(subkey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_requests_project_id_created_at ON quota_requests(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_requests_subkey_id ON quota_requests(subkey_id);
