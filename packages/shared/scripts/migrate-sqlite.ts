import Database from "better-sqlite3";
import { getPool, closePool } from "../src/db.ts";

const SQLITE_PATH = process.env.SQLITE_PATH || "./nostr-users.db";
const CHUNK = 1000;

interface UserRow {
  pubkey: string;
  name: string | null;
  display_name: string | null;
  about: string | null;
  picture: string | null;
  banner: string | null;
  website: string | null;
  nip05: string | null;
  lud16: string | null;
  follower_count: number;
  following_count: number;
  raw: string | null;
  event_created_at: number | null;
  seen_at: number | null;
}

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool = getPool();

  console.log(`Reading from ${SQLITE_PATH}...`);

  const users = sqlite.prepare("SELECT * FROM users").all() as UserRow[];
  console.log(`  ${users.length} users`);

  for (let i = 0; i < users.length; i += CHUNK) {
    const batch = users.slice(i, i + CHUNK);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const u of batch) {
        await client.query(
          `INSERT INTO nostr_users
            (pubkey, name, display_name, about, picture, banner, website, nip05, lud16,
             follower_count, following_count, raw, event_created_at, seen_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (pubkey) DO NOTHING`,
          [
            u.pubkey, u.name, u.display_name, u.about, u.picture, u.banner,
            u.website, u.nip05, u.lud16, u.follower_count ?? 0,
            u.following_count ?? 0, u.raw, u.event_created_at ?? 0,
            u.seen_at ?? Math.floor(Date.now() / 1000),
          ],
        );
        await client.query(
          `INSERT INTO search_entities
            (source, source_key, title, body, author, image_url, rank_score, meta)
           VALUES ('nostr_user', $1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (source, source_key) DO NOTHING`,
          [
            u.pubkey,
            u.display_name || u.name,
            u.about,
            u.nip05,
            u.picture,
            u.follower_count ?? 0,
            JSON.stringify({ pubkey: u.pubkey, nip05: u.nip05 }),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    console.log(`  users ${Math.min(i + CHUNK, users.length)}/${users.length}`);
  }

  const follows = sqlite
    .prepare("SELECT follower, followee FROM follows")
    .all() as { follower: string; followee: string }[];
  console.log(`  ${follows.length} follows`);

  for (let i = 0; i < follows.length; i += CHUNK) {
    const batch = follows.slice(i, i + CHUNK);
    const values: string[] = [];
    const params: string[] = [];
    batch.forEach((f, j) => {
      values.push(`($${j * 2 + 1}, $${j * 2 + 2})`);
      params.push(f.follower, f.followee);
    });
    await pool.query(
      `INSERT INTO nostr_follows (follower, followee) VALUES ${values.join(",")}
       ON CONFLICT DO NOTHING`,
      params,
    );
    console.log(`  follows ${Math.min(i + CHUNK, follows.length)}/${follows.length}`);
  }

  sqlite.close();
  await closePool();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
