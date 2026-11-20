import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Copy,
  Database,
  Lightbulb,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { Select } from "../components/ui/Select";
import { Callout } from "../components/ui/Callout";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import { getBusinessWorkflow } from "../services/data.service";
import type { BusinessWorkflow, WorkflowStep } from "../types";
import { formatCurrency, formatDate, formatNumber, titleCase } from "../utils/format";

type Horizon = 7 | 30 | 90;

interface ProcessFilters {
  days: Horizon;
  productId: string;
}

const DEFAULT_FILTERS: ProcessFilters = { days: 30, productId: "" };

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rangeForDays(days: number) {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return `${value.length} item${value.length === 1 ? "" : "s"}: ${value
      .slice(0, 3)
      .map((entry) => displayValue(entry))
      .join(", ")}`;
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 5)
      .map(([key, nested]) => `${titleCase(key)}: ${displayValue(nested)}`)
      .join(" · ");
  }
  return String(value);
}

const STAGE_META: Record<
  WorkflowStep["stage"],
  { label: string; icon: ReactNode; tone: "green" | "blue" | "orange" }
> = {
  descriptive: { label: "Descriptive", icon: <BarChart3 className="h-5 w-5" />, tone: "blue" },
  predictive: { label: "Predictive", icon: <TrendingUp className="h-5 w-5" />, tone: "green" },
  prescriptive: { label: "Prescriptive", icon: <Lightbulb className="h-5 w-5" />, tone: "orange" },
};

function StageCard({ step }: { step: WorkflowStep }) {
  const meta = STAGE_META[step.stage];
  const entries = Object.entries(step.finding ?? {});
  return (
    <div className="card flex min-w-0 flex-1 flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray">STEP {step.step}</Badge>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          {meta.icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
          <p className="mt-1 text-xs font-medium text-brand-700">{step.question}</p>
        </div>
      </div>

      {step.inputFromPreviousStep && (
        <div className="mt-4 rounded-xl border border-dashed border-brand-200 bg-brand-50/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">Input from previous stage</p>
          <p className="mt-1 text-xs text-slate-700">{step.inputFromPreviousStep}</p>
        </div>
      )}

      <dl className="mt-4 flex-1 space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">No finding available for this filter.</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
              <dt className="text-xs text-slate-500">{titleCase(key)}</dt>
              <dd className="max-w-[60%] text-right text-xs font-medium text-slate-900">{displayValue(value)}</dd>
            </div>
          ))
        )}
      </dl>

      {step.outputToNextStep && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Output to next stage</p>
          <p className="mt-1 text-xs text-slate-700">{step.outputToNextStep}</p>
        </div>
      )}
      {step.note && <p className="mt-3 text-xs italic text-slate-500">{step.note}</p>}
    </div>
  );
}

export default function BusinessAnalyticsProcessPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const [draft, setDraft] = useState<ProcessFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<ProcessFilters>(DEFAULT_FILTERS);
  const [workflow, setWorkflow] = useState<BusinessWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const result = await getBusinessWorkflow({
          ...rangeForDays(applied.days),
          days: applied.days,
          groupBy: "day",
          horizon: applied.days,
          productId: applied.productId || undefined,
        });
        if (!mounted) return;
        setWorkflow(result);
      } catch (err) {
        if (mounted) toast.error(err instanceof ApiRequestError ? err.message : "Failed to load the analytics workflow.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, isAdmin]);

  const filtersChanged = JSON.stringify(draft) !== JSON.stringify(applied);
  const selectedProductExists = useMemo(
    () => !draft.productId || (workflow?.availableProducts ?? []).some((product) => product.id === draft.productId),
    [draft.productId, workflow],
  );
  const aiPrompt = useMemo(() => {
    if (!workflow?.focusProduct) {
      return "Explain how the descriptive evidence, forecast, and recommendation stages are connected in this motor shop case study. Separate observed facts from estimates.";
    }
    const product = workflow.focusProduct;
    return `For ${product.name} (SKU ${product.sku}), explain the descriptive evidence, the ${workflow.forecastPeriodDays ?? applied.days}-day forecast, and the recommended action. Clearly separate observed facts from estimates.`;
  }, [workflow, applied.days]);

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <PageHeader
          title="Connected Analytics Process"
          subtitle="Administrator-only workflow trace from evidence to forecast to action."
        />
        <div className="mt-6">
          <Callout tone="warning">
            The connected process exposes financial forecasts and recommendations, so it is restricted to administrators.
          </Callout>
        </div>
      </div>
    );
  }

  if (loading) return <Spinner label="Tracing the connected analytics workflow..." />;

  function apply() {
    if (!selectedProductExists) setDraft({ ...draft, productId: "" });
    setApplied({ ...draft, productId: selectedProductExists ? draft.productId : "" });
  }

  function reset() {
    setDraft(DEFAULT_FILTERS);
    setApplied({ ...DEFAULT_FILTERS });
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Clipboard is unavailable in this browser.");
    }
  }

  if (!workflow) {
    return (
      <div className="card p-6">
        <PageHeader title="Connected Analytics Process" subtitle="No workflow result was returned." />
        <Button className="mt-5" onClick={() => setApplied({ ...applied })}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const { focusProduct, chain = [], contextSummary } = workflow;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connected Analytics Process"
        subtitle={`One database snapshot, three linked stages · ${workflow.range.from} to ${workflow.range.to}`}
        actions={
          <Link to="/reports" className="button-link button-link-outline">
            Back to dashboard
          </Link>
        }
      />

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-brand-600" /> Workflow focus
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Forecast horizon"
            value={draft.days}
            onChange={(event) => setDraft({ ...draft, days: Number(event.target.value) as Horizon })}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </Select>
          <div className="md:col-span-2">
            <Select
              label="Product to trace"
              value={draft.productId}
              onChange={(event) => setDraft({ ...draft, productId: event.target.value })}
            >
              <option value="">Auto-select from the highest-priority recommendation</option>
              {workflow.availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — {product.sku}
                  {product.stockoutRisk ? ` (${titleCase(product.stockoutRisk)} risk)` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={apply} disabled={!filtersChanged}>
            Trace workflow
          </Button>
          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
          {!selectedProductExists && (
            <span className="text-xs text-amber-700">That product is unavailable for this horizon; it will be auto-selected.</span>
          )}
        </div>
      </div>

      {!workflow.sufficientData && (
        <Callout tone="warning" title="Limited history warning">
          {workflow.message}
        </Callout>
      )}

      {contextSummary && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <StatCard label="Observed Revenue" value={formatCurrency(contextSummary.totalRevenue)} hint="Descriptive stage input" />
          <StatCard label="Transactions" value={formatNumber(contextSummary.totalTransactions)} hint="Completed sales in range" />
          <StatCard label="Products" value={formatNumber(contextSummary.totalProducts)} hint="Master records available" />
          <StatCard label="Customers" value={formatNumber(contextSummary.totalCustomers)} hint="Master records available" />
        </div>
      )}

      {focusProduct && (
        <div className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Current workflow focus</p>
              <h2 className="mt-1 text-base font-semibold text-slate-900">{focusProduct.name}</h2>
              <p className="text-xs text-slate-500">
                {focusProduct.sku} · {focusProduct.category} · {formatNumber(focusProduct.currentStock)} units on hand
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500 lg:text-right">
            <p>Snapshot rows: {contextSummary?.historicalSnapshotRows.sales ?? 0} sales · {contextSummary?.historicalSnapshotRows.productRows ?? 0} product rows</p>
            <p>Generated {formatDate(workflow.generatedAt)}</p>
          </div>
        </div>
      )}

      {/* Connected stages */}
      {chain.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-brand-600" />
            <h2 className="card-title">Stage-by-stage trace</h2>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            {chain.map((step, index) => (
              <div key={step.id} className="contents">
                <StageCard step={step} />
                {index < chain.length - 1 && (
                  <div className="flex items-center justify-center py-1 lg:py-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" aria-hidden="true" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="card">
          <EmptyState
            title="No connected trace available"
            description={workflow.message || "Adjust the horizon or product focus to trace a workflow."}
          />
        </div>
      )}

      <div className="card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Ask the AI Assistant about this trace</h3>
              <p className="mt-1 max-w-3xl text-xs text-slate-600">{aiPrompt}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                The assistant receives stage-aware facts from the server and cannot replace the calculated figures.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyPrompt}>
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy question"}
            </Button>
            <Link
              to="/ai"
              className="inline-flex h-8 items-center rounded-xl bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700"
            >
              Open AI Assistant
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>
          This page performs no writes. It reads the same validated snapshot used by the dashboard and displays the
          explicit handoff between stages. Recommendation decisions are recorded separately in the dashboard.
        </p>
      </div>
    </div>
  );
}
