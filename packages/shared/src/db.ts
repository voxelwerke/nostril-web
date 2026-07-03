import pgPromise from "pg-promise";

export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/nostril";

export function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export const pgp = pgPromise({
  error: (_err, e) => {
    if (e.query) console.error("pg query error:", e.query);
  },
});

let db: pgPromise.IDatabase<Record<string, never>> | null = null;

export function getDb(max = 10): pgPromise.IDatabase<Record<string, never>> {
  if (db) return db;
  const url = databaseUrl();
  db = pgp({
    connectionString: url,
    max,
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.$pool.end();
    db = null;
  }
}

// Postgres real[] rejects TypedArrays (e.g. Float32Array from fastembed): the
// binary buffer is read as bogus array dimensions. Coerce to a plain number[].
export function pgRealArray(v: ArrayLike<number> | null | undefined): number[] | null {
  return v ? Array.from(v) : null;
}

export type Db = pgPromise.IDatabase<Record<string, never>>;
export type { IDatabase, ITask } from "pg-promise";
