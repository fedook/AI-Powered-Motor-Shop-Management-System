import type { Request, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

function limitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please wait a moment and try again.",
    },
  });
}

const base = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  handler: limitHandler,
};

export const globalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 900,
});

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

export const aiLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? "")),
});

export const searchLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
});
