import Database from "better-sqlite3";
import { getDb, closeDb, pgp } from "../src/db.ts";
import { nUri } from "../src/uri.ts";

const SQLITE_PATH = process.env.SQLITE_PATH || "./nostr-users.db";
const CHUNK = 1000;

const usersCols = new pgp.helpers.ColumnSet(
  [
    "pubkey", "name", "display_name", "about", "picture", "banner",
    "website", "nip05", "lud16", "follower_count", "following_count",
    "raw", "event_created_at", "seen_at",
  ],
  { table: "nostr_users" },
);

const entityCols = new pgp.helpers.ColumnSet(
  ["source", "source_key", "uri", "title", "body", "author", "image_url", "rank_score", "meta"],
  { table: "search_entities" },
);

const followsCols = new pgp.helpers.ColumnSet(["follower", "followee"], {
  table: "nostr_follows",
});

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
  const db = getDb();

  console.log(`Reading from ${SQLITE_PATH}...`);

  const users = sqlite.prepare("SELECT * FROM users").all() as UserRow[];
  console.log(`  ${users.length} users`);

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < users.length; i += CHUNK) {
    const batch = users.slice(i, i + CHUNK);
    const userRows = batch.map((u) => ({
      pubkey: u.pubkey,
      name: u.name,
      display_name: u.display_name,
      about: u.about,
      picture: u.picture,
      banner: u.banner,
      website: u.website,
      nip05: u.nip05,
      lud16: u.lud16,
      follower_count: u.follower_count ?? 0,
      following_count: u.following_count ?? 0,
      raw: u.raw,
      event_created_at: u.event_created_at ?? 0,
      seen_at: u.seen_at ?? now,
    }));
    const entityRows = batch.map((u) => ({
      source: "nostr_user",
      source_key: u.pubkey,
      uri: nUri(u.pubkey),
      title: u.display_name || u.name,
      body: u.about,
      author: u.nip05,
      image_url: u.picture,
      rank_score: u.follower_count ?? 0,
      meta: JSON.stringify({ pubkey: u.pubkey, nip05: u.nip05 }),
    }));

    await db.tx(async (t) => {
      await t.none(pgp.helpers.insert(userRows, usersCols) + " ON CONFLICT (pubkey) DO NOTHING");
      await t.none(
        pgp.helpers.insert(entityRows, entityCols) +
          " ON CONFLICT (source, source_key) DO NOTHING",
      );
    });
    console.log(`  users ${Math.min(i + CHUNK, users.length)}/${users.length}`);
  }

  const follows = sqlite
    .prepare("SELECT follower, followee FROM follows")
    .all() as { follower: string; followee: string }[];
  console.log(`  ${follows.length} follows`);

  for (let i = 0; i < follows.length; i += CHUNK) {
    const batch = follows.slice(i, i + CHUNK);
    await db.none(pgp.helpers.insert(batch, followsCols) + " ON CONFLICT DO NOTHING");
    console.log(`  follows ${Math.min(i + CHUNK, follows.length)}/${follows.length}`);
  }

  sqlite.close();
  await closeDb();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
