import Database from "better-sqlite3";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const DB_PATH = process.env.DB_PATH || "./nostr-users.db";
const db = new Database(DB_PATH, { readonly: true });

const search = db.prepare(`
  SELECT u.pubkey, u.name, u.display_name, u.about, u.picture, u.nip05,
         u.follower_count, u.following_count
  FROM users_fts
  JOIN users u ON users_fts.rowid = u.rowid
  WHERE users_fts MATCH ?
  ORDER BY u.follower_count DESC
  LIMIT 20
`);

export const GET: RequestHandler = ({ url }) => {
  const q = url.searchParams.get("q")?.trim();
  if (!q) return json([]);

  const ftsQuery = q.replace(/['"*]/g, " ").trim() + "*";

  const results = search.all(ftsQuery);
  return json(results);
};
