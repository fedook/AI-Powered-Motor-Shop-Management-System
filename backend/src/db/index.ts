import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: "motor-shop-api",
});

pool.on("error", (error) => {
  // Idle client errors must not crash the process; the pool discards them.
  logger.error("Unexpected PostgreSQL pool error", { error });
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = Database | Transaction;

/** Runs a callback in a single PostgreSQL transaction; any thrown error rolls it back. */
export async function withTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(callback);
}

export async function checkDatabase(): Promise<number> {
  const startedAt = Date.now();
  await pool.query("SELECT 1");
  return Date.now() - startedAt;
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
