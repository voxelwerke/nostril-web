import { Router } from "express";
import { getDb } from "@nostril/shared/db";
import { decodeUriPath, parseUri } from "@nostril/shared/uri";
import type { DocSource } from "@nostril/shared";

const router = Router();
const db = getDb();

interface Row {
  kind: "post" | "entity";
  uri: string;
  source: DocSource;
  source_key: string;
  title: string | null;
  body: string | null;
  author: string | null;
  url: string | null;
  image_url: string | null;
  published_at: string | null;
  meta: Record<string, unknown> | null;
}

const postCols = `uri, source, source_key, title, body, author, url, image_url, published_at, meta`;
const entityCols = `uri, source, source_key, title, body, author, url, image_url, NULL::timestamptz AS published_at, meta`;

router.get("/:encoded", async (req, res) => {
  const uri = decodeUriPath(req.params.encoded);
  if (!parseUri(uri)) {
    res.status(400).json({ error: "invalid uri" });
    return;
  }

  const post = await db.oneOrNone<Row>(
    `SELECT 'post' AS kind, ${postCols} FROM search_posts WHERE uri = $<uri>`,
    { uri },
  );
  if (post) {
    res.json(post);
    return;
  }

  const entity = await db.oneOrNone<Row>(
    `SELECT 'entity' AS kind, ${entityCols} FROM search_entities WHERE uri = $<uri>`,
    { uri },
  );
  if (entity) {
    res.json(entity);
    return;
  }

  res.status(404).json({ error: "not found" });
});

export default router;
