-- SaveNet schema: pgvector + categories, posts, entities, entity_enrichment

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Categories owned by a user
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  enable_entity_resolution BOOLEAN NOT NULL DEFAULT false,
  auto_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
-- A user cannot have two categories with the same name
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, lower(name));

-- Resolved real-world entities (e.g. a restaurant / place)
CREATE TABLE IF NOT EXISTS entities (
  id SERIAL PRIMARY KEY,
  -- Populated later by Google Places; nullable for now
  place_id VARCHAR(255) UNIQUE,
  -- Normalized string key used for dedup until place_id exists
  resolution_key VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_resolution_key ON entities(resolution_key);

-- Captured posts
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('instagram', 'x')),
  platform_post_id VARCHAR(255),
  post_url TEXT NOT NULL,
  caption TEXT,
  author_handle VARCHAR(255),
  author_name VARCHAR(255),
  thumbnail_url TEXT,
  media_type VARCHAR(50),
  captured_at TIMESTAMPTZ,
  source_url TEXT,
  raw JSONB,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  summary TEXT,
  enriched_text TEXT,
  entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_posts_user_url UNIQUE (user_id, post_url)
);

CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_entity ON posts(entity_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);

-- Enrichment data attached to entities
CREATE TABLE IF NOT EXISTS entity_enrichment (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source VARCHAR(100) NOT NULL,
  data JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_enrichment_entity ON entity_enrichment(entity_id);
