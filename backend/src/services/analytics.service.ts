import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import type { Role } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { money } from "../utils/money";
import { getInventorySummary } from "./inventory.service";

/** Defence-in-depth: financial analytics are executable only for admins. */
function assertAdmin(role: Role, area: string): void {
  if (role !== "admin") {
    throw ApiError.forbidden(`${area} is available to administrators only.`);
  }
}

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

function monthKeys(count = 6): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export interface AnalyticsRange {
  from: Date;
  to: Date;
}

export function resolveRange(
  input: { from?: string; to?: string; days?: number },
  defaultDays = 30,
): AnalyticsRange {
  const to = input.to
    ? new Date(`${input.to}T23:59:59.999Z`)
    : new Date();
  const from = input.from
    ? new Date(`${input.from}T00:00:00.000Z`)
    : new Date(to.getTime() - ((input.days ?? defaultDays) - 1) * 86_400_000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error("Invalid analytics date range");
  }
  return { from, to };
}

export async function getDashboard(role: Role, userId?: string) {
  if (role === "staff" && !userId) {
    throw new Error("A user id is required to build the staff dashboard.");
  }

  const recentQuery =
    role === "admin"
      ? sql`
          SELECT s.id, s.transaction_number, c.full_name AS customer_name, u.name AS cashier_name,
                 s.total_amount::text, s.payment_method, s.status::text, s.created_at
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
          JOIN users u ON u.id = s.user_id
          ORDER BY s.created_at DESC
          LIMIT 6
        `
      : sql`
          SELECT s.id, s.transaction_number, c.full_name AS customer_name, u.name AS cashier_name,
                 s.total_amount::text, s.payment_method, s.status::text, s.created_at
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
          JOIN users u ON u.id = s.user_id
          WHERE s.user_id = ${userId}
          ORDER BY s.created_at DESC
          LIMIT 6
        `;

  const [countsRows, recent, bestSellers, monthlyRows, lowStock, inventorySummary, categoryMix] =
    await Promise.all([
      rows<{
        total_products: number;
        total_customers: number;
        total_sales: number;
        total_revenue: string;
        revenue_today: string;
        low_stock_count: number;
        out_of_stock_count: number;
        cancelled_sales: number;
        my_sales_total: number;
        my_sales_today: number;
      }>(sql`
        SELECT
          (SELECT count(*)::int FROM products) AS total_products,
          (SELECT count(*)::int FROM customers) AS total_customers,
          (SELECT count(*)::int FROM sales WHERE status = 'completed') AS total_sales,
          (SELECT coalesce(sum(total_amount), 0)::text FROM sales WHERE status = 'completed') AS total_revenue,
          (SELECT coalesce(sum(total_amount), 0)::text FROM sales WHERE status = 'completed' AND created_at >= date_trunc('day', now())) AS revenue_today,
          (SELECT count(*)::int FROM products WHERE stock_quantity <= minimum_stock) AS low_stock_count,
          (SELECT count(*)::int FROM products WHERE stock_quantity = 0) AS out_of_stock_count,
          (SELECT count(*)::int FROM sales WHERE status = 'cancelled') AS cancelled_sales,
          (SELECT count(*)::int FROM sales WHERE status = 'completed' AND user_id = ${userId ?? null}) AS my_sales_total,
          (SELECT count(*)::int FROM sales WHERE status = 'completed' AND user_id = ${userId ?? null} AND created_at >= date_trunc('day', now())) AS my_sales_today
      `),
      rows<{
        id: string;
        transaction_number: string;
        customer_name: string | null;
        cashier_name: string;
        total_amount: string;
        payment_method: string;
        status: string;
        created_at: string;
      }>(recentQuery),
      rows<{
        id: string;
        name: string;
        sku: string;
        units_sold: number;
        revenue: string;
      }>(sql`
        SELECT p.id, p.name, p.sku,
               coalesce(sum(si.quantity), 0)::int AS units_sold,
               coalesce(sum(si.subtotal), 0)::text AS revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
        JOIN products p ON p.id = si.product_id
        GROUP BY p.id, p.name, p.sku
        ORDER BY units_sold DESC, revenue DESC
        LIMIT 5
      `),
      rows<{ month: string; revenue: string; sales: number }>(sql`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               coalesce(sum(total_amount), 0)::text AS revenue,
               count(*)::int AS sales
        FROM sales
        WHERE status = 'completed'
          AND created_at >= date_trunc('month', now()) - interval '5 months'
        GROUP BY 1
        ORDER BY 1
      `),
      rows<{
        id: string;
        name: string;
        sku: string;
        stock_quantity: number;
        minimum_stock: number;
        category_name: string;
      }>(sql`
        SELECT p.id, p.name, p.sku, p.stock_quantity, p.minimum_stock, c.name AS category_name
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.stock_quantity <= p.minimum_stock
        ORDER BY p.stock_quantity ASC, p.name ASC
        LIMIT 8
      `),
      getInventorySummary(role),
      rows<{ category: string; units: number; retail_value: string }>(sql`
        SELECT c.name AS category,
               coalesce(sum(p.stock_quantity), 0)::int AS units,
               coalesce(sum(p.stock_quantity * p.selling_price), 0)::text AS retail_value
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY retail_value DESC
        LIMIT 8
      `),
    ]);

  const counts = countsRows[0];
  const monthlyMap = new Map(monthlyRows.map((row) => [row.month, row]));
  const monthly = monthKeys(6).map((key) => {
    const row = monthlyMap.get(key);
    return {
      month: key,
      label: new Date(`${key}-01T00:00:00.000Z`).toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      revenue: money(row?.revenue ?? 0),
      sales: Number(row?.sales ?? 0),
    };
  });

  const shared = {
    inventory: inventorySummary,
    recentTransactions: recent.map((row) => ({
      id: row.id,
      transactionNumber: row.transaction_number,
      customerName: row.customer_name ?? "Walk-in customer",
      cashierName: row.cashier_name,
      totalAmount: money(row.total_amount),
      paymentMethod: row.payment_method,
      status: row.status,
      createdAt: row.created_at,
    })),
    bestSellers: bestSellers.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unitsSold: Number(row.units_sold),
      ...(role === "admin" ? { revenue: money(row.revenue) } : {}),
    })),
    lowStockProducts: lowStock.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      stockQuantity: row.stock_quantity,
      minimumStock: row.minimum_stock,
      categoryName: row.category_name,
    })),
    categoryMix: categoryMix.map((row) => ({
      category: row.category,
      units: Number(row.units),
      ...(role === "admin" ? { retailValue: money(row.retail_value) } : {}),
    })),
  };

  if (role === "staff") {
    return {
      role,
      stats: {
        totalProducts: Number(counts?.total_products ?? 0),
        totalCustomers: Number(counts?.total_customers ?? 0),
        lowStockCount: Number(counts?.low_stock_count ?? 0),
        outOfStockCount: Number(counts?.out_of_stock_count ?? 0),
        cancelledSales: Number(counts?.cancelled_sales ?? 0),
        mySalesTotal: Number(counts?.my_sales_total ?? 0),
        mySalesToday: Number(counts?.my_sales_today ?? 0),
      },
      ...shared,
      // Monthly revenue history is intentionally omitted for staff accounts.
      monthlySales: [] as typeof monthly,
    };
  }

  return {
    role,
    stats: {
      totalProducts: Number(counts?.total_products ?? 0),
      totalCustomers: Number(counts?.total_customers ?? 0),
      totalSales: Number(counts?.total_sales ?? 0),
      totalRevenue: money(counts?.total_revenue ?? 0),
      revenueToday: money(counts?.revenue_today ?? 0),
      lowStockCount: Number(counts?.low_stock_count ?? 0),
      outOfStockCount: Number(counts?.out_of_stock_count ?? 0),
      cancelledSales: Number(counts?.cancelled_sales ?? 0),
    },
    ...shared,
    monthlySales: monthly,
  };
}

