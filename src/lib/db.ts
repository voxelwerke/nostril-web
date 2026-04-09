import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./nostr-users.db";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// Ensure events table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY,
    pubkey     TEXT NOT NULL,
    kind       INTEGER NOT NULL,
    content    TEXT,
    tags       TEXT,
    created_at INTEGER NOT NULL,
    sig        TEXT,
    raw        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_pubkey ON events(pubkey, kind, created_at DESC);

  CREATE TABLE IF NOT EXISTS events_fetched (
    pubkey     TEXT PRIMARY KEY,
    fetched_at INTEGER NOT NULL
  );
`);

export default db;
