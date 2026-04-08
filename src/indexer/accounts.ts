import WebSocket from "ws";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./nostr-users.db";
const CRAWL_DURATION_MS = 1 * 15 * 1000;

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net",
  "wss://nostr.wine",
  "wss://relay.snort.social",
  "wss://nostr-pub.wellorder.net",
  "wss://purplepag.es",
  "wss://nostr.fmt.wiz.biz",
  "wss://data.nostr.band",
  "wss://relay.mutinywallet.com",
];

// ─── DB SETUP ────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -64000"); // 64MB cache
db.pragma("temp_store = MEMORY");
db.pragma("mmap_size = 536870912"); // 512MB mmap

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    pubkey       TEXT PRIMARY KEY,
    name         TEXT,
    display_name TEXT,
    about        TEXT,
    picture      TEXT,
    banner       TEXT,
    website      TEXT,
    nip05        TEXT,
    lud16        TEXT,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    raw          TEXT,
    event_created_at INTEGER,
    seen_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower TEXT NOT NULL,
    followee TEXT NOT NULL,
    PRIMARY KEY (follower, followee)
  );

  CREATE INDEX IF NOT EXISTS idx_users_name ON users(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_users_nip05 ON users(nip05);
  CREATE INDEX IF NOT EXISTS idx_users_seen ON users(seen_at DESC);
  CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower);
  CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee);

  CREATE VIRTUAL TABLE IF NOT EXISTS users_fts USING fts5(
    name, display_name, about, nip05,
    content=users,
    content_rowid=rowid
  );

  CREATE TRIGGER IF NOT EXISTS users_ai AFTER INSERT ON users BEGIN
    INSERT INTO users_fts(rowid, name, display_name, about, nip05)
    VALUES (new.rowid, COALESCE(new.name,''), COALESCE(new.display_name,''), COALESCE(new.about,''), COALESCE(new.nip05,''));
  END;

  CREATE TRIGGER IF NOT EXISTS users_au AFTER UPDATE ON users BEGIN
    INSERT INTO users_fts(users_fts, rowid, name, display_name, about, nip05)
    VALUES ('delete', old.rowid, COALESCE(old.name,''), COALESCE(old.display_name,''), COALESCE(old.about,''), COALESCE(old.nip05,''));
    INSERT INTO users_fts(rowid, name, display_name, about, nip05)
    VALUES (new.rowid, COALESCE(new.name,''), COALESCE(new.display_name,''), COALESCE(new.about,''), COALESCE(new.nip05,''));
  END;
`);

const upsertUser = db.prepare(`
  INSERT INTO users (pubkey, name, display_name, about, picture, banner, website, nip05, lud16, raw, event_created_at, seen_at)
  VALUES (@pubkey, @name, @display_name, @about, @picture, @banner, @website, @nip05, @lud16, @raw, @event_created_at, @seen_at)
  ON CONFLICT(pubkey) DO UPDATE SET
    name         = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.name ELSE users.name END,
    display_name = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.display_name ELSE users.display_name END,
    about        = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.about ELSE users.about END,
    picture      = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.picture ELSE users.picture END,
    banner       = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.banner ELSE users.banner END,
    website      = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.website ELSE users.website END,
    nip05        = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.nip05 ELSE users.nip05 END,
    lud16        = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.lud16 ELSE users.lud16 END,
    raw          = CASE WHEN excluded.event_created_at > users.event_created_at THEN excluded.raw ELSE users.raw END,
    event_created_at = MAX(excluded.event_created_at, users.event_created_at),
    seen_at      = excluded.seen_at
`);

const upsertFollow = db.prepare(`
  INSERT OR IGNORE INTO follows (follower, followee) VALUES (?, ?)
`);

const updateFollowCounts = db.prepare(`
  UPDATE users SET
    following_count = (SELECT COUNT(*) FROM follows WHERE follower = users.pubkey),
    follower_count  = (SELECT COUNT(*) FROM follows WHERE followee = users.pubkey)
  WHERE pubkey = ?
