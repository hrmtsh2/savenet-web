CREATE TABLE IF NOT EXISTS digest_configs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_expression VARCHAR(255) NOT NULL DEFAULT 'cron(0 9 ? * SUN *)',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  instructions TEXT NOT NULL DEFAULT '',
  label_ids INTEGER[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS digests (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  config_id INTEGER NOT NULL REFERENCES digest_configs(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('queued', 'running', 'sent', 'failed')),
  subject VARCHAR(255),
  html TEXT,
  text_content TEXT,
  referenced_post_ids INTEGER[] NOT NULL DEFAULT '{}',
  error_message VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_digests_user_created ON digests (user_id, created_at DESC);
