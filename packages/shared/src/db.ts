import pg from "pg";

const { Pool } = pg;

export const DEFAULT_DATABASE_URL = "postgres://localhost:5432/nostril";

export function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

let pool: pg.Pool | null = null;

export function getPool(max = 10): pg.Pool {
  if (pool) return pool;
  const url = databaseUrl();
  pool = new Pool({
    connectionString: url,
    max,
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (err) => console.error("pg pool error", err));
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type { Pool, PoolClient } from "pg";
