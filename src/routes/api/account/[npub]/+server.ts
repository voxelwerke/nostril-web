import { npubToHex } from "$lib/nostr";
import db from "$lib/db";
import WebSocket from "ws";
import type { RequestHandler } from "./$types";

const RELAYS = (process.env.RELAYS || "wss://nos.lol,wss://relay.primal.net,wss://purplepag.es").split(",");
const QLEN = parseInt(process.env.QLEN || "10") * 1000;

const upsertEvent = db.prepare(`
  INSERT INTO events (id, pubkey, kind, content, tags, created_at, sig, raw)
  VALUES (@id, @pubkey, @kind, @content, @tags, @created_at, @sig, @raw)
  ON CONFLICT(id) DO NOTHING
`);

const getEvents = db.prepare(`
  SELECT raw FROM events WHERE pubkey = ? ORDER BY created_at DESC LIMIT 200
`);

export const GET: RequestHandler = ({ params }) => {
  const hex = npubToHex(params.npub);
  if (!hex) return new Response("invalid npub", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

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

      // 2. Connect to relays and query for live events
      const sockets: WebSocket[] = [];
      let closed = false;

      function finish() {
        if (closed) return;
        closed = true;
        sockets.forEach((ws) => { try { ws.close(); } catch {} });
        send("done", {});
        controller.close();
      }

      const timer = setTimeout(finish, QLEN);

      for (const url of RELAYS) {
        try {
          const ws = new WebSocket(url, { handshakeTimeout: 5000 });
          sockets.push(ws);

          ws.on("open", () => {
            ws.send(JSON.stringify(["REQ", "profile", { authors: [hex], limit: 200 }]));
          });

          ws.on("message", (raw: Buffer) => {
            if (closed) return;
            let msg: any;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg[0] !== "EVENT" || !msg[2]) return;
            const ev = msg[2];
            if (seenIds.has(ev.id)) return;
            seenIds.add(ev.id);

            // Save to DB
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

      // Safety: if stream is cancelled, clean up
      return () => {
        clearTimeout(timer);
        closed = true;
        sockets.forEach((ws) => { try { ws.close(); } catch {} });
      };
    },

    cancel() {
      // handled by return fn above
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
