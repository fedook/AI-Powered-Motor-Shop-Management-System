import { z } from "zod";
import { PAYMENT_METHODS } from "../config/constants";
import { dateRangeFields, uuidSchema } from "./common";

export const createSaleSchema = z
  .object({
    customerId: uuidSchema.optional().nullable(),
    items: z
      .array(
        z.object({
          productId: uuidSchema,
          quantity: z.coerce.number().int().min(1, "Quantity must be at least 1.").max(1000),
        }),
      )
      .min(1, "Add at least one product.")
      .max(50, "A sale can contain at most 50 line items."),
    discount: z.coerce.number().min(0).max(99_999_999).optional().default(0),
    paymentMethod: z.enum(PAYMENT_METHODS),
    amountPaid: z.coerce.number().min(0).max(99_999_999),
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  })
  .refine(
    (value) => new Set(value.items.map((item) => item.productId)).size === value.items.length,
    { message: "Each product may only appear once per sale. Combine duplicate quantities." },
  );

export const listSalesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["completed", "cancelled"]).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  cashierId: uuidSchema.optional(),
  ...dateRangeFields,
});

export const saleIdParamSchema = z.object({ id: uuidSchema });

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3, "Provide a cancellation reason.").max(500),
});

export const salesAnalyticsQuerySchema = z.object({
  ...dateRangeFields,
  days: z.coerce.number().int().min(1).max(365).optional(),
  groupBy: z.enum(["day", "week", "month"]).optional().default("day"),
});

export const productAnalyticsQuerySchema = z.object({
  ...dateRangeFields,
  limit: z.coerce.number().int().min(1).max(50).optional().default(5),
});
