import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";

async function run() {
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_DATABASE_URL must be set before running migrations.");
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
  const db = drizzle(pool);

  try {
    console.log("[migrate] Applying Drizzle migrations...");
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "src/db/migrations") });
    console.log("[migrate] Migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[migrate] Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
