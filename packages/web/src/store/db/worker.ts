import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { SCHEMA } from "./schema.ts";
import type { AuthorSnap, PostSnap, ToggleTable } from "./types.ts";

type Db = {
  exec(opts: {
    sql: string;
    bind?: unknown[];
    rowMode?: string;
    returnValue?: string;
  }): unknown;
  selectValue(sql: string, bind?: unknown[]): unknown;
};

let db: Db | null = null;

interface Req {
  id: number;
  type: string;
  payload?: Record<string, unknown>;
}

// Returns true when backed by persistent OPFS storage, false for the
// in-memory fallback. The SAH Pool VFS persists without needing
// cross-origin isolation (COOP/COEP), unlike the SharedArrayBuffer OpfsDb.
async function open(): Promise<boolean> {
  const sqlite3 = (await sqlite3InitModule()) as unknown as {
    oo1: { DB: new (name: string, flags: string) => Db };
    installOpfsSAHPoolVfs?: (opts: {
      name?: string;
    }) => Promise<{ OpfsSAHPoolDb: new (name: string) => Db }>;
  };

  if (sqlite3.installOpfsSAHPoolVfs) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "nostril" });
      db = new pool.OpfsSAHPoolDb("/nostril.db");
      db.exec({ sql: SCHEMA });
      return true;
    } catch (err) {
      console.warn("[db] OPFS SAH pool unavailable, falling back to memory", err);
    }
  }

  db = new sqlite3.oo1.DB("/nostril.db", "ct");
  db.exec({ sql: SCHEMA });
  return false;
}

function handle(req: Req): unknown {
  if (!db) throw new Error("db not ready");
  const p = req.payload ?? {};

  switch (req.type) {
    case "get": {
      const table = p.table as ToggleTable;
      const active = db.selectValue(
        `SELECT active FROM ${table} WHERE target_id = ?`,
        [p.targetId as string],
      );
      return active == null ? null : { active: Number(active) };
    }
    case "set": {
      const table = p.table as ToggleTable;
      db.exec({
        sql: `INSERT INTO ${table} (target_id, active, hlc) VALUES (?, ?, ?)
              ON CONFLICT(target_id) DO UPDATE SET active = excluded.active, hlc = excluded.hlc
              WHERE excluded.hlc > ${table}.hlc`,
        bind: [p.targetId as string, p.active as number, p.hlc as number],
      });
      return true;
    }
    case "getReaction": {
      const value = db.selectValue(
        `SELECT value FROM reactions WHERE target_id = ?`,
        [p.targetId as string],
      );
      return value == null ? null : { value: Number(value) };
    }
    case "setReaction": {
      db.exec({
        sql: `INSERT INTO reactions (target_id, value, hlc) VALUES (?, ?, ?)
              ON CONFLICT(target_id) DO UPDATE SET value = excluded.value, hlc = excluded.hlc
              WHERE excluded.hlc > reactions.hlc`,
        bind: [p.targetId as string, p.value as number, p.hlc as number],
      });
      return true;
    }
    case "upsertPost": {
      const post = p.post as PostSnap;
      db.exec({
        sql: `INSERT INTO posts (uri, author_uri, title, body, published_at, url, hlc)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(uri) DO UPDATE SET
                author_uri = excluded.author_uri, title = excluded.title,
                body = excluded.body, published_at = excluded.published_at,
                url = excluded.url, hlc = excluded.hlc
              WHERE excluded.hlc > posts.hlc`,
        bind: [
          post.uri,
          post.author_uri ?? null,
          post.title ?? null,
          post.body ?? null,
          post.published_at ?? null,
          post.url ?? null,
          p.hlc as number,
        ],
      });
      return true;
    }
    case "upsertAuthor": {
      const author = p.author as AuthorSnap;
      db.exec({
        sql: `INSERT INTO authors (uri, name, image, hlc)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(uri) DO UPDATE SET
                name = excluded.name, image = excluded.image, hlc = excluded.hlc
              WHERE excluded.hlc > authors.hlc`,
        bind: [author.uri, author.name ?? null, author.image ?? null, p.hlc as number],
      });
      return true;
    }
    case "listLikes": {
      const rows = db.exec({
        sql: `SELECT p.uri, p.title, p.body, p.published_at, p.url,
                     a.name AS author_name, a.image AS author_image
              FROM reactions r
              JOIN posts p ON p.uri = r.target_id
              LEFT JOIN authors a ON a.uri = p.author_uri
              WHERE r.value = 1
              ORDER BY r.hlc DESC`,
        rowMode: "object",
        returnValue: "resultRows",
      });
      return rows ?? [];
    }
    default:
      throw new Error(`unknown request: ${req.type}`);
  }
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    if (req.type === "init") {
      const persistent = await open();
      self.postMessage({ id: req.id, ok: true, result: { persistent } });
      return;
    }
    const result = handle(req);
    self.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: String(err) });
  }
};
