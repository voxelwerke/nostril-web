# Nostril Search

A search index for Nostr, a handful of NZ Mastodon instances, and RSS feeds.
Accounts and feeds are kept permanently; posts are retained for the last 4 weeks
via a nightly cleanup sweep.

## Stack

- **web** — Preact + Vite static site (`packages/web`)
- **api** — Express + `pg` read API (`packages/api`)
- **worker** — Nostr / Mastodon / RSS indexers (`packages/worker`)
- **shared** — types, pg pool, nostr helpers, SQL migrations (`packages/shared`)
- **db** — PostgreSQL 18

## Local development

Requires Node 20+, pnpm, and a local PostgreSQL 18.

```bash
cp .env.example .env          # point DATABASE_URL at your local PG
pnpm install
pnpm migrate                  # create extension (pg_trgm) + tables + indexes
pnpm dev                      # runs web + api + worker in one terminal
```

- web: http://localhost:5173 (proxies `/api` to the Express server)
- api: http://localhost:8080

### Importing the old SQLite data

```bash
SQLITE_PATH=./nostr-users.db pnpm migrate:sqlite
```

## Deployment

Production runs on [Sliplane](https://sliplane.io) via the root [`Dockerfile`](Dockerfile).
Local dev does **not** use Docker — keep using `pnpm dev`.

Three services on one server (private networking):

| Service | Exposed | Notes |
|---------|---------|-------|
| **postgres** | no | Sliplane Postgres preset |
| **nostril-web** | yes | Dockerfile default CMD — migrate + API + static web |
| **nostril-worker** | no | Same Dockerfile, CMD override: `pnpm --filter @nostril/worker start` |

**nostril-web** settings: branch `main`, healthcheck `/api/health`, env
`DATABASE_URL` (internal postgres host) and optional `RELAYS`. Do not set
`PORT` — Sliplane injects it.

**nostril-worker** env: same `DATABASE_URL`, plus `FIREHOSE=true`,
`MASTODON_INSTANCES`, `OPML_PATH=packages/worker/feeds.opml`, `RETENTION_DAYS`,
`NOSTR_RELAYS` (see [`.env.example`](.env.example)). Optional volume on
`packages/worker/local_cache` for fastembed model cache.

DigitalOcean App Platform config lives in [`.do/app.yaml`](.do/app.yaml) as an
alternate target. Uses **PostgreSQL 18** — no extensions beyond `pg_trgm`.

## Recent news feed

The home page shows a "Recent" feed of diverse posts from the last 7 days,
served by `GET /api/feed`. Instead of a plain chronological list, it favours
variety: the worker embeds every ingested post into a sentence vector (stored
as a `real[]` column on `search_posts`, no pgvector) using
[fastembed](https://www.npmjs.com/package/fastembed) (ONNX, text-only — no sharp),
and the API runs a recency-weighted farthest-point
sampler over the last 7 days of candidates.

The sampler is pure JavaScript in
[packages/shared/src/vector.ts](packages/shared/src/vector.ts) behind a single
`selectDiverse` function, so it can later be swapped for a native module without
changing the API or front end. Run `pnpm --filter @nostril/shared test` to
exercise it.

Embeddings are computed **inline during ingest**, so there is no backfill job.
Posts that were indexed before this feature (via `ON CONFLICT DO NOTHING`) will
not have an embedding, so after deploying the migration, truncate the post
tables and let the worker re-ingest for a clean feed.

Relevant env vars (all optional):

| Env var | Default | Purpose |
|---------|---------|---------|
| `EMBED_MODEL` | `fast-all-MiniLM-L6-v2` | fastembed model id (`fast-bge-small-en-v1.5`, etc.) |
| `FEED_HALF_LIFE_HOURS` | `48` | recency decay half-life for the feed sampler |
| `FEED_CANDIDATE_LIMIT` | `500` | max candidates loaded before sampling |

## Retention

Post tables (`search_posts`, `mastodon_statuses`, `rss_items`, `nostr_events`)
are plain tables. The worker runs a nightly `DELETE` sweep
([packages/worker/src/retention.ts](packages/worker/src/retention.ts)) that drops
rows older than `RETENTION_DAYS` (default 28). Durable tables (users, accounts,
feeds) are never swept.
