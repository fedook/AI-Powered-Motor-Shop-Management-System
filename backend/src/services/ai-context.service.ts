import type { Role } from "../config/constants";
import { getDashboard, getProductAnalytics, getSalesAnalytics } from "./analytics.service";
import { getSlowMovingProducts } from "./inventory.service";
import { getBABundleForAI } from "./ba.service";

export type InsightsFocus = "general" | "sales" | "inventory" | "profitability";

export type DataScope = "business" | "operational";

export interface BusinessAlert {
  severity: "info" | "warning" | "critical";
  area: "sales" | "inventory" | "customers" | "profitability" | "operations";
  message: string;
  figures?: Record<string, number | string>;
}

export type MetricTone = "neutral" | "info" | "positive" | "warning" | "critical";
export type MetricFormat = "currency" | "number";

export interface ResponseMetric {
  key: string;
  label: string;
  value: number;
  format: MetricFormat;
  tone: MetricTone;
  /** Short descriptive label shown with the value (never colour alone). */
  status: string;
}

export interface ResponseMetrics {
  scope: "last30days";
  from?: string;
  to?: string;
  generatedAt: string;
  items: ResponseMetric[];
}

export interface BusinessContext {
  generatedAt: string;
  role: Role;
  /** Tells history/navigation which data class this answer belongs to. */
  dataScope: DataScope;
  facts: Record<string, unknown>;
  alerts: BusinessAlert[];
  metrics: ResponseMetrics;
}

/**
 * Derives compact, display-ready metrics from the verified snapshot. The staff
 * variant deliberately contains no revenue, profit, cost or margin metrics.
 */
