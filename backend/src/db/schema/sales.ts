import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { products } from "./products";
import { users } from "./users";

export const saleStatusEnum = pgEnum("sale_status", ["completed", "cancelled"]);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    transactionNumber: varchar("transaction_number", { length: 40 }).notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 14, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull(),
    changeAmount: numeric("change_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    status: saleStatusEnum("status").notNull().default("completed"),
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sales_transaction_number_unique").on(table.transactionNumber),
    uniqueIndex("sales_idempotency_key_unique").on(table.idempotencyKey),
    index("sales_customer_idx").on(table.customerId),
    index("sales_user_idx").on(table.userId),
    index("sales_created_at_idx").on(table.createdAt),
    index("sales_status_idx").on(table.status),
    check("sales_subtotal_nonnegative", sql`${table.subtotal} >= 0`),
    check("sales_discount_nonnegative", sql`${table.discount} >= 0`),
    check("sales_discount_lte_subtotal", sql`${table.discount} <= ${table.subtotal}`),
    check(
      "sales_total_equals_subtotal_minus_discount",
      sql`${table.totalAmount} = ${table.subtotal} - ${table.discount}`,
    ),
    check("sales_amount_paid_nonnegative", sql`${table.amountPaid} >= 0`),
    check("sales_change_nonnegative", sql`${table.changeAmount} >= 0`),
    check("sales_transaction_number_not_blank", sql`length(trim(${table.transactionNumber})) > 0`),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex("sale_items_sale_product_unique").on(table.saleId, table.productId),
    index("sale_items_sale_idx").on(table.saleId),
    index("sale_items_product_idx").on(table.productId),
    check("sale_items_quantity_positive", sql`${table.quantity} > 0`),
    check("sale_items_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
    check("sale_items_cost_price_nonnegative", sql`${table.costPrice} >= 0`),
    check("sale_items_subtotal_nonnegative", sql`${table.subtotal} >= 0`),
  ],
);
