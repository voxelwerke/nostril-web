import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(max = 10): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
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
