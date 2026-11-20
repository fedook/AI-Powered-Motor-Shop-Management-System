import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { aiLimiter } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import {
  aiChatSchema,
  aiConversationCreateSchema,
  aiConversationParamsSchema,
  aiInsightsSchema,
} from "../validators/ai.validator";
import * as aiController from "../controllers/ai.controller";

export const aiRouter = Router();

aiRouter.use(requireAuth);

// Only generation endpoints consume the AI budget. Conversation history reads
// and deletes use the global limiter so a normal chat session never locks the
// user out of their own history.
aiRouter.get("/status", requirePermission("ai:status"), aiLimiter, aiController.status);

aiRouter.get(
  "/conversations",
  requirePermission("ai:conversations"),
  aiController.listConversations,
);
aiRouter.post(
  "/conversations",
  requirePermission("ai:conversations"),
  validate({ body: aiConversationCreateSchema }),
  aiController.createConversation,
);
aiRouter.get(
  "/conversations/:id",
  requirePermission("ai:conversations"),
  validate({ params: aiConversationParamsSchema }),
  aiController.getConversation,
);
aiRouter.delete(
  "/conversations/:id",
  requirePermission("ai:conversations"),
  validate({ params: aiConversationParamsSchema }),
  aiController.deleteConversation,
);

aiRouter.post(
  "/chat",
  requirePermission("ai:chat"),
  aiLimiter,
  validate({ body: aiChatSchema }),
  aiController.chat,
);
aiRouter.post(
  "/business-insights",
  requirePermission("ai:insights"),
  aiLimiter,
  validate({ body: aiInsightsSchema }),
  aiController.insights,
);