export function buildResponseMetrics(
  facts: Record<string, unknown>,
  role: Role,
  generatedAt: string,
): ResponseMetrics {
  const last30 = (facts.last30Days ?? {}) as Record<string, unknown>;
  const inventory = (facts.inventory ?? {}) as Record<string, unknown>;
  const operations = (facts.operations ?? {}) as Record<string, unknown>;

  const toNumber = (value: unknown): number => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const lowStock = toNumber(inventory.lowStockCount);
  const outOfStock = toNumber(inventory.outOfStockCount);
  const items: ResponseMetric[] = [];

  if (role === "admin") {
    const revenue = toNumber(last30.revenue);
    const change = toNumber(last30.revenueChangePercentVsPrevious30Days);
    items.push({
      key: "revenue30d",
      label: "Revenue · 30 days",
      value: revenue,
      format: "currency",
      tone: change < 0 ? "warning" : change > 0 ? "positive" : "neutral",
      status:
        change < 0
          ? `Down ${Math.abs(change)}% vs prior 30 days`
          : change > 0
            ? `Up ${change}% vs prior 30 days`
            : "Flat vs prior 30 days",
    });

    if (last30.grossProfit !== undefined) {
      items.push({
        key: "grossProfit30d",
        label: "Gross profit · 30 days",
        value: toNumber(last30.grossProfit),
        format: "currency",
        tone: "positive",
        status: "Admin-only margin view",
      });
    }

    items.push(
      {
        key: "transactions30d",
        label: "Transactions · 30 days",
        value: toNumber(last30.transactions),
        format: "number",
        tone: "info",
        status: "Completed sales",
      },
      {
        key: "unitsSold30d",
        label: "Units sold · 30 days",
        value: toNumber(last30.unitsSold),
        format: "number",
        tone: "info",
        status: "Across all products",
      },
    );
  } else {
    items.push(
      {
        key: "skuCount",
        label: "Products tracked",
        value: toNumber(inventory.skuCount),
        format: "number",
        tone: "info",
        status: "Active SKUs",
      },
      {
        key: "unitsOnHand",
        label: "Units on hand",
        value: toNumber(inventory.unitsOnHand),
        format: "number",
        tone: "neutral",
        status: "Total stock units",
      },
    );
  }

  items.push(
    {
      key: "lowStock",
      label: "Low-stock products",
      value: lowStock,
      format: "number",
      tone: lowStock > 0 ? "warning" : "positive",
      status: lowStock > 0 ? "At or below minimum — restock" : "All above minimum",
    },
    {
      key: "outOfStock",
      label: "Out-of-stock products",
      value: outOfStock,
      format: "number",
      tone: outOfStock > 0 ? "critical" : "positive",
      status: outOfStock > 0 ? "Unavailable — act now" : "None reported",
    },
  );

  if (role === "staff") {
    items.push({
      key: "mySalesToday",
      label: "Your sales today",
      value: toNumber(operations.mySalesToday),
      format: "number",
      tone: "info",
      status: "Transactions you processed",
    });
  }

  return {
    scope: "last30days",
    ...(typeof last30.from === "string" ? { from: last30.from } : {}),
    ...(typeof last30.to === "string" ? { to: last30.to } : {}),
    generatedAt,
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Administrator context: business-wide aggregates including financials */
/* ------------------------------------------------------------------ */

export async function buildAdminBusinessContext(): Promise<BusinessContext> {
  const [dashboard, sales, products, ba] = await Promise.all([
    getDashboard("admin"),
    getSalesAnalytics("admin", { days: 30, groupBy: "day" }),
    getProductAnalytics("admin", { limit: 5 }),
    getBABundleForAI(),
  ]);

  const cogs = Number((sales.summary.revenue - (sales.profit ?? 0)).toFixed(2));

  const last30: Record<string, unknown> = {
    from: sales.range.from,
    to: sales.range.to,
    revenue: sales.summary.revenue,
    transactions: sales.summary.transactions,
    averageSale: sales.summary.averageSale,
    unitsSold: sales.summary.unitsSold,
    revenueChangePercentVsPrevious30Days: sales.summary.revenueChangePercent,
    previousRevenue: sales.summary.previousRevenue,
    paymentMix: sales.paymentMix,
    dailySeries: sales.series.slice(-7),
    grossProfit: sales.profit ?? 0,
    costOfGoodsSold: Number.isFinite(cogs) ? cogs : 0,
  };

  const facts: Record<string, unknown> = {
    dataScope: "business",
    currency: "PHP",
    shop: {
      totalProducts: dashboard.stats.totalProducts,
      totalCustomers: dashboard.stats.totalCustomers,
      lifetimeCompletedSales: dashboard.stats.totalSales ?? 0,
      lifetimeRevenue: dashboard.stats.totalRevenue ?? 0,
      revenueToday: dashboard.stats.revenueToday ?? 0,
      cancelledSales: dashboard.stats.cancelledSales ?? 0,
    },
    last30Days: last30,
    monthlySales: dashboard.monthlySales.slice(-3),
    bestSellers: dashboard.bestSellers.slice(0, 3),
    leastSellers: products.leastSellers.slice(0, 3).map((product) => ({
      name: product.name,
      sku: product.sku,
      unitsSold: product.unitsSold,
      currentStock: product.stockQuantity,
      revenue: product.revenue,
    })),
    inventory: {
      ...dashboard.inventory,
      lowStockProducts: dashboard.lowStockProducts.slice(0, 5).map((product) => ({
        name: product.name,
        sku: product.sku,
        stock: product.stockQuantity,
        minimum: product.minimumStock,
      })),
      outOfStockCount: dashboard.stats.outOfStockCount,
      slowMoving: products.slowMoving.slice(0, 5).map((product) => ({
        name: product.name,
        sku: product.sku,
        stock: product.stockQuantity,
        retailValue: product.retailValue,
      })),
      categoryValuation: products.categoryValuation.slice(0, 4),
    },
    productPerformance: {
      topSellers: products.topSellers.map((product) => ({
        name: product.name,
        sku: product.sku,
        unitsSold: product.unitsSold,
        revenue: product.revenue,
        ...("margin" in product ? { margin: product.margin } : {}),
      })),
      leastSellers: products.leastSellers.slice(0, 3).map((product) => ({
        name: product.name,
        sku: product.sku,
        unitsSold: product.unitsSold,
        revenue: product.revenue,
      })),
      grossProfitLast30Days: products.summary.grossProfit,
    },
    businessAnalytics: {
      note: "Verified analytics computed from database records by the Business Analytics service. Forecasts are estimates, not guarantees.",
      descriptive: {
        range: ba.descriptive.range,
        totalRevenue: ba.descriptive.sales.totalSalesRevenue,
        totalTransactions: ba.descriptive.sales.totalTransactions,
        averageOrderValue: ba.descriptive.sales.averageOrderValue,
        revenueGrowthPercent: ba.descriptive.sales.revenueGrowthPercent,
        bestSelling: ba.descriptive.products.bestSelling.slice(0, 3).map((product) => ({
          name: product.name,
          unitsSold: product.unitsSold,
          revenue: product.revenue,
        })),
        leastSelling: ba.descriptive.products.leastSelling.slice(0, 3).map((product) => ({
          name: product.name,
          unitsSold: product.unitsSold,
        })),
        lowStockCount: ba.descriptive.inventory.lowStockCount,
        outOfStockCount: ba.descriptive.inventory.outOfStockCount,
        grossProfit: ba.descriptive.financial.grossProfit,
        grossProfitMarginPercent: ba.descriptive.financial.grossProfitMarginPercent,
      },
      predictive: {
        range: ba.predictive.historicalPeriod,
        horizonDays: ba.predictive.horizonDays,
        method: ba.predictive.sales.method,
        methodology: ba.predictive.methodology.sales,
        expectedRevenueNextPeriod: ba.predictive.sales.expectedRevenue,
        expectedTransactionsNextPeriod: ba.predictive.sales.expectedTransactions,
        sufficientData: ba.predictive.sales.sufficientData,
        forecastPeriods: ba.predictive.sales.forecastPeriods.map((period) => ({
          horizonDays: period.horizonDays,
          expectedRevenue: period.expectedRevenue,
          supported: period.supported,
          sufficientData: period.sufficientData,
        })),
        productDemand: ba.predictive.productDemand.ranking.slice(0, 5).map((product) => ({
          name: product.name,
          sku: product.sku,
          historicalQuantity: product.historicalQuantity,
          predictedQuantity: product.predictedQuantity,
          expectedDemandTrend: product.expectedDemandTrend,
          sufficientData: product.sufficientData,
        })),
        inventoryRisks: ba.predictive.inventoryRisk.slice(0, 5).map((product) => ({
          name: product.name,
          sku: product.sku,
          currentStock: product.currentStock,
          daysUntilDepletion: product.daysUntilDepletion,
          stockoutRisk: product.stockoutRisk,
        })),
      },
      prescriptive: {
        generatedAt: ba.prescriptive.generatedAt,
        requiresHumanApproval: ba.prescriptive.requiresHumanApproval,
        purchasingSummary: ba.prescriptive.purchasingSummary,
        recommendations: ba.prescriptive.recommendations.slice(0, 5).map((rec) => ({
          title: rec.title,
          relatedTo: rec.relatedTo,
          supportingHistoricalData: rec.supportingHistoricalData,
          predictedResult: rec.predictedResult,
          recommendedAction: rec.recommendedAction,
          reason: rec.reason,
          priority: rec.priority,
          status: rec.status,
        })),
      },
      workflow: [
        "Step 1 (descriptive): historical sales, product and customer figures are measured from completed transactions.",
        "Step 2 (predictive): those historical figures feed statistical forecasts of revenue, product demand and stockout risk.",
        "Step 3 (prescriptive): the forecasts plus current stock produce human-approved purchasing and inventory recommendations.",
      ],
    },
    privacy: {
      note: "Customer personal information is intentionally excluded from this snapshot.",
    },
  };

  const alerts = buildAdminAlerts(dashboard, sales, products, ba);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    role: "admin",
    dataScope: "business",
    facts,
    alerts,
    metrics: buildResponseMetrics(facts, "admin", generatedAt),
  };
}

function buildAdminAlerts(
  dashboard: Awaited<ReturnType<typeof getDashboard>>,
  sales: Awaited<ReturnType<typeof getSalesAnalytics>>,
  products: Awaited<ReturnType<typeof getProductAnalytics>>,
  ba: Awaited<ReturnType<typeof getBABundleForAI>>,
): BusinessAlert[] {
  const alerts: BusinessAlert[] = [];

  if (dashboard.stats.outOfStockCount > 0) {
    alerts.push({
      severity: "critical",
      area: "inventory",
      message: `${dashboard.stats.outOfStockCount} product(s) are out of stock.`,
      figures: { outOfStock: dashboard.stats.outOfStockCount },
    });
  }
  if (dashboard.stats.lowStockCount > 0) {
    alerts.push({
      severity: "warning",
      area: "inventory",
      message: `${dashboard.stats.lowStockCount} product(s) are at or below their minimum stock level.`,
      figures: {
        lowStock: dashboard.stats.lowStockCount,
        outOfStock: dashboard.stats.outOfStockCount,
      },
    });
  }
  if (products.slowMoving.length > 0) {
    alerts.push({
      severity: "info",
      area: "inventory",
      message: `${products.slowMoving.length} stocked product(s) have had no sales in the last 30 days.`,
      figures: { slowMoving: products.slowMoving.length },
    });
  }
  if (sales.summary.revenueChangePercent < 0) {
    alerts.push({
      severity: "warning",
      area: "sales",
      message: `Revenue is down ${Math.abs(sales.summary.revenueChangePercent)}% versus the previous 30-day period.`,
      figures: {
        changePercent: sales.summary.revenueChangePercent,
        previousRevenue: sales.summary.previousRevenue,
        currentRevenue: sales.summary.revenue,
      },
    });
  } else if (sales.summary.revenueChangePercent > 0) {
    alerts.push({
      severity: "info",
      area: "sales",
      message: `Revenue is up ${sales.summary.revenueChangePercent}% versus the previous 30-day period.`,
      figures: {
        changePercent: sales.summary.revenueChangePercent,
        currentRevenue: sales.summary.revenue,
      },
    });
  }
  if (dashboard.bestSellers[0]) {
    alerts.push({
      severity: "info",
      area: "sales",
      message: `${dashboard.bestSellers[0].name} is the top seller with ${dashboard.bestSellers[0].unitsSold} unit(s) sold.`,
      figures: { unitsSold: dashboard.bestSellers[0].unitsSold },
    });
  }
  if (sales.profit !== undefined) {
    alerts.push({
      severity: "info",
      area: "profitability",
      message: `Gross profit for the last 30 days is PHP ${sales.profit.toFixed(2)} (revenue PHP ${sales.summary.revenue.toFixed(2)}, estimated COGS PHP ${(sales.summary.revenue - sales.profit).toFixed(2)}).`,
      figures: {
        grossProfit30d: sales.profit,
        revenue30d: sales.summary.revenue,
        cogs30d: Number((sales.summary.revenue - sales.profit).toFixed(2)),
      },
    });
  }

  const criticalRisks = ba.predictive.inventoryRisk.filter((risk) => risk.stockoutRisk === "critical");
  if (criticalRisks.length > 0) {
    alerts.push({
      severity: "critical",
      area: "inventory",
      message: `${criticalRisks.length} product(s) have a critical predicted stockout risk: ${criticalRisks
        .slice(0, 3)
        .map((risk) => risk.name)
        .join(", ")}.`,
      figures: { criticalStockoutRisks: criticalRisks.length },
    });
  }
  if (ba.prescriptive.recommendations.length > 0) {
    alerts.push({
      severity: "info",
      area: "operations",
      message: `${ba.prescriptive.recommendations.length} business analytics recommendation(s) are available for administrator review; none are executed automatically.`,
      figures: { recommendations: ba.prescriptive.recommendations.length },
    });
  }

  return alerts;
}

/* ------------------------------------------------------------------ */
/* Staff context: operational only. No revenue, profit, cost or margins. */
/* ------------------------------------------------------------------ */

export async function buildStaffOperationalContext(userId: string): Promise<BusinessContext> {
  const [dashboard, slowMoving] = await Promise.all([
    getDashboard("staff", userId),
    getSlowMovingProducts(5),
  ]);

  const inventory = dashboard.inventory;
  const stats = dashboard.stats;

  const facts: Record<string, unknown> = {
    dataScope: "operational",
    currency: "PHP",
    shop: {
      totalProducts: stats.totalProducts,
      totalCustomers: stats.totalCustomers,
      cancelledSales: stats.cancelledSales ?? 0,
    },
    inventory: {
      skuCount: inventory.skuCount,
      unitsOnHand: inventory.unitsOnHand,
      lowStockCount: inventory.lowStockCount,
      outOfStockCount: inventory.outOfStockCount,
      lowStockProducts: dashboard.lowStockProducts.slice(0, 5).map((product) => ({
        name: product.name,
        sku: product.sku,
        stock: product.stockQuantity,
        minimum: product.minimumStock,
        category: product.categoryName,
      })),
      outOfStockProducts: dashboard.lowStockProducts
        .filter((product) => product.stockQuantity === 0)
        .slice(0, 5)
        .map((product) => ({
          name: product.name,
          sku: product.sku,
          minimum: product.minimumStock,
          category: product.categoryName,
        })),
      slowMoving: slowMoving.map((product) => ({
        name: product.name,
        sku: product.sku,
        stock: product.stockQuantity,
        minimum: product.minimumStock,
      })),
      categoryStockMix: dashboard.categoryMix.slice(0, 6).map((row) => ({
        category: row.category,
        units: row.units,
      })),
    },
    productDemand: {
      note: "Unit demand only. Monetary figures are intentionally excluded for staff accounts.",
      bestSellers: dashboard.bestSellers.slice(0, 5).map((product) => ({
        name: product.name,
        sku: product.sku,
        unitsSold: product.unitsSold,
      })),
    },
    operations: {
      mySalesTotal: stats.mySalesTotal ?? 0,
      mySalesToday: stats.mySalesToday ?? 0,
    },
    privacy: {
      note: "Revenue, profit, cost, margin and financial history are restricted to administrators and are not part of this snapshot.",
    },
  };

  const alerts = buildStaffAlerts(stats, slowMoving.length, stats.mySalesToday ?? 0);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    role: "staff",
    dataScope: "operational",
    facts,
    alerts,
    metrics: buildResponseMetrics(facts, "staff", generatedAt),
  };
}

