ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_platform_check
  ON posts(platform, platform_checked_at, id)
  WHERE platform IN ('instagram', 'x');
