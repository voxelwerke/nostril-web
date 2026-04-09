import { npubToHex } from "$lib/nostr";
import db from "$lib/db";
import WebSocket from "ws";
import type { RequestHandler } from "./$types";

const RELAYS = (process.env.RELAYS || "wss://nos.lol,wss://relay.primal.net,wss://purplepag.es").split(",");
const QLEN = parseInt(process.env.QLEN || "10") * 1000;
const MIN_FETCH = parseInt(process.env.MIN_FETCH || String(5 * 60));

const upsertEvent = db.prepare(`
  INSERT INTO events (id, pubkey, kind, content, tags, created_at, sig, raw)
  VALUES (@id, @pubkey, @kind, @content, @tags, @created_at, @sig, @raw)
  ON CONFLICT(id) DO NOTHING
`);

const getEvents = db.prepare(`
  SELECT raw FROM events WHERE pubkey = ? ORDER BY created_at DESC LIMIT 200
`);

const getFetchedAt = db.prepare(`
  SELECT fetched_at FROM events_fetched WHERE pubkey = ?
`);

const upsertFetched = db.prepare(`
  INSERT INTO events_fetched (pubkey, fetched_at) VALUES (?, ?)
  ON CONFLICT(pubkey) DO UPDATE SET fetched_at = excluded.fetched_at
`);

export const GET: RequestHandler = ({ params }) => {
  const hex = npubToHex(params.npub);
  if (!hex) return new Response("invalid npub", { status: 400 });

  const ac = new AbortController();
  const { signal } = ac;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: any) {
        if (signal.aborted) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      function cleanup() {
        if (!signal.aborted) ac.abort();
      }

      signal.addEventListener("abort", () => {
        try { controller.close(); } catch {}
      });

      // 1. Send cached events from DB
      const cached = getEvents.all(hex) as { raw: string }[];
      const seenIds = new Set<string>();
      for (const row of cached) {
        try {
          const ev = JSON.parse(row.raw);
          seenIds.add(ev.id);
          send("event", ev);
        } catch {}
      }
      send("cached", { count: cached.length });

      // 2. Check if we need to fetch from relays
      const now = Math.floor(Date.now() / 1000);
      const fetched = getFetchedAt.get(hex) as { fetched_at: number } | undefined;
      const fresh = fetched && (now - fetched.fetched_at) < MIN_FETCH;

      if (fresh) {
        send("done", {});
        cleanup();
        return;
      }

      // 3. Connect to relays and query for live events
      upsertFetched.run(hex, now);

      const sockets: WebSocket[] = [];

      function finish() {
        send("done", {});
        sockets.forEach((ws) => { try { ws.close(); } catch {} });
        cleanup();
      }

      const timer = setTimeout(finish, QLEN);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        sockets.forEach((ws) => { try { ws.close(); } catch {} });
      });

      for (const url of RELAYS) {
        try {
          const ws = new WebSocket(url, { handshakeTimeout: 5000 });
          sockets.push(ws);

          ws.on("open", () => {
            if (signal.aborted) return ws.close();
            ws.send(JSON.stringify(["REQ", "profile", { authors: [hex], kinds: [0, 1, 3, 6], limit: 200 }]));
          });

          ws.on("message", (raw: Buffer) => {
            if (signal.aborted) return;
            let msg: any;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg[0] !== "EVENT" || !msg[2]) return;
            const ev = msg[2];
            if (seenIds.has(ev.id)) return;
            seenIds.add(ev.id);

            try {
              upsertEvent.run({
                id: ev.id,
                pubkey: ev.pubkey,
                kind: ev.kind,
                content: ev.content || "",
                tags: JSON.stringify(ev.tags || []),
                created_at: ev.created_at,
                sig: ev.sig || "",
                raw: JSON.stringify(ev),
              });
            } catch {}

            send("event", ev);
          });

          ws.on("error", () => {});
          ws.on("close", () => {});
        } catch {}
      }
    },

    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
