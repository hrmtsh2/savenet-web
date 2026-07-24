CREATE INDEX IF NOT EXISTS idx_posts_library_search
  ON posts
  USING GIN (
    to_tsvector('simple',
      coalesce(caption, '') || ' ' || coalesce(author_handle, '') || ' ' ||
      coalesce(author_name, '') || ' ' || coalesce(summary, '') || ' ' ||
      coalesce(enriched_text, '') || ' ' || coalesce(source_url, '') || ' ' || coalesce(post_url, '')
    )
  );
