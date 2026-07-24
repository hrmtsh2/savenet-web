ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS label_ids INTEGER[] NOT NULL DEFAULT '{}';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS label_match VARCHAR(3) NOT NULL DEFAULT 'any'
  CHECK (label_match IN ('any', 'all'));

UPDATE conversations
SET label_ids = ARRAY[category_id]
WHERE category_id IS NOT NULL AND cardinality(label_ids) = 0;
