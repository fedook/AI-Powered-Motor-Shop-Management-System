import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { AUTH_COOKIE, CSRF_COOKIE } from "../config/env";
import { env, isProduction } from "../config/env";
import { parseDurationMs } from "./jwt";

const cookieBase = {
  secure: isProduction,
  sameSite: env.COOKIE_SAME_SITE,
  domain: env.COOKIE_DOMAIN,
  path: "/",
} as const;

const maxAge = parseDurationMs(env.JWT_EXPIRES_IN);

export function issueAuthCookies(res: Response, token: string): string {
  const csrfToken = randomBytes(32).toString("hex");
  res.cookie(AUTH_COOKIE, token, {
    ...cookieBase,
    httpOnly: true,
    maxAge,
  });
  // The CSRF cookie is intentionally readable by the SPA so it can echo the
  // value in the X-CSRF-Token header (double-submit cookie pattern).
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieBase,
    httpOnly: false,
    maxAge,
  });
  return csrfToken;
}

export function refreshCsrfCookie(res: Response): string {
  const csrfToken = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieBase,
    httpOnly: false,
    maxAge,
  });
  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIE, cookieBase);
  res.clearCookie(CSRF_COOKIE, cookieBase);
}

export function readAuthToken(req: Request): { token: string; method: "cookie" | "bearer" } | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return { token, method: "bearer" };
  }
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE];
  if (cookieToken) return { token: cookieToken, method: "cookie" };
  return null;
}

export function safeCompare(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  if (first.length !== second.length) return false;
  return timingSafeEqual(first, second);
}
