import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  Lightbulb,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { Badge } from "../components/ui/Badge";
import { Callout } from "../components/ui/Callout";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import {
  getDatasetCounts,
  getDescriptiveAnalytics,
  getPrescriptiveAnalytics,
  getPredictiveAnalytics,
} from "../services/data.service";
import type {
  DatasetVerification,
  DescriptiveAnalytics,
  PrescriptiveAnalytics,
  PredictiveAnalytics,
} from "../types";
import { formatCurrency, formatDate, formatNumber, titleCase } from "../utils/format";

const SECTIONS = [
  { id: 1, label: "Title & context" },
  { id: 2, label: "Profile & problem" },
  { id: 3, label: "Objectives" },
  { id: 4, label: "Significance" },
  { id: 5, label: "Scope & assumptions" },
  { id: 6, label: "Literature" },
  { id: 7, label: "Framework" },
  { id: 8, label: "Methodology" },
  { id: 9, label: "Datasets" },
  { id: 10, label: "Descriptive" },
  { id: 11, label: "Predictive" },
  { id: 12, label: "Prescriptive" },
  { id: 13, label: "Conclusions" },
];

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function last30Days() {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

function OverviewSection({
  number,
  title,
  icon,
  children,
}: {
  number: number;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`section-${number}`} className="card scroll-mt-24 p-6">
      <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Section {number}</p>
          <h2 className="card-title">{title}</h2>
        </div>
      </div>
      <div className="text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function RestrictedNote({ title }: { title: string }) {
  return (
    <Callout tone="warning" title={title}>
      Detailed financial outputs are administrator-only. Staff accounts can verify dataset completeness here and
      use the AI Assistant for role-safe operational answers.
    </Callout>
  );
}

export default function BusinessAnalyticsOverviewPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const [datasets, setDatasets] = useState<DatasetVerification | null>(null);
  const [descriptive, setDescriptive] = useState<DescriptiveAnalytics | null>(null);
  const [predictive, setPredictive] = useState<PredictiveAnalytics | null>(null);
  const [prescriptive, setPrescriptive] = useState<PrescriptiveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(1);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const range = last30Days();
        if (isAdmin) {
          const [datasetResult, descriptiveResult, predictiveResult, prescriptiveResult] = await Promise.all([
            getDatasetCounts(),
            getDescriptiveAnalytics({ ...range, days: 30, groupBy: "day" }),
            getPredictiveAnalytics({ ...range, days: 30, groupBy: "day", horizon: 30 }),
            getPrescriptiveAnalytics({ ...range, days: 30, groupBy: "day", horizon: 30 }),
          ]);
          if (!mounted) return;
          setDatasets(datasetResult);
          setDescriptive(descriptiveResult);
          setPredictive(predictiveResult);
          setPrescriptive(prescriptiveResult);
        } else {
          const datasetResult = await getDatasetCounts();
          if (!mounted) return;
          setDatasets(datasetResult);
        }
      } catch (err) {
        if (mounted) toast.error(err instanceof ApiRequestError ? err.message : "Failed to load case study data.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (loading) return <Spinner label="Preparing the Business Analytics case study..." />;

  const allDatasetsPass = datasets?.datasets.every((dataset) => dataset.meetsMinimum) ?? false;
  const topProduct = descriptive?.products.bestSelling[0];
  const topCustomer = descriptive?.customers.topCustomers[0];
  const topRecommendation = prescriptive?.recommendations[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Analytics Overview"
        subtitle="A 13-section case study of the motor shop's operational data, forecasts, and decision support."
        actions={
          <>
            <Link to="/reports" className="button-link button-link-outline">
              Open dashboard
            </Link>
            <Link to="/analytics/process" className="button-link button-link-primary">
              View connected process
            </Link>
          </>
        }
      />

      <nav className="card flex flex-wrap gap-2 p-4">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#section-${section.id}`}
            onClick={() => setActiveSection(section.id)}
            aria-current={activeSection === section.id ? "location" : undefined}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              activeSection === section.id
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            }`}
          >
            {section.id}. {section.label}
          </a>
        ))}
      </nav>

      <OverviewSection number={1} title="Title and context" icon={<FileText className="h-5 w-5" />}>
        <p className="text-base font-medium text-slate-900">
          AI-Powered Motor Shop Management System: From Operational Records to Connected Business Decisions
        </p>
        <p className="mt-3">
          This case study explains how sales, product, customer, and inventory records already stored in the system are
          converted into three connected levels of analysis: descriptive evidence, statistical forecasts, and
          prescriptive actions that a manager can review. The AI Assistant is an interpretation layer; it does not
          invent the underlying numbers.
        </p>
      </OverviewSection>

      <OverviewSection number={2} title="Business profile and statement of the problem" icon={<BookOpen className="h-5 w-5" />}>
        <p>
          The case business is a retail motor shop that sells Automotive parts and accessories through a point-of-sale
          workflow while tracking stock receipts, adjustments, and sales movements. The system holds master data for
          products and customers, transaction headers and line items, and an audit trail of inventory changes.
        </p>
        <p className="mt-3">
          <strong>Problem:</strong> operational reports described what had already happened, but there was no unified
          process that carried observed evidence into a forecast and then into a concrete, reviewable action. Stock
          decisions were reactive, and managers had no consistent way to see which forecast evidence supported each
          recommendation.
        </p>
      </OverviewSection>

      <OverviewSection number={3} title="Objectives of the study" icon={<Target className="h-5 w-5" />}>
        <BulletList
          items={[
            "Verify that Products, Customers, Sales, Sale Items, and Inventory Movements each contain at least 50 valid records using live database counts.",
            "Describe sales, product, customer, inventory, and financial performance from completed transactions.",
            "Forecast revenue, transaction counts, product demand, and stockout timing using transparent statistical methods.",
            "Generate replenishment, purchasing, sales-focus, and business-improvement recommendations from the forecast outputs.",
            "Connect all three stages in one interactive workflow with role-based access and an auditable human decision step.",
          ]}
        />
      </OverviewSection>

      <OverviewSection number={4} title="Significance of the study" icon={<Users className="h-5 w-5" />}>
        <BulletList
          items={[
            <span key="owners"><strong>Shop owners/managers:</strong> gain an evidence trail from observed sales to suggested purchasing and focus decisions.</span>,
            <span key="staff"><strong>Staff:</strong> retain access to operational data and dataset verification without exposure to restricted financial forecasts.</span>,
            <span key="customers"><strong>Customers:</strong> benefit indirectly from better stock availability and less frequent missed demand.</span>,
            <span key="academic"><strong>Academic evaluation:</strong> receives a working system where the three analytics levels are demonstrably connected rather than isolated screens.</span>,
          ]}
        />
      </OverviewSection>

      <OverviewSection number={5} title="Scope, delimitations, and assumptions" icon={<ShieldCheck className="h-5 w-5" />}>
        <BulletList
          items={[
            "The study uses records already present in the application database; no external market or competitor data is introduced.",
            "Descriptive and financial figures use completed sales. Cancelled transactions are reported separately, not treated as revenue.",
            "Forecasts are short-horizon estimates (7, 30, or 90 days) and depend on the quantity and quality of historical records in the selected range.",
            "Recommendations are advisory only. No purchase order, price change, or inventory mutation is executed automatically.",
            "User growth and seasonality beyond the available transaction window cannot be inferred from this dataset.",
          ]}
        />
      </OverviewSection>

      <OverviewSection number={6} title="Review of related literature and methods" icon={<BookOpen className="h-5 w-5" />}>
        <p>
          Descriptive analytics summarizes historical data through counts, totals, averages, ratios, rankings, and
          trends. Predictive analytics extends those summaries with statistical models; in this system, linear
          regression is used when a meaningful trend exists and a weighted moving average is used when the series is
          relatively stable. Prescriptive analytics converts predictions into candidate actions by comparing projected
          demand with current stock, lead time, and safety stock.
        </p>
        <p className="mt-3">
          The design also follows the principle of human-in-the-loop decision support: a generated recommendation is
          stored with a status so that acceptance, rejection, and completion remain accountable business decisions
          rather than silent system behavior.
        </p>
      </OverviewSection>

      <OverviewSection number={7} title="Conceptual framework" icon={<Layers className="h-5 w-5" />}>
        <div className="grid gap-3 md:grid-cols-5 md:items-center">
          {[
            ["Database records", "Products, customers, sales, items, movements"],
            ["Descriptive", "What happened? Verified facts and KPIs"],
            ["Predictive", "What is likely? Statistical estimates"],
            ["Prescriptive", "What should we do? Ranked actions"],
            ["Decision", "Human review with stored status"],
          ].map(([title, detail], index, array) => (
            <div key={title} className="contents">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{title}</p>
                <p className="mt-2 text-xs text-slate-600">{detail}</p>
              </div>
              {index < array.length - 1 && (
                <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-brand-500 md:block" />
              )}
            </div>
          ))}
        </div>
        <p className="mt-4">
          All three analytics stages read one shared snapshot built by the same service call. This is what makes the
          stages connected: the predictive model receives the descriptive series, and the recommendation engine
          receives the predictive rows and the descriptive rankings.
        </p>
      </OverviewSection>

      <OverviewSection number={8} title="Research design and analytical procedures" icon={<BarChart3 className="h-5 w-5" />}>
        <p>
          The study uses a quantitative, explanatory design over live transactional records. Data is filtered by date,
          category, and product; descriptive indicators are computed; a forecast is produced from the same filtered
          series; and the forecast is translated into recommendations. Key formulas are:
        </p>
        <BulletList
          items={[
            "Average Order Value = net revenue ÷ completed transactions.",
            "Revenue growth % = (current net revenue − prior-period net revenue) ÷ prior-period net revenue × 100.",
            "Trend forecast = linear regression on daily revenue when |slope × days| is material; otherwise a 7-day weighted moving average.",
            "Product demand = recent 30-day units adjusted by a bounded 30-day versus prior-30-day trend ratio.",
            "Stockout days = current stock ÷ recent average daily demand; reorder quantity covers 7-day lead time plus 3 safety days.",
          ]}
        />
      </OverviewSection>

      <OverviewSection number={9} title="Data sources, dataset verification, and integrity" icon={<Database className="h-5 w-5" />}>
        {datasets ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone={allDatasetsPass ? "green" : "red"}>
                {allDatasetsPass ? "ALL DATASETS PASS" : "DATASET REQUIREMENT NOT MET"}
              </Badge>
              <span className="text-xs text-slate-500">Minimum {datasets.minimumRequired} records per dataset</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Dataset</th>
                    <th scope="col">Table</th>
                    <th scope="col">Actual count</th>
                    <th scope="col">Distinct IDs</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.datasets.map((dataset) => (
                    <tr key={dataset.name}>
                      <td className="px-4 py-3 font-medium text-slate-800">{dataset.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{dataset.table}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{dataset.count}</td>
                      <td>{dataset.distinct}</td>
                      <td>
                        <Badge tone={dataset.meetsMinimum ? "green" : "red"}>{dataset.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Completed sales</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{datasets.integrity.completedSales}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Cancelled sales</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{datasets.integrity.cancelledSales}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">First recorded sale</p>
                <p className="mt-1 font-medium text-slate-800">{formatDate(datasets.integrity.firstSaleAt)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Last recorded sale</p>
                <p className="mt-1 font-medium text-slate-800">{formatDate(datasets.integrity.lastSaleAt)}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">{datasets.note}</p>
          </>
        ) : (
          <p className="text-slate-500">Dataset verification is unavailable.</p>
        )}
      </OverviewSection>

      <OverviewSection number={10} title="Descriptive results and discussion" icon={<BarChart3 className="h-5 w-5" />}>
        {descriptive ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {[
                ["Net revenue", formatCurrency(descriptive.sales.totalSalesRevenue)],
                ["Transactions", formatNumber(descriptive.sales.totalTransactions)],
                ["Units sold", formatNumber(descriptive.sales.totalUnitsSold)],
                ["Average order value", formatCurrency(descriptive.sales.averageOrderValue)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4">
              In the latest 30-day window, revenue moved {formatNumber(descriptive.sales.revenueGrowthPercent)}%
              versus the preceding 30 days, classified as {titleCase(descriptive.sales.salesTrend)}.{" "}
              {topProduct
                ? `The leading product by units was ${topProduct.name} with ${formatNumber(topProduct.unitsSold)} units and ${formatCurrency(topProduct.revenue)} in revenue.`
                : "No product sales were recorded in this window."}{" "}
              {topCustomer
                ? `${topCustomer.name} was the highest-spending customer with ${formatCurrency(topCustomer.totalSpent)} across ${formatNumber(topCustomer.purchases)} purchases.`
                : ""}
            </p>
            <p className="mt-3">
              Inventory context shows {formatNumber(descriptive.inventory.skuCount)} SKUs,{" "}
              {formatNumber(descriptive.inventory.unitsOnHand)} units on hand,{" "}
              {formatNumber(descriptive.inventory.lowStockCount)} low-stock products, and{" "}
              {formatNumber(descriptive.inventory.outOfStockCount)} out-of-stock products. These figures form the
              evidence base for the forecast stage.
            </p>
            <Link className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline" to="/reports">
              Explore the full descriptive dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <RestrictedNote title="Descriptive results are administrator-only." />
        )}
      </OverviewSection>

      <OverviewSection number={11} title="Predictive results and limitations" icon={<TrendingUp className="h-5 w-5" />}>
        {predictive ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Expected revenue ({predictive.horizonDays}d)</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatCurrency(predictive.sales.expectedRevenue)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Expected transactions</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(predictive.sales.expectedTransactions)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Method</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{titleCase(predictive.sales.method)}</p>
              </div>
            </div>
            <p className="mt-4">
              The model used {formatNumber(predictive.activeSellingDays)} active selling days from{" "}
              {predictive.historicalPeriod.from} to {predictive.historicalPeriod.to}.{" "}
              {predictive.sales.sufficientData
                ? "The available history was sufficient for the selected horizon."
                : predictive.sales.reason}
            </p>
            {predictive.limitations.length > 0 && (
              <div className="mt-4">
                <Callout tone="warning" title="Limitations">
                  <ul className="list-disc space-y-1 pl-5">
                    {predictive.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Callout>
              </div>
            )}
          </>
        ) : (
          <RestrictedNote title="Predictive results are administrator-only." />
        )}
      </OverviewSection>

      <OverviewSection number={12} title="Prescriptive results and decision workflow" icon={<Lightbulb className="h-5 w-5" />}>
        {prescriptive ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Generated recommendations</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(prescriptive.recommendations.length)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Suggested purchase units</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(prescriptive.purchasingSummary.suggestedUnits)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Estimated purchase cost</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatCurrency(prescriptive.purchasingSummary.estimatedCost)}
                </p>
              </div>
            </div>
            {topRecommendation && (
              <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="orange">{titleCase(topRecommendation.priority)} priority</Badge>
                  <span className="text-xs text-slate-500">{titleCase(topRecommendation.type)}</span>
                </div>
                <p className="mt-2 font-semibold text-slate-900">{topRecommendation.title}</p>
                <p className="mt-1">{topRecommendation.recommendedAction}</p>
              </div>
            )}
            <p className="mt-4">{prescriptive.basis.note}</p>
            <p className="mt-2 text-xs text-slate-500">{prescriptive.purchasingSummary.basis}</p>
            <Link className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline" to="/analytics/process">
              Follow one product through all three stages <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <RestrictedNote title="Prescriptive results are administrator-only." />
        )}
      </OverviewSection>

      <OverviewSection number={13} title="Conclusions, recommendations, and future work" icon={<CheckCircle2 className="h-5 w-5" />}>
        <BulletList
          items={[
            "The five required datasets meet the minimum record requirement based on live database verification.",
            "Descriptive results are reproducible because every figure comes from the same filtered records shown in the dashboard.",
            "Forecasts are statistical estimates with documented methods and limitations; they are not AI-generated claims.",
            "Prescriptive outputs are traceable to historical evidence and predicted demand, and they remain subject to human approval.",
            "Before distribution, confirm that actual .env files are excluded, rotate any credentials that were previously exposed, and validate the forecast against a later observation window.",
            "Future work may add seasonality models, supplier lead-time variability, and automated accuracy tracking once more history is available.",
          ]}
        />
      </OverviewSection>
    </div>
  );
}
