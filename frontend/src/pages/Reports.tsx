import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Lightbulb,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { StatCard } from "../components/ui/StatCard";
import { Badge, statusTone } from "../components/ui/Badge";
import { Select } from "../components/ui/Select";
import { Callout } from "../components/ui/Callout";
import { EmptyState } from "../components/ui/EmptyState";
import { RevenueChart } from "../components/charts/RevenueChart";
import { SimpleBarChart } from "../components/charts/SimpleBarChart";
import { ForecastChart } from "../components/charts/ForecastChart";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import {
  getDatasetCounts,
  getDescriptiveAnalytics,
  getPrescriptiveAnalytics,
  getPredictiveAnalytics,
  listCategories,
  listProducts,
  updateRecommendationStatus,
  type BaFilters,
} from "../services/data.service";
import type {
  BaRecommendation,
  Category,
  DatasetVerification,
  DescriptiveAnalytics,
  PrescriptiveAnalytics,
  PredictiveAnalytics,
  Product,
} from "../types";
import { formatCurrency, formatDate, formatNumber, titleCase } from "../utils/format";
import { downloadCsv } from "../utils/download";

type Horizon = 7 | 30 | 90;

interface Filters {
  days: Horizon;
  groupBy: "day" | "week" | "month";
  productId: string;
  categoryId: string;
}

