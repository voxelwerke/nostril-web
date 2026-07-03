import express from "express";
import compression from "compression";
import cors from "cors";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@nostril/shared/db";
import searchRouter from "./routes/search.ts";
import feedRouter from "./routes/feed.ts";
import nostrRouter from "./routes/nostr.ts";
import mastodonRouter from "./routes/mastodon.ts";
import rssRouter from "./routes/rss.ts";
import cRouter from "./routes/c.ts";

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);
const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "../../web/dist");

app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});
app.use(compression());
app.use(cors());

app.get("/api/health", async (_req, res) => {
  try {
    await getDb().one("SELECT 1 AS ok");
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
app.use("/api/c", cRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(webDir));
  app.get("*", (req, res) => {
    res.sendFile(join(webDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`api listening on :${PORT}`);
});