function buildStaffAlerts(
  stats: Awaited<ReturnType<typeof getDashboard>>["stats"],
  slowMovingCount: number,
  mySalesToday: number,
): BusinessAlert[] {
  const alerts: BusinessAlert[] = [];

  if (stats.outOfStockCount > 0) {
    alerts.push({
      severity: "critical",
      area: "inventory",
      message: `${stats.outOfStockCount} product(s) are out of stock.`,
      figures: { outOfStock: stats.outOfStockCount },
    });
  }
  if (stats.lowStockCount > 0) {
    alerts.push({
      severity: "warning",
      area: "inventory",
      message: `${stats.lowStockCount} product(s) are at or below their minimum stock level.`,
      figures: { lowStock: stats.lowStockCount, outOfStock: stats.outOfStockCount },
    });
  }
  if (slowMovingCount > 0) {
    alerts.push({
      severity: "info",
      area: "inventory",
      message: `${slowMovingCount} stocked product(s) have had no sales in the last 30 days.`,
      figures: { slowMoving: slowMovingCount },
    });
  }
  if (mySalesToday > 0) {
    alerts.push({
      severity: "info",
      area: "operations",
      message: `You have processed ${mySalesToday} sale(s) today.`,
      figures: { mySalesToday },
    });
  }

  return alerts;
}

