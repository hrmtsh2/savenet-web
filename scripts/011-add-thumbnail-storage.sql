ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_s3_key TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_thumbnail_s3_key
  ON posts(thumbnail_s3_key)
  WHERE thumbnail_s3_key IS NOT NULL;
