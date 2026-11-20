import { z } from "zod";
import { dateRangeFields, uuidSchema } from "./common";

/** Shared, server-validated filter shape for all Business Analytics endpoints. */
export const analyticsFilterSchema = z.object({
  ...dateRangeFields,
  days: z.coerce.number().int().min(7).max(365).optional().default(90),
  groupBy: z.enum(["day", "week", "month", "year"]).optional().default("day"),
  productId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
});

export const forecastQuerySchema = analyticsFilterSchema.extend({
  horizon: z.enum(["7", "30", "90"]).optional().default("30"),
});

export const recommendationStatusSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected", "completed"]),
  note: z.string().trim().max(500).optional(),
});

export const recommendationKeyParamSchema = z.object({
  key: z.string().trim().min(3).max(200),
});

export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
export type RecommendationStatusInput = z.infer<typeof recommendationStatusSchema>;
