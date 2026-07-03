import { Router } from "express";
import { getPool } from "@nostril/shared/db";
import type { RssFeed } from "@nostril/shared";

const router = Router();
const pool = getPool();

router.get("/feeds/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid feed id" });
    return;
  }

  const feed = await pool.query<RssFeed>("SELECT * FROM rss_feeds WHERE id = $1", [id]);
  if (feed.rows.length === 0) {
    res.status(404).json({ error: "feed not found" });
    return;
  }

  const items = await pool.query(
    `SELECT feed_id, guid, title, content_text, link, published_at
     FROM rss_items WHERE feed_id = $1
     ORDER BY published_at DESC LIMIT 50`,
    [id],
  );

  res.json({ feed: feed.rows[0], items: items.rows });
});

router.get("/items/:id", async (req, res) => {
  const guid = req.params.id;
  const item = await pool.query(
    `SELECT feed_id, guid, title, content, link, published_at
     FROM rss_items WHERE guid = $1 ORDER BY published_at DESC LIMIT 1`,
    [guid],
  );
  if (item.rows.length === 0) {
    res.status(404).json({ error: "item not found" });
    return;
  }
  res.json(item.rows[0]);
});

export default router;
