import WebSocket from "ws";
import type { Pool } from "@nostril/shared/db";

const RELAYS = (
  process.env.NOSTR_RELAYS ||
  "wss://nos.lol,wss://relay.primal.net,wss://relay.snort.social,wss://nostr-pub.wellorder.net,wss://purplepag.es"
).split(",");
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "500", 10);
const BATCH_COOLDOWN_MS = 10_000;
const FIREHOSE = process.env.FIREHOSE !== "false";
const COUNT_INTERVAL_MS = 10 * 60 * 1000;

interface NostrEvent {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  sig: string;
}

export function startNostr(pool: Pool) {
  const resolver = new BatchResolver(pool);
  const connections = RELAYS.map((url, i) =>
    connectRelay(pool, resolver, url, `doom-${i}`),
  );

  const countTimer = setInterval(() => void recomputeCounts(pool), COUNT_INTERVAL_MS);

  console.log(`[nostr] started, mode=${FIREHOSE ? "firehose+resolve" : "resolve"}, relays=${RELAYS.length}`);

  return () => {
    clearInterval(countTimer);
    connections.forEach((c) => c.close());
  };
}

async function handleProfile(pool: Pool, event: NostrEvent) {
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(event.content || "{}");
  } catch {
    return;
  }
  const str = (v: unknown, n: number) =>
    typeof v === "string" ? v.slice(0, n) : null;
  const name = str(meta.name, 200) || str(meta.display_name, 200);
  const displayName = str(meta.display_name, 200) || str(meta.displayName, 200);
  const about = str(meta.about, 1000);
  const picture = str(meta.picture, 500);
  const nip05 = str(meta.nip05, 300);
  const now = Math.floor(Date.now() / 1000);

  await pool.query(
    `INSERT INTO nostr_users
      (pubkey, name, display_name, about, picture, banner, website, nip05, lud16, raw, event_created_at, seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (pubkey) DO UPDATE SET
       name = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.name ELSE nostr_users.name END,
       display_name = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.display_name ELSE nostr_users.display_name END,
       about = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.about ELSE nostr_users.about END,
       picture = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.picture ELSE nostr_users.picture END,
       banner = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.banner ELSE nostr_users.banner END,
       website = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.website ELSE nostr_users.website END,
       nip05 = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.nip05 ELSE nostr_users.nip05 END,
       lud16 = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.lud16 ELSE nostr_users.lud16 END,
       raw = CASE WHEN excluded.event_created_at > nostr_users.event_created_at THEN excluded.raw ELSE nostr_users.raw END,
       event_created_at = GREATEST(excluded.event_created_at, nostr_users.event_created_at),
       seen_at = excluded.seen_at`,
    [
      event.pubkey, name, displayName, about, picture,
      str(meta.banner, 500), str(meta.website, 300), nip05, str(meta.lud16, 300),
      event.content?.slice(0, 2000) ?? null, event.created_at, now,
    ],
  );

  await pool.query(
    `INSERT INTO search_entities (source, source_key, title, body, author, image_url, meta)
     VALUES ('nostr_user', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (source, source_key) DO UPDATE SET
       title = excluded.title, body = excluded.body, author = excluded.author,
       image_url = excluded.image_url, meta = excluded.meta`,
    [event.pubkey, displayName || name, about, nip05, picture, JSON.stringify({ pubkey: event.pubkey, nip05 })],
  );
}

async function handleFollowList(pool: Pool, event: NostrEvent) {
  const followees = event.tags
    .filter((t) => t[0] === "p" && t[1]?.length === 64)
    .map((t) => t[1]!);
  if (followees.length === 0) return;

  const values: string[] = [];
  const params: string[] = [];
  followees.forEach((f, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(event.pubkey, f);
  });
  await pool.query(
    `INSERT INTO nostr_follows (follower, followee) VALUES ${values.join(",")}
     ON CONFLICT DO NOTHING`,
    params,
  );
}

async function recomputeCounts(pool: Pool) {
  console.log("[nostr] recomputing follow counts...");
  await pool.query(`
    UPDATE nostr_users u SET
      following_count = COALESCE((SELECT COUNT(*) FROM nostr_follows WHERE follower = u.pubkey), 0),
      follower_count = COALESCE((SELECT COUNT(*) FROM nostr_follows WHERE followee = u.pubkey), 0)
  `);
  await pool.query(`
    UPDATE search_entities se SET rank_score = u.follower_count
    FROM nostr_users u
    WHERE se.source = 'nostr_user' AND se.source_key = u.pubkey
  `);
}

class BatchResolver {
  private pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }

  async next(): Promise<string[] | null> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 3600;
    const { rows } = await this.pool.query<{ followee: string }>(
      `SELECT DISTINCT f.followee FROM nostr_follows f
       WHERE f.followee NOT IN (SELECT pubkey FROM nostr_users)
         AND f.followee NOT IN (SELECT pubkey FROM nostr_resolve_attempts WHERE queried_at > $1)
       LIMIT $2`,
      [cutoff, BATCH_SIZE],
    );
    if (rows.length === 0) return null;
    const pubkeys = rows.map((r) => r.followee);

    const values = pubkeys.map((_, i) => `($${i + 1}, ${now})`).join(",");
    await this.pool.query(
      `INSERT INTO nostr_resolve_attempts (pubkey, queried_at) VALUES ${values}
       ON CONFLICT (pubkey) DO UPDATE SET queried_at = excluded.queried_at`,
      pubkeys,
    );
    return pubkeys;
  }
}

function connectRelay(
  pool: Pool,
  resolver: BatchResolver,
  url: string,
  subId: string,
) {
  let ws: WebSocket;
  let dead = false;
  let attempts = 0;
  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  async function sendNextBatch() {
    if (dead || !ws || ws.readyState !== WebSocket.OPEN) return;
    const batch = await resolver.next();
    if (!batch) return;
    ws.send(JSON.stringify(["CLOSE", subId + "-resolve"]));
    ws.send(JSON.stringify(["REQ", subId + "-resolve", { kinds: [0], authors: batch }]));
  }

  function scheduleNextBatch() {
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      void sendNextBatch();
    }, BATCH_COOLDOWN_MS);
  }

  function connect() {
    if (dead) return;
    ws = new WebSocket(url, { handshakeTimeout: 10000 });

    ws.on("open", () => {
      attempts = 0;
      console.log(`[nostr] + ${url}`);
      if (FIREHOSE) {
        ws.send(JSON.stringify(["REQ", subId, { kinds: [0], limit: 5000 }]));
        ws.send(JSON.stringify(["REQ", subId + "-follows", { kinds: [3], limit: 5000 }]));
      }
      void sendNextBatch();
    });

    ws.on("message", (raw: Buffer) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;
      if (msg[0] === "EOSE" && msg[1] === subId + "-resolve") {
        scheduleNextBatch();
        return;
      }
      if (msg[0] !== "EVENT" || !msg[2]) return;
      const event = msg[2] as NostrEvent;
      if (event.kind === 0) void handleProfile(pool, event).catch(() => {});
      else if (event.kind === 3) void handleFollowList(pool, event).catch(() => {});
    });

    ws.on("error", () => {});
    ws.on("close", () => {
      if (!dead && attempts < 5) {
        attempts++;
        setTimeout(connect, Math.min(1000 * 2 ** attempts, 30000));
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
