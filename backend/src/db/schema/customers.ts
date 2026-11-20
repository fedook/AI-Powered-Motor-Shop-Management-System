import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: varchar("full_name", { length: 150 }).notNull(),
    email: varchar("email", { length: 255 }),
    contactNumber: varchar("contact_number", { length: 30 }),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customers_email_unique").on(table.email),
    index("customers_full_name_idx").on(table.fullName),
    index("customers_created_at_idx").on(table.createdAt),
    check(
      "customers_email_format",
      sql`${table.email} IS NULL OR (${table.email} = lower(${table.email}) AND ${table.email} ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')`,
    ),
    check("customers_full_name_not_blank", sql`length(trim(${table.fullName})) > 0`),
  ],
);
