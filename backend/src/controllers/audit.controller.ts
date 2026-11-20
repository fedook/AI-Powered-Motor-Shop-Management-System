import type { Request, Response } from "express";
import type { z } from "zod";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, users } from "../db/schema";
import { asyncHandler } from "../utils/async-handler";
import { paginationMeta, sendSuccess } from "../utils/http";
import { paginate } from "../utils/pagination";
import type { auditLogQuerySchema } from "../validators/audit.validator";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof auditLogQuerySchema>;
  const { page, pageSize, offset } = paginate(query);
  const conditions: SQL[] = [];

  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.userId) conditions.push(eq(auditLogs.userId, query.userId));
  if (query.from) {
    const from = new Date(`${query.from}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) conditions.push(gte(auditLogs.createdAt, from));
  }
  if (query.to) {
    const to = new Date(`${query.to}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) conditions.push(lte(auditLogs.createdAt, to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        requestId: auditLogs.requestId,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(auditLogs).where(whereClause),
  ]);

  sendSuccess(res, rows, paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)));
});
