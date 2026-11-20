import type { Request } from "express";
import { db, type DbExecutor } from "../db";
import { auditLogs } from "../db/schema";
import { logger } from "../utils/logger";

export interface AuditEvent {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  request?: Request;
}

/**
 * Writes an audit record. Audit failures are logged but never break the
 * business operation that triggered them (availability trade-off, documented).
 */
export async function recordAudit(event: AuditEvent, executor: DbExecutor = db): Promise<void> {
  try {
    await executor.insert(auditLogs).values({
      userId: event.userId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      details: event.details ?? null,
      requestId: event.request?.requestId ?? null,
      ipAddress: event.request?.ip ?? null,
    });
  } catch (error) {
    logger.error("Failed to write audit log", {
      action: event.action,
      entityType: event.entityType,
      error,
    });
  }
}
