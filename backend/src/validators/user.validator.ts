import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema, uuidSchema } from "./common";

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["admin", "staff"]).default("staff"),
});

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: z.enum(["admin", "staff"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(120).optional(),
  role: z.enum(["admin", "staff"]).optional(),
});

export const userIdParamSchema = z.object({ id: uuidSchema });
