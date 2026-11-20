import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { CSRF_COOKIE, CSRF_HEADER } from "../config/env";
import { ApiError } from "../utils/api-error";
import { safeCompare } from "../utils/cookies";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const allowedOrigins = new Set(env.FRONTEND_URL);

/**
 * Rejects state-changing browser requests from unexpected origins and enforces
 * the double-submit CSRF token for cookie-authenticated requests.
 */
export function protectStateChangingRequests(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    next(ApiError.forbidden("Request origin is not allowed."));
    return;
  }

  const hasBearer = req.headers.authorization?.startsWith("Bearer ");
  const authCookie = (req.cookies as Record<string, string> | undefined)?.ms_token;

  if (authCookie && !hasBearer) {
    const csrfCookie = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
    const csrfHeader = req.headers[CSRF_HEADER];
    const provided = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;

    if (!csrfCookie || !provided || !safeCompare(csrfCookie, provided)) {
      next(
        new ApiError(403, "CSRF_VALIDATION_FAILED", "Missing or invalid CSRF token."),
      );
      return;
    }
  }

  next();
}
