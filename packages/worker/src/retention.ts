import type { Pool } from "@nostril/shared/db";

const DAYS = parseInt(process.env.RETENTION_DAYS || "28", 10);
const INTERVAL_MS = parseInt(
  process.env.RETENTION_SWEEP_INTERVAL_MS || String(24 * 60 * 60 * 1000),
  10,
);

const TABLES: { table: string; col: string }[] = [
  { table: "search_posts", col: "published_at" },
  { table: "mastodon_statuses", col: "created_at" },
  { table: "rss_items", col: "published_at" },
  { table: "nostr_events", col: "created_at" },
];

export function startRetention(pool: Pool) {
  let stopped = false;

  async function sweep() {
    for (const { table, col } of TABLES) {
      try {
        const res = await pool.query(
          `DELETE FROM ${table} WHERE ${col} < now() - ($1 || ' days')::interval`,
          [DAYS],
        );
        if (res.rowCount) console.log(`[retention] ${table}: dropped ${res.rowCount}`);
      } catch (e) {
        console.error(`[retention] ${table} sweep failed`, (e as Error).message);
      }
    }
  }

  void sweep();
  const timer = setInterval(() => {
    if (!stopped) void sweep();
  }, INTERVAL_MS);

  console.log(`[retention] started, keeping ${DAYS} days, sweep every ${INTERVAL_MS}ms`);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
