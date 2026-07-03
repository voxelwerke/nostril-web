import Parser from "rss-parser";
import type { Pool } from "@nostril/shared/db";
import { parseOpml } from "./opml.ts";
import { stripHtml } from "./html.ts";
import { embed } from "./embed.ts";

const OPML_PATH = process.env.OPML_PATH || "./feeds.opml";
const POLL_INTERVAL_MS = parseInt(process.env.RSS_POLL_INTERVAL_MS || "1800000", 10);

const parser = new Parser({ timeout: 15000 });

export function startRss(pool: Pool) {
  let stopped = false;

  async function loop() {
    try {
      await seedFeeds(pool);
      await pollAll(pool);
    } catch (e) {
      console.error("[rss] loop error", e);
    }
    if (!stopped) setTimeout(loop, POLL_INTERVAL_MS);
  }

  void loop();
  console.log(`[rss] started, opml=${OPML_PATH}, interval=${POLL_INTERVAL_MS}ms`);

  return () => {
    stopped = true;
  };
}

async function seedFeeds(pool: Pool) {
  let feeds;
  try {
    feeds = await parseOpml(OPML_PATH);
  } catch (e) {
    console.error(`[rss] could not read OPML at ${OPML_PATH}`, e);
    return;
  }
  for (const f of feeds) {
    await pool.query(
      `INSERT INTO rss_feeds (url, title, site_url) VALUES ($1, $2, $3)
       ON CONFLICT (url) DO UPDATE SET
         title = COALESCE(rss_feeds.title, excluded.title),
         site_url = COALESCE(rss_feeds.site_url, excluded.site_url)`,
      [f.url, f.title, f.site_url],
    );
  }
  console.log(`[rss] seeded ${feeds.length} feeds`);
}

async function pollAll(pool: Pool) {
  const { rows } = await pool.query<{
    id: number;
    url: string;
    etag: string | null;
    last_modified: string | null;
  }>("SELECT id, url, etag, last_modified FROM rss_feeds");

  for (const feed of rows) {
    try {
      await pollFeed(pool, feed);
    } catch (e) {
      console.error(`[rss] ${feed.url} failed`, (e as Error).message);
    }
  }
}

async function pollFeed(
  pool: Pool,
  feed: { id: number; url: string; etag: string | null; last_modified: string | null },
) {
  const headers: Record<string, string> = {};
  if (feed.etag) headers["If-None-Match"] = feed.etag;
  if (feed.last_modified) headers["If-Modified-Since"] = feed.last_modified;

  const res = await fetch(feed.url, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 304) return;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.text();
  const parsed = await parser.parseString(body);

  await pool.query(
    `UPDATE rss_feeds SET
       title = COALESCE(title, $2),
       description = COALESCE($3, description),
       etag = $4, last_modified = $5, last_fetched_at = $6
     WHERE id = $1`,
    [
      feed.id,
      parsed.title ?? null,
      parsed.description ?? null,
      res.headers.get("etag"),
      res.headers.get("last-modified"),
      Math.floor(Date.now() / 1000),
    ],
  );

  for (const item of parsed.items ?? []) {
    const guid = item.guid || item.link || item.title;
    if (!guid) continue;
    const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
    const contentHtml = item["content:encoded"] || item.content || item.contentSnippet || "";
    const contentText = stripHtml(contentHtml);

    await pool.query(
      `INSERT INTO rss_items (feed_id, guid, title, content, content_text, link, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (feed_id, guid) DO NOTHING`,
      [feed.id, guid, item.title ?? null, contentHtml, contentText, item.link ?? null, publishedAt],
    );

    const body = contentText.slice(0, 4000);
    const embedding = await embed(item.title ?? null, body);
    await pool.query(
      `INSERT INTO search_posts (source, source_key, title, body, author, url, published_at, meta, embedding)
       VALUES ('rss_item', $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source, source_key) DO NOTHING`,
      [
        `${feed.id}:${guid}`,
        item.title ?? null,
        body,
        parsed.title ?? null,
        item.link ?? null,
        publishedAt,
        JSON.stringify({ feed_id: feed.id, guid }),
        embedding,
      ],
    );
  }
}
