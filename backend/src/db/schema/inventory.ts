import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { users } from "./users";

export const movementTypeEnum = pgEnum("movement_type", [
  "stock_in",
  "stock_out",
  "adjustment",
  "sale",
  "sale_cancellation",
]);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    movementType: movementTypeEnum("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    previousQuantity: integer("previous_quantity").notNull(),
    newQuantity: integer("new_quantity").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_movements_product_idx").on(table.productId),
    index("inventory_movements_created_at_idx").on(table.createdAt),
    index("inventory_movements_type_idx").on(table.movementType),
    check("inventory_movements_quantity_positive", sql`${table.quantity} > 0`),
    check("inventory_movements_previous_nonnegative", sql`${table.previousQuantity} >= 0`),
    check("inventory_movements_new_nonnegative", sql`${table.newQuantity} >= 0`),
    check(
      "inventory_movements_quantity_matches_delta",
      sql`(
        (${table.movementType} IN ('stock_in', 'sale_cancellation') AND ${table.newQuantity} = ${table.previousQuantity} + ${table.quantity})
        OR (${table.movementType} IN ('stock_out', 'sale') AND ${table.newQuantity} = ${table.previousQuantity} - ${table.quantity})
        OR (${table.movementType} = 'adjustment' AND ${table.newQuantity} <> ${table.previousQuantity} AND abs(${table.newQuantity} - ${table.previousQuantity}) = ${table.quantity})
      )`,
    ),
  ],
);