/** Role-aware entry point used by the AI service. */
export async function buildBusinessContext(
  role: Role,
  userId?: string,
): Promise<BusinessContext> {
  if (role === "admin") return buildAdminBusinessContext();
  if (!userId) throw new Error("A user id is required to build the staff AI context.");
  return buildStaffOperationalContext(userId);
}

function fmtPhp(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "PHP 0.00";
  return `PHP ${n.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* Deterministic fallbacks                                             */
/* ------------------------------------------------------------------ */

/** Rules-based recommendations used when Groq is unavailable. */
export function buildFallbackRecommendations(
  context: BusinessContext,
  focus: InsightsFocus = "general",
): string[] {
  return context.role === "admin"
    ? buildAdminRecommendations(context, focus)
    : buildStaffRecommendations(context, focus);
}

function buildAdminRecommendations(context: BusinessContext, focus: InsightsFocus): string[] {
  const facts = context.facts as any;
  const last30 = facts.last30Days ?? {};
  const inventory = facts.inventory ?? {};
  const perf = facts.productPerformance ?? {};
  const top = perf.topSellers?.[0];
  const least = perf.leastSellers?.[0];
  const lowStock = Number(inventory.lowStockCount ?? inventory.lowStockProducts?.length ?? 0);
  const outOfStock = Number(inventory.outOfStockCount ?? 0);
  const slowMovingCount = Array.isArray(inventory.slowMoving) ? inventory.slowMoving.length : 0;
  const revChange = Number(last30.revenueChangePercentVsPrevious30Days ?? 0);
  const revenue = last30.revenue;
  const txns = last30.transactions;
  const avg = last30.averageSale;

  const recommendations: string[] = [];

  const salesRecs = () => {
    if (top) {
      recommendations.push(
        `Prioritize top seller "${top.name}" (SKU ${top.sku}, ${top.unitsSold} units, ${fmtPhp(top.revenue)} revenue in 30 days). Action: keep it in stock and feature it in promotions. Supporting figures: 30-day revenue ${fmtPhp(revenue)}, ${txns ?? 0} transactions, avg sale ${fmtPhp(avg)}. Expected benefit: protect proven revenue drivers.`,
      );
    }
    if (Number.isFinite(revChange)) {
      recommendations.push(
        `Respond to sales trend (${revChange}% vs previous 30 days, current revenue ${fmtPhp(revenue)}, previous ${fmtPhp(last30.previousRevenue)}). Action: ${revChange < 0 ? "run targeted bundles/promotions and review availability during peak hours" : "sustain momentum by maintaining stock of best sellers and upselling accessories"}. Expected benefit: stabilize or grow monthly sales.`,
      );
    }
    if (least) {
      recommendations.push(
        `Review low performer "${least.name}" (SKU ${least.sku}, ${least.unitsSold} units, ${fmtPhp(least.revenue)} in 30 days). Action: adjust pricing, bundle with fast movers, or limit reorders. Expected benefit: reduce stagnant inventory and improve turnover.`,
      );
    }
  };

  const inventoryRecs = () => {
    if (outOfStock > 0 || lowStock > 0) {
      recommendations.push(
        `Restock priority items now (${outOfStock} out of stock, ${lowStock} low/at minimum). Action: reorder based on recent sales velocity and minimum stock levels; verify supplier lead times. Supporting figures: inventory retail value ${fmtPhp(inventory.retailValue)}, stock units ${inventory.stockUnits ?? inventory.unitsOnHand ?? 0}. Expected benefit: avoid missed sales and stockouts.`,
      );
    }
    if (slowMovingCount > 0) {
      recommendations.push(
        `Reduce slow-moving inventory (${slowMovingCount} stocked item(s) with no sales in 30 days). Action: create clearance bundles or promotions instead of reordering. Expected benefit: free cash and shelf space for faster-moving products.`,
      );
    }
    if (Array.isArray(inventory.lowStockProducts) && inventory.lowStockProducts[0]) {
      const p = inventory.lowStockProducts[0];
      recommendations.push(
        `Monitor "${p.name}" (SKU ${p.sku}, stock ${p.stock}, minimum ${p.minimum}). Action: set a reorder point above minimum based on demand. Expected benefit: fewer emergency restocks.`,
      );
    }
  };

  const profitabilityRecs = () => {
    if (last30.grossProfit !== undefined) {
      recommendations.push(
        `Protect margin (30-day gross profit ${fmtPhp(last30.grossProfit)} on revenue ${fmtPhp(revenue)}). Action: review pricing/costs on high-revenue items and focus promotions on healthy-margin products. Supporting figures: top seller ${top ? `"${top.name}" ${fmtPhp(top.revenue)}${top.margin !== undefined ? `, margin ${fmtPhp(top.margin)}` : ""}` : "n/a"}. Expected benefit: improved profitability without relying on volume alone.`,
      );
    } else {
      recommendations.push(
        `Profitability details are limited for this snapshot. Action: review cost, margin, and gross profit reports before changing prices. Supporting figures: 30-day revenue ${fmtPhp(revenue)}. Expected benefit: decisions based on complete margin data.`,
      );
    }
    if (slowMovingCount > 0) {
      recommendations.push(
        `Limit capital tied in slow-moving stock (${slowMovingCount} item(s), retail value signals in snapshot). Action: discount or bundle slow movers. Expected benefit: recover cash and reduce carrying cost.`,
      );
    }
  };

  if (focus === "sales") salesRecs();
  else if (focus === "inventory") inventoryRecs();
  else if (focus === "profitability") profitabilityRecs();
  else {
    salesRecs();
    inventoryRecs();
  }

  const deduped = Array.from(new Set(recommendations)).slice(0, 5);
  if (deduped.length < 3) {
    deduped.push(
      `Maintain baseline operations. Action: review weekly sales and stock levels, and verify changes against live reports. Supporting figures: revenue today ${fmtPhp(facts.shop?.revenueToday)}, lifetime revenue ${fmtPhp(facts.shop?.lifetimeRevenue)}. Expected benefit: steady, data-driven decisions.`,
    );
  }

  deduped.push(
    "Limitations: This is a deterministic fallback (not a Groq-generated analysis). It uses verified snapshot aggregates only; confirm details in Sales/Inventory reports before acting. Insufficient or missing data is noted where applicable.",
  );

  return deduped.slice(0, 6);
}

function buildStaffRecommendations(context: BusinessContext, focus: InsightsFocus): string[] {
  const facts = context.facts as any;
  const inventory = facts.inventory ?? {};
  const demand = facts.productDemand ?? {};
  const operations = facts.operations ?? {};
  const top = demand.bestSellers?.[0];
  const low = Array.isArray(inventory.lowStockProducts) ? inventory.lowStockProducts : [];
  const out = Array.isArray(inventory.outOfStockProducts) ? inventory.outOfStockProducts : [];
  const slow = Array.isArray(inventory.slowMoving) ? inventory.slowMoving : [];
  const lowStock = Number(inventory.lowStockCount ?? low.length);
  const outOfStock = Number(inventory.outOfStockCount ?? out.length);

  const recommendations: string[] = [];

  if (focus === "profitability") {
    recommendations.push(
      "Profitability analysis is restricted to administrators. Operational action: keep fast-moving items in stock, record sales accurately, and escalate pricing or cost questions to an administrator.",
    );
  }

  if (outOfStock > 0 || lowStock > 0) {
    recommendations.push(
      `Restock priority items now (${outOfStock} out of stock, ${lowStock} low/at minimum). Action: check the low-stock list, confirm supplier lead times, and report urgent shortages to an administrator. Supporting figures: ${inventory.unitsOnHand ?? 0} total units on hand across ${inventory.skuCount ?? 0} products. Expected benefit: avoid missed sales and keep the counter stocked.`,
    );
  }

  if (low[0]) {
    const p = low[0];
    recommendations.push(
      `Monitor "${p.name}" (SKU ${p.sku}, stock ${p.stock}, minimum ${p.minimum}). Action: set a reorder reminder above the minimum and tallies physical stock before peak hours. Expected benefit: fewer emergency stockouts during selling hours.`,
    );
  }

  if (slow.length > 0) {
    recommendations.push(
      `Review slow-moving stock (${slow.length} item(s) with no sales in 30 days). Action: place them in a visible counter display or suggest them to customers; ask an administrator before discounting. Expected benefit: better shelf turnover.`,
    );
  }

  if (focus === "sales" || focus === "general") {
    if (top) {
      recommendations.push(
        `Keep the top unit seller "${top.name}" (SKU ${top.sku}, ${top.unitsSold} unit(s) sold in 30 days) available on the floor. Action: check stock before each shift and restock the display first. Expected benefit: protect the most requested product.`,
      );
    }
    recommendations.push(
      `Maintain accurate POS habits. Action: record every sale and customer correctly; you have processed ${operations.mySalesToday ?? 0} sale(s) today. Expected benefit: reliable stock counts and clean handover.`,
    );
  }

  if (focus === "inventory" && recommendations.length === 0) {
    recommendations.push(
      `Inventory looks healthy in the snapshot (${lowStock} low and ${outOfStock} out of stock). Action: continue periodic stock checks and report discrepancies. Expected benefit: steady availability.`,
    );
  }

  const deduped = Array.from(new Set(recommendations)).slice(0, 5);
  if (deduped.length < 3) {
    deduped.push(
      "Baseline operational action: review low-stock and out-of-stock items at the start of each shift, keep selling prices visible, and route financial questions to an administrator.",
    );
  }

  deduped.push(
    "Limitations: This is a deterministic fallback based on operational stock data only. Revenue, profit, cost, margin and financial history are not available to staff accounts.",
  );

  return deduped.slice(0, 6);
}

export function buildFallbackChatAnswer(context: BusinessContext, question: string): string {
  return context.role === "admin"
    ? buildAdminFallbackChatAnswer(context, question)
    : buildStaffFallbackChatAnswer(context, question);
}

function buildAdminFallbackChatAnswer(context: BusinessContext, question: string): string {
  const q = question.toLowerCase();
  const facts = context.facts as any;
  const shop = facts.shop ?? {};
  const last30 = facts.last30Days ?? {};
  const inventory = facts.inventory ?? {};
  const perf = facts.productPerformance ?? {};
  const best = facts.bestSellers?.[0] ?? perf.topSellers?.[0];
  const least = facts.leastSellers?.[0] ?? perf.leastSellers?.[0];
  const low = Array.isArray(inventory.lowStockProducts) ? inventory.lowStockProducts : [];
  const slow = Array.isArray(inventory.slowMoving) ? inventory.slowMoving : [];
  const outOfStock = Number(inventory.outOfStockCount ?? 0);

  const lines: string[] = [];
  lines.push(
    "Fallback response (Groq unavailable): answering from verified database aggregates only. No figures are invented.",
  );

  const ba = (facts.businessAnalytics ?? {}) as any;
  const baDescriptive = ba.descriptive ?? {};
  const baPredictive = ba.predictive ?? {};
  const baPrescriptive = ba.prescriptive ?? {};

  if (/explain.*descriptive|descriptive analytics|what happened/.test(q)) {
    lines.push(
      "Descriptive analytics measures what already happened using completed sales, product, customer and inventory records (no estimates).",
    );
    lines.push(
      `Verified 30-day snapshot: ${fmtPhp(baDescriptive.totalRevenue)} revenue from ${baDescriptive.totalTransactions ?? 0} transactions; average order value ${fmtPhp(baDescriptive.averageOrderValue)}; revenue change ${baDescriptive.revenueGrowthPercent ?? 0}% versus the prior period.`,
    );
    if (Array.isArray(baDescriptive.bestSelling) && baDescriptive.bestSelling[0]) {
      const item = baDescriptive.bestSelling[0];
      lines.push(`Best seller: ${item.name} with ${item.unitsSold} unit(s) and ${fmtPhp(item.revenue)} revenue.`);
    }
    lines.push(
      `Financial view: gross profit ${fmtPhp(baDescriptive.grossProfit)} (margin ${baDescriptive.grossProfitMarginPercent ?? 0}%). Inventory: ${baDescriptive.lowStockCount ?? 0} low-stock and ${baDescriptive.outOfStockCount ?? 0} out-of-stock products.`,
    );
  } else if (
    /explain.*predictive|predictive analytics|predict(ed|ion)?\s+(sales|demand)|next month|forecast|what will sell/.test(
      q,
    )
  ) {
    lines.push(
      "Predictive analytics estimates what is likely to happen by applying statistical methods to verified historical data. These are estimates, not guarantees.",
    );
    lines.push(
      `Method: ${baPredictive.method ?? "unavailable"}. Historical period used: ${baPredictive.range?.from ?? "n/a"} to ${baPredictive.range?.to ?? "n/a"}. Forecast period: ${baPredictive.horizonDays ?? 30} days.`,
    );
    if (baPredictive.sufficientData) {
      lines.push(
        `Estimated ${fmtPhp(baPredictive.expectedRevenueNextPeriod)} revenue and ${baPredictive.expectedTransactionsNextPeriod ?? 0} transactions over the next ${baPredictive.horizonDays ?? 30} days.`,
      );
    } else {
      lines.push("No sales forecast was produced because the historical data is insufficient.");
    }
    if (Array.isArray(baPredictive.productDemand) && baPredictive.productDemand.length > 0) {
      lines.push(
        `Product demand estimates: ${baPredictive.productDemand
          .slice(0, 3)
          .map((item: any) => `${item.name} (${item.historicalQuantity} historical units → ${item.predictedQuantity ?? "n/a"} estimated units, ${item.expectedDemandTrend})`)
          .join("; ")}.`,
      );
    }
    lines.push("Limitation: forecasts assume recent patterns continue and cannot predict sudden changes in demand, pricing or stock availability.");
  } else if (
    /explain.*prescriptive|prescriptive analytics|what should we|recommend|restock|improve the business/.test(
      q,
    )
  ) {
    lines.push(
      "Prescriptive analytics recommends actions by combining measured history with forecasts and current stock. Recommendations require human approval; nothing is executed automatically.",
    );
    const recs = Array.isArray(baPrescriptive.recommendations) ? baPrescriptive.recommendations : [];
    if (recs.length > 0) {
      for (const rec of recs.slice(0, 3)) {
        lines.push(
          `**${rec.priority} priority — ${rec.title}**: ${rec.recommendedAction} Supporting data: ${rec.supportingHistoricalData} Predicted result: ${rec.predictedResult} Reason: ${rec.reason}`,
        );
      }
      lines.push(
        `Purchasing estimate: ${baPrescriptive.purchasingSummary?.suggestedUnits ?? 0} units at about ${fmtPhp(baPrescriptive.purchasingSummary?.estimatedCost)} (estimate only).`,
      );
    } else {
      lines.push("No recommendation is currently available; check the prescriptive dashboard after more sales history is recorded.");
    }
  } else if (/declining|decreasing sales|losing demand/.test(q)) {
    const declining = Array.isArray(baPredictive.productDemand)
      ? baPredictive.productDemand.filter(
          (item: any) => item.expectedDemandTrend === "decreasing" && item.sufficientData,
        )
      : [];
    if (declining.length > 0) {
      lines.push(
        `Products with decreasing demand estimates: ${declining
          .slice(0, 3)
          .map((item: any) => `${item.name} (${item.historicalQuantity} historical units, ${item.predictedQuantity ?? "n/a"} estimated units)`)
          .join("; ")}.`,
      );
    } else {
      lines.push("No product with a sufficiently long history currently shows a decreasing demand trend in the verified snapshot.");
    }
  } else if (/run out|stockout|stock out|out of stock soon/.test(q)) {
    const risks = Array.isArray(baPredictive.inventoryRisks) ? baPredictive.inventoryRisks : [];
    if (risks.length > 0) {
      lines.push(
        `Stockout-risk estimate (from current stock and recent demand): ${risks
          .slice(0, 4)
          .map(
            (item: any) =>
              `${item.name} — ${item.stockoutRisk} risk, ${item.currentStock} units on hand${item.daysUntilDepletion !== null ? `, about ${item.daysUntilDepletion} day(s) of stock left` : ""}`,
          )
          .join("; ")}.`,
      );
    } else {
      lines.push("No product with sufficient demand history is currently flagged for stockout risk in the verified snapshot.");
    }
  } else if (q.includes("best") || q.includes("top sell")) {
    if (best) {
      lines.push(
        `Best-selling product (snapshot): ${best.name}${best.sku ? ` (SKU ${best.sku})` : ""} — ${best.unitsSold ?? 0} unit(s) sold${best.revenue !== undefined ? `, revenue ${fmtPhp(best.revenue)}` : ""}.`,
      );
    } else {
      lines.push("Best-selling product: insufficient data in the current snapshot.");
    }
    if (Array.isArray(facts.bestSellers) && facts.bestSellers.length > 1) {
      const others = facts.bestSellers
        .slice(1, 4)
        .map((p: any) => `${p.name} (${p.unitsSold ?? 0} units)`)
        .join(", ");
      if (others) lines.push(`Other top sellers: ${others}.`);
    }
  } else if (/(low[\s-]*stock|low in stock|restock|out of stock)/.test(q)) {
    lines.push(
      `Inventory status: ${outOfStock} out of stock, ${low.length} low/at-minimum item(s), ${inventory.stockUnits ?? inventory.unitsOnHand ?? 0} total stock units, retail value ${fmtPhp(inventory.retailValue)}.`,
    );
    if (outOfStock > 0 || low.length > 0) {
      const items = low
        .slice(0, 5)
        .map((p: any) => `${p.name} (SKU ${p.sku}, stock ${p.stock}, min ${p.minimum})`)
        .join("; ");
      if (items) lines.push(`Priority restock items: ${items}${low.length > 5 ? " ..." : ""}.`);
      lines.push("Recommendation: reorder based on recent sales velocity and supplier lead times.");
    } else {
      lines.push("No low-stock or out-of-stock products were identified in the snapshot.");
    }
  } else if (
    q.includes("sales") ||
    q.includes("revenue") ||
    q.includes("30 day") ||
    q.includes("month") ||
    q.includes("performance")
  ) {
    lines.push(
      `Last 30 days (${last30.from ?? "n/a"} to ${last30.to ?? "n/a"}): revenue ${fmtPhp(last30.revenue)}, transactions ${last30.transactions ?? 0}, average sale ${fmtPhp(last30.averageSale)}, units sold ${last30.unitsSold ?? 0}, change vs previous 30 days ${Number(last30.revenueChangePercentVsPrevious30Days ?? 0)}% (previous revenue ${fmtPhp(last30.previousRevenue)}).`,
    );
    if (last30.grossProfit !== undefined) {
      lines.push(
        `Profitability (admin-only): gross profit ${fmtPhp(last30.grossProfit)}${last30.costOfGoodsSold !== undefined ? `, estimated COGS ${fmtPhp(last30.costOfGoodsSold)}` : ""}.`,
      );
    }
    lines.push(
      `Today: revenue ${fmtPhp(shop.revenueToday)}. Lifetime completed sales: ${shop.lifetimeCompletedSales ?? 0}, lifetime revenue ${fmtPhp(shop.lifetimeRevenue)}.`,
    );
  } else if (q.includes("slow") || q.includes("moving")) {
    if (slow.length > 0) {
      const items = slow
        .slice(0, 5)
        .map((p: any) => `${p.name} (SKU ${p.sku}, stock ${p.stock}, retail value ${fmtPhp(p.retailValue)})`)
        .join("; ");
      lines.push(`Slow-moving stocked items (no sales in last 30 days, snapshot): ${items}${slow.length > 5 ? " ..." : ""}.`);
      lines.push("Recommendation: consider promotions/bundles instead of reordering these items.");
    } else {
      lines.push("No slow-moving stocked products were identified in the last 30 days snapshot.");
    }
  } else if (q.includes("profit") || q.includes("margin") || q.includes("cogs") || q.includes("cost")) {
    lines.push(
      `Profitability (last 30 days, admin-only): revenue ${fmtPhp(last30.revenue)}, gross profit ${fmtPhp(last30.grossProfit)}${last30.costOfGoodsSold !== undefined ? `, estimated COGS ${fmtPhp(last30.costOfGoodsSold)}` : ""}.`,
    );
    if (perf.topSellers?.[0]?.margin !== undefined) {
      lines.push(`Top seller margin signal: ${perf.topSellers[0].name} margin ${fmtPhp(perf.topSellers[0].margin)} (snapshot).`);
    }
  } else {
    lines.push(
      `Business snapshot summary: 30-day revenue ${fmtPhp(last30.revenue)} (${Number(last30.revenueChangePercentVsPrevious30Days ?? 0)}% vs previous 30 days), transactions ${last30.transactions ?? 0}, avg sale ${fmtPhp(last30.averageSale)}.`,
    );
    if (best) lines.push(`Top seller: ${best.name} (${best.unitsSold ?? 0} units${best.revenue !== undefined ? `, ${fmtPhp(best.revenue)}` : ""}).`);
    if (least) lines.push(`Least seller (snapshot): ${least.name} (${least.unitsSold ?? 0} units).`);
    lines.push(`Inventory: ${outOfStock} out of stock, ${low.length} low/at-minimum, ${slow.length} slow-moving item(s).`);
    if (last30.grossProfit !== undefined) {
      lines.push(
        `Admin profitability: gross profit ${fmtPhp(last30.grossProfit)}${last30.costOfGoodsSold !== undefined ? `, estimated COGS ${fmtPhp(last30.costOfGoodsSold)}` : ""} (last 30 days).`,
      );
    }
    lines.push(
      "You can ask about best-selling products, low stock/restocking, sales performance (last 30 days), slow-moving inventory, or profitability (admin).",
    );
  }

  if (context.alerts.length > 0) {
    lines.push(`Alerts: ${context.alerts.slice(0, 3).map((a) => a.message).join(" | ")}`);
  }
  lines.push(
    `Data as of: ${context.generatedAt}. Limitations: This is a deterministic fallback, not a Groq-generated response; if a specific figure is not in the snapshot, it cannot be provided.`,
  );
  return lines.join("\n\n");
}

function buildStaffFallbackChatAnswer(context: BusinessContext, question: string): string {
  const q = question.toLowerCase();
  const facts = context.facts as any;
  const inventory = facts.inventory ?? {};
  const demand = facts.productDemand ?? {};
  const operations = facts.operations ?? {};
  const best = demand.bestSellers?.[0];
  const low = Array.isArray(inventory.lowStockProducts) ? inventory.lowStockProducts : [];
  const out = Array.isArray(inventory.outOfStockProducts) ? inventory.outOfStockProducts : [];
  const slow = Array.isArray(inventory.slowMoving) ? inventory.slowMoving : [];
  const outOfStock = Number(inventory.outOfStockCount ?? out.length);

  const lines: string[] = [];
  lines.push(
    "Fallback response (Groq unavailable): answering from verified operational data only. No figures are invented.",
  );

  const asksFinancial =
    /revenue|profit|margin|cogs|cost|income|expense|financial|forecast|projection|valuation|how much (money|did we make)|average sale|payment mix/.test(
      q,
    );

  if (asksFinancial) {
    lines.push(
      "Financial information (revenue, profit, cost, margin, valuation, financial analytics and forecasts) is restricted to administrators for staff accounts.",
    );
    lines.push(
      "Available operational help: product details, selling prices, stock levels, low/out-of-stock items, restocking priorities, and POS steps.",
    );
  } else if (/descriptive|predictive|prescriptive|what happened|what should we do/.test(q)) {
    lines.push(
      "Descriptive analytics reports what happened (sales counts, stock levels and product demand). Predictive analytics estimates future demand from that history. Prescriptive analytics turns the forecast and current stock into proposed actions.",
    );
    lines.push(
      "Financial figures, revenue forecasts and strategic purchasing recommendations are restricted to administrators for staff accounts. I can still help with unit-level demand and stock information.",
    );
    if (best) lines.push(`Top unit seller in the operational snapshot: ${best.name} (${best.unitsSold ?? 0} units).`);
    lines.push(`Stock: ${outOfStock} out of stock, ${low.length} low/at-minimum.`);
  } else if (q.includes("best") || q.includes("top sell") || q.includes("popular")) {
    if (best) {
      lines.push(
        `Top unit seller (snapshot): ${best.name}${best.sku ? ` (SKU ${best.sku})` : ""} — ${best.unitsSold ?? 0} unit(s) sold. Monetary figures are not available to staff accounts.`,
      );
    } else {
      lines.push("Top-selling product: insufficient operational data in the current snapshot.");
    }
  } else if (/(low[\s-]*stock|low in stock|restock|out of stock)/.test(q)) {
    lines.push(
      `Inventory status: ${outOfStock} out of stock, ${low.length} low/at-minimum item(s), ${inventory.unitsOnHand ?? 0} total units on hand across ${inventory.skuCount ?? 0} products.`,
    );
    if (outOfStock > 0 || low.length > 0) {
      const items = low
        .slice(0, 5)
        .map((p: any) => `${p.name} (SKU ${p.sku}, stock ${p.stock}, min ${p.minimum})`)
        .join("; ");
      if (items) lines.push(`Priority restock items: ${items}${low.length > 5 ? " ..." : ""}.`);
      lines.push("Recommendation: report urgent shortages to an administrator and reorder based on recent unit demand.");
    } else {
      lines.push("No low-stock or out-of-stock products were identified in the snapshot.");
    }
  } else if (q.includes("slow") || q.includes("moving")) {
    if (slow.length > 0) {
      const items = slow
        .slice(0, 5)
        .map((p: any) => `${p.name} (SKU ${p.sku}, stock ${p.stock})`)
        .join("; ");
      lines.push(`Slow-moving stocked items (no sales in last 30 days, snapshot): ${items}${slow.length > 5 ? " ..." : ""}.`);
      lines.push("Recommendation: give these items more counter visibility; ask an administrator before discounting.");
    } else {
      lines.push("No slow-moving stocked products were identified in the last 30 days snapshot.");
    }
  } else if (q.includes("sales") || q.includes("performance") || q.includes("today")) {
    lines.push(
      `Operational sales view: you have processed ${operations.mySalesToday ?? 0} sale(s) today (${operations.mySalesTotal ?? 0} completed in total). Monetary totals and revenue analytics are not available to staff accounts.`,
    );
    if (best) lines.push(`Top unit seller: ${best.name} (${best.unitsSold ?? 0} units).`);
    lines.push(`Stock: ${outOfStock} out of stock, ${low.length} low/at-minimum, ${inventory.unitsOnHand ?? 0} units on hand.`);
  } else {
    lines.push(
      `Operational snapshot: ${inventory.skuCount ?? 0} products, ${inventory.unitsOnHand ?? 0} units on hand, ${outOfStock} out of stock, ${low.length} low/at-minimum, ${slow.length} slow-moving item(s).`,
    );
    if (best) lines.push(`Top unit seller: ${best.name} (${best.unitsSold ?? 0} units).`);
    lines.push(
      `Your activity: ${operations.mySalesToday ?? 0} sale(s) today, ${operations.mySalesTotal ?? 0} completed in total.`,
    );
    lines.push(
      "You can ask about product details, selling prices, low stock/restocking, slow-moving stock, or your POS activity. Financial analytics are administrator-only.",
    );
  }

  if (context.alerts.length > 0) {
    lines.push(`Alerts: ${context.alerts.slice(0, 3).map((a) => a.message).join(" | ")}`);
  }
  lines.push(
    `Data as of: ${context.generatedAt}. Limitations: This is a deterministic operational fallback, not a Groq-generated response; financial figures are intentionally excluded for staff accounts.`,
  );
  return lines.join("\n\n");
}
