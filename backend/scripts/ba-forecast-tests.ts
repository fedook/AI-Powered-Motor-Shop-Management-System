/** Deterministic unit checks for the forecasting formulas (no database needed). */
import {
  addUtcDays,
  forecastProductDemand,
  forecastSales,
  linearRegression,
  type DailySalesPoint,
} from "../src/services/forecast";

const results: Array<{ name: string; passed: boolean; detail: string }> = [];
function check(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

function series(length: number, value: number): DailySalesPoint[] {
  return Array.from({ length }, (_, index) => ({
    date: addUtcDays("2026-01-01", index),
    revenue: value,
    transactions: 1,
    units: 1,
  }));
}

check("linear regression slope", linearRegression([0, 1, 2, 3]).slope === 1, "slope=1");
check("date arithmetic handles month boundary", addUtcDays("2026-01-31", 1) === "2026-02-01", "2026-01-31 + 1d");

const constant = forecastSales(series(30, 100), 7);
check(
  "constant history uses moving average",
  constant.sufficientData && constant.method === "weighted_moving_average" && constant.expectedRevenue === 700,
  `method=${constant.method}, 7d estimate=${constant.expectedRevenue}`,
);

const trending = series(40, 100).map((point, index) => ({ ...point, revenue: 100 + index * 10 }));
const trendForecast = forecastSales(trending, 7);
check(
  "material trend uses linear regression",
  trendForecast.sufficientData && trendForecast.method === "linear_regression" && trendForecast.forecast[0]!.predictedRevenue > 100,
  `method=${trendForecast.method}, day1=${trendForecast.forecast[0]?.predictedRevenue}`,
);

const short = forecastSales(series(5, 100), 7);
check(
  "insufficient history is not forecast",
  !short.sufficientData && short.forecast.length === 0,
  short.reason ?? "no reason",
);

const demand = forecastProductDemand({
  historicalQuantity: 900,
  historicalRevenue: 45000,
  lookbackDays: 90,
  recentQuantity: 60,
  priorQuantity: 60,
  activeDays: 20,
  stockQuantity: 10,
  minimumStock: 8,
  horizon: 30,
});
check(
  "product demand estimates stockout risk",
  demand.sufficientData &&
    demand.predictedQuantity === 300 &&
    demand.daysUntilDepletion === 5 &&
    demand.stockoutRisk === "critical" &&
    demand.suggestedReorderQuantity > 0,
  `predicted=${demand.predictedQuantity}, days=${demand.daysUntilDepletion}, risk=${demand.stockoutRisk}, reorder=${demand.suggestedReorderQuantity}`,
);

const sparse = forecastProductDemand({
  historicalQuantity: 1,
  historicalRevenue: 500,
  lookbackDays: 90,
  recentQuantity: 1,
  priorQuantity: 0,
  activeDays: 1,
  stockQuantity: 3,
  minimumStock: 2,
  horizon: 30,
});
check(
  "sparse product history is not forecast",
  !sparse.sufficientData && sparse.predictedQuantity === null && sparse.stockoutRisk === "unknown",
  sparse.reason ?? "no reason",
);

const failed = results.filter((item) => !item.passed);
console.log(`\n[Forecast tests] ${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) process.exitCode = 1;
