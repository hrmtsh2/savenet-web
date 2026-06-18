-- SaveNet: vector index + chat recommendation tables

-- HNSW index for fast cosine-distance similarity search over post embeddings.
-- Keeps pgvector queries fast as the number of saved posts grows.
CREATE INDEX IF NOT EXISTS idx_posts_embedding_hnsw
  ON posts USING hnsw (embedding vector_cosine_ops);

-- A chat conversation, scoped to a single category.
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_category ON conversations(category_id);

-- Messages within a conversation. referenced_post_ids records which saved posts
-- an assistant reply cited, so the UI can render their cards.
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  referenced_post_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);
