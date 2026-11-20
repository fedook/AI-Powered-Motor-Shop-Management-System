import { z } from "zod";
import { dateRangeFields } from "./common";

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
  userId: z.string().uuid().optional(),
  ...dateRangeFields,
});
