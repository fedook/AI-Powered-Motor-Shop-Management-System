import bcrypt from "bcrypt";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Request } from "express";
import { db, withTransaction } from "../db";
import { users } from "../db/schema";
import { AUDIT_ACTIONS } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { escapeLike, paginate } from "../utils/pagination";
import { paginationMeta } from "../utils/http";
import { recordAudit } from "./audit.service";

const BCRYPT_ROUNDS = 12;

const userColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export async function listUsers(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "admin" | "staff";
}) {
  const { page, pageSize, offset } = paginate(input);
  const conditions = [];
  if (input.search) {
    const term = `%${escapeLike(input.search)}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)));
  }
  if (input.role) conditions.push(eq(users.role, input.role));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select(userColumns)
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(users).where(whereClause),
  ]);

  return { data: rows, meta: paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)) };
}

export async function createUser(
  input: { name: string; email: string; password: string; role: "admin" | "staff" },
  actorId: string,
  request: Request,
) {
  const duplicate = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (duplicate.length > 0) throw ApiError.conflict("An account with this email already exists.");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  return withTransaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      })
      .returning(userColumns);

    if (!created) throw new ApiError(500, "CREATE_FAILED", "Unable to create user.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.USER_CREATE,
        entityType: "user",
        entityId: created.id,
        details: { role: created.role, email: created.email },
        request,
      },
      tx,
    );

    return created;
  });
}

export async function updateUser(
  targetId: string,
  input: { name?: string; email?: string; role?: "admin" | "staff" },
  actorId: string,
  request: Request,
) {
  if (targetId === actorId && input.role && input.role !== "admin") {
    throw ApiError.forbidden("You cannot change your own role.");
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) throw ApiError.notFound("User not found.");

  if (input.email && input.email !== target.email) {
    const duplicate = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (duplicate.length > 0 && duplicate[0]?.id !== targetId) {
      throw ApiError.conflict("An account with this email already exists.");
    }
  }

  if (input.role === "staff" && target.role === "admin") {
    const adminRows = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    if (Number(adminRows[0]?.total ?? 0) <= 1) {
      throw ApiError.conflict("The system must keep at least one administrator account.");
    }
  }

  const roleChanged = Boolean(input.role && input.role !== target.role);

  return withTransaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
        ...(roleChanged ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}),
      })
      .where(eq(users.id, targetId))
      .returning(userColumns);

    if (!updated) throw ApiError.notFound("User not found.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.USER_UPDATE,
        entityType: "user",
        entityId: targetId,
        details: {
          changed: Object.keys(input),
          roleFrom: target.role,
          roleTo: updated.role,
        },
        request,
      },
      tx,
    );

    return updated;
  });
}

export async function deleteUser(targetId: string, actorId: string, request: Request) {
  if (targetId === actorId) throw ApiError.forbidden("You cannot delete your own account.");

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) throw ApiError.notFound("User not found.");

  if (target.role === "admin") {
    const adminRows = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    if (Number(adminRows[0]?.total ?? 0) <= 1) {
      throw ApiError.conflict("The system must keep at least one administrator account.");
    }
  }

  await withTransaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, targetId));
    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.USER_DELETE,
        entityType: "user",
        entityId: targetId,
        details: { email: target.email, role: target.role },
        request,
      },
      tx,
    );
  });
}