export async function getSalesAnalytics(
  role: Role,
  input: { from?: string; to?: string; days?: number; groupBy?: "day" | "week" | "month" },
) {
  assertAdmin(role, "Sales analytics");
  const range = resolveRange(input);
  const spanMs = range.to.getTime() - range.from.getTime();
  const previousFrom = new Date(range.from.getTime() - spanMs - 1);
  const previousTo = new Date(range.from.getTime() - 1);
  const groupBy = input.groupBy ?? "day";
  const bucket = sql.raw(`'${groupBy}'`);

  const [totalsRows, previousRows, seriesRows, paymentRows, topRows, statusRows, itemsRows] =
    await Promise.all([
      rows<{
        transactions: number;
        revenue: string;
        discounts: string;
        average_sale: string;
        units: number;
      }>(sql`
        SELECT count(*)::int AS transactions,
               coalesce(sum(s.total_amount), 0)::text AS revenue,
               coalesce(sum(s.discount), 0)::text AS discounts,
               coalesce(avg(s.total_amount), 0)::text AS average_sale,
               (SELECT coalesce(sum(si.quantity), 0)::int FROM sale_items si
                 JOIN sales sx ON sx.id = si.sale_id
                 WHERE sx.status = 'completed' AND sx.created_at BETWEEN ${range.from} AND ${range.to}) AS units
        FROM sales s
        WHERE s.status = 'completed' AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `),
      rows<{ transactions: number; revenue: string }>(sql`
        SELECT count(*)::int AS transactions, coalesce(sum(total_amount), 0)::text AS revenue
        FROM sales
        WHERE status = 'completed' AND created_at BETWEEN ${previousFrom} AND ${previousTo}
      `),
      rows<{ bucket: string; revenue: string; sales: number }>(sql`
        SELECT to_char(date_trunc(${bucket}, created_at), 'YYYY-MM-DD') AS bucket,
               coalesce(sum(total_amount), 0)::text AS revenue,
               count(*)::int AS sales
        FROM sales
        WHERE status = 'completed' AND created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY 1
        ORDER BY 1
      `),
      rows<{ payment_method: string; sales: number; revenue: string }>(sql`
        SELECT payment_method, count(*)::int AS sales, coalesce(sum(total_amount), 0)::text AS revenue
        FROM sales
        WHERE status = 'completed' AND created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY payment_method
        ORDER BY revenue DESC
      `),
      rows<{
        id: string;
        name: string;
        sku: string;
        units_sold: number;
        revenue: string;
      }>(sql`
        SELECT p.id, p.name, p.sku,
               coalesce(sum(si.quantity), 0)::int AS units_sold,
               coalesce(sum(si.subtotal), 0)::text AS revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
        JOIN products p ON p.id = si.product_id
        WHERE s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY p.id, p.name, p.sku
        ORDER BY units_sold DESC, revenue DESC
        LIMIT 8
      `),
      rows<{ status: string; total: number }>(sql`
        SELECT status::text AS status, count(*)::int AS total
        FROM sales
        WHERE created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY status
      `),
      rows<{ units: number }>(sql`
        SELECT coalesce(sum(si.quantity), 0)::int AS units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'completed' AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `),
    ]);

  const totals = totalsRows[0];
  const previous = previousRows[0];
  const revenue = money(totals?.revenue ?? 0);
  const previousRevenue = money(previous?.revenue ?? 0);
  const revenueChangePercent =
    previousRevenue === 0
      ? revenue > 0
        ? 100
        : 0
      : Math.round(((revenue - previousRevenue) / previousRevenue) * 1000) / 10;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    groupBy,
    summary: {
      transactions: Number(totals?.transactions ?? 0),
      revenue,
      discounts: money(totals?.discounts ?? 0),
      averageSale: money(totals?.average_sale ?? 0),
      unitsSold: Number(itemsRows[0]?.units ?? totals?.units ?? 0),
      previousRevenue,
      revenueChangePercent,
    },
    series: seriesRows.map((row) => ({
      bucket: row.bucket,
      revenue: money(row.revenue),
      sales: Number(row.sales),
    })),
    paymentMix: paymentRows.map((row) => ({
      method: row.payment_method,
      sales: Number(row.sales),
      revenue: money(row.revenue),
    })),
    topProducts: topRows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      unitsSold: Number(row.units_sold),
      revenue: money(row.revenue),
    })),
    statusMix: statusRows.map((row) => ({ status: row.status, total: Number(row.total) })),
    profit:
      role === "admin" && totals
        ? money(
            (
              await rows<{ profit: string }>(sql`
                SELECT coalesce(sum((si.unit_price - si.cost_price) * si.quantity), 0)::text AS profit
                FROM sale_items si
                JOIN sales s ON s.id = si.sale_id
                WHERE s.status = 'completed' AND s.created_at BETWEEN ${range.from} AND ${range.to}
              `)
            )[0]?.profit ?? 0,
          )
        : undefined,
  };
}

