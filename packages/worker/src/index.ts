import { getPool, closePool } from "@nostril/shared/db";
import { startNostr } from "./nostr.ts";
import { startMastodon } from "./mastodon.ts";
import { startRss } from "./rss.ts";
import { startRetention } from "./retention.ts";

const LOCK_KEY = 424242;

async function main() {
  const pool = getPool(5);

  // Ensure only one worker indexes at a time (safety net for restarts / scaling).
  const { rows } = await pool.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [LOCK_KEY],
  );
  if (!rows[0]?.locked) {
    console.error("[worker] another instance holds the indexing lock, exiting");
    await closePool();
    process.exit(0);
  }

  console.log("[worker] acquired indexing lock");

  const stops = [
    startNostr(pool),
    startMastodon(pool),
    startRss(pool),
    startRetention(pool),
  ];

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    stops.forEach((stop) => stop());
    await pool.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
