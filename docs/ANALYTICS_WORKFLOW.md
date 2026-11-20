# Connected analytics workflow

## 1. Purpose

The requirement is not three unrelated reports. The system must demonstrate that each stage uses the previous stage's output. This document explains the implementation and how to verify it in the UI.

## 2. One shared snapshot

`GET /api/analytics/workflow` calls `buildBundle(input, horizon)`, which loads a single analytics context containing:

- filtered sales totals and daily series;
- product-level units, revenue, cost, stock, and recent/prior 30-day quantities;
- customer aggregates;
- inventory snapshots and movement summaries;
- current recommendation decision statuses.

From that context the service builds descriptive, predictive, and prescriptive results in order. The same objects are returned so the UI cannot silently combine different ranges.

## 3. Explicit handoffs

| Stage | Uses previous output | Produces next output |
|---|---|---|
| Descriptive | Validated DB snapshot | Daily revenue/transaction series, product rankings, growth %, stock snapshot |
| Predictive | Descriptive daily series and product history | Forecast rows, demand ranking, stockout risk, suggested reorder quantities |
| Prescriptive | Forecast rows plus descriptive rankings/growth/stock | Ranked recommendations, purchasing summary, decision statuses |

The Connected Process page renders these handoffs as `inputFromPreviousStep` and `outputToNextStep` on every stage card.

## 4. Interactive trace

On `/analytics/process` the administrator can:

1. choose a 7, 30, or 90-day horizon;
2. choose a product from `availableProducts`, or leave it on auto-select;
3. trace that product through all three stages;
4. copy an AI prompt that asks for an explanation of the same trace.

Auto-selection picks the first product attached to a recommendation, then falls back to the first ranked product. This ensures the workflow always has a concrete example when sales exist.

## 5. Verification checklist

- Open `/analytics/process`.
- Confirm the focus product is shown with SKU, category, and current stock.
- Read the descriptive card's `Output to next stage`.
- Confirm the predictive card's `Input from previous stage` matches that series.
- Read the predictive card's `Output to next stage`.
- Confirm the prescriptive card uses the predicted demand and stock risk.
- Change the product and horizon, then trace again. The values and recommendation key should change accordingly.

## 6. Why this counts as connected

The connection is enforced in server code, not just in page copy. The predictive builder receives the descriptive series object; the prescriptive builder receives the predictive result and descriptive result. The workflow endpoint returns the three resulting step records from one call. No separate browser-side calculation is involved.
