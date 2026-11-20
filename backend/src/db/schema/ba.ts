import { pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const baRecommendationStatusEnum = pgEnum("ba_recommendation_status", [
  "pending",
  "accepted",
  "rejected",
  "completed",
]);

/**
 * Human decision trail for prescriptive recommendations.
 * Analytics are always recalculated from source records; this table stores only
 * the administrator's decision, never generated business figures.
 */
export const baRecommendationStatuses = pgTable("ba_recommendation_statuses", {
  key: varchar("key", { length: 200 }).primaryKey(),
  status: baRecommendationStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
