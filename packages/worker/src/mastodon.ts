import type { Pool } from "@nostril/shared/db";
import { stripHtml } from "./html.ts";

const INSTANCES = (process.env.MASTODON_INSTANCES || "mastodon.nz")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const POLL_INTERVAL_MS = parseInt(process.env.MASTODON_POLL_INTERVAL_MS || "300000", 10);

interface Account {
  id: string;
  acct: string;
  display_name: string;
  note: string;
  avatar: string;
  url: string;
  followers_count: number;
  following_count: number;
}

interface Status {
  id: string;
  account: Account;
  content: string;
  url: string;
  created_at: string;
}

export function startMastodon(pool: Pool) {
  let stopped = false;

  async function loop() {
    for (const instance of INSTANCES) {
      if (stopped) return;
      try {
        await pollInstance(pool, instance);
      } catch (e) {
        console.error(`[mastodon] ${instance} failed`, (e as Error).message);
      }
    }
    if (!stopped) setTimeout(loop, POLL_INTERVAL_MS);
  }

  void loop();
  console.log(`[mastodon] started, instances=${INSTANCES.join(",")}`);

  return () => {
    stopped = true;
  };
}

async function api<T>(instance: string, path: string): Promise<T | null> {
  const res = await fetch(`https://${instance}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    console.warn(`[mastodon] ${instance} rate limited, retry-after=${retry}`);
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function pollInstance(pool: Pool, instance: string) {
  const now = Math.floor(Date.now() / 1000);

  const info = await api<{ title: string; description: string; version: string; stats?: { user_count: number } }>(
    instance,
    "/api/v1/instance",
  );
  if (info) {
    await pool.query(
      `INSERT INTO mastodon_instances (instance, title, description, version, users_count, seen_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (instance) DO UPDATE SET
         title = excluded.title, description = excluded.description,
         version = excluded.version, users_count = excluded.users_count, seen_at = excluded.seen_at`,
      [instance, info.title, info.description, info.version, info.stats?.user_count ?? null, now],
    );
  }

  const statuses = await api<Status[]>(
    instance,
    "/api/v1/timelines/public?local=true&limit=40",
  );
  if (!statuses) return;

  const seenAccounts = new Set<string>();

  for (const s of statuses) {
    if (!seenAccounts.has(s.account.id)) {
      seenAccounts.add(s.account.id);
      await upsertAccount(pool, instance, s.account, now);
    }
    await upsertStatus(pool, instance, s);
  }

  console.log(`[mastodon] ${instance}: ${statuses.length} statuses, ${seenAccounts.size} accounts`);
}

async function upsertAccount(pool: Pool, instance: string, acc: Account, now: number) {
  const noteText = stripHtml(acc.note);
  await pool.query(
    `INSERT INTO mastodon_accounts
      (instance, id, acct, display_name, note, note_text, avatar, url, followers_count, following_count, seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (instance, id) DO UPDATE SET
       acct = excluded.acct, display_name = excluded.display_name,
       note = excluded.note, note_text = excluded.note_text, avatar = excluded.avatar,
       url = excluded.url, followers_count = excluded.followers_count,
       following_count = excluded.following_count, seen_at = excluded.seen_at`,
    [
      instance, acc.id, acc.acct, acc.display_name, acc.note, noteText,
      acc.avatar, acc.url, acc.followers_count ?? 0, acc.following_count ?? 0, now,
    ],
  );

  await pool.query(
    `INSERT INTO search_entities (source, source_key, title, body, author, url, image_url, rank_score, meta)
     VALUES ('mastodon_account', $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source, source_key) DO UPDATE SET
       title = excluded.title, body = excluded.body, author = excluded.author,
       url = excluded.url, image_url = excluded.image_url, rank_score = excluded.rank_score, meta = excluded.meta`,
    [
      `${instance}:${acc.id}`,
      acc.display_name || acc.acct,
      noteText,
      acc.acct,
      acc.url,
      acc.avatar,
      acc.followers_count ?? 0,
      JSON.stringify({ instance, acct: acc.acct }),
    ],
  );
}

async function upsertStatus(pool: Pool, instance: string, s: Status) {
  const text = stripHtml(s.content);
  await pool.query(
    `INSERT INTO mastodon_statuses
      (instance, id, account_id, acct, content, content_text, url, created_at, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (instance, id) DO NOTHING`,
    [instance, s.id, s.account.id, s.account.acct, s.content, text, s.url, s.created_at, JSON.stringify(s)],
  );

  await pool.query(
    `INSERT INTO search_posts (source, source_key, title, body, author, url, published_at, meta)
     VALUES ('mastodon_status', $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (source, source_key) DO NOTHING`,
    [
      `${instance}:${s.id}`,
      null,
      text.slice(0, 4000),
      s.account.acct,
      s.url,
      s.created_at,
      JSON.stringify({ instance, id: s.id, acct: s.account.acct }),
    ],
  );
}
