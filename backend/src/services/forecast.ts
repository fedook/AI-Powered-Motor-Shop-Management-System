/**
 * Pure, deterministic forecasting helpers used by the Business Analytics API.
 *
 * These functions contain no database or AI calls. They receive verified
 * historical aggregates from the BA service and return estimates that are
 * always labelled as estimates by the API and the UI.
 */

export interface DailySalesPoint {
  date: string;
  revenue: number;
  transactions: number;
  units: number;
}

export interface ForecastDay {
  date: string;
  predictedRevenue: number;
  predictedTransactions: number;
}

export interface SalesForecastResult {
  method: "linear_regression" | "weighted_moving_average" | "simple_moving_average";
  methodDescription: string;
  historicalPeriod: { from: string; to: string };
  historicalDays: number;
  activeDays: number;
  sufficientData: boolean;
  reason?: string;
  forecast: ForecastDay[];
  expectedRevenue: number;
  expectedTransactions: number;
  limitations: string[];
}

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Ordinary least squares over x = 0..n-1. */
export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: values[0] ?? 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    numerator += dx * ((values[i] ?? 0) - meanY);
    denominator += dx * dx;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

function weightedAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const weights = values.map((_, index) => index + 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return values.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0) / totalWeight;
}

/**
 * Forecasts daily revenue and transactions from a complete daily series.
 * Missing days must be supplied as zero-value points by the caller so that the
 * model learns the true demand rate instead of ignoring quiet periods.
 */
export function forecastSales(
  series: DailySalesPoint[],
  horizon: number,
  options?: { today?: string; minimumDays?: number },
): SalesForecastResult {
  const minimumDays = options?.minimumDays ?? 14;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const historicalPeriod = {
    from: sorted[0]?.date ?? "",
    to: sorted[sorted.length - 1]?.date ?? "",
  };
  const activeDays = sorted.filter(
    (point) => point.transactions > 0 || point.revenue > 0 || point.units > 0,
  ).length;

  const limitations = [
    "Estimates only — actual sales depend on demand, pricing, stock availability and external factors.",
    "Completed sales only; cancelled transactions are excluded.",
    `Historical window: ${historicalPeriod.from || "n/a"} to ${historicalPeriod.to || "n/a"}.`,
  ];

  if (sorted.length < minimumDays || activeDays < 5) {
    return {
      method: "simple_moving_average",
      methodDescription: "No forecast was produced because the history is too short or empty.",
      historicalPeriod,
      historicalDays: sorted.length,
      activeDays,
      sufficientData: false,
      reason: `At least ${minimumDays} daily periods and 5 active selling days are required; found ${sorted.length} periods and ${activeDays} active days.`,
      forecast: [],
      expectedRevenue: 0,
      expectedTransactions: 0,
      limitations: [...limitations, "Insufficient historical data — figures are intentionally not estimated."],
    };
  }

  const revenueValues = sorted.map((point) => point.revenue);
  const transactionValues = sorted.map((point) => point.transactions);
  const meanRevenue = revenueValues.reduce((sum, value) => sum + value, 0) / revenueValues.length;
  const revenueFit = linearRegression(revenueValues);
  const transactionFit = linearRegression(transactionValues);
  const trendIsMaterial = Math.abs(revenueFit.slope) > Math.max(1, meanRevenue * 0.02);
  const method: SalesForecastResult["method"] =
    sorted.length >= 30 && trendIsMaterial
      ? "linear_regression"
      : sorted.length >= 7
        ? "weighted_moving_average"
        : "simple_moving_average";

  const methodDescription =
    method === "linear_regression"
      ? "A straight-line trend (linear regression) fitted to daily completed-sale revenue; the same slope is applied to transaction counts."
      : method === "weighted_moving_average"
        ? "Recent seven days are averaged with larger weights on the newest days; the average is carried forward."
        : "The average of the available daily history is carried forward.";

  const lastDate = sorted[sorted.length - 1]?.date ?? "";
  const forecast: ForecastDay[] = [];
  for (let step = 1; step <= horizon; step += 1) {
    let predictedRevenue: number;
    let predictedTransactions: number;
    if (method === "linear_regression") {
      const x = sorted.length - 1 + step;
      predictedRevenue = revenueFit.intercept + revenueFit.slope * x;
      predictedTransactions = transactionFit.intercept + transactionFit.slope * x;
    } else if (method === "weighted_moving_average") {
      predictedRevenue = weightedAverage(revenueValues.slice(-7));
      predictedTransactions = weightedAverage(transactionValues.slice(-7));
    } else {
      predictedRevenue = meanRevenue;
      predictedTransactions = transactionValues.reduce((sum, value) => sum + value, 0) / transactionValues.length;
    }
    forecast.push({
      date: addUtcDays(lastDate, step),
      predictedRevenue: round2(Math.max(0, predictedRevenue)),
      predictedTransactions: Math.max(0, Math.round(predictedTransactions)),
    });
  }

  return {
    method,
    methodDescription,
    historicalPeriod,
    historicalDays: sorted.length,
    activeDays,
    sufficientData: true,
    forecast,
    expectedRevenue: round2(forecast.reduce((sum, day) => sum + day.predictedRevenue, 0)),
    expectedTransactions: forecast.reduce((sum, day) => sum + day.predictedTransactions, 0),
    limitations: [
      ...limitations,
      "Linear regression assumes the recent trend continues; a trend break can make estimates inaccurate.",
      "Moving averages react slowly to sudden changes and cannot predict one-off events.",
    ],
  };
}

