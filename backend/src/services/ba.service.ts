/**
 * Business Analytics service.
 *
 * Descriptive, predictive and prescriptive results are computed from the same
 * verified database snapshot in a single pass so that every stage genuinely
 * feeds the next one. No figure in this module is hard-coded and no AI model is
 * used to invent statistics.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { baRecommendationStatuses } from "../db/schema";
import { AUDIT_ACTIONS, type Role } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { money } from "../utils/money";
import { resolveRange } from "./analytics.service";
import { recordAudit } from "./audit.service";
import {
  addUtcDays,
  forecastProductDemand,
  forecastSales,
  linearRegression,
  round2,
  type DailySalesPoint,
  type ProductDemandResult,
  type SalesForecastResult,
} from "./forecast";

export interface BAFilters {
  from?: string;
  to?: string;
  days?: number;
  groupBy?: "day" | "week" | "month" | "year";
  productId?: string;
  categoryId?: string;
}

export type RecommendationStatus = "pending" | "accepted" | "rejected" | "completed";

interface AnalyticsRange {
  from: Date;
  to: Date;
}

interface TotalRow {
  transactions: number;
  revenue: number;
  discounts: number;
  units: number;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  units: number;
  revenue: number;
  cost: number;
  active_days: number;
  last_sold_at: string | null;
  stock: number;
  minimum: number;
  purchase_price: number;
  recent_qty: number;
  prior_qty: number;
}

interface CustomerRow {
  id: string;
  name: string;
  transactions: number;
  spent: number;
  last_purchase: string | null;
}

interface MovementSummaryRow {
  movement_type: string;
  total: number;
  units: number;
  last_at: string | null;
}

interface MovementHistoryRow {
  id: string;
  product_name: string;
  sku: string;
  movement_type: string;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  created_at: string;
}

function assertAdmin(role: Role, area: string): void {
  if (role !== "admin") {
    throw ApiError.forbidden(`${area} is available to administrators only.`);
  }
}

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows ?? [];
}

function andAll(parts: SQL[]): SQL {
  return parts.length > 0 ? sql.join(parts, sql` AND `) : sql`TRUE`;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(range: AnalyticsRange): number {
  const start = new Date(`${dateOnly(range.from)}T00:00:00.000Z`).getTime();
  const end = new Date(`${dateOnly(range.to)}T00:00:00.000Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function saleWhere(range: AnalyticsRange, input: BAFilters): SQL {
  const parts: SQL[] = [
    sql`s.status = 'completed'`,
    sql`s.created_at BETWEEN ${range.from} AND ${range.to}`,
  ];
  if (input.productId) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM sale_items si_f WHERE si_f.sale_id = s.id AND si_f.product_id = ${input.productId}
    )`);
  }
  if (input.categoryId) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM sale_items si_f
      JOIN products p_f ON p_f.id = si_f.product_id
      WHERE si_f.sale_id = s.id AND p_f.category_id = ${input.categoryId}
    )`);
  }
  return andAll(parts);
}

function productWhere(input: BAFilters): SQL {
  const parts: SQL[] = [];
  if (input.productId) parts.push(sql`p.id = ${input.productId}`);
  if (input.categoryId) parts.push(sql`p.category_id = ${input.categoryId}`);
  return andAll(parts);
}

function previousRange(range: AnalyticsRange): AnalyticsRange {
  const span = range.to.getTime() - range.from.getTime() + 1;
  return {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime() - 1),
  };
}

async function fetchDailySales(range: AnalyticsRange, input: BAFilters): Promise<DailySalesPoint[]> {
  const where = saleWhere(range, input);
  const result = await rows<{
    day: string;
    revenue: string;
    transactions: number;
    units: number;
  }>(sql`
    WITH sale_units AS (
      SELECT sale_id, coalesce(sum(quantity), 0)::int AS units FROM sale_items GROUP BY sale_id
    )
    SELECT to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS day,
           coalesce(sum(s.total_amount), 0)::text AS revenue,
           count(*)::int AS transactions,
           coalesce(sum(su.units), 0)::int AS units
    FROM sales s
    LEFT JOIN sale_units su ON su.sale_id = s.id
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1
  `);

  // Include quiet days as zeros so demand rates are not overstated.
  const byDate = new Map(
    result.map((row) => [
      row.day,
      {
        date: row.day,
        revenue: Number(row.revenue ?? 0),
        transactions: Number(row.transactions ?? 0),
        units: Number(row.units ?? 0),
      },
    ]),
  );
  const start = dateOnly(range.from);
  const end = dateOnly(range.to);
  const series: DailySalesPoint[] = [];
  const dayCount = Math.min(366, daysBetween(range));
  for (let index = 0; index < dayCount; index += 1) {
    const date = addUtcDays(start, index);
    if (date > end) break;
    series.push(
      byDate.get(date) ?? { date, revenue: 0, transactions: 0, units: 0 },
    );
  }
  return series;
}

function groupSeries(
  daily: DailySalesPoint[],
  groupBy: BAFilters["groupBy"] = "day",
): Array<{ bucket: string; revenue: number; sales: number; units: number }> {
  const buckets = new Map<string, { revenue: number; sales: number; units: number }>();
  for (const point of daily) {
    let key = point.date;
    if (groupBy === "month") key = point.date.slice(0, 7);
    else if (groupBy === "year") key = point.date.slice(0, 4);
    else if (groupBy === "week") {
      const date = new Date(`${point.date}T00:00:00.000Z`);
      const offset = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - offset);
      key = date.toISOString().slice(0, 10);
    }
    const current = buckets.get(key) ?? { revenue: 0, sales: 0, units: 0 };
    current.revenue += point.revenue;
    current.sales += point.transactions;
    current.units += point.units;
    buckets.set(key, current);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, value]) => ({
      bucket,
      revenue: round2(value.revenue),
      sales: value.sales,
      units: value.units,
    }));
}

async function fetchTotals(range: AnalyticsRange, input: BAFilters): Promise<TotalRow> {
  const where = saleWhere(range, input);
  const result = await rows<TotalRow>(sql`
    WITH sale_units AS (
      SELECT sale_id, coalesce(sum(quantity), 0)::int AS units FROM sale_items GROUP BY sale_id
    )
    SELECT count(*)::int AS transactions,
           coalesce(sum(s.total_amount), 0)::text AS revenue,
           coalesce(sum(s.discount), 0)::text AS discounts,
           coalesce(sum(su.units), 0)::int AS units
    FROM sales s
    LEFT JOIN sale_units su ON su.sale_id = s.id
    WHERE ${where}
  `);
  const row = result[0];
  return {
    transactions: Number(row?.transactions ?? 0),
    revenue: Number(row?.revenue ?? 0),
    discounts: Number(row?.discounts ?? 0),
    units: Number(row?.units ?? 0),
  };
}

async function fetchPaymentMix(
  range: AnalyticsRange,
  input: BAFilters,
): Promise<Array<{ method: string; transactions: number; revenue: number }>> {
  const result = await rows<{
    method: string;
    transactions: number;
    revenue: string;
  }>(sql`
    SELECT s.payment_method AS method,
           count(*)::int AS transactions,
           coalesce(sum(s.total_amount), 0)::text AS revenue
    FROM sales s
    WHERE ${saleWhere(range, input)}
    GROUP BY s.payment_method
    ORDER BY sum(s.total_amount) DESC
  `);
  return result.map((row) => ({
    method: row.method,
    transactions: Number(row.transactions ?? 0),
    revenue: Number(row.revenue ?? 0),
  }));
}

async function fetchProductRows(range: AnalyticsRange, input: BAFilters): Promise<ProductRow[]> {
  const where = productWhere(input);
  const recentFrom = new Date(Math.max(range.from.getTime(), range.to.getTime() - 29 * 86_400_000));
  const priorTo = new Date(recentFrom.getTime() - 1);
  const priorFrom = new Date(Math.max(range.from.getTime(), recentFrom.getTime() - 30 * 86_400_000));

  const result = await rows<ProductRow>(sql`
    SELECT p.id, p.name, p.sku, c.name AS category,
           coalesce(sum(si.quantity), 0)::int AS units,
           coalesce(sum(si.subtotal), 0)::text AS revenue,
           coalesce(sum(si.cost_price * si.quantity), 0)::text AS cost,
           count(DISTINCT date_trunc('day', s.created_at))::int AS active_days,
           max(s.created_at) AS last_sold_at,
           p.stock_quantity AS stock,
           p.minimum_stock AS minimum,
           p.purchase_price::text AS purchase_price,
           coalesce(sum(CASE
             WHEN s.created_at BETWEEN ${recentFrom} AND ${range.to} THEN si.quantity ELSE 0
           END), 0)::int AS recent_qty,
           coalesce(sum(CASE
             WHEN s.created_at BETWEEN ${priorFrom} AND ${priorTo} THEN si.quantity ELSE 0
           END), 0)::int AS prior_qty
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN sale_items si ON si.product_id = p.id
    LEFT JOIN sales s ON s.id = si.sale_id
      AND s.status = 'completed'
      AND s.created_at BETWEEN ${range.from} AND ${range.to}
    WHERE ${where}
    GROUP BY p.id, p.name, p.sku, c.name, p.stock_quantity, p.minimum_stock, p.purchase_price
  `);

  return result.map((row) => ({
    ...row,
    units: Number(row.units ?? 0),
    revenue: Number(row.revenue ?? 0),
    cost: Number(row.cost ?? 0),
    active_days: Number(row.active_days ?? 0),
    stock: Number(row.stock ?? 0),
    minimum: Number(row.minimum ?? 0),
    purchase_price: Number(row.purchase_price ?? 0),
    recent_qty: Number(row.recent_qty ?? 0),
    prior_qty: Number(row.prior_qty ?? 0),
  }));
}

async function fetchCustomers(range: AnalyticsRange): Promise<CustomerRow[]> {
  const result = await rows<CustomerRow>(sql`
    SELECT c.id, c.full_name AS name,
           count(s.id)::int AS transactions,
           coalesce(sum(s.total_amount), 0)::text AS spent,
           max(s.created_at) AS last_purchase
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
      AND s.status = 'completed'
      AND s.created_at BETWEEN ${range.from} AND ${range.to}
    GROUP BY c.id, c.full_name
    ORDER BY sum(s.total_amount) DESC NULLS LAST, count(s.id) DESC, c.full_name ASC
  `);
  return result.map((row) => ({
    ...row,
    transactions: Number(row.transactions ?? 0),
    spent: Number(row.spent ?? 0),
  }));
}

async function fetchMovementSummary(
  range: AnalyticsRange,
  input: BAFilters,
): Promise<MovementSummaryRow[]> {
  const result = await rows<MovementSummaryRow>(sql`
    SELECT m.movement_type AS movement_type,
           count(*)::int AS total,
           coalesce(sum(m.quantity), 0)::int AS units,
           max(m.created_at) AS last_at
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    WHERE ${productWhere(input)}
      AND m.created_at BETWEEN ${range.from} AND ${range.to}
    GROUP BY m.movement_type
    ORDER BY total DESC
  `);
  return result.map((row) => ({
    ...row,
    total: Number(row.total ?? 0),
    units: Number(row.units ?? 0),
  }));
}

async function fetchMovementHistory(
  range: AnalyticsRange,
  input: BAFilters,
): Promise<MovementHistoryRow[]> {
  const result = await rows<MovementHistoryRow>(sql`
    SELECT m.id, p.name AS product_name, p.sku, m.movement_type,
           m.quantity, m.previous_quantity, m.new_quantity, m.reason, m.created_at
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.user_id
    WHERE ${productWhere(input)}
      AND m.created_at BETWEEN ${range.from} AND ${range.to}
    ORDER BY m.created_at DESC
    LIMIT 10
  `);
  return result.map((row) => ({
    ...row,
    quantity: Number(row.quantity ?? 0),
    previous_quantity: Number(row.previous_quantity ?? 0),
    new_quantity: Number(row.new_quantity ?? 0),
  }));
}

async function fetchCancelledCount(range: AnalyticsRange, input: BAFilters): Promise<number> {
  const parts: SQL[] = [
    sql`s.status = 'cancelled'`,
    sql`s.created_at BETWEEN ${range.from} AND ${range.to}`,
  ];
  if (input.productId) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM sale_items si_c WHERE si_c.sale_id = s.id AND si_c.product_id = ${input.productId}
    )`);
  }
  if (input.categoryId) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM sale_items si_c JOIN products p_c ON p_c.id = si_c.product_id
      WHERE si_c.sale_id = s.id AND p_c.category_id = ${input.categoryId}
    )`);
  }
  const result = await rows<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM sales s WHERE ${andAll(parts)}
  `);
  return Number(result[0]?.total ?? 0);
}

interface AnalyticsContext {
  generatedAt: string;
  range: AnalyticsRange;
  input: BAFilters;
  lookbackDays: number;
  daily: DailySalesPoint[];
  totals: TotalRow;
  previousTotals: TotalRow;
  products: ProductRow[];
  customers: CustomerRow[];
  movementSummary: MovementSummaryRow[];
  movementHistory: MovementHistoryRow[];
  paymentMix: Array<{ method: string; transactions: number; revenue: number }>;
  cancelledCount: number;
}

async function buildContext(input: BAFilters): Promise<AnalyticsContext> {
  const range = resolveRange(
    { from: input.from, to: input.to, days: input.days ?? 90 },
    90,
  );
  const [daily, totals, previousTotals, products, customers, movementSummary, movementHistory, paymentMix, cancelledCount] =
    await Promise.all([
      fetchDailySales(range, input),
      fetchTotals(range, input),
      fetchTotals(previousRange(range), input),
      fetchProductRows(range, input),
      fetchCustomers(range),
      fetchMovementSummary(range, input),
      fetchMovementHistory(range, input),
      fetchPaymentMix(range, input),
      fetchCancelledCount(range, input),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    range,
    input,
    lookbackDays: daysBetween(range),
    daily,
    totals,
    previousTotals,
    products,
    customers,
    movementSummary,
    movementHistory,
    paymentMix,
    cancelledCount,
  };
}

interface ProductRanking {
  rank: number;
  id: string;
  name: string;
  sku: string;
  category: string;
  unitsSold: number;
  revenue: number;
  stockQuantity: number;
}

function rank(list: ProductRow[], key: "units" | "revenue"): ProductRanking[] {
  const sorted = [...list].sort((a, b) => b[key] - a[key]);
  return sorted.map((product, index) => ({
    rank: index + 1,
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    unitsSold: product.units,
    revenue: money(product.revenue),
    stockQuantity: product.stock,
  }));
}

function buildDescriptive(ctx: AnalyticsContext) {
  const { totals, previousTotals, daily, products, customers } = ctx;
  const revenue = round2(totals.revenue);
  const previousRevenue = round2(previousTotals.revenue);
  const growth =
    previousRevenue === 0
      ? revenue > 0
        ? 100
        : 0
      : round2(((revenue - previousRevenue) / previousRevenue) * 100);
  const averageOrderValue = totals.transactions > 0 ? round2(revenue / totals.transactions) : 0;
  const slope = linearRegression(daily.map((point) => point.revenue)).slope;

  const productList = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    unitsSold: product.units,
    revenue: money(product.revenue),
    costOfGoodsSold: money(product.cost),
    stockQuantity: product.stock,
    minimumStock: product.minimum,
    activeDays: product.active_days,
    lastSoldAt: product.last_sold_at,
    recent30DayUnits: product.recent_qty,
    prior30DayUnits: product.prior_qty,
  }));

  const bestSelling = productList.filter((p) => p.unitsSold > 0).slice(0, 10);
  const sortedByUnitsAsc = [...productList].sort(
    (a, b) => a.unitsSold - b.unitsSold || b.stockQuantity - a.stockQuantity,
  );
  const sortedByRevenueAsc = [...productList].sort((a, b) => a.revenue - b.revenue);

  const totalCustomerSpending = customers.reduce((sum, customer) => sum + customer.spent, 0);
  const purchasingCustomers = customers.filter((customer) => customer.transactions > 0);
  const frequencyBuckets = [
    { label: "No purchase in range", customers: customers.length - purchasingCustomers.length },
    {
      label: "1 purchase",
      customers: purchasingCustomers.filter((customer) => customer.transactions === 1).length,
    },
    {
      label: "2–3 purchases",
      customers: purchasingCustomers.filter(
        (customer) => customer.transactions >= 2 && customer.transactions <= 3,
      ).length,
    },
    {
      label: "4+ purchases",
      customers: purchasingCustomers.filter((customer) => customer.transactions >= 4).length,
    },
  ];

  const lowStock = productList.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minimumStock);
  const outOfStock = productList.filter((p) => p.stockQuantity === 0);
  const fastMoving = [...productList]
    .filter((p) => p.recent30DayUnits > 0)
    .sort((a, b) => b.recent30DayUnits - a.recent30DayUnits)
    .slice(0, 8);
  const slowMoving = productList
    .filter((p) => p.stockQuantity > 0 && p.recent30DayUnits === 0)
    .sort((a, b) => b.stockQuantity - a.stockQuantity)
    .slice(0, 10);

  const cogs = round2(products.reduce((sum, product) => sum + product.cost, 0));
  const grossSales = round2(products.reduce((sum, product) => sum + product.revenue, 0));
  const grossProfit = round2(revenue - cogs);

  return {
    generatedAt: ctx.generatedAt,
    range: { from: dateOnly(ctx.range.from), to: dateOnly(ctx.range.to) },
    historicalDays: ctx.lookbackDays,
    sales: {
      totalSalesRevenue: money(revenue),
      totalTransactions: totals.transactions,
      totalUnitsSold: totals.units,
      grossSales: money(grossSales),
      discounts: money(totals.discounts),
      averageOrderValue: money(averageOrderValue),
      previousPeriodRevenue: money(previousRevenue),
      revenueGrowthPercent: growth,
      salesTrend: slope > 0.01 ? "increasing" : slope < -0.01 ? "decreasing" : "stable",
      cancelledTransactions: ctx.cancelledCount,
      series: {
        daily: groupSeries(daily, "day"),
        weekly: groupSeries(daily, "week"),
        monthly: groupSeries(daily, "month"),
        yearly: groupSeries(daily, "year"),
      },
      paymentMix: ctx.paymentMix.map((row) => ({
        method: row.method,
        transactions: row.transactions,
        revenue: money(row.revenue),
      })),
    },
    products: {
      totalProducts: products.length,
      bestSelling,
      leastSelling: sortedByUnitsAsc.slice(0, 10),
      highestRevenue: rank(products, "revenue").slice(0, 10),
      lowestRevenue: [...rank(products, "revenue")].reverse().slice(0, 10),
      rankings: rank(products, "units"),
    },
    customers: {
      totalCustomers: customers.length,
      purchasingCustomers: purchasingCustomers.length,
      averageCustomerSpending: money(
        customers.length > 0 ? round2(totalCustomerSpending / customers.length) : 0,
      ),
      averagePurchasingCustomerSpending: money(
        purchasingCustomers.length > 0
          ? round2(totalCustomerSpending / purchasingCustomers.length)
          : 0,
      ),
      frequencyBuckets,
      topCustomers: customers.slice(0, 10).map((customer) => ({
        id: customer.id,
        name: customer.name,
        purchases: customer.transactions,
        totalSpent: money(customer.spent),
        averageSpend: money(
          customer.transactions > 0 ? round2(customer.spent / customer.transactions) : 0,
        ),
        lastPurchaseAt: customer.last_purchase,
      })),
    },
    inventory: {
      skuCount: products.length,
      unitsOnHand: products.reduce((sum, product) => sum + product.stock, 0),
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      lowStock,
      outOfStock,
      fastMoving,
      slowMoving,
      movementSummary: ctx.movementSummary,
      movementHistory: ctx.movementHistory.map((row) => ({
        ...row,
        createdAt: row.created_at,
      })),
    },
    financial: {
      netRevenue: money(revenue),
      grossSales: money(grossSales),
      discounts: money(totals.discounts),
      costOfGoodsSold: money(cogs),
      grossProfit: money(grossProfit),
      grossProfitMarginPercent: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
      averageTransactionValue: money(averageOrderValue),
      basis: "Completed sales only; discounts are deducted before gross profit is calculated.",
    },
  };
}

interface ProductForecast {
  id: string;
  name: string;
  sku: string;
  category: string;
  historicalQuantity: number;
  historicalRevenue: number;
  predictedQuantity: number | null;
  expectedDemandTrend: ProductDemandResult["expectedDemandTrend"];
  averageDailyDemand: number | null;
  daysUntilDepletion: number | null;
  stockoutRisk: ProductDemandResult["stockoutRisk"];
  suggestedReorderQuantity: number;
  currentStock: number;
  minimumStock: number;
  purchasePrice: number;
  sufficientData: boolean;
  reason?: string;
}

interface PrescriptiveRecommendation {
  key: string;
  type: "restock" | "excess_inventory" | "declining_demand" | "sales_focus" | "business_improvement" | "purchasing_plan";
  title: string;
  relatedTo: string;
  productId: string | null;
  supportingHistoricalData: string;
  predictedResult: string;
  recommendedAction: string;
  reason: string;
  priority: "critical" | "high" | "medium" | "low";
  generatedAt: string;
  status: RecommendationStatus;
  decisionNote?: string | null;
  decidedAt?: string | null;
}

function buildPredictive(ctx: AnalyticsContext, horizon: number) {
  const today = new Date().toISOString().slice(0, 10);
  const fitSeries = ctx.daily.filter((point) => point.date < today);
  const modelSeries = fitSeries.length >= 14 ? fitSeries : ctx.daily;
  const horizonDays = horizon === 7 || horizon === 30 || horizon === 90 ? horizon : 30;
  const periods = ([7, 30, 90] as const).map((days) => {
    const forecast: SalesForecastResult = forecastSales(modelSeries, days);
    return {
      horizonDays: days,
      supported: modelSeries.length >= days,
      method: forecast.method,
      methodDescription: forecast.methodDescription,
      historicalPeriod: forecast.historicalPeriod,
      historicalDays: forecast.historicalDays,
      activeDays: forecast.activeDays,
      sufficientData: forecast.sufficientData,
      reason: forecast.reason,
      expectedRevenue: money(forecast.expectedRevenue),
      expectedTransactions: forecast.expectedTransactions,
      limitations: forecast.limitations,
    };
  });
  const selected = forecastSales(modelSeries, horizonDays);

  const productForecasts: ProductForecast[] = ctx.products.map((product) => {
    const demand = forecastProductDemand({
      historicalQuantity: product.units,
      historicalRevenue: product.revenue,
      lookbackDays: ctx.lookbackDays,
      recentQuantity: product.recent_qty,
      priorQuantity: product.prior_qty,
      activeDays: product.active_days,
      stockQuantity: product.stock,
      minimumStock: product.minimum,
      horizon: horizonDays,
    });
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      historicalQuantity: product.units,
      historicalRevenue: product.revenue,
      predictedQuantity: demand.predictedQuantity,
      expectedDemandTrend: demand.expectedDemandTrend,
      averageDailyDemand: demand.averageDailyDemand,
      daysUntilDepletion: demand.daysUntilDepletion,
      stockoutRisk: demand.stockoutRisk,
      suggestedReorderQuantity: demand.suggestedReorderQuantity,
      currentStock: product.stock,
      minimumStock: product.minimum,
      purchasePrice: product.purchase_price,
      sufficientData: demand.sufficientData,
      reason: demand.reason,
    };
  });

  const demandRanking = [...productForecasts]
    .sort(
      (a, b) =>
        Number(b.sufficientData) - Number(a.sufficientData) ||
        (b.predictedQuantity ?? -1) - (a.predictedQuantity ?? -1),
    )
    .slice(0, 15);
  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
  const inventoryRisk = [...productForecasts]
    .filter((product) => product.sufficientData && product.currentStock <= product.minimumStock)
    .sort(
      (a, b) =>
        riskOrder[a.stockoutRisk] - riskOrder[b.stockoutRisk] ||
        (a.daysUntilDepletion ?? Number.MAX_SAFE_INTEGER) -
          (b.daysUntilDepletion ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 15);

  return {
    generatedAt: ctx.generatedAt,
    range: { from: dateOnly(ctx.range.from), to: dateOnly(ctx.range.to) },
    horizonDays,
    methodology: {
      sales: selected.methodDescription,
      product:
        "Average daily units from the historical window, adjusted by the ratio of the last 30 days to the previous 30 days (bounded to 0.5x–1.5x).",
      inventory:
        "Days until depletion = current stock ÷ average daily demand over the last 30 days. Reorder quantity covers a 7-day lead time plus 3 days of safety stock, never below the product minimum.",
      estimatesOnly: true,
    },
    historicalPeriod: selected.historicalPeriod,
    historicalDays: selected.historicalDays,
    activeSellingDays: selected.activeDays,
    sales: {
      sufficientData: selected.sufficientData,
      reason: selected.reason,
      method: selected.method,
      expectedRevenue: money(selected.expectedRevenue),
      expectedTransactions: selected.expectedTransactions,
      forecast: selected.forecast.map((day) => ({
        date: day.date,
        predictedRevenue: money(day.predictedRevenue),
        predictedTransactions: day.predictedTransactions,
      })),
      forecastPeriods: periods,
    },
    productDemand: {
      historicalAndPredicted: demandRanking.slice(0, 10).map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        historicalQuantity: product.historicalQuantity,
        predictedQuantity: product.predictedQuantity,
        expectedDemandTrend: product.expectedDemandTrend,
        sufficientData: product.sufficientData,
      })),
      ranking: demandRanking,
    },
    inventoryRisk,
    limitations: [
      "All forecasts are estimates, not guaranteed outcomes.",
      "Insufficient histories are marked as such and receive no predicted quantity.",
      "Forecasts assume no major price, supplier or demand changes.",
      "Cancelled sales are excluded from historical demand.",
    ],
  };
}

async function getRecommendationStatusMap(): Promise<Map<string, { status: RecommendationStatus; note: string | null; decidedAt: string }>> {
  const result = await db.execute(sql`
    SELECT key, status::text AS status, note, decided_at FROM ba_recommendation_statuses
  `);
  const rows = (result as unknown as {
    rows: Array<{ key: string; status: string; note: string | null; decided_at: string }>;
  }).rows;
  return new Map(
    rows.map((row) => [
      row.key,
      {
        status: row.status as RecommendationStatus,
        note: row.note,
        decidedAt: new Date(row.decided_at).toISOString(),
      },
    ]),
  );
}

async function buildPrescriptive(
  ctx: AnalyticsContext,
  predictive: ReturnType<typeof buildPredictive>,
  descriptive: ReturnType<typeof buildDescriptive>,
): Promise<{
  generatedAt: string;
  horizonDays: number;
  recommendations: PrescriptiveRecommendation[];
  purchasingSummary: {
    suggestedUnits: number;
    estimatedCost: number;
    basis: string;
  };
  requiresHumanApproval: boolean;
}> {
  const statuses = await getRecommendationStatusMap();
  const generatedAt = ctx.generatedAt;
  const horizon = predictive.horizonDays;
  const recommendations: PrescriptiveRecommendation[] = [];

  const withStatus = (rec: Omit<PrescriptiveRecommendation, "status" | "decisionNote" | "decidedAt">) => {
    const saved = statuses.get(rec.key);
    recommendations.push({
      ...rec,
      status: saved?.status ?? "pending",
      ...(saved?.note ? { decisionNote: saved.note } : {}),
      ...(saved?.decidedAt ? { decidedAt: saved.decidedAt } : {}),
    });
  };

  for (const product of predictive.inventoryRisk) {
    if (product.suggestedReorderQuantity <= 0 || product.stockoutRisk === "unknown") continue;
    withStatus({
      key: `restock:${product.id}:${horizon}d`,
      type: "restock",
      title: `Restock ${product.name}`,
      relatedTo: `${product.name} (${product.sku}) — stock ${product.currentStock}, minimum ${product.minimumStock}`,
      productId: product.id,
      supportingHistoricalData: `${product.historicalQuantity} units sold in the ${ctx.lookbackDays}-day history; current stock ${product.currentStock} units.`,
      predictedResult: `Estimated ${product.predictedQuantity ?? 0} units of demand over ${horizon} days; ${product.stockoutRisk} stockout risk${product.daysUntilDepletion !== null ? `, depletion in about ${product.daysUntilDepletion} days` : ""}.`,
      recommendedAction: `Purchase approximately ${product.suggestedReorderQuantity} units and place the order before stock reaches the minimum level.`,
      reason: "Forecast demand can exceed the available stock within the lead time.",
      priority: product.stockoutRisk === "critical" ? "critical" : product.stockoutRisk === "high" ? "high" : "medium",
      generatedAt,
    });
  }

  const restockKeys = new Set(recommendations.map((rec) => rec.productId));
  for (const product of predictive.productDemand.ranking) {
    if (!product.sufficientData || product.expectedDemandTrend !== "decreasing") continue;
    if (restockKeys.has(product.id)) continue;
    withStatus({
      key: `declining:${product.id}:${horizon}d`,
      type: "declining_demand",
      title: `Review declining demand for ${product.name}`,
      relatedTo: `${product.name} (${product.sku})`,
      productId: product.id,
      supportingHistoricalData: `${product.historicalQuantity} units sold historically; recent 30-day units below the prior 30-day period.`,
      predictedResult: `Estimated ${product.predictedQuantity ?? 0} units over ${horizon} days with a decreasing demand trend.`,
      recommendedAction: "Review price, placement and promotion before placing another purchase order.",
      reason: "A declining trend can tie up cash in slow-moving inventory.",
      priority: "medium",
      generatedAt,
    });
  }

  const slow = descriptive.inventory.slowMoving.slice(0, 5);
  for (const product of slow) {
    if (product.stockQuantity <= 0) continue;
    withStatus({
      key: `excess:${product.id}:${horizon}d`,
      type: "excess_inventory",
      title: `Review excess stock of ${product.name}`,
      relatedTo: `${product.name} (${product.sku}) — ${product.stockQuantity} units on hand`,
      productId: product.id,
      supportingHistoricalData: `No completed sales in the recent 30-day window; ${product.stockQuantity} units remain in stock.`,
      predictedResult: "Demand forecast is unavailable or very low for this product.",
      recommendedAction: "Pause reorders and use a bundle or promotion to reduce held stock.",
      reason: "Stock with no recent demand increases carrying cost and reduces available cash.",
      priority: "low",
      generatedAt,
    });
  }

  const topRevenue = descriptive.products.highestRevenue[0];
  if (topRevenue) {
    withStatus({
      key: `sales-focus:${topRevenue.id}:${horizon}d`,
      type: "sales_focus",
      title: `Protect revenue from ${topRevenue.name}`,
      relatedTo: `${topRevenue.name} (${topRevenue.sku})`,
      productId: topRevenue.id,
      supportingHistoricalData: `Highest product revenue in the period at ${topRevenue.revenue} from ${topRevenue.unitsSold} units.`,
      predictedResult: "This product remains a leading revenue contributor in the historical period.",
      recommendedAction: "Keep this product available and include it in a featured promotion or bundle.",
      reason: "Protecting proven revenue drivers supports overall sales performance.",
      priority: "medium",
      generatedAt,
    });
  }

  if (descriptive.sales.revenueGrowthPercent < 0) {
    withStatus({
      key: `business-growth:${horizon}d`,
      type: "business_improvement",
      title: "Respond to declining revenue",
      relatedTo: "Overall sales revenue",
      productId: null,
      supportingHistoricalData: `Revenue ${descriptive.sales.totalSalesRevenue} versus ${descriptive.sales.previousPeriodRevenue} in the prior period (${descriptive.sales.revenueGrowthPercent}%).`,
      predictedResult: predictive.sales.sufficientData
        ? `Estimated ${predictive.sales.expectedRevenue} over the next ${horizon} days.`
        : "Forecast unavailable due to insufficient history.",
      recommendedAction: "Run a targeted promotion on proven sellers and review stock availability during peak periods.",
      reason: "Revenue is below the previous comparable period.",
      priority: "high",
      generatedAt,
    });
  }

  const suggestedUnits = predictive.inventoryRisk.reduce(
    (sum, product) => sum + Math.max(0, product.suggestedReorderQuantity),
    0,
  );
  const estimatedCost = round2(
    predictive.inventoryRisk.reduce(
      (sum, product) => sum + Math.max(0, product.suggestedReorderQuantity) * product.purchasePrice,
      0,
    ),
  );
  withStatus({
    key: `purchasing-plan:${horizon}d`,
    type: "purchasing_plan",
    title: "Prepare the purchasing plan",
    relatedTo: "Reorder quantities across at-risk products",
    productId: null,
    supportingHistoricalData: `${descriptive.inventory.lowStockCount} low-stock and ${descriptive.inventory.outOfStockCount} out-of-stock products in the current snapshot.`,
    predictedResult: `${predictive.inventoryRisk.length} products flagged with stockout risk; ${suggestedUnits} units suggested for reorder.`,
    recommendedAction: `Review supplier prices and approve a purchase budget of about ${money(estimatedCost)} before placing orders.`,
    reason: "Purchasing should follow calculated demand and stock risk, not guesswork.",
    priority: "medium",
    generatedAt,
  });

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.title.localeCompare(b.title),
  );

  return {
    generatedAt,
    horizonDays: horizon,
    recommendations,
    purchasingSummary: {
      suggestedUnits,
      estimatedCost: money(estimatedCost),
      basis: "Sum of suggested reorder quantities × product purchase price; an estimate only.",
    },
    requiresHumanApproval: true,
  };
}

interface Bundle {
  generatedAt: string;
  range: { from: string; to: string };
  descriptive: ReturnType<typeof buildDescriptive>;
  predictive: ReturnType<typeof buildPredictive>;
  prescriptive: Awaited<ReturnType<typeof buildPrescriptive>>;
  context: AnalyticsContext;
}

async function buildBundle(input: BAFilters, horizonDays = 30): Promise<Bundle> {
  const ctx = await buildContext(input);
  const descriptive = buildDescriptive(ctx);
  const predictive = buildPredictive(ctx, horizonDays);
  const prescriptive = await buildPrescriptive(ctx, predictive, descriptive);
  return {
    generatedAt: ctx.generatedAt,
    range: { from: dateOnly(ctx.range.from), to: dateOnly(ctx.range.to) },
    descriptive,
    predictive,
    prescriptive,
    context: ctx,
  };
}

export async function getDatasetCounts() {
  const result = await rows<Record<string, unknown>>(sql`
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
      (SELECT min(created_at) FROM sales) AS first_sale_at,
      (SELECT max(created_at) FROM sales) AS last_sale_at
  `);
  const row = result[0] ?? {};
  const definitions = [
    { name: "Products", table: "products", count: Number(row.products ?? 0), distinct: Number(row.distinct_product_skus ?? 0) },
    { name: "Customers", table: "customers", count: Number(row.customers ?? 0), distinct: Number(row.distinct_customer_emails ?? 0) },
    { name: "Sales", table: "sales", count: Number(row.sales ?? 0), distinct: Number(row.distinct_transaction_numbers ?? 0) },
    { name: "Sale Items", table: "sale_items", count: Number(row.sale_items ?? 0), distinct: Number(row.sale_items ?? 0) },
    { name: "Inventory Movements", table: "inventory_movements", count: Number(row.inventory_movements ?? 0), distinct: Number(row.inventory_movements ?? 0) },
  ];
  return {
    generatedAt: new Date().toISOString(),
    minimumRequired: 50,
    datasets: definitions.map((dataset) => ({
      ...dataset,
      meetsMinimum: dataset.count >= 50,
      status: dataset.count >= 50 ? "PASS" : "FAIL",
    })),
    integrity: {
      completedSales: Number(row.completed_sales ?? 0),
      cancelledSales: Number(row.cancelled_sales ?? 0),
      firstSaleAt: row.first_sale_at ?? null,
      lastSaleAt: row.last_sale_at ?? null,
    },
    note: "Counts are read directly from the configured database on every request.",
  };
}

export async function getDescriptiveAnalytics(role: Role, input: BAFilters) {
  assertAdmin(role, "Descriptive analytics");
  const bundle = await buildBundle(input);
  return {
    generatedAt: bundle.generatedAt,
    range: bundle.range,
    historicalDays: bundle.descriptive.historicalDays,
    sales: bundle.descriptive.sales,
    products: bundle.descriptive.products,
    customers: bundle.descriptive.customers,
    inventory: bundle.descriptive.inventory,
    financial: bundle.descriptive.financial,
  };
}

export async function getPredictiveAnalytics(
  role: Role,
  input: BAFilters & { horizon?: string | number },
) {
  assertAdmin(role, "Predictive analytics");
  const horizon = Number(input.horizon ?? 30);
  const bundle = await buildBundle(input, horizon);
  return {
    generatedAt: bundle.generatedAt,
    range: bundle.range,
    methodology: bundle.predictive.methodology,
    historicalPeriod: bundle.predictive.historicalPeriod,
    historicalDays: bundle.predictive.historicalDays,
    activeSellingDays: bundle.predictive.activeSellingDays,
    horizonDays: bundle.predictive.horizonDays,
    sales: bundle.predictive.sales,
    productDemand: bundle.predictive.productDemand,
    inventoryRisk: bundle.predictive.inventoryRisk,
    limitations: bundle.predictive.limitations,
  };
}

export async function getPrescriptiveAnalytics(role: Role, input: BAFilters & { horizon?: string | number }) {
  assertAdmin(role, "Prescriptive analytics");
  const bundle = await buildBundle(input, Number(input.horizon ?? 30));
  return {
    generatedAt: bundle.generatedAt,
    range: bundle.range,
    horizonDays: bundle.prescriptive.horizonDays,
    recommendations: bundle.prescriptive.recommendations,
    purchasingSummary: bundle.prescriptive.purchasingSummary,
    requiresHumanApproval: bundle.prescriptive.requiresHumanApproval,
    basis: {
      descriptiveRange: bundle.range,
      forecastPeriod: `${bundle.predictive.horizonDays} days`,
      note: "Every recommendation references a computed historical figure and forecast produced in the same calculation pass.",
    },
  };
}

export async function getBusinessWorkflow(role: Role, input: BAFilters & { horizon?: string | number }) {
  assertAdmin(role, "Business Analytics workflow");
  const bundle = await buildBundle(input, Number(input.horizon ?? 30));
  const { descriptive, predictive, prescriptive, context } = bundle;

  const focus = input.productId
    ? predictive.productDemand.ranking.find((product) => product.id === input.productId)
    : prescriptive.recommendations.find((rec) => rec.productId)?.productId
      ? predictive.productDemand.ranking.find(
          (product) => product.id === prescriptive.recommendations.find((rec) => rec.productId)?.productId,
        )
      : predictive.productDemand.ranking[0];

  if (!focus || !focus.sufficientData) {
    return {
      generatedAt: bundle.generatedAt,
      range: bundle.range,
      sufficientData: false,
      message: "Not enough historical product data to demonstrate a connected workflow.",
      steps: [],
      availableProducts: [],
    };
  }

  const recommendation = prescriptive.recommendations.find((rec) => rec.productId === focus.id);
  const historical = descriptive.products.rankings.find((row) => row.id === focus.id);

  return {
    generatedAt: bundle.generatedAt,
    range: bundle.range,
    sufficientData: true,
    forecastPeriodDays: predictive.horizonDays,
    focusProduct: {
      id: focus.id,
      name: focus.name,
      sku: focus.sku,
      category: focus.category,
      currentStock: focus.currentStock,
    },
    availableProducts: predictive.productDemand.ranking.slice(0, 10).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      predictedQuantity: product.predictedQuantity,
      stockoutRisk: product.stockoutRisk,
    })),
    chain: [
      {
        id: `descriptive:${focus.id}`,
        step: 1,
        stage: "descriptive" as const,
        title: "Descriptive — what happened?",
        question: "Analyze historical business data.",
        finding: {
          product: focus.name,
          unitsSold: focus.historicalQuantity,
          revenue: money(focus.historicalRevenue),
          rankByUnits: historical?.rank ?? null,
          historicalPeriod: bundle.range,
          currentStock: focus.currentStock,
          sourceTable: "sales + sale_items + products",
        },
        outputToNextStep: `Historical quantity (${focus.historicalQuantity} units) and demand rate feed the forecast model.`,
      },
      {
        id: `predictive:${focus.id}`,
        step: 2,
        stage: "predictive" as const,
        title: "Predictive — what is likely to happen?",
        question: "Use historical sales to estimate future demand.",
        finding: {
          product: focus.name,
          predictedQuantity: focus.predictedQuantity,
          expectedDemandTrend: focus.expectedDemandTrend,
          averageDailyDemand: focus.averageDailyDemand,
          daysUntilDepletion: focus.daysUntilDepletion,
          stockoutRisk: focus.stockoutRisk,
          forecastPeriodDays: predictive.horizonDays,
          salesForecastMethod: predictive.sales.method,
          forecastPeriod: predictive.historicalPeriod,
          estimated: true,
        },
        inputFromPreviousStep: `Historical quantity (${focus.historicalQuantity} units) from step 1.`,
        outputToNextStep: `Predicted demand (${focus.predictedQuantity ?? 0} units) and stockout risk feed the recommendation.`,
      },
      {
        id: `prescriptive:${focus.id}`,
        step: 3,
        stage: "prescriptive" as const,
        title: "Prescriptive — what should we do?",
        question: "Use the forecast and current inventory to recommend an action.",
        finding: recommendation
          ? {
              title: recommendation.title,
              recommendedAction: recommendation.recommendedAction,
              reason: recommendation.reason,
              priority: recommendation.priority,
              status: recommendation.status,
              supportingHistoricalData: recommendation.supportingHistoricalData,
              predictedResult: recommendation.predictedResult,
              requiresHumanApproval: true,
            }
          : null,
        inputFromPreviousStep: `Predicted demand (${focus.predictedQuantity ?? 0} units) and stock (${focus.currentStock} units) from step 2.`,
        note: recommendation
          ? null
          : "No action recommendation was generated for this product in the selected period.",
      },
    ],
    contextSummary: {
      totalRevenue: descriptive.sales.totalSalesRevenue,
      totalTransactions: descriptive.sales.totalTransactions,
      totalProducts: descriptive.products.totalProducts,
      totalCustomers: descriptive.customers.totalCustomers,
      historicalSnapshotRows: {
        sales: context.daily.filter((day) => day.transactions > 0).length,
        productRows: context.products.length,
      },
    },
  };
}

export async function setRecommendationStatus(
  role: Role,
  key: string,
  status: RecommendationStatus,
  note: string | undefined,
  userId: string,
  request?: Parameters<typeof recordAudit>[0]["request"],
) {
  assertAdmin(role, "Recommendation decisions");
  if (!key || key.length > 200) throw ApiError.badRequest("Invalid recommendation key.");

  const [updated] = await db
    .insert(baRecommendationStatuses)
    .values({
      key,
      status,
      note: note ?? null,
      decidedBy: userId,
      decidedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: baRecommendationStatuses.key,
      set: {
        status,
        note: note ?? null,
        decidedBy: userId,
        decidedAt: new Date(),
      },
    })
    .returning({
      key: baRecommendationStatuses.key,
      status: baRecommendationStatuses.status,
      note: baRecommendationStatuses.note,
      decidedAt: baRecommendationStatuses.decidedAt,
    });

  void recordAudit({
    userId,
    action: AUDIT_ACTIONS.BA_RECOMMENDATION_STATUS,
    entityType: "ba_recommendation",
    entityId: key,
    details: { status, note: note ?? null },
    request,
  });

  return {
    ...updated,
    decidedAt: updated?.decidedAt instanceof Date ? updated.decidedAt.toISOString() : updated?.decidedAt,
    message: "Decision recorded. Inventory and purchasing records were not changed.",
  };
}

/** Used by the AI context builder so it reuses the same computed analytics. */
export async function getBABundleForAI(input: BAFilters = {}) {
  const bundle = await buildBundle({ days: 30, ...input }, 30);
  return {
    generatedAt: bundle.generatedAt,
    range: bundle.range,
    descriptive: bundle.descriptive,
    predictive: bundle.predictive,
    prescriptive: bundle.prescriptive,
  };
}
