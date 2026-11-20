# Analytics API documentation

Base URL: `http://localhost:7000/api` (or the deployed backend URL). All endpoints return the standard JSON envelope `{ "data": ... }` with optional `meta`.

Authentication uses the existing JWT/cookie mechanism. Examples use `$TOKEN` as a placeholder; never paste a real secret into documentation or source.

## 1. Analytics endpoints

| Method | Endpoint | Permission | Access |
|---|---|---|---|
| GET | `/analytics/dashboard` | `analytics:dashboard` | Admin + staff |
| GET | `/analytics/sales` | `analytics:sales` | Admin |
| GET | `/analytics/products` | `analytics:products` | Admin |
| GET | `/analytics/datasets` | `analytics:datasets` | Admin + staff |
| GET | `/analytics/descriptive` | `analytics:descriptive` | Admin |
| GET | `/analytics/predictive` | `analytics:predictive` | Admin |
| GET | `/analytics/prescriptive` | `analytics:prescriptive` | Admin |
| GET | `/analytics/workflow` | `analytics:workflow` | Admin |
| PATCH | `/analytics/recommendations/:key/status` | `analytics:prescriptive` | Admin |

## 2. Shared query filters

| Parameter | Type | Validation | Notes |
|---|---|---|---|
| `from` | string | `YYYY-MM-DD` | Optional range start |
| `to` | string | `YYYY-MM-DD` | Optional range end |
| `days` | number | 7–365, default 90 | Used when explicit dates are omitted |
| `groupBy` | enum | `day`, `week`, `month`, `year` | Default `day` |
| `productId` | UUID | optional | Filters sales and product rows |
| `categoryId` | UUID | optional | Filters sales and product rows |
| `horizon` | enum | `7`, `30`, `90` | Predictive/prescriptive/workflow only, default `30` |

## 3. Example requests

```powershell
# Live dataset counts
curl -H "Authorization: Bearer $TOKEN" `
  http://localhost:7000/api/analytics/datasets

# Descriptive analytics for the last 30 days
curl -H "Authorization: Bearer $TOKEN" `
  "http://localhost:7000/api/analytics/descriptive?days=30&groupBy=day"

# 30-day forecast
curl -H "Authorization: Bearer $TOKEN" `
  "http://localhost:7000/api/analytics/predictive?days=30&horizon=30"

# Recommendations
curl -H "Authorization: Bearer $TOKEN" `
  "http://localhost:7000/api/analytics/prescriptive?days=30&horizon=30"

# Connected workflow
curl -H "Authorization: Bearer $TOKEN" `
  "http://localhost:7000/api/analytics/workflow?days=30&horizon=30"

# Record a human decision
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" `
  -d '{"status":"accepted","note":"Reviewed in weekly meeting."}' `
  "http://localhost:7000/api/analytics/recommendations/restock%3A%3Cproduct-id%3E%3A30d/status"
```

## 4. Response highlights

- `datasets` returns the five dataset rows, integrity dates, cancellation count, and PASS/FAIL status.
- `descriptive` returns `sales`, `products`, `customers`, `inventory`, and `financial` objects.
- `predictive` returns `sales.forecast`, `sales.forecastPeriods`, `productDemand`, `inventoryRisk`, `methodology`, and `limitations`.
- `prescriptive` returns `recommendations`, `purchasingSummary`, `basis`, and `requiresHumanApproval`.
- `workflow` returns `focusProduct`, `availableProducts`, `contextSummary`, and the three-step `chain`.

## 5. Validation and error behavior

- Invalid query values are rejected by Zod before the service runs.
- Missing or insufficient permissions return the existing `FORBIDDEN` error.
- Staff requests to predictive/prescriptive/workflow endpoints were verified to return HTTP 403.
- Recommendation keys are limited to 3–200 characters; notes are limited to 500 characters.
- Forecasts with insufficient data return `sufficientData: false` and an empty forecast rather than an error.

## 6. Frontend client

All calls are centralized in `frontend/src/services/data.service.ts`:

`getDatasetCounts`, `getDescriptiveAnalytics`, `getPredictiveAnalytics`, `getPrescriptiveAnalytics`, `getBusinessWorkflow`, `updateRecommendationStatus`.

The pages never call external AI providers or databases directly.