`);

// ─── RELAY CONNECTION ────────────────────────────────────────────────────────

function connectRelay(url: string, subId: string) {
  let ws: WebSocket;
  let reconnectAttempts = 0;
  let dead = false;

  function connect() {
    if (dead) return;

    console.log("connecting");

    ws = new WebSocket(url, { handshakeTimeout: 10000 });

    ws.on("open", () => {
      reconnectAttempts = 0;
      console.log(`[+] ${url}`);

      // Subscribe to kind:0 (profiles) and kind:3 (follow lists)
      // No filter limits — we want EVERYTHING
      ws.send(JSON.stringify(["REQ", subId, { kinds: [0], limit: 5000 }]));

      ws.send(
        JSON.stringify([
          "REQ",
          subId + "-follows",
          { kinds: [3], limit: 5000 },
        ]),
      );
    });

    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      console.log(msg);

      const event = msg[2];

      if (!event) {
        console.error("skip ", msg);
        return;
      }

      if (event.kind === 0) {
        handleProfile(event);
      } else if (event.kind === 3) {
        handleFollowList(event);
      }
    });

    ws.on("error", (err: Error) => {
      console.log(err);
    });

    ws.on("close", () => {
      if (!dead && reconnectAttempts < 5) {
        reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
        setTimeout(connect, delay);
      }
    });
  }

  connect();

  return {
    close() {
      dead = true;
      ws?.close();
    },
  };
}

// ─── EVENT HANDLERS ──────────────────────────────────────────────────────────

function handleProfile(event: any) {
  const meta = JSON.parse(event.content || "{}");
  upsertUser.run({
    pubkey: event.pubkey,
    name: meta.name?.slice(0, 200) || null,
    display_name:
      (meta.display_name || meta.displayName)?.slice(0, 200) || null,
    about: meta.about?.slice(0, 1000) || null,
    picture: meta.picture?.slice(0, 500) || null,
    banner: meta.banner?.slice(0, 500) || null,
    website: meta.website?.slice(0, 300) || null,
    nip05: meta.nip05?.toString().slice(0, 300) || null,
    lud16: meta.lud16?.slice(0, 300) || null,
    raw: event.content?.slice(0, 2000) || null,
    event_created_at: event.created_at,
    seen_at: Math.floor(Date.now() / 1000),
  });
}

function handleFollowList(event: any) {
  const followee_pubkeys = event.tags
    .filter((t: string[]) => t[0] === "p" && t[1]?.length === 64)
    .map((t: string[]) => t[1]);

  for (const followee of followee_pubkeys) {
    upsertFollow.run([event.pubkey, followee]);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

console.log(`\n🕳️  NOSTR DATABASE OF DOOM`);
console.log(`   DB: ${DB_PATH}`);
console.log(`   Duration: 10 minutes`);
console.log(`   Relays: ${RELAYS.length}\n`);

const connections = RELAYS.map((url, i) => connectRelay(url, `doom-${i}`));

// Progress ticker
const ticker = setInterval(() => {
  const stmt = db.prepare("SELECT COUNT(*) as c FROM users");
  const follows_stmt = db.prepare("SELECT COUNT(*) as c FROM follows");
  const userCount = (stmt.get() as any).c;
  const followCount = (follows_stmt.get() as any).c;

  console.log("userCount", userCount);
  console.log("followCount", followCount);
}, 500);

// Shut down after duration
setTimeout(() => {
  console.log("\n⏰ Time's up. Flushing and closing...");
  clearInterval(ticker);
  connections.forEach((c) => c.close());

  // Final follow count update for top users by follower count
  console.log("📊 Updating follow counts (this may take a moment)...");
  db.exec(`
    UPDATE users SET
      following_count = (SELECT COUNT(*) FROM follows WHERE follower = users.pubkey),
      follower_count  = (SELECT COUNT(*) FROM follows WHERE followee = users.pubkey)
  `);

  // Rebuild FTS index
  console.log("🔍 Rebuilding FTS index...");
  db.exec("INSERT INTO users_fts(users_fts) VALUES ('rebuild')");

  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any)
    .c;
  const followCount = (
    db.prepare("SELECT COUNT(*) as c FROM follows").get() as any
  ).c;

  console.log(`\n✅ DONE`);
  console.log(`   Users:   ${userCount.toLocaleString()}`);
  console.log(`   Follows: ${followCount.toLocaleString()}`);
  console.log(`   DB:      ${DB_PATH}\n`);

  db.close();
  process.exit(0);
}, CRAWL_DURATION_MS);
