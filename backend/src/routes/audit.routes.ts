import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { auditLogQuerySchema } from "../validators/audit.validator";
import * as auditController from "../controllers/audit.controller";

export const auditRouter = Router();

auditRouter.use(requireAuth, requirePermission("audit:read"));

auditRouter.get("/", validate({ query: auditLogQuerySchema }), auditController.list);
