import type { Request, Response } from "express";
import { checkDatabase } from "../db";
import { env } from "../config/env";
import { groqService } from "../services/groq.service";

const startedAt = Date.now();

/** Liveness/readiness probe used by Render and by the frontend status widget. */
export async function health(_req: Request, res: Response): Promise<void> {
  let databaseLatencyMs: number | null = null;
  let databaseUp = false;

  try {
    databaseLatencyMs = await checkDatabase();
    databaseUp = true;
  } catch {
    databaseUp = false;
  }

  const status = databaseUp ? "ok" : "degraded";
  res.status(databaseUp ? 200 : 503).json({
    success: databaseUp,
    data: {
      status,
      database: databaseUp ? "up" : "down",
      databaseLatencyMs,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      environment: env.NODE_ENV,
      aiConfigured: groqService.isConfigured(),
      aiProvider: "groq",
      timestamp: new Date().toISOString(),
    },
  });
}
