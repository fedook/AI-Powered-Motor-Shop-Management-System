import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as aiService from "../services/ai.service";
import * as conversationService from "../services/ai-conversation.service";
import { groqService } from "../services/groq.service";
import type {
  aiChatSchema,
  aiConversationCreateSchema,
  aiInsightsSchema,
} from "../validators/ai.validator";

export const chat = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof aiChatSchema>;
  const result = await aiService.chat(input, req.user!, req);
  sendSuccess(res, result);
});

export const insights = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof aiInsightsSchema>;
  const result = await aiService.businessInsights(input, req.user!, req);
  sendSuccess(res, result);
});

export const status = asyncHandler(async (req: Request, res: Response) => {
  const force = req.query.refresh === "1" || req.query.refresh === "true";
  const result = await groqService.probe(force);
  sendSuccess(res, result);
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const result = await conversationService.listConversations(req.user!.id);
  sendSuccess(res, result);
});

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof aiConversationCreateSchema>;
  const result = await conversationService.createConversation(req.user!.id, input.title);
  sendSuccess(res, result, undefined, 201);
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const result = await conversationService.getConversationDetail(
    req.user!.id,
    req.params.id as string,
    req.user!.role,
  );
  sendSuccess(res, result);
});

export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await conversationService.deleteConversation(req.user!.id, id);
  sendSuccess(res, { id, deleted: true });
});
