import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, closeDb, databaseUrl, pgp } from "@nostril/shared/db";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "../../shared/migrations");

// Create the target database if it doesn't exist yet, so `pnpm migrate` just works.
async function ensureDatabase() {
  const url = databaseUrl();

  const probe = pgp({ connectionString: url, max: 1 });
  try {
    await probe.connect().then((c) => c.done());
    return;
  } catch (e) {
    if ((e as { code?: string }).code !== "3D000") throw e; // 3D000 = database does not exist
  } finally {
    await probe.$pool.end();
  }

  const dbName = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const conn = pgp({ connectionString: admin.toString(), max: 1 });
  try {
    await conn.none(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`created database ${dbName}`);
  } finally {
    await conn.$pool.end();
  }
}

async function main() {
  await ensureDatabase();
  const db = getDb(2);
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await db.none(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );

  const applied = new Set(
    (await db.any<{ name: string }>("SELECT name FROM _migrations")).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`applying ${file}...`);
    await db.tx(async (t) => {
      await t.none(sql);
      await t.none("INSERT INTO _migrations (name) VALUES ($<file>)", { file });
    });
    console.log(`  ok ${file}`);
  }

  await closeDb();
  console.log("migrations complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
