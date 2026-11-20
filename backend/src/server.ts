import { createServer } from "node:http";
import { app } from "./app";
import { env } from "./config/env";
import { checkDatabase, closeDatabase } from "./db";
import { logger } from "./utils/logger";

const server = createServer(app);
const host = "0.0.0.0";

server.requestTimeout = 60_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 5_000;

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Graceful shutdown started", { signal });

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 12_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await closeDatabase();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("Error while closing database pool", { error });
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  void shutdown("uncaughtException");
});

server.listen(env.PORT, host, async () => {
  logger.info("Motor Shop API listening", {
    port: env.PORT,
    environment: env.NODE_ENV,
    allowedOrigins: env.FRONTEND_URL,
    aiConfigured: Boolean(env.GROQ_API_KEY),
    model: env.GROQ_MODEL,
    aiProvider: "groq",
  });

  try {
    const latency = await checkDatabase();
    logger.info("Database connection verified", { latencyMs: latency });
  } catch (error) {
    // Keep serving: /api/health reports degraded and the pool reconnects when
    // PostgreSQL becomes available again.
    logger.error("Database connection unavailable at startup", { error });
  }
});
