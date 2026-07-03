-- Nostril search engine schema: durable entities + ephemeral post tables.
-- Runs on raw PostgreSQL 18. Post tables are pruned by the worker's nightly
-- DELETE sweep (see packages/worker/src/retention.ts); no partitioning needed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── DURABLE SOURCE TABLES ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nostr_users (
  pubkey           TEXT PRIMARY KEY,
  name             TEXT,
  display_name     TEXT,
  about            TEXT,
  picture          TEXT,
  banner           TEXT,
  website          TEXT,
  nip05            TEXT,
  lud16            TEXT,
  follower_count   INTEGER NOT NULL DEFAULT 0,
  following_count  INTEGER NOT NULL DEFAULT 0,
  raw              TEXT,
  event_created_at BIGINT NOT NULL DEFAULT 0,
  seen_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nostr_users_followers ON nostr_users (follower_count DESC);

CREATE TABLE IF NOT EXISTS nostr_follows (
  follower TEXT NOT NULL,
  followee TEXT NOT NULL,
  PRIMARY KEY (follower, followee)
);
CREATE INDEX IF NOT EXISTS idx_nostr_follows_followee ON nostr_follows (followee);

-- Cooldown tracking so relays don't re-query the same unresolved pubkey.
CREATE TABLE IF NOT EXISTS nostr_resolve_attempts (
  pubkey     TEXT PRIMARY KEY,
  queried_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS mastodon_instances (
  instance   TEXT PRIMARY KEY,
  title      TEXT,
  description TEXT,
  version    TEXT,
  users_count INTEGER,
  seen_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS mastodon_accounts (
  instance         TEXT NOT NULL,
  id               TEXT NOT NULL,
  acct             TEXT NOT NULL,
  display_name     TEXT,
  note             TEXT,
  note_text        TEXT,
  avatar           TEXT,
  url              TEXT,
  followers_count  INTEGER NOT NULL DEFAULT 0,
  following_count  INTEGER NOT NULL DEFAULT 0,
  seen_at          BIGINT NOT NULL,
  PRIMARY KEY (instance, id)
);
CREATE INDEX IF NOT EXISTS idx_mastodon_accounts_acct ON mastodon_accounts (acct);

CREATE TABLE IF NOT EXISTS rss_feeds (
  id          SERIAL PRIMARY KEY,
  url         TEXT NOT NULL UNIQUE,
  title       TEXT,
  site_url    TEXT,
  description TEXT,
  etag        TEXT,
  last_modified TEXT,
  last_fetched_at BIGINT
);

-- ─── UNIFIED SEARCH: DURABLE ENTITIES ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_entities (
  source      TEXT NOT NULL,
  source_key  TEXT NOT NULL,
  title       TEXT,
  body        TEXT,
  author      TEXT,
  url         TEXT,
  image_url   TEXT,
  rank_score  REAL NOT NULL DEFAULT 0,
  meta        JSONB,
  search      TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED,
  PRIMARY KEY (source, source_key)
);
CREATE INDEX IF NOT EXISTS idx_search_entities_gin ON search_entities USING GIN (search);
CREATE INDEX IF NOT EXISTS idx_search_entities_rank ON search_entities (rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_search_entities_title_trgm ON search_entities USING GIN (title gin_trgm_ops);

-- ─── EPHEMERAL POST TABLES (28-day nightly sweep) ────────────────────────────

CREATE TABLE IF NOT EXISTS search_posts (
  source       TEXT NOT NULL,
  source_key   TEXT NOT NULL,
  title        TEXT,
  body         TEXT,
  author       TEXT,
  url          TEXT,
  image_url    TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  rank_score   REAL NOT NULL DEFAULT 0,
  meta         JSONB,
  search       TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED,
  PRIMARY KEY (source, source_key)
);
CREATE INDEX IF NOT EXISTS idx_search_posts_gin ON search_posts USING GIN (search);
CREATE INDEX IF NOT EXISTS idx_search_posts_published ON search_posts (published_at);

CREATE TABLE IF NOT EXISTS mastodon_statuses (
  instance     TEXT NOT NULL,
  id           TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  acct         TEXT,
  content      TEXT,
  content_text TEXT,
  url          TEXT,
  created_at   TIMESTAMPTZ NOT NULL,
  raw          JSONB,
  PRIMARY KEY (instance, id)
);
CREATE INDEX IF NOT EXISTS idx_mastodon_statuses_created ON mastodon_statuses (created_at);
CREATE INDEX IF NOT EXISTS idx_mastodon_statuses_account ON mastodon_statuses (instance, account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rss_items (
  feed_id      INTEGER NOT NULL,
  guid         TEXT NOT NULL,
  title        TEXT,
  content      TEXT,
  content_text TEXT,
  link         TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (feed_id, guid)
);
CREATE INDEX IF NOT EXISTS idx_rss_items_published ON rss_items (published_at);
CREATE INDEX IF NOT EXISTS idx_rss_items_feed ON rss_items (feed_id, published_at DESC);

CREATE TABLE IF NOT EXISTS nostr_events (
  id         TEXT PRIMARY KEY,
  pubkey     TEXT NOT NULL,
  kind       INTEGER NOT NULL,
  content    TEXT,
  tags       JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  sig        TEXT,
  raw        JSONB
);
CREATE INDEX IF NOT EXISTS idx_nostr_events_pubkey ON nostr_events (pubkey, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nostr_events_created ON nostr_events (created_at);
