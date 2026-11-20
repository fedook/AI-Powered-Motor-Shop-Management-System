import { and, desc, eq, sql } from "drizzle-orm";
import { db, withTransaction } from "../db";
import { aiConversations, aiMessages } from "../db/schema";
import type { Role } from "../config/constants";
import { ApiError } from "../utils/api-error";

export type StoredMessageRole = "user" | "assistant";
export type MessageDataScope = "business" | "operational" | "general" | "policy";

export interface StoredChatMessage {
  id: string;
  role: StoredMessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredChatMessage[];
}

/** A reasonable cap so prompts cannot grow without bound. */
export const MAX_HISTORY_MESSAGES = 10;
const MAX_STORED_CONTENT_CHARS = 12_000;
const MAX_CONVERSATION_MESSAGES = 200;
const DEFAULT_TITLE = "New conversation";

export function deriveConversationTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return DEFAULT_TITLE;
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function assertConversationId(userId: string, conversationId: string): void {
  if (!userId || !conversationId) {
    throw ApiError.notFound("Conversation not found.");
  }
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
      messageCount: sql<number>`count(${aiMessages.id})::int`,
    })
    .from(aiConversations)
    .leftJoin(aiMessages, eq(aiMessages.conversationId, aiConversations.id))
    .where(eq(aiConversations.userId, userId))
    .groupBy(
      aiConversations.id,
      aiConversations.title,
      aiConversations.createdAt,
      aiConversations.updatedAt,
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(50);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: Number(row.messageCount ?? 0),
  }));
}

export async function createConversation(
  userId: string,
  title?: string,
): Promise<ConversationSummary> {
  const safeTitle = (title?.trim() || DEFAULT_TITLE).slice(0, 120);
  const [conversation] = await db
    .insert(aiConversations)
    .values({ userId, title: safeTitle })
    .returning();

  if (!conversation) {
    throw new ApiError(500, "CONVERSATION_CREATE_FAILED", "Unable to start a conversation.");
  }

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: 0,
  };
}

/** Throws 404 when the conversation does not exist or belongs to another user. */
export async function ensureConversationOwned(
  userId: string,
  conversationId: string,
): Promise<void> {
  assertConversationId(userId, conversationId);

  const [conversation] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    throw ApiError.notFound("Conversation not found.");
  }
}

/**
 * Role-based history filtering. Administrator answers carry dataScope
 * "business" and may contain revenue, profit, cost or margin figures. A staff
 * account must never receive those messages, including conversations that were
 * created while the same person held an administrator role.
 *
 * Legacy rows written before dataScope existed fall back to the older mode
 * marker so business answers are still hidden.
 */
export function isMessageVisibleToRole(
  metadata: Record<string, unknown> | null | undefined,
  role: Role,
): boolean {
  if (role === "admin") return true;
  if (!metadata) return true;

  const scope = metadata.dataScope;
  if (scope === "business") return false;
  if (scope === "operational" || scope === "general" || scope === "policy") return true;

  return metadata.mode !== "business";
}

export async function getConversationDetail(
  userId: string,
  conversationId: string,
  role: Role = "admin",
): Promise<ConversationDetail> {
  assertConversationId(userId, conversationId);

  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    throw ApiError.notFound("Conversation not found.");
  }

  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversation.id))
    .orderBy(aiMessages.createdAt)
    .limit(MAX_CONVERSATION_MESSAGES);

  const visible = rows.filter((row) =>
    isMessageVisibleToRole(row.metadata as Record<string, unknown> | null, role),
  );

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: visible.length,
    messages: visible.map((row) => ({
      id: row.id,
      role: row.role as StoredMessageRole,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    })),
  };
}

/**
 * Loads the most recent messages in chronological order. The owner check is
 * performed first so callers can never read another user's history. Messages
 * that are not visible to the caller's role are removed before they can be
 * sent to the AI provider.
 */
export async function getRecentHistory(
  userId: string,
  conversationId: string,
  options: { limit?: number; role?: Role } = {},
): Promise<Array<{ role: StoredMessageRole; content: string }>> {
  await ensureConversationOwned(userId, conversationId);

  const limit = Math.max(1, Math.min(options.limit ?? MAX_HISTORY_MESSAGES, MAX_HISTORY_MESSAGES));
  const role = options.role ?? "admin";

  const rows = await db
    .select({
      role: aiMessages.role,
      content: aiMessages.content,
      metadata: aiMessages.metadata,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(desc(aiMessages.createdAt))
    // Over-fetch so filtering still leaves enough visible turns.
    .limit(Math.min(limit * 4, MAX_CONVERSATION_MESSAGES));

  return rows
    .filter((row) => isMessageVisibleToRole(row.metadata as Record<string, unknown> | null, role))
    .slice(0, limit)
    .reverse()
    .map((row) => ({
      role: row.role as StoredMessageRole,
      content: row.content,
    }));
}

export async function maybeUpdateConversationTitle(
  userId: string,
  conversationId: string,
  message: string,
): Promise<void> {
  const [conversation] = await db
    .select({ id: aiConversations.id, title: aiConversations.title })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    throw ApiError.notFound("Conversation not found.");
  }

  if (conversation.title !== DEFAULT_TITLE && conversation.title.trim()) return;

  const title = deriveConversationTitle(message);
  await db
    .update(aiConversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)));
}

export async function appendMessage(
  conversationId: string,
  role: StoredMessageRole,
  content: string,
  metadata?: Record<string, unknown> | null,
): Promise<StoredChatMessage> {
  const safeContent = content.trim().slice(0, MAX_STORED_CONTENT_CHARS);
  if (!safeContent) {
    throw ApiError.badRequest("A message cannot be empty.");
  }

  return withTransaction(async (tx) => {
    const [message] = await tx
      .insert(aiMessages)
      .values({
        conversationId,
        role,
        content: safeContent,
        metadata: metadata ?? null,
      })
      .returning();

    if (!message) {
      throw new ApiError(500, "MESSAGE_CREATE_FAILED", "Unable to save the conversation message.");
    }

    await tx
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, conversationId));

    return {
      id: message.id,
      role: message.role as StoredMessageRole,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      metadata: (message.metadata as Record<string, unknown> | null) ?? null,
    };
  });
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  assertConversationId(userId, conversationId);

  const deleted = await db
    .delete(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .returning({ id: aiConversations.id });

  if (deleted.length === 0) {
    throw ApiError.notFound("Conversation not found.");
  }
}
