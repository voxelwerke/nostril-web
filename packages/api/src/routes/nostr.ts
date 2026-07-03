import { Router } from "express";
import WebSocket from "ws";
import { getDb } from "@nostril/shared/db";
import { npubToHex } from "@nostril/shared";
import type { NostrUser } from "@nostril/shared";

const router = Router();
const db = getDb();

const RELAYS = (
  process.env.RELAYS || "wss://nos.lol,wss://relay.primal.net,wss://purplepag.es"
).split(",");
const QLEN = parseInt(process.env.QLEN || "10", 10) * 1000;

router.get("/users/:npub", async (req, res) => {
  const hex = npubToHex(req.params.npub);
  if (!hex) {
    res.status(400).json({ error: "invalid npub" });
    return;
  }
  const user = await db.oneOrNone<NostrUser>(
    "SELECT * FROM nostr_users WHERE pubkey = $<hex>",
    { hex },
  );
  if (!user) {
    res.status(404).json({ error: "not found", pubkey: hex });
    return;
  }
  res.json(user);
});

router.get("/users/:npub/events", async (req, res) => {
  const hex = npubToHex(req.params.npub);
  if (!hex) {
    res.status(400).json({ error: "invalid npub" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let closed = false;
  const seen = new Set<string>();

  function send(event: string, data: unknown) {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const cached = await db.any<{ raw: unknown }>(
    "SELECT raw FROM nostr_events WHERE pubkey = $<hex> ORDER BY created_at DESC LIMIT 200",
    { hex },
  );
  for (const row of cached) {
    const ev = row.raw as { id?: string };
    if (ev?.id) {
      seen.add(ev.id);
      send("event", ev);
    }
  }
  send("cached", { count: cached.length });

  const sockets: WebSocket[] = [];

  function finish() {
    if (closed) return;
    send("done", {});
    closed = true;
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    res.end();
  }

  const timer = setTimeout(finish, QLEN);
  req.on("close", () => {
    clearTimeout(timer);
    closed = true;
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });

  for (const url of RELAYS) {
    try {
      const ws = new WebSocket(url, { handshakeTimeout: 5000 });
      sockets.push(ws);

      ws.on("open", () => {
        if (closed) return ws.close();
        ws.send(
          JSON.stringify([
            "REQ",
            "profile",
            { authors: [hex], kinds: [0, 1, 3, 6], limit: 200 },
          ]),
        );
      });

      ws.on("message", (raw: Buffer) => {
        if (closed) return;
        let msg: unknown;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!Array.isArray(msg) || msg[0] !== "EVENT" || !msg[2]) return;
        const ev = msg[2] as { id: string; kind: number; created_at: number };
        if (seen.has(ev.id)) return;
        seen.add(ev.id);
        if (ev.kind === 1) void cacheNote(ev);
        send("event", ev);
      });

      ws.on("error", () => {});
    } catch {
      // ignore relay connect failure
    }
  }
});

async function cacheNote(ev: {
  id: string;
  pubkey?: string;
  kind: number;
  content?: string;
  tags?: unknown;
  created_at: number;
  sig?: string;
}) {
  try {
    await db.none(
      `INSERT INTO nostr_events (id, pubkey, kind, content, tags, created_at, sig, raw)
       VALUES ($<id>, $<pubkey>, $<kind>, $<content>, $<tags>, to_timestamp($<created_at>), $<sig>, $<raw>)
       ON CONFLICT (id) DO NOTHING`,
      {
        id: ev.id,
        pubkey: ev.pubkey ?? "",
        kind: ev.kind,
        content: ev.content ?? "",
        tags: JSON.stringify(ev.tags ?? []),
        created_at: ev.created_at,
        sig: ev.sig ?? "",
        raw: JSON.stringify(ev),
      },
    );
  } catch {
    // best-effort cache
  }
}

export default router;
