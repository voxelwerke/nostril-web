-- Canonical nostril URIs: n:{id}, m:{id}@{host}, r:{hash(canonical_url)}

ALTER TABLE search_entities ADD COLUMN IF NOT EXISTS uri TEXT;
ALTER TABLE search_posts ADD COLUMN IF NOT EXISTS uri TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_entities_uri
  ON search_entities (uri) WHERE uri IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_posts_uri
  ON search_posts (uri) WHERE uri IS NOT NULL;
