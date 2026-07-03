-- Sentence embeddings for the recent-news feed's diversity sampler.
-- Stored as a plain real[] (no pgvector) and computed inline by the worker
-- during ingest. Swept alongside the rest of search_posts by retention.

ALTER TABLE search_posts
  ADD COLUMN IF NOT EXISTS embedding real[];
