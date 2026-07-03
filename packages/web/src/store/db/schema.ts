export const SCHEMA = `
CREATE TABLE IF NOT EXISTS reactions (
  target_id TEXT PRIMARY KEY,
  value     INTEGER NOT NULL,
  hlc       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  target_id TEXT PRIMARY KEY,
  active    INTEGER NOT NULL,
  hlc       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  target_id TEXT PRIMARY KEY,
  active    INTEGER NOT NULL,
  hlc       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  uri          TEXT PRIMARY KEY,
  author_uri   TEXT,
  title        TEXT,
  body         TEXT,
  published_at TEXT,
  url          TEXT,
  hlc          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
  uri   TEXT PRIMARY KEY,
  name  TEXT,
  image TEXT,
  hlc   INTEGER NOT NULL
);
`;
