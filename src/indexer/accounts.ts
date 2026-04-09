import WebSocket from "ws";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./nostr-users.db";
const CRAWL_DURATION_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;
const FIREHOSE = process.argv.includes("-firehose");

const RELAYS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://nostr-pub.wellorder.net",
  "wss://purplepag.es",
];

// ─── DB SETUP ────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

const GRAPHQLITE_PATH =
  process.env.GRAPHQLITE_PATH ||
  "/opt/homebrew/opt/graphqlite/lib/sqlite/graphqlite.dylib";

let hasGraphqlite = false;
try {
  db.loadExtension(GRAPHQLITE_PATH);
  hasGraphqlite = true;
  console.log("✅ GraphQLite extension loaded");
} catch (e) {
  console.error("⚠️  GraphQLite extension not found at", GRAPHQLITE_PATH);
}

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -64000");
db.pragma("temp_store = MEMORY");
db.pragma("mmap_size = 536870912");

// Relational tables for search / metadata
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
    follower_count  INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    raw          TEXT,
    event_created_at INTEGER,
    seen_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower TEXT NOT NULL,
    followee TEXT NOT NULL,
    PRIMARY KEY (follower, followee)
  ) WITHOUT ROWID;

  -- Track when we last tried to resolve an unresolved pubkey
  CREATE TABLE IF NOT EXISTS resolve_attempts (
    pubkey     TEXT PRIMARY KEY,
    queried_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_name  ON users(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_users_nip05 ON users(nip05);
  CREATE INDEX IF NOT EXISTS idx_users_seen  ON users(seen_at DESC);
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

// ─── PREPARED STATEMENTS ─────────────────────────────────────────────────────

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

// GraphQLite cypher helper
function cypher(query: string, params?: string) {
  if (!hasGraphqlite) return;
  try {
    if (params) {
      db.prepare("SELECT cypher(?, ?)").get(query, params);
    } else {
      db.prepare("SELECT cypher(?)").get(query);
    }
  } catch (e: any) {
    // Silently skip graph errors during indexing
  }
}

// ─── BATCH RESOLVER ──────────────────────────────────────────────────────────

const BATCH_COOLDOWN_MS = 10_000; // wait 10s between batches per relay

const nextUnresolved = db.prepare(`
  SELECT DISTINCT f.followee
  FROM follows f
  WHERE f.followee NOT IN (SELECT pubkey FROM users)
    AND f.followee NOT IN (SELECT pubkey FROM resolve_attempts WHERE queried_at > ?)
  LIMIT ?
`);

const markQueried = db.prepare(`
  INSERT INTO resolve_attempts (pubkey, queried_at) VALUES (?, ?)
  ON CONFLICT(pubkey) DO UPDATE SET queried_at = excluded.queried_at
`);

class BatchResolver {
  private dispatched = 0;

  next(): string[] | null {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 3600;
    const rows = nextUnresolved.all(cutoff, BATCH_SIZE) as {
      followee: string;
    }[];
    if (rows.length === 0) return null;

    const pubkeys = rows.map((r) => r.followee);

    // Mark them as queried so no other relay grabs the same batch
    const markMany = db.transaction((keys: string[]) => {
      for (const pk of keys) markQueried.run(pk, now);
    });
    markMany(pubkeys);

    this.dispatched += pubkeys.length;
    return pubkeys;
  }

  get dispatchedCount() {
    return this.dispatched;
  }
}

const resolver = new BatchResolver();

// ─── EVENT HANDLERS ──────────────────────────────────────────────────────────

function handleProfile(event: any) {
  let meta: any;
  try {
    meta = JSON.parse(event.content || "{}");
  } catch {
    return; // malformed JSON, skip
  }
  const name =
    meta.name?.slice(0, 200) || meta.display_name?.slice(0, 200) || null;

  upsertUser.run({
    pubkey: event.pubkey,
    name,
    display_name:
      (meta.display_name || meta.displayName)?.toString().slice(0, 200) || null,
    about: meta.about?.toString().slice(0, 1000) || null,
    picture: meta.picture?.toString().slice(0, 500) || null,
    banner: meta.banner?.toString().slice(0, 500) || null,
    website: meta.website?.toString().slice(0, 300) || null,
    nip05: meta.nip05?.toString().slice(0, 300) || null,
    lud16: meta.lud16?.toString().slice(0, 300) || null,
    raw: event.content?.toString().slice(0, 2000) || null,
    event_created_at: event.created_at,
    seen_at: Math.floor(Date.now() / 1000),
  });

  // Create/update node in graphqlite
  const safeName = (name || "").replace(/'/g, "\\'").replace(/"/g, '\\"');
  cypher(
    `MERGE (p:Person {pubkey: "${event.pubkey}"}) SET p.name = "${safeName}"`,
  );
}

function handleFollowList(event: any) {
  const p_tags = event.tags
    .filter((t: string[]) => t[0] === "p" && t[1]?.length === 64)
    .map((t: string[]) => t[1]);

  const transaction = db.transaction((tags: string[]) => {
    for (const followee of tags) {
      upsertFollow.run(event.pubkey, followee);
      // Create edge in graphqlite
      cypher(`
        MERGE (a:Person {pubkey: "${event.pubkey}"})
        MERGE (b:Person {pubkey: "${followee}"})
        MERGE (a)-[:FOLLOWS]->(b)
      `);
    }
  });
  transaction(p_tags);
}

// ─── RELAY CONNECTION ────────────────────────────────────────────────────────

function connectRelay(url: string, subId: string) {
  let ws: WebSocket;
  let reconnectAttempts = 0;
  let dead = false;

  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  function sendNextBatch() {
    if (dead || !ws || ws.readyState !== WebSocket.OPEN) return;
    const batch = resolver.next();
    if (!batch) {
      console.log(`[${subId}] resolver: no more unresolved pubkeys`);
      return;
    }
    console.log(`[${subId}] resolving batch of ${batch.length}...`);
    ws.send(JSON.stringify(["CLOSE", subId + "-resolve"]));
    ws.send(
      JSON.stringify([
        "REQ",
        subId + "-resolve",
        { kinds: [0], authors: batch },
      ]),
    );
  }

  function scheduleNextBatch() {
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      sendNextBatch();
    }, BATCH_COOLDOWN_MS);
  }

  function connect() {
    if (dead) return;
    console.log(`connecting to ${url}...`);

    ws = new WebSocket(url, { handshakeTimeout: 10000 });

    ws.on("open", () => {
      reconnectAttempts = 0;
      console.log(`[+] ${url}`);

      if (FIREHOSE) {
        // Firehose mode: yolo whoever is posting right now
        ws.send(JSON.stringify(["REQ", subId, { kinds: [0], limit: 5000 }]));
        ws.send(
          JSON.stringify([
            "REQ",
            subId + "-follows",
            { kinds: [3], limit: 5000 },
          ]),
        );
      }

      // Always resolve unresolved pubkeys
      sendNextBatch();
    });

    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());

      // When a resolve batch finishes (EOSE), schedule the next one with cooldown
      if (msg[0] === "EOSE" && msg[1] === subId + "-resolve") {
        scheduleNextBatch();
        return;
      }

      if (msg[0] !== "EVENT" || !msg[2]) return;

      const event = msg[2];
      if (event.kind === 0) handleProfile(event);
      else if (event.kind === 3) handleFollowList(event);
    });

    ws.on("error", (err: Error) => console.log(err));

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
      if (batchTimer) clearTimeout(batchTimer);
      ws?.close();
    },
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

