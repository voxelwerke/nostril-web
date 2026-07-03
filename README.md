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

Deploys to DigitalOcean App Platform via buildpacks (no Docker). See
[.do/app.yaml](.do/app.yaml). Uses a managed **PostgreSQL 18** database — no
extensions beyond `pg_trgm`.

## Retention

Post tables (`search_posts`, `mastodon_statuses`, `rss_items`, `nostr_events`)
are plain tables. The worker runs a nightly `DELETE` sweep
([packages/worker/src/retention.ts](packages/worker/src/retention.ts)) that drops
rows older than `RETENTION_DAYS` (default 28). Durable tables (users, accounts,
feeds) are never swept.
