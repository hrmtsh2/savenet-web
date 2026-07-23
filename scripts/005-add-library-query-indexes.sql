CREATE INDEX IF NOT EXISTS idx_post_labels_label_post
  ON post_labels (label_id, post_id);

CREATE INDEX IF NOT EXISTS idx_posts_user_created_id
  ON posts (user_id, created_at DESC, id DESC);
