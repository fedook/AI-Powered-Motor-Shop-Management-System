import { z } from "zod";
import { dateRangeFields, uuidSchema } from "./common";

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(120).optional(),
  categoryId: uuidSchema.optional(),
  lowStock: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const createMovementSchema = z
  .object({
    productId: uuidSchema,
    movementType: z.enum(["stock_in", "stock_out", "adjustment"]),
    quantity: z.coerce.number().int().min(1).max(1_000_000).optional(),
    newQuantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
    reason: z.string().trim().min(3, "Provide a reason for this inventory change.").max(300),
  })
  .superRefine((value, context) => {
    if (value.movementType === "adjustment") {
      if (value.newQuantity === undefined) {
        context.addIssue({
          code: "custom",
          path: ["newQuantity"],
          message: "New quantity is required for an adjustment.",
        });
      }
    } else if (value.quantity === undefined) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Quantity is required for stock in/out.",
      });
    }
  });

export const listMovementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  productId: uuidSchema.optional(),
  movementType: z
    .enum(["stock_in", "stock_out", "adjustment", "sale", "sale_cancellation"])
    .optional(),
  ...dateRangeFields,
});
