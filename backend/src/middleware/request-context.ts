import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

/** Attaches a correlation ID used in logs, audit records and error responses. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && incoming.length <= 64 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (req.path === "/health" || req.path === "/api/health") return;
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const payload = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id,
      ip: req.ip,
    };
    if (durationMs > 2000) logger.warn("Slow request", payload);
    else logger.info("Request", payload);
  });
  next();
}

export function requestTimeout(ms = 45_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          error: {
            code: "REQUEST_TIMEOUT",
            message: "The request took too long to process.",
          },
          requestId: req.requestId,
        });
      }
    });
    next();
  };
}
