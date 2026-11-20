import { z } from "zod";
import { emailSchema, uuidSchema } from "./common";

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(2, "Customer name must be at least 2 characters.").max(150),
  email: emailSchema.optional().nullable(),
  contactNumber: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-\s]*$/, "Contact number contains invalid characters.")
    .optional()
    .nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(120).optional(),
});

export const customerIdParamSchema = z.object({ id: uuidSchema });
