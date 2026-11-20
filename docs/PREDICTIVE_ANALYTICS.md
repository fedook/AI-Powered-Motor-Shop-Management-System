# Predictive analytics

## 1. Question answered

**What is likely to happen?** Predictive analytics estimates short-term revenue, transactions, product demand, and stockout timing from the same verified historical snapshot used by descriptive analytics.

## 2. Endpoint

`GET /api/analytics/predictive`

In addition to the shared filters, `horizon` accepts `7`, `30`, or `90` days. The response includes method names, method descriptions, historical period, active selling days, forecast rows, product demand rows, inventory risk rows, and limitations.

## 3. Revenue and transaction forecast

Implemented in `backend/src/services/forecast.ts` as pure functions with no database or AI calls.

1. Build a complete daily series for the selected range, filling days with no sales as zero. This prevents quiet periods from being ignored.
2. Require at least **14 daily periods** and **5 active selling days**. If not met, `sufficientData=false` and no numbers are invented.
3. Fit ordinary least squares to daily revenue and transaction counts.
4. Use **linear regression** when the series has at least 30 days and `|slope| > max(1, meanRevenue × 0.02)`. The same fitted slope is applied to transaction counts.
5. Otherwise use a **7-day weighted moving average**, with weights 1 through 7 so the newest day has the largest influence.
6. Clip predictions at zero, round revenue to two decimals and transactions to whole numbers, then extend dates from the last historical day.

`expectedRevenue` and `expectedTransactions` are the sums of the horizon rows.

## 4. Product demand forecast

Product-level forecasting requires at least **3 active selling days** and positive historical units. Sparse products return `predictedQuantity = null`, `expectedDemandTrend = unknown`, and a reason instead of a fabricated value.

For products with sufficient evidence:

```text
averageDailyDemand = recent 30-day units ÷ 30
priorDaily         = prior 30-day units ÷ 30
trendRatio         = clamp(averageDailyDemand ÷ priorDaily, 0.5, 1.5)
predictedQuantity  = round((historyUnits ÷ historyDays) × horizon × trendRatio)
daysUntilDepletion = floor(currentStock ÷ averageDailyDemand)
```

Trend classification: `increasing` above 1.1, `decreasing` below 0.9, otherwise `stable`.

## 5. Stockout risk and reorder quantity

| Days until depletion | Risk |
|---:|---|
| ≤ 7 | critical |
| 8–14 | high |
| 15–30 | medium |
| > 30 | low |
| no demand estimate | unknown |

A product at or below minimum stock is raised to at least `medium` risk. Reorder quantity is the largest of:

```text
ceil(averageDailyDemand × (7-day lead time + 3 safety days) − currentStock)
max(0, minimumStock − currentStock)
0
```

## 6. Forecast periods and limitations

The API also returns `forecastPeriods` for 7, 30, and 90 days so the UI can show how each horizon behaves. Every response includes limitations such as:

- estimates only, not guarantees;
- completed sales only;
- historical window boundaries;
- linear regression assumes the recent trend continues;
- moving averages react slowly to sudden changes.

## 7. Verification

`npm.cmd run test:ba-forecast` executes 7 deterministic checks covering linear trend selection, weighted average selection, insufficient data, product trend bounds, stockout classification, depletion math, and reorder calculation. All 7 passed in the recorded run.
