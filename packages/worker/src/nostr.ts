import WebSocket from "ws";
import { type Db, pgp } from "@nostril/shared/db";
import { nUri } from "@nostril/shared/uri";

const followsCols = new pgp.helpers.ColumnSet(["follower", "followee"], {
  table: "nostr_follows",
});
const resolveCols = new pgp.helpers.ColumnSet(["pubkey", "queried_at"], {
  table: "nostr_resolve_attempts",
});

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

export function startNostr(db: Db) {
  const resolver = new BatchResolver(db);
  const connections = RELAYS.map((url, i) =>
    connectRelay(db, resolver, url, `doom-${i}`),
  );

  const countTimer = setInterval(() => void recomputeCounts(db), COUNT_INTERVAL_MS);

  console.log(`[nostr] started, mode=${FIREHOSE ? "firehose+resolve" : "resolve"}, relays=${RELAYS.length}`);

  return () => {
    clearInterval(countTimer);
    connections.forEach((c) => c.close());
  };
}

async function handleProfile(db: Db, event: NostrEvent) {
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

  await db.none(
    `INSERT INTO nostr_users
      (pubkey, name, display_name, about, picture, banner, website, nip05, lud16, raw, event_created_at, seen_at)
     VALUES ($<pubkey>,$<name>,$<displayName>,$<about>,$<picture>,$<banner>,$<website>,$<nip05>,$<lud16>,$<raw>,$<createdAt>,$<seen>)
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
    {
      pubkey: event.pubkey,
      name,
      displayName,
      about,
      picture,
      banner: str(meta.banner, 500),
      website: str(meta.website, 300),
      nip05,
      lud16: str(meta.lud16, 300),
      raw: event.content?.slice(0, 2000) ?? null,
      createdAt: event.created_at,
      seen: now,
    },
  );

  await db.none(
    `INSERT INTO search_entities (source, source_key, uri, title, body, author, image_url, meta)
     VALUES ('nostr_user', $<key>, $<uri>, $<title>, $<body>, $<author>, $<image>, $<meta>)
     ON CONFLICT (source, source_key) DO UPDATE SET
       uri = excluded.uri,
       title = excluded.title, body = excluded.body, author = excluded.author,
       image_url = excluded.image_url, meta = excluded.meta`,
    {
      key: event.pubkey,
      uri: nUri(event.pubkey),
      title: displayName || name,
      body: about,
      author: nip05,
      image: picture,
      meta: JSON.stringify({ pubkey: event.pubkey, nip05 }),
    },
  );
}

async function handleFollowList(db: Db, event: NostrEvent) {
  const followees = event.tags
    .filter((t) => t[0] === "p" && t[1]?.length === 64)
    .map((t) => t[1]!);
  if (followees.length === 0) return;

  const rows = followees.map((followee) => ({ follower: event.pubkey, followee }));
  await db.none(
    pgp.helpers.insert(rows, followsCols) + " ON CONFLICT DO NOTHING",
  );
}

async function recomputeCounts(db: Db) {
  console.log("[nostr] recomputing follow counts...");
  await db.none(`
    UPDATE nostr_users u SET
      following_count = COALESCE((SELECT COUNT(*) FROM nostr_follows WHERE follower = u.pubkey), 0),
      follower_count = COALESCE((SELECT COUNT(*) FROM nostr_follows WHERE followee = u.pubkey), 0)
  `);
  await db.none(`
    UPDATE search_entities se SET rank_score = u.follower_count
    FROM nostr_users u
    WHERE se.source = 'nostr_user' AND se.source_key = u.pubkey
  `);
}

class BatchResolver {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async next(): Promise<string[] | null> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 3600;
    const rows = await this.db.any<{ followee: string }>(
      `SELECT DISTINCT f.followee FROM nostr_follows f
       WHERE f.followee NOT IN (SELECT pubkey FROM nostr_users)
         AND f.followee NOT IN (SELECT pubkey FROM nostr_resolve_attempts WHERE queried_at > $<cutoff>)
       LIMIT $<limit>`,
      { cutoff, limit: BATCH_SIZE },
    );
    if (rows.length === 0) return null;
    const pubkeys = rows.map((r) => r.followee);

    const attempts = pubkeys.map((pubkey) => ({ pubkey, queried_at: now }));
    await this.db.none(
      pgp.helpers.insert(attempts, resolveCols) +
        " ON CONFLICT (pubkey) DO UPDATE SET queried_at = excluded.queried_at",
    );
    return pubkeys;
  }
}

function connectRelay(
  db: Db,
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
      if (event.kind === 0) void handleProfile(db, event).catch(() => {});
      else if (event.kind === 3) void handleFollowList(db, event).catch(() => {});
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
