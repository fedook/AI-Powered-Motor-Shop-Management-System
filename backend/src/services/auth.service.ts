import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import type { Request } from "express";
import { db, withTransaction } from "../db";
import { users } from "../db/schema";
import { AUDIT_ACTIONS } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { signAuthToken } from "../utils/jwt";
import { recordAudit } from "./audit.service";

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-password", BCRYPT_ROUNDS);

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  lastLoginAt: Date | null;
  createdAt: Date;
}

function publicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

function issueToken(row: typeof users.$inferSelect): string {
  return signAuthToken(row.id, row.role, row.tokenVersion);
}

export async function register(
  input: { name: string; email: string; password: string },
  request: Request,
): Promise<{ user: PublicUser; token: string }> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw ApiError.conflict("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Registration always creates a staff account: the client cannot choose a role.
  const created = await withTransaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: "staff",
      })
      .returning();

    if (!row) throw new ApiError(500, "CREATE_FAILED", "Unable to create account.");

    await recordAudit(
      {
        userId: row.id,
        action: AUDIT_ACTIONS.REGISTER,
        entityType: "user",
        entityId: row.id,
        details: { role: row.role },
        request,
      },
      tx,
    );

    return row;
  });

  return { user: publicUser(created), token: issueToken(created) };
}

export async function login(
  input: { email: string; password: string },
  request: Request,
): Promise<{ user: PublicUser; token: string }> {
  const [account] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  // Always perform a bcrypt comparison to reduce account-enumeration timing leaks.
  const passwordMatches = await bcrypt.compare(input.password, account?.passwordHash ?? DUMMY_HASH);

  if (!account || !passwordMatches) {
    await recordAudit({
      userId: null,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "auth",
      details: { email: input.email },
      request,
    });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const [updated] = await db
    .update(users)
    .set({ lastLoginAt: sql`now()`, updatedAt: new Date() })
    .where(eq(users.id, account.id))
    .returning();

  await recordAudit({
    userId: account.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "auth",
    entityId: account.id,
    details: { role: account.role },
    request,
  });

  return { user: publicUser(updated ?? account), token: issueToken(updated ?? account) };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw ApiError.notFound("Account not found.");
  return publicUser(account);
}

export async function updateProfile(
  userId: string,
  input: { name?: string; email?: string },
  request: Request,
): Promise<PublicUser> {
  if (input.email) {
    const duplicate = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (duplicate.length > 0 && duplicate[0]?.id !== userId) {
      throw ApiError.conflict("An account with this email already exists.");
    }
  }

  const [updated] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw ApiError.notFound("Account not found.");

  await recordAudit({
    userId,
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    entityType: "user",
    entityId: userId,
    details: { changed: Object.keys(input) },
    request,
  });

  return publicUser(updated);
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  request: Request,
): Promise<{ user: PublicUser; token: string }> {
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw ApiError.notFound("Account not found.");

  const matches = await bcrypt.compare(input.currentPassword, account.passwordHash);
  if (!matches) {
    throw new ApiError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
  }

  if (await bcrypt.compare(input.newPassword, account.passwordHash)) {
    throw ApiError.badRequest("New password must be different from the current password.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

  // Bumping tokenVersion revokes every other session. The caller receives a
  // fresh token so the current device stays signed in.
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw ApiError.notFound("Account not found.");

  await recordAudit({
    userId,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    entityType: "user",
    entityId: userId,
    details: { sessionsRevoked: true },
    request,
  });

  return { user: publicUser(updated), token: issueToken(updated) };
}

export async function revokeAllSessions(userId: string, request: Request): Promise<void> {
  await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await recordAudit({
    userId,
    action: "SESSIONS_REVOKED",
    entityType: "user",
    entityId: userId,
    request,
  });
}
