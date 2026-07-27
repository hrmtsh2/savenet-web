CREATE TABLE IF NOT EXISTS agent_configs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('entity_enrichment', 'auto_labeller', 'digest')),
  label_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  instructions TEXT NOT NULL DEFAULT '',
  allow_web_research BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_configs_scope CHECK (
    (kind = 'entity_enrichment' AND label_id IS NOT NULL) OR
    (kind IN ('auto_labeller', 'digest') AND label_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_entity_label
  ON agent_configs (user_id, kind, label_id)
  WHERE kind = 'entity_enrichment';

CREATE TABLE IF NOT EXISTS agent_runs (
  id SERIAL PRIMARY KEY,
  config_id INTEGER NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL,
  trigger VARCHAR(32) NOT NULL CHECK (trigger IN ('retroactive', 'capture', 'manual', 'schedule')),
  status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  provider VARCHAR(32),
  model_id VARCHAR(160),
  credential_source VARCHAR(16),
  context JSONB,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  error_message VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_queued ON agent_runs (status, created_at) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS agent_run_items (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  output JSONB,
  document_text TEXT,
  embedding vector(768),
  error_message VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (run_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_items_run_status ON agent_run_items (run_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_run_items_embedding ON agent_run_items USING hnsw (embedding vector_cosine_ops);
