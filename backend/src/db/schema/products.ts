import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { categories } from "./categories";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 50 }).notNull(),
    description: text("description"),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull(),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }).notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(5),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_sku_unique").on(table.sku),
    index("products_category_idx").on(table.categoryId),
    index("products_name_idx").on(table.name),
    index("products_stock_idx").on(table.stockQuantity),
    index("products_created_at_idx").on(table.createdAt),
    check("products_purchase_price_nonnegative", sql`${table.purchasePrice} >= 0`),
    check("products_selling_price_nonnegative", sql`${table.sellingPrice} >= 0`),
    check("products_stock_nonnegative", sql`${table.stockQuantity} >= 0`),
    check("products_minimum_stock_nonnegative", sql`${table.minimumStock} >= 0`),
    check("products_name_not_blank", sql`length(trim(${table.name})) > 0`),
  ],
);
