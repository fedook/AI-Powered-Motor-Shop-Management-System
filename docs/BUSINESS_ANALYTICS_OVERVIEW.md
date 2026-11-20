# Business Analytics Overview

## 1. Purpose

The Business Analytics layer turns the motor shop's existing operational records into a connected decision-support workflow. It does not replace the POS, inventory, customer, authentication, or AI modules. Instead, it reads their persisted data and produces:

1. **Descriptive analytics** — what happened, based on completed transactions and current master data.
2. **Predictive analytics** — what is likely to happen, using transparent statistical methods.
3. **Prescriptive analytics** — what the manager should consider doing, with a stored human decision status.

## 2. Implemented user pages

| Route | Page | Access | Description |
|---|---|---|---|
| `/analytics/overview` | Business Analytics Overview | All authenticated users | 13-section case study with live dataset verification; financial outputs hidden from staff |
| `/reports` and `/analytics` | Business Analytics Dashboard | Admin | Filters, KPIs, charts, forecasts, recommendation decision queue |
| `/analytics/process` | Connected Analytics Process | Admin | Product-selectable trace showing the handoff between the three stages |

The original Reports page was rewritten as the Business Analytics Dashboard rather than duplicated, preserving the existing API and UI architecture.

## 3. Verified dataset counts

The endpoint `GET /api/analytics/datasets` and script `npm.cmd run db:verify` both report:

| Dataset | Table | Actual count | Minimum | Result |
|---|---|---:|---:|---|
| Products | `products` | 50 | 50 | PASS |
| Customers | `customers` | 50 | 50 | PASS |
| Sales | `sales` | 59 | 50 | PASS |
| Sale Items | `sale_items` | 138 | 50 | PASS |
| Inventory Movements | `inventory_movements` | 188 | 50 | PASS |

Sales span **2026-07-26** to **2026-11-17** with **0 cancelled** transactions at verification time.

## 4. Key design decisions

- A single `ba.service.ts` builds one shared DB snapshot and derives all three stages from it. This prevents the stages from using different numbers.
- Forecasting lives in a pure `forecast.ts` module. No AI model invents forecast figures.
- Only one new table was added: `ba_recommendation_statuses`, which stores an auditable decision on a generated recommendation.
- The seeder only topped customers from 48 to 50. It did not delete, truncate, or rewrite existing records.
- Staff receive dataset counts and role-safe overview content; all financial, predictive, prescriptive, and workflow data remains admin-only.

## 5. Evidence

- Forecast unit tests: **7/7 passed** (`npm.cmd run test:ba-forecast`).
- Analytics API integration checks: **13/13 passed** (`npm.cmd run test:ba-api`).
- Backend typecheck: passed.
- Frontend typecheck and production build: passed.
- Full detail is in [TESTING_REPORT.md](./TESTING_REPORT.md).
