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

export const aiChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Ask a question first.")
    .max(1000, "Questions are limited to 1,000 characters."),
  conversationId: z.string().uuid("Invalid conversation id.").optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1500),
      }),
    )
    .max(10, "Conversation history is limited to 10 messages.")
    .optional()
    .default([]),
});

export const aiInsightsSchema = z.object({
  focus: z.enum(["general", "sales", "inventory", "profitability"]).optional().default("general"),
  conversationId: z.string().uuid("Invalid conversation id.").optional(),
});

export const aiConversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
});

export const aiConversationParamsSchema = z.object({
  id: z.string().uuid("Invalid conversation id."),
});
