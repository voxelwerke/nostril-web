import { getDb, closeDb } from "@nostril/shared/db";
import { initEmbed } from "./embed.ts";
import { startNostr } from "./nostr.ts";
import { startMastodon } from "./mastodon.ts";
import { startRss } from "./rss.ts";
import { startRetention } from "./retention.ts";

const LOCK_KEY = 424242;

async function main() {
  const db = getDb(5);

  // Ensure only one worker indexes at a time (safety net for restarts / scaling).
  const lock = await db.one<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($<key>) AS locked",
    { key: LOCK_KEY },
  );
  if (!lock.locked) {
    console.error("[worker] another instance holds the indexing lock, exiting");
    await closeDb();
    process.exit(0);
  }

  console.log("[worker] acquired indexing lock");

  await initEmbed();

  const stops = [
    startNostr(db),
    startMastodon(db),
    startRss(db),
    startRetention(db),
  ];

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    stops.forEach((stop) => stop());
    await db.none("SELECT pg_advisory_unlock($<key>)", { key: LOCK_KEY }).catch(() => {});
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
