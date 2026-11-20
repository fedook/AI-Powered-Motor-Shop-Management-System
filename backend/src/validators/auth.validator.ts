import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema } from "./common";

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required.").max(72),
});

export const profileUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(72),
  newPassword: passwordSchema,
});