export interface ProductDemandInput {
  historicalQuantity: number;
  historicalRevenue: number;
  lookbackDays: number;
  recentQuantity: number;
  priorQuantity: number;
  activeDays: number;
  stockQuantity: number;
  minimumStock: number;
  horizon: number;
  leadTimeDays?: number;
}

export interface ProductDemandResult {
  sufficientData: boolean;
  reason?: string;
  predictedQuantity: number | null;
  expectedDemandTrend: "increasing" | "decreasing" | "stable" | "unknown";
  averageDailyDemand: number | null;
  daysUntilDepletion: number | null;
  stockoutRisk: "critical" | "high" | "medium" | "low" | "unknown";
  suggestedReorderQuantity: number;
  methodology: string;
}

/**
 * Product-level demand and stockout estimate. Requires several active selling
 * days before any quantity is predicted; sparse items remain explicitly
 * "unknown" rather than receiving invented forecasts.
 */
export function forecastProductDemand(input: ProductDemandInput): ProductDemandResult {
  const leadTimeDays = input.leadTimeDays ?? 7;
  const methodology =
    "Historical units divided by calendar days gives average daily demand. The last 30 days are compared with the previous 30 days to adjust the trend (limited to 0.5x–1.5x). Days until depletion = current stock ÷ average daily demand.";

  if (input.activeDays < 3 || input.historicalQuantity <= 0 || input.lookbackDays <= 0) {
    return {
      sufficientData: false,
      reason: "Fewer than 3 active selling days in the historical window.",
      predictedQuantity: null,
      expectedDemandTrend: "unknown",
      averageDailyDemand: null,
      daysUntilDepletion: null,
      stockoutRisk: "unknown",
      suggestedReorderQuantity: input.stockQuantity < input.minimumStock
        ? input.minimumStock - input.stockQuantity
        : 0,
      methodology,
    };
  }

  const averageDailyDemand = input.recentQuantity / 30;
  const priorDaily = input.priorQuantity / 30;
  const trendRatio = priorDaily > 0
    ? clamp(averageDailyDemand / priorDaily, 0.5, 1.5)
    : averageDailyDemand > 0
      ? 1.2
      : 1;
  const predictedQuantity = Math.max(
    0,
    Math.round((input.historicalQuantity / input.lookbackDays) * input.horizon * trendRatio),
  );
  const daysUntilDepletion =
    averageDailyDemand > 0 ? Math.floor(input.stockQuantity / averageDailyDemand) : null;

  let stockoutRisk: ProductDemandResult["stockoutRisk"] = "low";
  if (daysUntilDepletion === null) stockoutRisk = "unknown";
  else if (daysUntilDepletion <= 7) stockoutRisk = "critical";
  else if (daysUntilDepletion <= 14) stockoutRisk = "high";
  else if (daysUntilDepletion <= 30) stockoutRisk = "medium";
  if (input.minimumStock > 0 && input.stockQuantity <= input.minimumStock && stockoutRisk === "low") {
    stockoutRisk = "medium";
  }

  const safetyStockDays = 3;
  const target = averageDailyDemand * (leadTimeDays + safetyStockDays);
  const reorderCandidate = Math.ceil(target - input.stockQuantity);
  const minimumTopUp = Math.max(0, input.minimumStock - input.stockQuantity);
  const suggestedReorderQuantity = Math.max(0, reorderCandidate, minimumTopUp);

  return {
    sufficientData: true,
    predictedQuantity,
    expectedDemandTrend:
      trendRatio > 1.1 ? "increasing" : trendRatio < 0.9 ? "decreasing" : "stable",
    averageDailyDemand: round2(averageDailyDemand),
    daysUntilDepletion,
    stockoutRisk,
    suggestedReorderQuantity,
    methodology,
  };
}
