import jwt, { type SignOptions } from "jsonwebtoken";
import { env, JWT_AUDIENCE, JWT_ISSUER } from "../config/env";
import type { Role } from "../config/constants";
import { ApiError } from "./api-error";

interface TokenPayload {
  sub: string;
  role: Role;
  ver: number;
}

export function signAuthToken(userId: string, role: Role, tokenVersion: number): string {
  const options: SignOptions = {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign({ role, ver: tokenVersion }, env.JWT_SECRET, {
    ...options,
    subject: userId,
  });
}

export function verifyAuthToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (typeof decoded === "string" || !decoded.sub) {
      throw new ApiError(401, "INVALID_TOKEN", "Invalid authentication token.");
    }
    const payload = decoded as jwt.JwtPayload & { role?: unknown; ver?: unknown };
    if (payload.role !== "admin" && payload.role !== "staff") {
      throw new ApiError(401, "INVALID_TOKEN", "Invalid authentication token.");
    }
    if (typeof payload.ver !== "number" || !Number.isInteger(payload.ver)) {
      throw new ApiError(401, "INVALID_TOKEN", "Invalid authentication token.");
    }
    return { sub: decoded.sub, role: payload.role, ver: payload.ver };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, "TOKEN_EXPIRED", "Your session has expired. Please sign in again.");
    }
    throw new ApiError(401, "INVALID_TOKEN", "Invalid authentication token.");
  }
}

/** Converts "1d", "12h", "30m" or "900s" into milliseconds. */
export function parseDurationMs(value: string, fallbackMs = 86_400_000): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit ?? "d"] ?? 86_400_000);
}
