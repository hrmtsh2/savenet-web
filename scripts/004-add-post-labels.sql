-- Categories now act as the label catalogue. Posts may have many labels.
CREATE TABLE IF NOT EXISTS post_labels (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (post_id, label_id)
);

CREATE INDEX IF NOT EXISTS post_labels_label_id_idx ON post_labels(label_id);

-- Preserve every existing category assignment as a label assignment.
INSERT INTO post_labels (post_id, label_id)
SELECT id, category_id FROM posts WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill deterministic source labels for posts that predate this change.
INSERT INTO categories (user_id, name, description, enable_entity_resolution, enable_web_enrichment, auto_created)
SELECT DISTINCT p.user_id,
  CASE p.platform
    WHEN 'instagram' THEN 'Instagram'
    WHEN 'x' THEN 'X'
    WHEN 'browser_bookmark' THEN 'Browser Bookmark'
    WHEN 'reading_list' THEN 'Reading List'
  END,
  NULL, false, false, true
FROM posts p
ON CONFLICT (user_id, lower(name)) DO NOTHING;

INSERT INTO post_labels (post_id, label_id)
SELECT p.id, c.id
FROM posts p
JOIN categories c ON c.user_id = p.user_id
 AND lower(c.name) = lower(CASE p.platform
   WHEN 'instagram' THEN 'Instagram'
   WHEN 'x' THEN 'X'
   WHEN 'browser_bookmark' THEN 'Browser Bookmark'
   WHEN 'reading_list' THEN 'Reading List'
 END)
ON CONFLICT DO NOTHING;
