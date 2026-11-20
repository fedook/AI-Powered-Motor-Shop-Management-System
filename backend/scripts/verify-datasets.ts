/**
 * Safe, read-only dataset verification.
 *
 * Prints the actual row counts for the five Business Analytics datasets and a
 * small set of integrity checks. It never modifies data and never prints
 * connection strings or credentials.
 *
 * Usage: npm.cmd run db:verify
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[verify] DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: parsed.data.DIRECT_DATABASE_URL || parsed.data.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 10_000,
});
const db = drizzle(pool);

const REQUIRED_MINIMUM = 50;

async function main() {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM products) AS products,
      (SELECT count(*)::int FROM customers) AS customers,
      (SELECT count(*)::int FROM sales) AS sales,
      (SELECT count(*)::int FROM sale_items) AS sale_items,
      (SELECT count(*)::int FROM inventory_movements) AS inventory_movements,
      (SELECT count(DISTINCT sku)::int FROM products) AS distinct_product_skus,
      (SELECT count(DISTINCT email)::int FROM customers) AS distinct_customer_emails,
      (SELECT count(DISTINCT transaction_number)::int FROM sales) AS distinct_transaction_numbers,
      (SELECT count(*)::int FROM sales WHERE status = 'completed') AS completed_sales,
      (SELECT count(*)::int FROM sales WHERE status = 'cancelled') AS cancelled_sales,
      (SELECT count(*)::int FROM sales WHERE transaction_number LIKE 'SEED-%') AS seed_sales,
      (SELECT count(*)::int FROM categories) AS categories,
      (SELECT count(*)::int FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed') AS completed_sale_items,
      (SELECT count(*)::int FROM products WHERE stock_quantity < 0) AS negative_stock,
      (SELECT count(*)::int FROM products p WHERE p.stock_quantity <> coalesce((
        SELECT sum(CASE WHEN m.movement_type IN ('stock_in', 'sale_cancellation') THEN m.quantity ELSE -m.quantity END)
        FROM inventory_movements m WHERE m.product_id = p.id
      ), 0)) AS inventory_inconsistencies,
      (SELECT min(created_at) FROM sales) AS first_sale_at,
      (SELECT max(created_at) FROM sales) AS last_sale_at
  `);
  const row = (result as unknown as { rows: Record<string, unknown>[] }).rows[0] ?? {};

  const datasets: Array<[string, string, string]> = [
    ["products", "products", String(row.products ?? 0)],
    ["customers", "customers", String(row.customers ?? 0)],
    ["sales", "sales", String(row.sales ?? 0)],
    ["sale_items", "sale_items", String(row.sale_items ?? 0)],
    ["inventory_movements", "inventory_movements", String(row.inventory_movements ?? 0)],
  ];

  console.log("\n=== Business Analytics dataset verification (read-only) ===");
  console.log("| Dataset | Table | Actual rows | Minimum | Status |");
  console.log("|---|---|---:|---:|---|");
  let allPass = true;
  for (const [label, table, countText] of datasets) {
    const count = Number(countText);
    const pass = Number.isFinite(count) && count >= REQUIRED_MINIMUM;
    allPass = allPass && pass;
    console.log(`| ${label} | ${table} | ${count} | ${REQUIRED_MINIMUM} | ${pass ? "PASS" : "FAIL"} |`);
  }
  console.log("\nIntegrity details:");
  console.log({
    distinctProductSkus: Number(row.distinct_product_skus ?? 0),
    distinctCustomerEmails: Number(row.distinct_customer_emails ?? 0),
    distinctTransactionNumbers: Number(row.distinct_transaction_numbers ?? 0),
    completedSales: Number(row.completed_sales ?? 0),
    cancelledSales: Number(row.cancelled_sales ?? 0),
    seedSales: Number(row.seed_sales ?? 0),
    categories: Number(row.categories ?? 0),
    completedSaleItems: Number(row.completed_sale_items ?? 0),
    negativeStockProducts: Number(row.negative_stock ?? 0),
    inventoryInconsistencies: Number(row.inventory_inconsistencies ?? 0),
    firstSaleAt: row.first_sale_at ?? null,
    lastSaleAt: row.last_sale_at ?? null,
  });
  console.log(`\n[verify] ${allPass ? "All five datasets meet the minimum." : "One or more datasets are below the minimum."}`);
  if (!allPass) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[verify] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