console.log(`\n🕳️  NOSTR DATABASE OF DOOM`);
console.log(`   Mode: ${FIREHOSE ? "FIREHOSE + RESOLVE" : "RESOLVE ONLY"}`);
console.log(`   DB: ${DB_PATH}`);
console.log(`   Duration: ${CRAWL_DURATION_MS / 60000} minutes`);
console.log(`   Relays: ${RELAYS.length}\n`);

const connections = RELAYS.map((url, i) => connectRelay(url, `doom-${i}`));

const ticker = setInterval(() => {
  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any)
    .c;
  const followCount = (
    db.prepare("SELECT COUNT(*) as c FROM follows").get() as any
  ).c;
  const unresolvedCount = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT followee) as c FROM follows WHERE followee NOT IN (SELECT pubkey FROM users)",
      )
      .get() as any
  ).c;
  console.log(
    `users: ${userCount}  follows: ${followCount}  unresolved: ${unresolvedCount}  dispatched: ${resolver.dispatchedCount}`,
  );
}, 500);

// ─── SHUTDOWN ────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log("\n⏰ Time's up. Flushing and closing...");
  clearInterval(ticker);
  connections.forEach((c) => c.close());

  console.log("📊 Updating follow counts...");
  db.exec(`
    UPDATE users SET
      following_count = (SELECT COUNT(*) FROM follows WHERE follower = users.pubkey),
      follower_count  = (SELECT COUNT(*) FROM follows WHERE followee = users.pubkey)
  `);

  console.log("🔍 Rebuilding FTS index...");
  db.exec("INSERT INTO users_fts(users_fts) VALUES ('rebuild')");

  // Load graph for queries
  if (hasGraphqlite) {
    console.log("📈 Loading graph into memory...");
    try {
      const result = db.prepare("SELECT gql_load_graph()").get();
      console.log("   Graph:", result);
    } catch (e) {
      console.log("   (graph load skipped)");
    }
  }

  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any)
    .c;
  const followCount = (
    db.prepare("SELECT COUNT(*) as c FROM follows").get() as any
  ).c;
  const unresolvedCount = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT followee) as c FROM follows WHERE followee NOT IN (SELECT pubkey FROM users)",
      )
      .get() as any
  ).c;

  console.log(`\n✅ DONE`);
  console.log(`   Users:      ${userCount.toLocaleString()}`);
  console.log(`   Follows:    ${followCount.toLocaleString()}`);
  console.log(`   Unresolved: ${unresolvedCount.toLocaleString()}`);
  console.log(`   DB:         ${DB_PATH}`);

  // ─── SAMPLE GRAPH SEARCH ───────────────────────────────────────────────
  if (hasGraphqlite) {
    console.log("\n🔎 Sample: people within 2 hops of first Person node...\n");
    try {
      const result = db
        .prepare(
          `
        SELECT cypher('MATCH (a:Person)-[:FOLLOWS*1..2]->(b:Person) RETURN b.pubkey, b.name LIMIT 10')
      `,
        )
        .get() as any;
      console.log(Object.values(result)[0]);
    } catch (e) {
      console.log("   (graph query skipped — graphqlite error)");
    }
  }

  db.close();
  process.exit(0);
}, CRAWL_DURATION_MS);
