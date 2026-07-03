import { type Db, pgRealArray } from "@nostril/shared/db";
import { stripHtml } from "./html.ts";
import { embed } from "./embed.ts";

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

export function startMastodon(db: Db) {
  let stopped = false;

  async function loop() {
    for (const instance of INSTANCES) {
      if (stopped) return;
      try {
        await pollInstance(db, instance);
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

async function pollInstance(db: Db, instance: string) {
  const now = Math.floor(Date.now() / 1000);

  const info = await api<{ title: string; description: string; version: string; stats?: { user_count: number } }>(
    instance,
    "/api/v1/instance",
  );
  if (info) {
    await db.none(
      `INSERT INTO mastodon_instances (instance, title, description, version, users_count, seen_at)
       VALUES ($<instance>, $<title>, $<description>, $<version>, $<users>, $<seen>)
       ON CONFLICT (instance) DO UPDATE SET
         title = excluded.title, description = excluded.description,
         version = excluded.version, users_count = excluded.users_count, seen_at = excluded.seen_at`,
      {
        instance,
        title: info.title,
        description: info.description,
        version: info.version,
        users: info.stats?.user_count ?? null,
        seen: now,
      },
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
      await upsertAccount(db, instance, s.account, now);
    }
    await upsertStatus(db, instance, s);
  }

  console.log(`[mastodon] ${instance}: ${statuses.length} statuses, ${seenAccounts.size} accounts`);
}

async function upsertAccount(db: Db, instance: string, acc: Account, now: number) {
  const noteText = stripHtml(acc.note);
  await db.none(
    `INSERT INTO mastodon_accounts
      (instance, id, acct, display_name, note, note_text, avatar, url, followers_count, following_count, seen_at)
     VALUES ($<instance>,$<id>,$<acct>,$<displayName>,$<note>,$<noteText>,$<avatar>,$<url>,$<followers>,$<following>,$<seen>)
     ON CONFLICT (instance, id) DO UPDATE SET
       acct = excluded.acct, display_name = excluded.display_name,
       note = excluded.note, note_text = excluded.note_text, avatar = excluded.avatar,
       url = excluded.url, followers_count = excluded.followers_count,
       following_count = excluded.following_count, seen_at = excluded.seen_at`,
    {
      instance,
      id: acc.id,
      acct: acc.acct,
      displayName: acc.display_name,
      note: acc.note,
      noteText,
      avatar: acc.avatar,
      url: acc.url,
      followers: acc.followers_count ?? 0,
      following: acc.following_count ?? 0,
      seen: now,
    },
  );

  await db.none(
    `INSERT INTO search_entities (source, source_key, title, body, author, url, image_url, rank_score, meta)
     VALUES ('mastodon_account', $<key>, $<title>, $<body>, $<author>, $<url>, $<image>, $<rank>, $<meta>)
     ON CONFLICT (source, source_key) DO UPDATE SET
       title = excluded.title, body = excluded.body, author = excluded.author,
       url = excluded.url, image_url = excluded.image_url, rank_score = excluded.rank_score, meta = excluded.meta`,
    {
      key: `${instance}:${acc.id}`,
      title: acc.display_name || acc.acct,
      body: noteText,
      author: acc.acct,
      url: acc.url,
      image: acc.avatar,
      rank: acc.followers_count ?? 0,
      meta: JSON.stringify({ instance, acct: acc.acct }),
    },
  );
}

async function upsertStatus(db: Db, instance: string, s: Status) {
  const text = stripHtml(s.content);
  await db.none(
    `INSERT INTO mastodon_statuses
      (instance, id, account_id, acct, content, content_text, url, created_at, raw)
     VALUES ($<instance>,$<id>,$<accountId>,$<acct>,$<content>,$<contentText>,$<url>,$<createdAt>,$<raw>)
     ON CONFLICT (instance, id) DO NOTHING`,
    {
      instance,
      id: s.id,
      accountId: s.account.id,
      acct: s.account.acct,
      content: s.content,
      contentText: text,
      url: s.url,
      createdAt: s.created_at,
      raw: JSON.stringify(s),
    },
  );

  const body = text.slice(0, 4000);
  const embedding = await embed(null, body);
  await db.none(
    `INSERT INTO search_posts (source, source_key, title, body, author, url, published_at, meta, embedding)
     VALUES ('mastodon_status', $<key>, $<title>, $<body>, $<author>, $<url>, $<published>, $<meta>, $<embedding>)
     ON CONFLICT (source, source_key) DO NOTHING`,
    {
      key: `${instance}:${s.id}`,
      title: null,
      body,
      author: s.account.acct,
      url: s.url,
      published: s.created_at,
      meta: JSON.stringify({ instance, id: s.id, acct: s.account.acct }),
      embedding: pgRealArray(embedding),
    },
  );
}
