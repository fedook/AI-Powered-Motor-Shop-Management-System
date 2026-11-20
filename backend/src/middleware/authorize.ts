import type { NextFunction, Request, Response } from "express";
import {
  AUDIT_ACTIONS,
  ROLE_PERMISSIONS,
  type Permission,
  type Role,
} from "../config/constants";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";
import { recordAudit } from "../services/audit.service";

/** True when the role's explicit allow-list contains the permission. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Server-side role enforcement kept for call sites that need a simple role
 * check. New routes should use requirePermission so the policy stays central.
 * Hiding UI elements is never the only control.
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      auditDenied(req, { allowedRoles: allowedRoles.join(",") });
      next(ApiError.forbidden("Your role does not permit this operation."));
      return;
    }
    next();
  };
}

/**
 * Enforces a single named permission. The role always comes from the database
 * through requireAuth, never from the client. Denials are audited so repeated
 * attempts to reach administrator data are visible to administrators.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!hasPermission(req.user.role, permission)) {
      const details = {
        permission,
        role: req.user.role,
        method: req.method,
        path: req.originalUrl,
        result: "denied",
      };
      logger.warn("Authorization denied", { requestId: req.requestId, ...details });
      auditDenied(req, details);
      next(ApiError.forbidden("Your role does not permit this operation."));
      return;
    }
    next();
  };
}

function auditDenied(req: Request, details: Record<string, unknown>): void {
  // Auditing must never block the denial response or fail the request.
  void recordAudit({
    userId: req.user?.id ?? null,
    action: AUDIT_ACTIONS.AUTHORIZATION_DENIED,
    entityType: "authorization",
    entityId: null,
    details,
    request: req,
  });
}

export function isAdmin(req: Request): boolean {
  return req.user?.role === "admin";
}
