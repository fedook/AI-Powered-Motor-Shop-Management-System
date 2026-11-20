/**
 * Integration smoke tests for the Business Analytics API.
 *
 * Run against a local server:
 *   $env:BA_TEST_BASE_URL="http://127.0.0.1:4010"; npx tsx scripts/ba-api-tests.ts
 *
 * Credentials are read from the environment; they are never printed.
 */
import "dotenv/config";
import { z } from "zod";

const env = z
  .object({
    ADMIN_EMAIL: z.string().email(),
    ADMIN_PASSWORD: z.string().min(1),
    STAFF_EMAIL: z.string().email(),
    STAFF_PASSWORD: z.string().min(1),
    BA_TEST_BASE_URL: z.string().url().optional().default("http://127.0.0.1:4010"),
  })
  .parse(process.env);

interface ApiResponse {
  status: number;
  data: any;
  cookie: string;
  csrfToken?: string;
}

async function call(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; csrfToken?: string } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.csrfToken) headers["x-csrf-token"] = options.csrfToken;
  const response = await fetch(`${env.BA_TEST_BASE_URL}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const rawCookies = response.headers.getSetCookie?.() ?? [];
  const cookie = rawCookies.map((value) => value.split(";")[0]).join("; ");
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, cookie, csrfToken: data?.data?.csrfToken };
}

const results: Array<{ name: string; passed: boolean; detail: string }> = [];
function check(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function main() {
  const adminLogin = await call("/auth/login", {
    method: "POST",
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  check("admin login", adminLogin.status === 200, `HTTP ${adminLogin.status}`);
  if (adminLogin.status !== 200) return;
  const adminCookie = adminLogin.cookie;
  const csrfToken = adminLogin.csrfToken ?? "";

  const datasets = await call("/analytics/datasets", { cookie: adminCookie });
  check(
    "dataset endpoint returns actual counts",
    datasets.status === 200 && Array.isArray(datasets.data?.data?.datasets),
    `HTTP ${datasets.status}`,
  );
  const datasetRows = datasets.data?.data?.datasets ?? [];
  check(
    "all five datasets have at least 50 records",
    datasetRows.length === 5 && datasetRows.every((row: any) => row.count >= 50),
    datasetRows.map((row: any) => `${row.table}:${row.count}`).join(", "),
  );

  const descriptive = await call("/analytics/descriptive?days=90", { cookie: adminCookie });
  const d = descriptive.data?.data;
  check(
    "descriptive analytics uses real records",
    descriptive.status === 200 && d?.sales?.totalTransactions > 0 && d?.sales?.series?.daily?.length >= 28,
    `transactions=${d?.sales?.totalTransactions}, daily buckets=${d?.sales?.series?.daily?.length ?? 0}`,
  );
  check(
    "average order value equals revenue over transactions",
    descriptive.status === 200 &&
      Math.abs(d.sales.averageOrderValue - d.sales.totalSalesRevenue / d.sales.totalTransactions) < 0.05,
    `AOV=${d?.sales?.averageOrderValue}`,
  );

  const predictive = await call("/analytics/predictive?days=90&horizon=30", { cookie: adminCookie });
  const p = predictive.data?.data;
  check(
    "predictive analytics returns statistical forecast",
    predictive.status === 200 &&
      p?.sales?.sufficientData === true &&
      p?.sales?.forecast?.length === 30 &&
      typeof p?.sales?.method === "string",
    `method=${p?.sales?.method}, 30-day estimate=${p?.sales?.expectedRevenue}, historicalDays=${p?.historicalDays}`,
  );
  check(
    "forecast periods 7/30/90 are exposed",
    predictive.status === 200 && p?.sales?.forecastPeriods?.length === 3,
    (p?.sales?.forecastPeriods ?? []).map((x: any) => `${x.horizonDays}d:${x.expectedRevenue}`).join(", "),
  );
  check(
    "product demand forecast is tied to history",
    predictive.status === 200 &&
      Array.isArray(p?.productDemand?.ranking) &&
      p.productDemand.ranking.some((item: any) => item.historicalQuantity > 0 && item.sufficientData),
    `ranked products=${p?.productDemand?.ranking?.length ?? 0}`,
  );

  const prescriptive = await call("/analytics/prescriptive?days=90&horizon=30", { cookie: adminCookie });
  const r = prescriptive.data?.data;
  check(
    "prescriptive analytics returns evidence-linked recommendations",
    prescriptive.status === 200 &&
      Array.isArray(r?.recommendations) &&
      r.recommendations.length > 0 &&
      r.recommendations.every(
        (item: any) => item.supportingHistoricalData && item.predictedResult && item.recommendedAction && item.priority,
      ),
    `recommendations=${r?.recommendations?.length ?? 0}`,
  );

  const workflow = await call("/analytics/workflow?days=90&horizon=30", { cookie: adminCookie });
  const w = workflow.data?.data;
  check(
    "workflow connects all three stages",
    workflow.status === 200 &&
      w?.sufficientData === true &&
      w?.chain?.length === 3 &&
      w.chain[0]?.stage === "descriptive" &&
      w.chain[1]?.stage === "predictive" &&
      w.chain[2]?.stage === "prescriptive" &&
      Boolean(w.chain[1]?.inputFromPreviousStep) &&
      Boolean(w.chain[2]?.inputFromPreviousStep),
    `focus=${w?.focusProduct?.name ?? "n/a"}, steps=${w?.chain?.length ?? 0}`,
  );

  if (r?.recommendations?.[0]) {
    const key = r.recommendations[0].key as string;
    const updated = await call(`/analytics/recommendations/${encodeURIComponent(key)}/status`, {
      method: "PATCH",
      cookie: adminCookie,
      csrfToken,
      body: { status: "pending", note: "Verified by automated API test." },
    });
    check(
      "recommendation status can be recorded by admin",
      updated.status === 200 && updated.data?.data?.status === "pending",
      `HTTP ${updated.status}`,
    );
  }

  const staffLogin = await call("/auth/login", {
    method: "POST",
    body: { email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD },
  });
  if (staffLogin.status === 200) {
    const forbidden = await call("/analytics/predictive?days=90", { cookie: staffLogin.cookie });
    check(
      "staff cannot access predictive analytics",
      forbidden.status === 403,
      `HTTP ${forbidden.status}`,
    );
    const staffDatasets = await call("/analytics/datasets", { cookie: staffLogin.cookie });
    check("staff can view dataset counts", staffDatasets.status === 200, `HTTP ${staffDatasets.status}`);
  }

  const failed = results.filter((item) => !item.passed);
  console.log(`\n[BA API tests] ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[BA API tests] Error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
