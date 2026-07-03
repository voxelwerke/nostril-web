import { Router } from "express";
import { getDb } from "@nostril/shared/db";
import type { SearchResult } from "@nostril/shared";

const router = Router();
const db = getDb();

const ENTITY_SOURCES = new Set(["nostr_user", "mastodon_account", "rss_feed"]);
const POST_SOURCES = new Set(["nostr_note", "mastodon_status", "rss_item"]);

router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const source = String(req.query.source ?? "all");
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  if (!q) {
    res.json([]);
    return;
  }

  const wantEntities = source === "all" || ENTITY_SOURCES.has(source);
  const wantPosts = source === "all" || POST_SOURCES.has(source);

  const parts: string[] = [];
  if (wantEntities) {
    parts.push(`
      SELECT source, source_key, title, body, author, url, image_url,
             NULL::timestamptz AS published_at, meta,
             ts_rank(search, query) * (1 + ln(1 + rank_score)) AS rank
      FROM search_entities, plainto_tsquery('english', $<q>) query
      WHERE search @@ query
        AND ($<source> = 'all' OR source = $<source>)`);
  }
  if (wantPosts) {
    parts.push(`
      SELECT source, source_key, title, body, author, url, image_url,
             published_at, meta,
             ts_rank(search, query) AS rank
      FROM search_posts, plainto_tsquery('english', $<q>) query
      WHERE search @@ query
        AND ($<source> = 'all' OR source = $<source>)
        AND published_at > now() - interval '28 days'`);
  }

  const sql = `
    ${parts.join("\nUNION ALL\n")}
    ORDER BY rank DESC, published_at DESC NULLS LAST
    LIMIT $<limit> OFFSET $<offset>`;

  try {
    const rows = await db.any<SearchResult>(sql, { q, source, limit, offset });
    res.json(rows);
  } catch (e) {
    console.error("search error", e);
    res.status(500).json({ error: "search failed" });
  }
});

export default router;
