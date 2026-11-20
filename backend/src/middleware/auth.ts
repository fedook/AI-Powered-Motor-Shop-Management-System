import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { ApiError } from "../utils/api-error";
import { verifyAuthToken } from "../utils/jwt";
import { readAuthToken } from "../utils/cookies";

/**
 * Verifies the JWT, then reloads the user from PostgreSQL. Role and account
 * state come from the database, so role changes/deletions apply immediately
 * and a forged/stale token cannot escalate privileges. The token version is
 * bumped on password changes or "sign out everywhere" to revoke old tokens.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const credentials = readAuthToken(req);
    if (!credentials) throw ApiError.unauthorized();

    const payload = verifyAuthToken(credentials.token);
    const [account] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!account) throw ApiError.unauthorized("This account no longer exists.");
    if (account.tokenVersion !== payload.ver) {
      throw new ApiError(401, "SESSION_REVOKED", "Your session is no longer valid. Please sign in again.");
    }

    req.user = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
    };
    req.authMethod = credentials.method;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Like requireAuth, but silently ignores missing/invalid credentials. Used by
 * logout so an expired session can still clear its cookies.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const credentials = readAuthToken(req);
  if (!credentials) {
    next();
    return;
  }
  try {
    await requireAuth(req, res, (error?: unknown) => {
      if (error) {
        next();
        return;
      }
      next();
    });
  } catch {
    next();
  }
}
