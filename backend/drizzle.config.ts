
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL?.trim();

if (!directDatabaseUrl) {
  throw new Error(
    "DIRECT_DATABASE_URL is missing. Configure your Neon non-pooled connection string in .env.",
  );
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: directDatabaseUrl,
  },
  strict: true,
  verbose: true,
});
