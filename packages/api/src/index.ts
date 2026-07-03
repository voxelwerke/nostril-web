import express from "express";
import compression from "compression";
import cors from "cors";
import { getPool } from "@nostril/shared/db";
import searchRouter from "./routes/search.ts";
import feedRouter from "./routes/feed.ts";
import nostrRouter from "./routes/nostr.ts";
import mastodonRouter from "./routes/mastodon.ts";
import rssRouter from "./routes/rss.ts";

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

app.use(compression());
app.use(cors());

app.get("/api/health", async (_req, res) => {
  try {
    await getPool().query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/api/search", searchRouter);
app.use("/api/feed", feedRouter);
app.use("/api/nostr", nostrRouter);
app.use("/api/mastodon", mastodonRouter);
app.use("/api/rss", rssRouter);

app.listen(PORT, () => {
  console.log(`api listening on :${PORT}`);
});
