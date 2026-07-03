import { Router } from "express";
import { getPool } from "@nostril/shared/db";
import { recencyWeight, selectDiverse, type Candidate } from "@nostril/shared";
import type { SearchResult } from "@nostril/shared";

const router = Router();
const pool = getPool();

const HALF_LIFE_HOURS = parseFloat(process.env.FEED_HALF_LIFE_HOURS || "48");
const CANDIDATE_LIMIT = parseInt(process.env.FEED_CANDIDATE_LIMIT || "500", 10);

interface Row extends SearchResult {
  embedding: number[] | null;
}

router.get("/", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  try {
    const { rows } = await pool.query<Row>(
      `SELECT source, source_key, title, body, author, url, image_url,
              published_at, meta, embedding
       FROM search_posts
       WHERE published_at > now() - interval '7 days'
         AND embedding IS NOT NULL
       ORDER BY published_at DESC
       LIMIT $1`,
      [CANDIDATE_LIMIT],
    );

    const now = Date.now();
    const candidates: Candidate[] = rows.map((r) => {
      const ageHours = (now - new Date(r.published_at as string).getTime()) / 3_600_000;
      return { embedding: r.embedding as number[], weight: recencyWeight(ageHours, HALF_LIFE_HOURS) };
    });

    const picked = selectDiverse(candidates, { limit, offset });
    const results: SearchResult[] = picked.map((i) => {
      const { embedding: _embedding, ...rest } = rows[i]!;
      return { ...rest, rank: candidates[i]!.weight };
    });

    res.json(results);
  } catch (e) {
    console.error("feed error", e);
    res.status(500).json({ error: "feed failed" });
  }
});

export default router;
