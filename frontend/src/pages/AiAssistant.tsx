import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Banknote,
  Bot,
  Boxes,
  Eraser,
  Info,
  MessagesSquare,
  Package,
  PackageX,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import {
  aiChat,
  aiInsights,
  createAiConversation,
  deleteAiConversation,
  getAiConversation,
  getAiStatus,
  listAiConversations,
} from "../services/data.service";
import type {
  AiChatResponse,
  AiConversationSummary,
  AiMetricTone,
  AiResponseMetric,
  AiResponseMetrics,
  AiStatus,
} from "../types";
import { formatCurrency, formatDateTime, formatNumber, titleCase } from "../utils/format";

type ChatMode = "general" | "business";
type DataScope = "business" | "operational" | "general" | "policy";

interface MessageMeta {
  model?: string;
  available?: boolean;
  dataAsOf?: string;
  alerts?: AiChatResponse["alerts"];
  metrics?: AiResponseMetrics;
  reason?: string;
  source?: "groq" | "fallback" | "policy";
  mode?: ChatMode;
  dataScope?: DataScope;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: MessageMeta;
}

interface ConfirmState {
  type: "delete" | "clear";
  id?: string;
}

function statusBadge(status: AiStatus | null) {
  if (!status) return <Badge tone="gray">Checking AI status…</Badge>;
  if (!status.configured) return <Badge tone="amber">Not configured</Badge>;
  if (status.providerReachable === false) return <Badge tone="red">Provider unavailable</Badge>;
  if (status.providerReachable === true) return <Badge tone="green">AI available</Badge>;
  return <Badge tone="blue">Configured (not tested)</Badge>;
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) {
      return "The AI is handling a lot of requests right now. Please wait a few seconds and try again.";
    }
    if (error.code === "AI_TIMEOUT") {
      return "The AI took too long to respond. Please try a shorter question or try again.";
    }
    return error.message;
  }
  return "I couldn't reach the AI service. Please check your connection and try again.";
}

/** Human-readable labels for server-side policy reason codes. */
function reasonLabel(reason: string): string {
  switch (reason) {
    case "financial_restricted":
      return "Financial information is restricted to administrators.";
    case "admin_data_restricted":
      return "That information is restricted to administrators.";
    case "prompt_injection":
      return "This request was blocked by the AI safety policy.";
    default:
      return reason;
  }
}

