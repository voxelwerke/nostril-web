import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getPool, closePool, databaseUrl } from "@nostril/shared/db";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "../../shared/migrations");

// Create the target database if it doesn't exist yet, so `pnpm migrate` just works.
async function ensureDatabase() {
  const url = databaseUrl();

  // Fast path: if we can connect to the target db, it already exists.
  const probe = new pg.Client({ connectionString: url });
  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (e) {
    if ((e as { code?: string }).code !== "3D000") throw e; // 3D000 = database does not exist
    await probe.end().catch(() => {});
  }

  const dbName = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`created database ${dbName}`);
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureDatabase();
  const pool = getPool(2);
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );

  const applied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM _migrations")).rows.map(
      (r) => r.name,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`applying ${file}...`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    console.log(`  ok ${file}`);
  }

  await closePool();
  console.log("migrations complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
