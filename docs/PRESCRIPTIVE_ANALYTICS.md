# Prescriptive analytics

## 1. Question answered

**What should the manager consider doing?** Prescriptive analytics converts observed evidence and statistical forecasts into ranked, reviewable actions. It never executes the action.

## 2. Endpoint

`GET /api/analytics/prescriptive`

Status updates: `PATCH /api/analytics/recommendations/:key/status`

## 3. Recommendation rules

| Type | Trigger | Action |
|---|---|---|
| `restock` | Product has a forecasted stockout risk and a positive reorder quantity | Purchase approximately the calculated reorder quantity before stock reaches minimum |
| `declining_demand` | Sufficient product forecast with decreasing trend and no existing restock recommendation | Review price, placement, and promotion before another order |
| `excess_inventory` | In-stock product with zero recent 30-day sales | Pause reorders; consider bundle or promotion |
| `sales_focus` | Highest-revenue product in the descriptive period | Keep available and feature in promotion or bundle |
| `business_improvement` | Descriptive revenue growth is negative | Run a targeted promotion on proven sellers and review stock availability |
| `purchasing_plan` | Always generated from the aggregate reorder plan | Review supplier prices and approve an estimated budget |

Recommendations are sorted by priority: `critical`, `high`, `medium`, `low`, then alphabetically by title.

## 4. Evidence carried from earlier stages

Each recommendation stores:

- `supportingHistoricalData` — a descriptive fact such as historical units or current stock;
- `predictedResult` — the forecasted demand, trend, or risk;
- `recommendedAction` — the proposed human decision;
- `reason` — why the action follows from the evidence;
- `priority` and `type`.

The `basis` object on the response records the descriptive range and forecast period used, so a reviewer can see which snapshot produced the suggestion.

## 5. Purchasing summary

```text
suggestedUnits = Σ positive suggested reorder quantities
estimatedCost  = Σ (suggested reorder quantity × product purchase price)
```

Both values are estimates for budget review, not purchase orders.

## 6. Human decision workflow

Every recommendation has a deterministic key such as `restock:<product-id>:30d`. The `ba_recommendation_statuses` table stores:

- `key` (unique), `status`, optional `note`, `decided_by`, `decided_at`, `created_at`.

Allowed statuses: `pending`, `accepted`, `rejected`, `completed`. Updating a status is permission-protected (`analytics:prescriptive`) and writes an audit log entry (`BA_RECOMMENDATION_STATUS`). The UI provides Accept, Reject, Mark done, and Reset to pending controls.

## 7. Safety and limitations

- Recommendations are advisory. No POS, inventory, supplier, or customer data is modified.
- A recommendation is regenerated per horizon; the decision key includes the horizon to avoid mixing 7-day and 30-day decisions.
- Sparse products remain `unknown` in prediction and therefore do not receive invented restock quantities.
- Financial recommendations are admin-only; staff cannot read or update them.
