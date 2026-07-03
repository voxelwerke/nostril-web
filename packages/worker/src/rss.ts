import Parser from "rss-parser";
import { type Db, pgRealArray } from "@nostril/shared/db";
import { rssItemUri } from "@nostril/shared/uri-hash";
import { parseOpml } from "./opml.ts";
import { stripHtml } from "./html.ts";
import { embed } from "./embed.ts";

const OPML_PATH = process.env.OPML_PATH || "./feeds.opml";
const POLL_INTERVAL_MS = parseInt(process.env.RSS_POLL_INTERVAL_MS || "1800000", 10);

const parser = new Parser({ timeout: 15000 });

export function startRss(db: Db) {
  let stopped = false;

  async function loop() {
    try {
      await seedFeeds(db);
      await pollAll(db);
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

async function seedFeeds(db: Db) {
  let feeds;
  try {
    feeds = await parseOpml(OPML_PATH);
  } catch (e) {
    console.error(`[rss] could not read OPML at ${OPML_PATH}`, e);
    return;
  }
  for (const f of feeds) {
    await db.none(
      `INSERT INTO rss_feeds (url, title, site_url) VALUES ($<url>, $<title>, $<siteUrl>)
       ON CONFLICT (url) DO UPDATE SET
         title = COALESCE(rss_feeds.title, excluded.title),
         site_url = COALESCE(rss_feeds.site_url, excluded.site_url)`,
      { url: f.url, title: f.title, siteUrl: f.site_url },
    );
  }
  console.log(`[rss] seeded ${feeds.length} feeds`);
}

async function pollAll(db: Db) {
  const rows = await db.any<{
    id: number;
    url: string;
    etag: string | null;
    last_modified: string | null;
  }>("SELECT id, url, etag, last_modified FROM rss_feeds");

  for (const feed of rows) {
    try {
      await pollFeed(db, feed);
    } catch (e) {
      console.error(`[rss] ${feed.url} failed`, (e as Error).message);
    }
  }
}

async function pollFeed(
  db: Db,
  feed: { id: number; url: string; etag: string | null; last_modified: string | null },
) {
  const headers: Record<string, string> = {};
  if (feed.etag) headers["If-None-Match"] = feed.etag;
  if (feed.last_modified) headers["If-Modified-Since"] = feed.last_modified;

  const res = await fetch(feed.url, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 304) return;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = await res.text();
  const parsed = await parser.parseString(raw);

  await db.none(
    `UPDATE rss_feeds SET
       title = COALESCE(title, $<title>),
       description = COALESCE($<description>, description),
       etag = $<etag>, last_modified = $<lastModified>, last_fetched_at = $<fetched>
     WHERE id = $<id>`,
    {
      id: feed.id,
      title: parsed.title ?? null,
      description: parsed.description ?? null,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      fetched: Math.floor(Date.now() / 1000),
    },
  );

  for (const item of parsed.items ?? []) {
    const guid = item.guid || item.link || item.title;
    if (!guid) continue;
    const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
    const contentHtml = item["content:encoded"] || item.content || item.contentSnippet || "";
    const contentText = stripHtml(contentHtml);

    await db.none(
      `INSERT INTO rss_items (feed_id, guid, title, content, content_text, link, published_at)
       VALUES ($<feedId>, $<guid>, $<title>, $<content>, $<contentText>, $<link>, $<published>)
       ON CONFLICT (feed_id, guid) DO NOTHING`,
      {
        feedId: feed.id,
        guid,
        title: item.title ?? null,
        content: contentHtml,
        contentText,
        link: item.link ?? null,
        published: publishedAt,
      },
    );

    const body = contentText.slice(0, 4000);
    const embedding = await embed(item.title ?? null, body);
    await db.none(
      `INSERT INTO search_posts (source, source_key, uri, title, body, author, url, published_at, meta, embedding)
       VALUES ('rss_item', $<key>, $<uri>, $<title>, $<body>, $<author>, $<url>, $<published>, $<meta>, $<embedding>)
       ON CONFLICT (source, source_key) DO NOTHING`,
      {
        key: `${feed.id}:${guid}`,
        uri: rssItemUri(item.link ?? null, feed.url, guid),
        title: item.title ?? null,
        body,
        author: parsed.title ?? null,
        url: item.link ?? null,
        published: publishedAt,
        meta: JSON.stringify({ feed_id: feed.id, guid }),
        embedding: pgRealArray(embedding),
      },
    );
  }
}