function readStoredMeta(metadata?: Record<string, unknown> | null): MessageMeta | undefined {
  if (!metadata) return undefined;
  const meta: MessageMeta = {};
  if (typeof metadata.model === "string") meta.model = metadata.model;
  if (typeof metadata.available === "boolean") meta.available = metadata.available;
  if (typeof metadata.dataAsOf === "string") meta.dataAsOf = metadata.dataAsOf;
  if (typeof metadata.reason === "string") meta.reason = metadata.reason;
  if (metadata.source === "groq" || metadata.source === "fallback" || metadata.source === "policy") {
    meta.source = metadata.source;
  }
  if (metadata.mode === "general" || metadata.mode === "business") meta.mode = metadata.mode;
  if (
    metadata.dataScope === "business" ||
    metadata.dataScope === "operational" ||
    metadata.dataScope === "general" ||
    metadata.dataScope === "policy"
  ) {
    meta.dataScope = metadata.dataScope;
  }
  if (Array.isArray(metadata.alerts)) meta.alerts = metadata.alerts as AiChatResponse["alerts"];
  const metrics = readStoredMetrics(metadata.metrics);
  if (metrics) meta.metrics = metrics;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

const METRIC_TONES: readonly AiMetricTone[] = ["neutral", "info", "positive", "warning", "critical"];

/** Tolerates metadata written by older responses while staying type-safe. */
function readStoredMetrics(value: unknown): AiResponseMetrics | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items)) return undefined;

  const items: AiResponseMetric[] = [];
  for (const entry of raw.items) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const numeric = typeof item.value === "number" ? item.value : Number(item.value);
    if (typeof item.key !== "string" || typeof item.label !== "string" || !Number.isFinite(numeric)) {
      continue;
    }
    const tone = METRIC_TONES.includes(item.tone as AiMetricTone)
      ? (item.tone as AiMetricTone)
      : "neutral";
    items.push({
      key: item.key,
      label: item.label,
      value: numeric,
      format: item.format === "currency" ? "currency" : "number",
      tone,
      status: typeof item.status === "string" ? item.status : "",
    });
  }

  if (items.length === 0) return undefined;
  return {
    scope: "last30days",
    ...(typeof raw.from === "string" ? { from: raw.from } : {}),
    ...(typeof raw.to === "string" ? { to: raw.to } : {}),
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Markdown normalization                                              */
/* ------------------------------------------------------------------ */

const HTML_ENTITIES: Array<[RegExp, string]> = [
  [/&#x20;|&#32;/gi, " "],
  [/&nbsp;/gi, " "],
  [/&mdash;/gi, "—"],
  [/&ndash;/gi, "–"],
  [/&hellip;/gi, "…"],
  [/&quot;/gi, '"'],
  [/&#0*39;|&apos;/gi, "'"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&amp;/gi, "&"],
];

/** Cleans presentation artefacts without touching inline code spans. */
function normalizeOutsideCode(line: string): string {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      let next = segment
        .replace(/[\u00a0\u2007\u2009\u202f]/g, " ")
        .replace(/\u2011/g, "-")
        .replace(/[\u200B-\u200D\uFEFF]/g, "");
      for (const [pattern, replacement] of HTML_ENTITIES) next = next.replace(pattern, replacement);
      next = next.replace(/\\([*_#])/g, "$1");
      return next.replace(/(\d)\s+%/g, "$1%");
    })
    .join("");
}

function normalizeMarkdown(input: string): string {
  const lines = input.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n");
  const normalized: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      normalized.push(raw.replace(/[ \t]+$/, ""));
      continue;
    }
    if (inFence) {
      // Fenced code is preserved byte-for-byte so commands and snippets stay valid.
      normalized.push(raw);
      continue;
    }

    let line = normalizeOutsideCode(raw);

    // A table row whose outer pipes were escaped is not recognised by GFM.
    if (/^\s*\\\|/.test(line) || /\\\|\s*$/.test(line)) {
      line = line.replace(/\\\|/g, "|");
    }

    normalized.push(line.replace(/[ \t]+$/, ""));
  }

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ */
/* Markdown rendering                                                  */
/* ------------------------------------------------------------------ */

function textFromChildren(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromChildren).join("");
  const element = node as { props?: { children?: ReactNode } };
  return textFromChildren(element.props?.children);
}

const NUMERIC_CELL = /^(?:PHP\s*)?[₱$+-]?\s*\d[\d,.]*(?:\.\d+)?\s*%?$/i;

function isNumericCell(children: ReactNode): boolean {
  const text = textFromChildren(children).trim();
  return text.length > 0 && text.length <= 24 && NUMERIC_CELL.test(text);
}

const PRIORITY_STYLES = {
  High: "bg-rose-50 text-rose-700 ring-rose-200",
  Medium: "bg-amber-50 text-amber-800 ring-amber-200",
  Low: "bg-blue-50 text-blue-700 ring-blue-200",
} as const;

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="mb-2 mt-4 border-b border-slate-200 pb-1.5 text-base font-semibold text-slate-900 first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 border-b border-slate-200 pb-1.5 text-base font-semibold text-slate-900 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => {
    const text = textFromChildren(children).trim();
    const match = /^priority\s*:\s*(high|medium|low)\s*[—–:-]\s*(.+)$/i.exec(text);
    if (match) {
      const priority = titleCase(match[1] ?? "") as keyof typeof PRIORITY_STYLES;
      return (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 first:mt-0 first:border-0 first:pt-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
              PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Low
            }`}
          >
            {priority} priority
          </span>
          <h3 className="text-sm font-semibold text-slate-900">{match[2]}</h3>
        </div>
      );
    }
    return <h3 className="mb-1.5 mt-4 text-sm font-semibold text-slate-900 first:mt-0">{children}</h3>;
  },
  h4: ({ children }) => (
    <h4 className="mb-1 mt-3 text-[13px] font-semibold uppercase tracking-wide text-slate-600 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="my-2 leading-6 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-slate-500">{children}</del>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-brand-500">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-brand-600">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 leading-6">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-4 border-brand-300 bg-brand-50/50 px-3 py-2 text-slate-600">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-slate-200" />,
  a: ({ href, children }) => {
    const safeHref = typeof href === "string" && /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
    if (!safeHref) {
      return <span className="font-medium text-slate-700">{children}</span>;
    }
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
      >
        {children}
      </a>
    );
  },
  img: ({ alt }) => (
    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
      Image omitted{alt ? `: ${alt}` : ""}
    </span>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl bg-slate-900 p-3.5 text-xs leading-5 text-slate-100 shadow-inner">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
    if (isBlock) {
      return <code className={`block font-mono text-xs leading-5 text-slate-100 ${className ?? ""}`}>{children}</code>;
    }
    return (
      <code className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-800 ring-1 ring-inset ring-brand-100">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-3 -mx-1 overflow-x-auto rounded-xl border border-slate-200 sm:mx-0">
      <table className="w-full min-w-[380px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="[&>tr:nth-child(even)]:bg-slate-50/60">{children}</tbody>
  ),
  tr: ({ children }) => <tr className="align-top">{children}</tr>,
  th: ({ children, style }) => (
    <th
      style={style}
      className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => {
    const rightAlign = isNumericCell(children) && !style?.textAlign;
    return (
      <td
        style={style}
        className={`border-t border-slate-100 px-3 py-2 text-slate-700 ${
          rightAlign ? "whitespace-nowrap text-right tabular-nums" : ""
        }`}
      >
        {children}
      </td>
    );
  },
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-sm leading-6 text-slate-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
        {normalizeMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HCI helpers                                                         */
/* ------------------------------------------------------------------ */

const METRIC_ICONS: Record<string, typeof Banknote> = {
  revenue30d: Banknote,
  grossProfit30d: Wallet,
  transactions30d: Receipt,
  unitsSold30d: Package,
  lowStock: AlertTriangle,
  outOfStock: PackageX,
};

const METRIC_TONE_STYLES: Record<AiMetricTone, { dot: string; text: string }> = {
  neutral: { dot: "bg-slate-400", text: "text-slate-600" },
  info: { dot: "bg-blue-500", text: "text-blue-700" },
  positive: { dot: "bg-emerald-500", text: "text-emerald-700" },
  warning: { dot: "bg-amber-500", text: "text-amber-700" },
  critical: { dot: "bg-rose-500", text: "text-rose-700" },
};

function MetricGrid({
  metrics,
  dataAsOf,
  scope = "business",
}: {
  metrics: AiResponseMetrics;
  dataAsOf?: string;
  scope?: DataScope;
}) {
  if (metrics.items.length === 0) return null;
  const scopeLabel = scope === "operational" ? "Operational snapshot" : "Business snapshot";

  return (
    <section
      aria-label={`${scopeLabel} metrics from verified data`}
      className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <Activity className="h-3.5 w-3.5 text-brand-600" aria-hidden /> {scopeLabel} · last 30
          days
        </span>
        {dataAsOf && <span className="text-[11px] text-slate-400">Data as of {formatDateTime(dataAsOf)}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.items.map((metric) => {
          const Icon = METRIC_ICONS[metric.key] ?? Boxes;
          const tone = METRIC_TONE_STYLES[metric.tone] ?? METRIC_TONE_STYLES.neutral;
          const value =
            metric.format === "currency" ? formatCurrency(metric.value) : formatNumber(metric.value);
          return (
            <div
              key={metric.key}
              className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
            >
              <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate" title={metric.label}>
                  {metric.label}
                </span>
              </dt>
              <dd className="mt-1 text-base font-semibold leading-tight tabular-nums text-slate-900 sm:text-lg">
                {value}
              </dd>
              <dd className={`mt-1 flex items-start gap-1 text-[10px] leading-4 sm:text-[11px] ${tone.text}`}>
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                <span className="min-w-0">{metric.status}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const ALERT_STYLES: Record<
  string,
  { label: string; icon: typeof AlertTriangle; wrap: string; iconClass: string }
> = {
  critical: {
    label: "Critical",
    icon: AlertOctagon,
    wrap: "border-rose-200 bg-rose-50 text-rose-900",
    iconClass: "text-rose-600",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    iconClass: "text-amber-600",
  },
  info: {
    label: "Info",
    icon: Info,
    wrap: "border-blue-200 bg-blue-50 text-blue-900",
    iconClass: "text-blue-600",
  },
};

function AlertList({ alerts }: { alerts: NonNullable<AiChatResponse["alerts"]> }) {
  return (
    <div className="space-y-1.5">
      {alerts.slice(0, 3).map((alert, index) => {
        const style = ALERT_STYLES[alert.severity] ?? ALERT_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={`${alert.area}-${index}`}
            role="note"
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${style.wrap}`}
          >
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.iconClass}`} aria-hidden />
            <span className="min-w-0">
              <span className="mr-1 font-semibold uppercase tracking-wide">{style.label}:</span>
              {alert.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const ADMIN_SUGGESTIONS = [
  "Hi! Who are you?",
  "What can you do?",
  "What are our best-selling products?",
  "Which products are low in stock?",
  "How is our revenue trending vs the previous 30 days?",
  "What is our gross profit this month?",
];

const STAFF_SUGGESTIONS = [
  "Hi! Who are you?",
  "What can you do?",
  "Which products are low in stock?",
  "What should we restock first?",
  "What are the best-selling products by units?",
  "How do I process a sale in POS?",
];

export default function AiAssistantPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const suggestions = isAdmin ? ADMIN_SUGGESTIONS : STAFF_SUGGESTIONS;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [focus, setFocus] = useState<"general" | "sales" | "inventory" | "profitability">("general");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeConversation = conversations.find((item) => item.id === conversationId) ?? null;
  const activeTitle = activeConversation?.title ?? "New conversation";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, openingId]);

  async function refreshStatus(force = false) {
    setStatusLoading(true);
    try {
      const status = await getAiStatus({ refresh: force });
      setAiStatus(status);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "Unable to load AI status.";
      setAiStatus({
        configured: false,
        providerReachable: false,
        checkedAt: new Date().toISOString(),
        note: message,
        errorCode: err instanceof ApiRequestError ? err.code : undefined,
      });
    } finally {
      setStatusLoading(false);
    }
  }

  async function refreshConversations() {
    try {
      const list = await listAiConversations();
      setConversations(list);
      setConversationsError(null);
    } catch (err) {
      setConversationsError(friendlyError(err));
    } finally {
      setConversationsLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
    void refreshConversations();
  }, []);

  function startNewChat() {
    if (sending) return;
    setConversationId(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function openConversation(id: string) {
    if (sending || openingId || id === conversationId) return;
    setOpeningId(id);
    try {
      const detail = await getAiConversation(id);
      setConversationId(detail.id);
      setMessages(
        detail.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          meta: readStoredMeta(message.metadata),
        })),
      );
    } catch (err) {
      toast.error(friendlyError(err));
      void refreshConversations();
    } finally {
      setOpeningId(null);
    }
  }

  async function runConfirmedAction() {
    if (!confirmState) return;
    const target = confirmState;

    if (target.type === "delete" && target.id) {
      setDeletingId(target.id);
      try {
        await deleteAiConversation(target.id);
        if (target.id === conversationId) {
          setConversationId(null);
          setMessages([]);
        }
        toast.success("Conversation deleted.");
        await refreshConversations();
      } catch (err) {
        toast.error(friendlyError(err));
      } finally {
        setDeletingId(null);
        setConfirmState(null);
      }
      return;
    }

    if (target.type === "clear") {
      if (conversationId) {
        setDeletingId(conversationId);
        try {
          await deleteAiConversation(conversationId);
          await refreshConversations();
        } catch (err) {
          toast.error(friendlyError(err));
        } finally {
          setDeletingId(null);
        }
      }
      setConversationId(null);
      setMessages([]);
      setInput("");
      setConfirmState(null);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setSending(true);

    try {
      const res = await aiChat({
        message: text,
        ...(conversationId ? { conversationId } : {}),
      });
      if (res.conversationId) setConversationId(res.conversationId);

      const content =
        res.answer || res.insights || "I couldn't generate a response just now. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          meta: {
            model: res.ai.model,
            available: res.ai.available,
            dataAsOf: res.dataAsOf,
            alerts: res.alerts,
            metrics: res.metrics,
            reason: res.ai.reason,
            source: res.dataScope === "policy" ? "policy" : res.ai.available ? "groq" : "fallback",
            mode: res.mode ?? res.ai.mode,
            dataScope: res.dataScope,
          },
        },
      ]);
      if (!res.ai.available && res.ai.reason && res.dataScope !== "policy") {
        toast.info(res.ai.reason);
      }
      void refreshConversations();
    } catch (err) {
      const message = friendlyError(err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I'm sorry — ${message}`,
          meta: { available: false, source: "fallback", reason: message },
        },
      ]);
      toast.error(message);
      void refreshConversations();
    } finally {
      setSending(false);
    }
  }

  async function loadInsights() {
    if (!isAdmin || insightsLoading || sending) return;
    setInsightsLoading(true);
    const label = focus === "general" ? "Business insights" : `${titleCase(focus)} insights`;
    try {
      let targetId = conversationId;
      if (!targetId) {
        const created = await createAiConversation(label);
        targetId = created.id;
        setConversationId(created.id);
        await refreshConversations();
      }

      const res = await aiInsights({ focus, conversationId: targetId });
      if (res.conversationId) setConversationId(res.conversationId);

      const content =
        res.insights || (res.recommendations || []).join("\n\n") || "No insights available.";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: `Generate ${focus} business insights.` },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          meta: {
            model: res.ai.model,
            available: res.ai.available,
            dataAsOf: res.dataAsOf,
            alerts: res.alerts,
            metrics: res.metrics,
            reason: res.ai.reason,
            source: res.ai.available ? "groq" : "fallback",
            mode: "business",
            dataScope: "business",
          },
        },
      ]);
      if (!res.ai.available && res.ai.reason) toast.info(res.ai.reason);
      void refreshConversations();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setInsightsLoading(false);
    }
  }

  const maybeConfirm = (state: ConfirmState) => {
    if (deletingId) return;
    setConfirmState(state);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        subtitle={
          isAdmin
            ? "Chat naturally about anything, or ask about your shop. Business answers use verified data and are advisory only."
            : "Chat naturally about anything, or ask about products and stock. Operational answers use verified data and are advisory only."
        }
      />

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2 xl:grid-cols-[0.95fr_2.3fr_1fr] xl:gap-5">
        {/* Conversation history */}
        <div className="card order-2 flex min-w-0 max-h-[340px] min-h-[200px] flex-col overflow-hidden lg:max-h-[380px] xl:order-none xl:h-[clamp(360px,calc(100dvh-13rem),760px)] xl:min-h-0 xl:max-h-none">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessagesSquare className="h-4 w-4 text-brand-700" /> Conversations
            </h3>
            <Button size="sm" onClick={startNewChat} disabled={sending} title="Start a new conversation">
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {conversationsLoading ? (
              <Spinner label="Loading conversations…" className="py-6" />
            ) : conversationsError ? (
              <p className="px-3 py-6 text-center text-xs text-rose-700" role="alert">{conversationsError}</p>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs leading-5 text-slate-600" role="status">
                No saved conversations yet. Say hello and your chat history will appear here.
              </p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((conversation) => {
                  const active = conversation.id === conversationId;
                  const opening = conversation.id === openingId;
                  const removing = conversation.id === deletingId;
                  return (
                    <li key={conversation.id}>
                      <div
                        className={`group flex items-start gap-1 rounded-xl px-2 py-2 transition ${
                          active ? "bg-brand-50 ring-1 ring-brand-100" : "hover:bg-slate-50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void openConversation(conversation.id)}
                          disabled={sending || removing || opening}
                          className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                        >
                          <span
                            className={`block truncate text-sm ${
                              active ? "font-semibold text-brand-800" : "font-medium text-slate-700"
                            }`}
                          >
                            {opening ? "Opening…" : conversation.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {formatDateTime(conversation.updatedAt)} · {conversation.messageCount}{" "}
                            {conversation.messageCount === 1 ? "message" : "messages"}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete conversation ${conversation.title}`}
                          title="Delete conversation"
                          onClick={() => maybeConfirm({ type: "delete", id: conversation.id })}
                          disabled={sending || removing || opening}
                          className="mt-0.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="card order-1 flex h-[clamp(420px,calc(100dvh-14rem),760px)] min-w-0 flex-col overflow-hidden sm:h-[clamp(460px,calc(100dvh-13rem),760px)] lg:col-span-2 xl:order-none xl:col-span-1 xl:h-[clamp(460px,calc(100dvh-13rem),760px)]">
          <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 sm:px-5 xl:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{activeTitle}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                    <Activity className="h-3.5 w-3.5" /> AI status:
                  </span>
                  {statusBadge(aiStatus)}
                  {aiStatus?.provider && <span className="text-slate-500">Provider: {aiStatus.provider}</span>}
                  {aiStatus?.model && <span className="text-slate-500">Model: {aiStatus.model}</span>}
                  {aiStatus?.checkedAt && !statusLoading && (
                    <span className="text-slate-400">Checked {formatDateTime(aiStatus.checkedAt)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => maybeConfirm({ type: "clear" })}
                  disabled={sending || insightsLoading || messages.length === 0}
                  title="Clear this conversation"
                >
                  <Eraser className="h-3.5 w-3.5" /> Clear
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshStatus(true)}
                  loading={statusLoading}
                  disabled={statusLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            </div>
            {aiStatus?.note && (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                  aiStatus.providerReachable === false || aiStatus.configured === false
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <p>
                  <span className="font-medium">Diagnostic:</span> {aiStatus.note}
                </p>
                {aiStatus.errorCode && <p className="mt-1 text-amber-800">Code: {aiStatus.errorCode}</p>}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 xl:px-6">
            {openingId ? (
              <Spinner label="Loading conversation…" />
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                  <Bot className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">Hello! I'm MotorShop AI</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  {isAdmin
                    ? "Ask me anything — greetings, motorcycle questions, or how your shop is doing. Business answers use verified database aggregates, and I never invent figures."
                    : "Ask me anything — greetings, motorcycle questions, product details, or stock and restocking priorities. Operational answers use verified data, and I never invent figures."}
                </p>
                <div className="mt-6 grid w-full max-w-3xl gap-2.5 sm:grid-cols-2 xl:gap-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="space-y-4 xl:space-y-5"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Conversation transcript"
              >
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2.5 sm:gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "assistant" && (
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`min-w-0 ${
                        message.role === "user"
                          ? "flex max-w-[85%] flex-col items-end sm:max-w-[78%] xl:max-w-[72%]"
                          : "max-w-[calc(100%-3rem)] xl:max-w-[88%]"
                      }`}
                    >
                      <div
                        className={`break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
                          message.role === "user"
                            ? "rounded-br-md bg-brand-600 text-white"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <div className="space-y-3">
                            {message.meta?.mode === "business" && message.meta.metrics && (
                              <MetricGrid
                                metrics={message.meta.metrics}
                                dataAsOf={message.meta.dataAsOf}
                                scope={message.meta.dataScope}
                              />
                            )}
                            <MarkdownMessage content={message.content} />
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap break-words font-sans">{message.content}</pre>
                        )}
                      </div>
                      {message.role === "assistant" && message.meta && (
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {message.meta.source === "policy" && <Badge tone="amber">Policy response</Badge>}
                            {message.meta.source === "groq" && message.meta.available && (
                              <Badge tone="green">AI response</Badge>
                            )}
                            {message.meta.source !== "policy" &&
                              (message.meta.source === "fallback" || message.meta.available === false) && (
                                <Badge tone="amber">Fallback / unavailable</Badge>
                              )}
                            {message.meta.mode === "business" && (
                              <Badge tone="blue">
                                {message.meta.dataScope === "operational"
                                  ? "Operational data"
                                  : "Business data"}
                              </Badge>
                            )}
                            {message.meta.model && <span>Model: {message.meta.model}</span>}
                            {message.meta.dataAsOf && (
                              <span>Data as of {formatDateTime(message.meta.dataAsOf)}</span>
                            )}
                          </div>
                          {message.meta.reason && message.meta.available === false && (
                            <p className="text-xs text-amber-700">{reasonLabel(message.meta.reason)}</p>
                          )}
                          {message.meta.alerts && message.meta.alerts.length > 0 && (
                            <AlertList alerts={message.meta.alerts} />
                          )}
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-2.5 sm:gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div
                      role="status"
                      aria-label="Assistant is thinking"
                      className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-4 shadow-sm"
                    >
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-2 w-2 animate-bounce rounded-full bg-brand-400"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form onSubmit={onSend} className="shrink-0 border-t border-slate-100 bg-white p-3 sm:p-4 xl:px-5">
            <div className="flex items-end gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Message the assistant"
                placeholder={
                  isAdmin
                    ? "Ask anything — general or business…"
                    : "Ask about products, stock, or general topics…"
                }
                className="form-control h-12 min-w-0 flex-1"
                maxLength={1000}
                disabled={sending || openingId !== null}
              />
              <Button
                type="submit"
                aria-label="Send message"
                disabled={!input.trim() || sending || openingId !== null}
                loading={sending}
                className="h-12 shrink-0 px-4 sm:px-5"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
            
          </form>
        </div>

        {/* Side panel */}
        <div className="order-3 min-w-0 space-y-4 xl:order-none xl:h-[clamp(360px,calc(100dvh-13rem),760px)] xl:overflow-y-auto xl:pr-1">
          {isAdmin ? (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-2 text-brand-700">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-semibold text-slate-900">Business Insights</h3>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Generate a prioritized action plan from real shop data. Results are added to the active
                conversation.
              </p>
              <div className="mt-4 space-y-3">
                <Select
                  label="Focus"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value as typeof focus)}
                >
                  <option value="general">General</option>
                  <option value="sales">Sales</option>
                  <option value="inventory">Inventory</option>
                  <option value="profitability">Profitability</option>
                </Select>
                <Button
                  onClick={() => void loadInsights()}
                  loading={insightsLoading}
                  disabled={insightsLoading || sending}
                  className="w-full"
                >
                  <Sparkles className="h-4 w-4" /> Generate Insights
                </Button>
              </div>
            </div>
          ) : (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-2 text-brand-700">
                <Boxes className="h-5 w-5" />
                <h3 className="font-semibold text-slate-900">Operational help</h3>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Your assistant covers everyday store operations. Ask about:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• Product details, selling prices, and categories</li>
                <li>• Stock levels, low-stock items, and restocking priorities</li>
                <li>• Best-selling products by units sold</li>
                <li>• POS steps and customer service guidance</li>
              </ul>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Revenue, profit, cost, margin, financial analytics, forecasts, and administrator reports
                are not available to staff accounts.
              </div>
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900">How it works</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>• Greetings and general questions are answered conversationally without shop data.</li>
              <li>
                • {isAdmin
                  ? "Business questions use verified metrics from PostgreSQL."
                  : "Operational questions use verified product and stock data from PostgreSQL."}
              </li>
              <li>• Recent messages are kept in order so follow-ups like “it” or “that product” make sense.</li>
              <li>• The AI is advisory only and cannot execute SQL or change records.</li>
              {!isAdmin && (
                <li>• Financial and administrator-only questions are refused before any AI request.</li>
              )}
            </ul>
            <Button variant="secondary" className="mt-4 w-full" onClick={startNewChat} disabled={sending}>
              <Plus className="h-4 w-4" /> New Conversation
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.type === "delete" ? "Delete conversation?" : "Clear this conversation?"}
        message={
          confirmState?.type === "delete"
            ? "This permanently removes the conversation and all of its messages from your history."
            : "This clears the current conversation and removes it from your saved history."
        }
        confirmLabel={confirmState?.type === "delete" ? "Delete" : "Clear"}
        loading={deletingId !== null}
        onConfirm={() => void runConfirmedAction()}
        onCancel={() => {
          if (deletingId === null) setConfirmState(null);
        }}
      />
    </div>
  );
}
