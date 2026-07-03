import { Router } from "express";
import { getDb } from "@nostril/shared/db";
import type { RssFeed } from "@nostril/shared";

const router = Router();
const db = getDb();

router.get("/feeds/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "invalid feed id" });
    return;
  }

  const feed = await db.oneOrNone<RssFeed>(
    "SELECT * FROM rss_feeds WHERE id = $<id>",
    { id },
  );
  if (!feed) {
    res.status(404).json({ error: "feed not found" });
    return;
  }

  const items = await db.any(
    `SELECT feed_id, guid, title, content_text, link, published_at
     FROM rss_items WHERE feed_id = $<id>
     ORDER BY published_at DESC LIMIT 50`,
    { id },
  );

  res.json({ feed, items });
});

router.get("/items/:id", async (req, res) => {
  const guid = req.params.id;
  const item = await db.oneOrNone(
    `SELECT feed_id, guid, title, content, link, published_at
     FROM rss_items WHERE guid = $<guid> ORDER BY published_at DESC LIMIT 1`,
    { guid },
  );
  if (!item) {
    res.status(404).json({ error: "item not found" });
    return;
  }
  res.json(item);
});

export default router;