const DEFAULT_FILTERS: Filters = { days: 30, groupBy: "day", productId: "", categoryId: "" };

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeForDays(days: number): { from: string; to: string } {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function buildParams(filters: Filters): BaFilters & { horizon: Horizon } {
  return {
    ...rangeForDays(filters.days),
    days: filters.days,
    groupBy: filters.groupBy,
    productId: filters.productId || undefined,
    categoryId: filters.categoryId || undefined,
    horizon: filters.days,
  };
}

function toneForTrend(trend: string): "success" | "warn" | "default" {
  if (trend === "increasing") return "success";
  if (trend === "decreasing") return "warn";
  return "default";
}

function toneForTrendBadge(trend: string): "green" | "red" | "gray" {
  if (trend === "increasing") return "green";
  if (trend === "decreasing") return "red";
  return "gray";
}

function SectionTitle({
  step,
  title,
  subtitle,
  icon,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        {icon}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            STAGE {step}
          </span>
          <h2 className="card-title">{title}</h2>
        </div>
        <p className="card-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function TableCard({
  title,
  subtitle,
  headers,
  rows,
  empty = "No records in this range.",
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {headers.map((header) => (
                <th scope="col" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-6 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const [draft, setDraft] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [datasets, setDatasets] = useState<DatasetVerification | null>(null);
  const [descriptive, setDescriptive] = useState<DescriptiveAnalytics | null>(null);
  const [predictive, setPredictive] = useState<PredictiveAnalytics | null>(null);
  const [prescriptive, setPrescriptive] = useState<PrescriptiveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [productList, categoryList] = await Promise.all([
          listProducts({ page: 1, pageSize: 100 }),
          listCategories(),
        ]);
        if (!mounted) return;
        setProducts(productList.data);
        setCategories(categoryList);
      } catch (err) {
        if (mounted) toast.error(err instanceof ApiRequestError ? err.message : "Failed to load filter options.");
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const params = buildParams(applied);
        const [datasetResult, descriptiveResult, predictiveResult, prescriptiveResult] = await Promise.all([
          getDatasetCounts(),
          getDescriptiveAnalytics(params),
          getPredictiveAnalytics(params),
          getPrescriptiveAnalytics(params),
        ]);
        if (!mounted) return;
        setDatasets(datasetResult);
        setDescriptive(descriptiveResult);
        setPredictive(predictiveResult);
        setPrescriptive(prescriptiveResult);
      } catch (err) {
        if (mounted) toast.error(err instanceof ApiRequestError ? err.message : "Failed to load analytics.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, isAdmin]);

  const params = useMemo(() => buildParams(applied), [applied]);
  const selectedProducts = useMemo(
    () => (draft.categoryId ? products.filter((product) => product.categoryId === draft.categoryId) : products),
    [draft.categoryId, products],
  );
  const filtersChanged = JSON.stringify(draft) !== JSON.stringify(applied);
  const seriesKey = applied.groupBy === "week" ? "weekly" : applied.groupBy === "month" ? "monthly" : "daily";

  const forecastChartData = useMemo(() => {
    if (!descriptive || !predictive) return [];
    const actual = descriptive.sales.series.daily.slice(-14).map((point) => ({
      name: point.bucket.slice(5),
      actual: point.revenue,
      predicted: null as number | null,
    }));
    const forecast = predictive.sales.forecast.map((point) => ({
      name: point.date.slice(5),
      actual: null as number | null,
      predicted: point.predictedRevenue,
    }));
    return [...actual, ...forecast];
  }, [descriptive, predictive]);

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <PageHeader
          title="Business Analytics"
          subtitle="Restricted area. Descriptive, predictive, and prescriptive outputs contain financial data."
        />
        <div className="mt-6">
          <Callout tone="warning">
            Your role can view dataset verification on the Business Analytics Overview page, but detailed analytics
            and recommendations are administrator-only.
          </Callout>
        </div>
      </div>
    );
  }

  if (loading) return <Spinner label="Computing analytics from database records..." />;

  function applyFilters() {
    const next = { ...draft };
    if (next.productId && next.categoryId) {
      const product = products.find((item) => item.id === next.productId);
      if (product && product.categoryId !== next.categoryId) next.productId = "";
    }
    setDraft(next);
    setApplied(next);
  }

  function resetFilters() {
    setDraft(DEFAULT_FILTERS);
    setApplied({ ...DEFAULT_FILTERS });
  }

  function exportSeriesCsv() {
    if (!descriptive) return;
    downloadCsv(
      `descriptive-${params.from}-to-${params.to}.csv`,
      descriptive.sales.series[seriesKey].map((point) => ({
        bucket: point.bucket,
        revenue: point.revenue,
        transactions: point.sales,
        units: point.units,
      })),
    );
  }

  function exportForecastCsv() {
    if (!predictive) return;
    downloadCsv(
      `forecast-${predictive.horizonDays}d.csv`,
      predictive.sales.forecast.map((point) => ({
        date: point.date,
        predictedRevenue: point.predictedRevenue,
        predictedTransactions: point.predictedTransactions,
      })),
    );
  }

  function exportRecommendationsCsv() {
    if (!prescriptive) return;
    downloadCsv(
      `prescriptive-${prescriptive.horizonDays}d.csv`,
      prescriptive.recommendations.map((rec) => ({
        key: rec.key,
        type: rec.type,
        priority: rec.priority,
        title: rec.title,
        relatedTo: rec.relatedTo,
        supportingHistoricalData: rec.supportingHistoricalData,
        predictedResult: rec.predictedResult,
        recommendedAction: rec.recommendedAction,
        status: rec.status,
      })),
    );
  }

  async function decideRecommendation(
    rec: BaRecommendation,
    status: "pending" | "accepted" | "rejected" | "completed",
  ) {
    setUpdatingKey(rec.key);
    try {
      await updateRecommendationStatus(rec.key, status);
      setPrescriptive((current) =>
        current
          ? {
              ...current,
              recommendations: current.recommendations.map((item) =>
                item.key === rec.key
                  ? { ...item, status, decidedAt: new Date().toISOString() }
                  : item,
              ),
            }
          : current,
      );
      toast.success(`Recommendation marked ${status}.`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to update recommendation status.");
    } finally {
      setUpdatingKey(null);
    }
  }

  if (!descriptive || !predictive || !prescriptive) {
    return (
      <div className="card p-6">
        <PageHeader title="Business Analytics" subtitle="No analytics result was returned." />
        <Button className="mt-5" onClick={() => setApplied({ ...applied })}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const { sales, products: descriptiveProducts, customers, inventory, financial } = descriptive;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Analytics Dashboard"
        subtitle={`${params.from} to ${params.to} · descriptive evidence → statistical forecast → recommended action`}
        actions={
          <>
            <Link to="/analytics/overview" className="button-link button-link-outline">
              Case study
            </Link>
            <Link to="/analytics/process" className="button-link button-link-primary">
              Connected process
            </Link>
          </>
        }
      />

      {/* Filters */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-brand-600" /> Analytics controls
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Select
            label="Range / horizon"
            value={draft.days}
            onChange={(event) => setDraft({ ...draft, days: Number(event.target.value) as Horizon })}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
          <Select
            label="Group by"
            value={draft.groupBy}
            onChange={(event) =>
              setDraft({ ...draft, groupBy: event.target.value as Filters["groupBy"] })
            }
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
          <Select
            label="Category"
            value={draft.categoryId}
            onChange={(event) =>
              setDraft({ ...draft, categoryId: event.target.value, productId: "" })
            }
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            label="Product"
            value={draft.productId}
            onChange={(event) => setDraft({ ...draft, productId: event.target.value })}
          >
            <option value="">All products</option>
            {selectedProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <div className="flex items-end gap-2">
            <Button onClick={applyFilters} disabled={!filtersChanged}>
              Apply
            </Button>
            <Button variant="ghost" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Filters are applied to the same database snapshot used by all three stages. The selected range also becomes
          the forecast horizon; product demand always uses the latest 30 days against the prior 30 days.
        </p>
      </div>

      {/* Dataset strip */}
      {datasets && (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {datasets.datasets.map((dataset) => (
            <div key={dataset.name} className="card toolbar">
              <p className="truncate text-xs font-medium text-slate-500">{dataset.name}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{dataset.count}</p>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{dataset.distinct} distinct</span>
                <Badge tone={dataset.meetsMinimum ? "green" : "red"}>{dataset.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
        <span className="font-semibold text-brand-800">Analysis chain:</span>
        <span>1. Observed data</span>
        <ArrowRight className="h-4 w-4 text-brand-500" />
        <span>2. Statistical forecast</span>
        <ArrowRight className="h-4 w-4 text-brand-500" />
        <span>3. Human-reviewed action</span>
      </div>

      {/* Descriptive */}
      <section className="space-y-4">
        <SectionTitle
          step={1}
          title="Descriptive analytics — what happened?"
          subtitle={`Actual completed sales from ${descriptive.range.from} to ${descriptive.range.to}.`}
          icon={<SlidersHorizontal className="h-5 w-5" />}
        />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <StatCard label="Net Revenue" value={formatCurrency(sales.totalSalesRevenue)} hint={`${formatCurrency(sales.grossSales)} gross less ${formatCurrency(sales.discounts)} discounts`} />
          <StatCard label="Transactions" value={formatNumber(sales.totalTransactions)} hint={`${formatNumber(sales.totalUnitsSold)} units sold`} />
          <StatCard label="Average Order Value" value={formatCurrency(sales.averageOrderValue)} hint="Net revenue ÷ transactions" />
          <StatCard
            label="Revenue Growth"
            value={`${sales.revenueGrowthPercent >= 0 ? "+" : ""}${formatNumber(sales.revenueGrowthPercent)}%`}
            hint={`vs prior ${descriptive.historicalDays} days · ${titleCase(sales.salesTrend)}`}
            tone={toneForTrend(sales.salesTrend)}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="card p-5 xl:col-span-2">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Revenue trend</h3>
                <p className="text-xs text-slate-500">Completed sales grouped by {applied.groupBy}</p>
              </div>
              <Button variant="outline" size="sm" onClick={exportSeriesCsv}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
            <RevenueChart
              data={descriptive.sales.series[seriesKey].map((point) => ({
                bucket: point.bucket,
                revenue: point.revenue,
                sales: point.sales,
              }))}
            />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900">Payment mix</h3>
            <p className="mb-4 text-xs text-slate-500">Observed revenue by payment method</p>
            {sales.paymentMix.length === 0 ? (
              <p className="text-sm text-slate-500">No payments in range.</p>
            ) : (
              <SimpleBarChart
                data={sales.paymentMix.map((mix) => ({ name: titleCase(mix.method), value: mix.revenue }))}
                valueFormatter={formatCurrency}
              />
            )}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <TableCard
            title="Product performance"
            subtitle="Ranked by units sold in the selected range"
            headers={["#", "Product", "Units", "Revenue", "Stock"]}
            rows={descriptiveProducts.rankings.slice(0, 8).map((product, index) => [
              <span key="rank" className="text-slate-400">{index + 1}</span>,
              <div key="name">
                <p className="font-medium text-slate-800">{product.name}</p>
                <p className="text-xs text-slate-500">{product.sku} · {product.category}</p>
              </div>,
              formatNumber(product.unitsSold),
              formatCurrency(product.revenue),
              formatNumber(product.stockQuantity),
            ])}
          />
          <TableCard
            title="Customer behavior"
            subtitle={`${customers.purchasingCustomers} of ${customers.totalCustomers} customers purchased in this range`}
            headers={["Segment", "Customers"]}
            rows={customers.frequencyBuckets.map((bucket) => [
              <span key="label" className="font-medium">{bucket.label}</span>,
              formatNumber(bucket.customers),
            ])}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <TableCard
            title="Inventory behavior"
            subtitle="Current stock and recent movement context"
            headers={["Indicator", "Value"]}
            rows={[
              ["SKUs", formatNumber(inventory.skuCount)],
              ["Units on hand", formatNumber(inventory.unitsOnHand)],
              ["Low-stock products", formatNumber(inventory.lowStockCount)],
              ["Out-of-stock products", formatNumber(inventory.outOfStockCount)],
              ["Movements recorded", formatNumber(inventory.movementSummary.reduce((sum, row) => sum + row.total, 0))],
            ].map(([label, value]) => [<span key="label" className="font-medium">{label}</span>, <span key="value">{value}</span>])}
          />
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900">Financial summary</h3>
            <p className="mb-4 text-xs text-slate-500">{financial.basis}</p>
            <dl className="space-y-3 text-sm">
              {[
                ["Net revenue", financial.netRevenue],
                ["Cost of goods sold", financial.costOfGoodsSold],
                ["Gross profit", financial.grossProfit],
                ["Gross margin", `${formatNumber(financial.grossProfitMarginPercent)}%`],
                ["Average transaction value", financial.averageTransactionValue],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold text-slate-900">{typeof value === "number" ? formatCurrency(value) : value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Predictive */}
      <section className="space-y-4">
        <SectionTitle
          step={2}
          title="Predictive analytics — what is likely to happen?"
          subtitle={`Forecast for the next ${predictive.horizonDays} days, computed from the descriptive snapshot above.`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <StatCard label="Expected Revenue" value={formatCurrency(predictive.sales.expectedRevenue)} hint={`${predictive.horizonDays}-day statistical estimate`} tone="success" />
          <StatCard label="Expected Transactions" value={formatNumber(predictive.sales.expectedTransactions)} hint={`Method: ${predictive.sales.method}`} />
          <StatCard label="Active Selling Days" value={formatNumber(predictive.activeSellingDays)} hint={`of ${predictive.historicalDays} historical days`} />
          <StatCard label="At-Risk Products" value={formatNumber(predictive.inventoryRisk.length)} hint="Based on projected demand and current stock" tone={predictive.inventoryRisk.length > 0 ? "warn" : "default"} />
        </div>

        {!predictive.sales.sufficientData && (
          <Callout tone="warning" title="Limited sales history for this filter">
            {predictive.sales.reason}
          </Callout>
        )}

        <div className="card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Actual vs forecast revenue</h3>
              <p className="text-xs text-slate-500">
                {predictive.methodology.sales} · historical basis {predictive.historicalPeriod.from} to{" "}
                {predictive.historicalPeriod.to}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={exportForecastCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
          <ForecastChart data={forecastChartData} />
          <p className="mt-3 text-xs text-slate-500">{predictive.methodology.inventory}</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <TableCard
            title="Product demand forecast"
            subtitle="Historical units and expected units for the selected horizon"
            headers={["Product", "Historical", "Predicted", "Trend", "Status"]}
            rows={predictive.productDemand.historicalAndPredicted.slice(0, 8).map((product) => [
              <div key="name">
                <p className="font-medium text-slate-800">{product.name}</p>
                <p className="text-xs text-slate-500">{product.sku}</p>
              </div>,
              formatNumber(product.historicalQuantity),
              product.predictedQuantity === null ? "—" : formatNumber(product.predictedQuantity),
              <Badge key="trend" tone={toneForTrendBadge(product.expectedDemandTrend)}>
                {titleCase(product.expectedDemandTrend)}
              </Badge>,
              product.sufficientData ? (
                <span key="status" className="text-emerald-700">Sufficient</span>
              ) : (
                <span key="status" className="text-amber-700">Limited</span>
              ),
            ])}
          />
          <TableCard
            title="Inventory risk projection"
            subtitle="Stockout timing derived from average daily demand and current stock"
            headers={["Product", "Stock", "Daily Demand", "Depletion", "Risk"]}
            rows={predictive.inventoryRisk.slice(0, 8).map((product) => [
              <div key="name">
                <p className="font-medium text-slate-800">{product.name}</p>
                <p className="text-xs text-slate-500">{product.sku}</p>
              </div>,
              formatNumber(product.currentStock ?? 0),
              formatNumber(product.averageDailyDemand ?? 0),
              product.daysUntilDepletion === null ? "—" : `${formatNumber(product.daysUntilDepletion)} days`,
              <Badge key="risk" tone={statusTone(product.stockoutRisk ?? "unknown")}>
                {titleCase(product.stockoutRisk ?? "unknown")}
              </Badge>,
            ])}
          />
        </div>

        {predictive.limitations.length > 0 && (
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Forecast limitations</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              {predictive.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Prescriptive */}
      <section className="space-y-4">
        <SectionTitle
          step={3}
          title="Prescriptive analytics — what should we do?"
          subtitle={`Actions derived from the descriptive findings and ${prescriptive.horizonDays}-day forecast; every action requires human review.`}
          icon={<Lightbulb className="h-5 w-5" />}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Recommendations" value={formatNumber(prescriptive.recommendations.length)} hint="Generated from ranked forecast evidence" />
          <StatCard label="Suggested Purchase Units" value={formatNumber(prescriptive.purchasingSummary.suggestedUnits)} hint="Covers 7-day lead time + 3 safety days" />
          <StatCard label="Estimated Purchase Cost" value={formatCurrency(prescriptive.purchasingSummary.estimatedCost)} hint="Using product purchase prices" />
        </div>

        <div className="card p-5">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div className="text-sm text-slate-700">
              <p className="font-semibold text-slate-900">How this stage used the previous stages</p>
              <p className="mt-1">{prescriptive.basis.note}</p>
              <p className="mt-1 text-xs text-slate-500">
                Descriptive range {prescriptive.basis.descriptiveRange.from} to {prescriptive.basis.descriptiveRange.to} · forecast period {prescriptive.basis.forecastPeriod}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Decision queue</h3>
              <p className="text-xs text-slate-500">Statuses are stored in the database and audited.</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportRecommendationsCsv}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {prescriptive.recommendations.length === 0 ? (
            <div className="card xl:col-span-2">
              <EmptyState className="py-8" title="No recommendations for these filters" description="Try a wider date range or a different product focus." />
            </div>
          ) : (
            prescriptive.recommendations.map((rec) => (
              <div key={rec.key} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(rec.priority)}>{titleCase(rec.priority)} priority</Badge>
                      <Badge tone={statusTone(rec.status)}>{titleCase(rec.status)}</Badge>
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">{titleCase(rec.type)}</span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-900">{rec.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{rec.relatedTo}</p>
                  </div>
                  {rec.status === "pending" && <Lightbulb className="h-5 w-5 shrink-0 text-amber-500" />}
                  {rec.status !== "pending" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <p><span className="font-medium text-slate-600">Observed:</span> {rec.supportingHistoricalData}</p>
                  <p><span className="font-medium text-slate-600">Forecast:</span> {rec.predictedResult}</p>
                  <p><span className="font-medium text-slate-600">Action:</span> {rec.recommendedAction}</p>
                  <p className="text-xs text-slate-500">{rec.reason}</p>
                  {rec.decidedAt && <p className="text-xs text-slate-400">Decided {formatDate(rec.decidedAt)}</p>}
                </div>

                {rec.status === "pending" ? (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Button size="sm" loading={updatingKey === rec.key} onClick={() => decideRecommendation(rec, "accepted")}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={updatingKey === rec.key} onClick={() => decideRecommendation(rec, "rejected")}>
                      Reject
                    </Button>
                    <Button size="sm" variant="secondary" disabled={updatingKey === rec.key} onClick={() => decideRecommendation(rec, "completed")}>
                      Mark done
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-auto self-start"
                    disabled={updatingKey === rec.key}
                    onClick={() => decideRecommendation(rec, "pending")}
                  >
                    Reset to pending
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-slate-500">
          Recommendations are decision support, not automatic purchases or price changes. No POS, inventory, or
          customer records are modified by this page.
        </p>
      </section>
    </div>
  );
}
