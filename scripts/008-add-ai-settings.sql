CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  user_id VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('openrouter')),
  encrypted_api_key TEXT NOT NULL,
  key_hint VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS ai_model_preferences (
  user_id VARCHAR(128) NOT NULL,
  feature VARCHAR(32) NOT NULL CHECK (feature IN ('chat')),
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('google', 'openrouter')),
  model_id VARCHAR(160) NOT NULL,
  credential_source VARCHAR(16) NOT NULL CHECK (credential_source IN ('platform', 'byok')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  feature VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  model_id VARCHAR(160) NOT NULL,
  credential_source VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  duration_ms INTEGER,
  error_message VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_user_created ON ai_runs (user_id, created_at DESC);