export async function getProductAnalytics(
  role: Role,
  input: { from?: string; to?: string; limit?: number },
) {
  assertAdmin(role, "Product analytics");
  const range = resolveRange(input, 30);
  const limit = input.limit ?? 5;

  const [topSellers, leastSellers, slowMoving, lowStock, categoryValuation, totals, profitRows] =
    await Promise.all([
      rows<{
        id: string;
        name: string;
        sku: string;
        category: string;
        units_sold: number;
        revenue: string;
        stock_quantity: number;
      }>(sql`
        SELECT p.id, p.name, p.sku, c.name AS category,
               coalesce(sum(si.quantity), 0)::int AS units_sold,
               coalesce(sum(si.subtotal), 0)::text AS revenue,
               p.stock_quantity
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
        JOIN products p ON p.id = si.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY p.id, p.name, p.sku, c.name, p.stock_quantity
        ORDER BY units_sold DESC, revenue DESC
        LIMIT ${limit}
      `),
      rows<{
        id: string;
        name: string;
        sku: string;
        category: string;
        units_sold: number;
        revenue: string;
        stock_quantity: number;
      }>(sql`
        SELECT p.id, p.name, p.sku, c.name AS category,
               coalesce(sum(si.quantity), 0)::int AS units_sold,
               coalesce(sum(si.subtotal), 0)::text AS revenue,
               p.stock_quantity
        FROM products p
        JOIN categories c ON c.id = p.category_id
        LEFT JOIN sale_items si ON si.product_id = p.id
        LEFT JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
          AND s.created_at BETWEEN ${range.from} AND ${range.to}
        GROUP BY p.id, p.name, p.sku, c.name, p.stock_quantity
        ORDER BY units_sold ASC, p.stock_quantity DESC, p.name ASC
        LIMIT ${limit}
      `),
      rows<{
        id: string;
        name: string;
        sku: string;
        category: string;
        stock_quantity: number;
        retail_value: string;
        last_sold_at: string | null;
      }>(sql`
        SELECT p.id, p.name, p.sku, c.name AS category, p.stock_quantity,
               (p.stock_quantity * p.selling_price)::text AS retail_value,
               (SELECT max(s.created_at) FROM sale_items si
                 JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
                 WHERE si.product_id = p.id) AS last_sold_at
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.stock_quantity > 0
          AND NOT EXISTS (
            SELECT 1 FROM sale_items si
            JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
            WHERE si.product_id = p.id AND s.created_at >= now() - interval '30 days'
          )
        ORDER BY p.stock_quantity * p.selling_price DESC
        LIMIT 10
      `),
      rows<{
        id: string;
        name: string;
        sku: string;
        category: string;
        stock_quantity: number;
        minimum_stock: number;
        selling_price: string;
      }>(sql`
        SELECT p.id, p.name, p.sku, c.name AS category, p.stock_quantity, p.minimum_stock,
               p.selling_price::text
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.stock_quantity <= p.minimum_stock
        ORDER BY p.stock_quantity ASC, p.name ASC
        LIMIT 20
      `),
      rows<{
        category: string;
        sku_count: number;
        units: number;
        retail_value: string;
        cost_value: string;
      }>(sql`
        SELECT c.name AS category, count(p.id)::int AS sku_count,
               coalesce(sum(p.stock_quantity), 0)::int AS units,
               coalesce(sum(p.stock_quantity * p.selling_price), 0)::text AS retail_value,
               coalesce(sum(p.stock_quantity * p.purchase_price), 0)::text AS cost_value
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY retail_value DESC
      `),
      rows<{
        revenue: string;
        cost: string;
        units: number;
      }>(sql`
        SELECT coalesce(sum(si.subtotal), 0)::text AS revenue,
               coalesce(sum(si.cost_price * si.quantity), 0)::text AS cost,
               coalesce(sum(si.quantity), 0)::int AS units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'completed' AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `),
      rows<{ profit: string }>(sql`
        SELECT coalesce(sum((si.unit_price - si.cost_price) * si.quantity), 0)::text AS profit
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'completed' AND s.created_at BETWEEN ${range.from} AND ${range.to}
      `),
    ]);

  const total = totals[0];

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    summary: {
      unitsSold: Number(total?.units ?? 0),
      revenue: money(total?.revenue ?? 0),
      ...(role === "admin"
        ? {
            costOfGoodsSold: money(total?.cost ?? 0),
            grossProfit: money(profitRows[0]?.profit ?? 0),
          }
        : {}),
    },
    topSellers: topSellers.map((row) => ({
      ...row,
      unitsSold: Number(row.units_sold),
      revenue: money(row.revenue),
      stockQuantity: Number(row.stock_quantity),
    })),
    leastSellers: leastSellers.map((row) => ({
      ...row,
      unitsSold: Number(row.units_sold),
      revenue: money(row.revenue),
      stockQuantity: Number(row.stock_quantity),
    })),
    slowMoving: slowMoving.map((row) => ({
      ...row,
      stockQuantity: Number(row.stock_quantity),
      retailValue: money(row.retail_value),
      lastSoldAt: row.last_sold_at,
    })),
    lowStock: lowStock.map((row) => ({
      ...row,
      stockQuantity: Number(row.stock_quantity),
      minimumStock: Number(row.minimum_stock),
      sellingPrice: money(row.selling_price),
    })),
    categoryValuation: categoryValuation.map((row) => ({
      category: row.category,
      skuCount: Number(row.sku_count),
      units: Number(row.units),
      retailValue: money(row.retail_value),
      ...(role === "admin" ? { costValue: money(row.cost_value) } : {}),
    })),
  };
}
