# Testing report

**Environment:** Windows PowerShell, Node.js 20+, PostgreSQL/Neon, backend `tsx` server, Vite frontend.  
**Verification date:** 20 November 2026.  
**Credential handling:** credentials were read from local `.env` variables by test scripts and never printed.

## 1. Commands executed and results

| # | Command | Scope | Result |
|---:|---|---|---|
| 1 | `npm.cmd run verify` (backend) | TypeScript typecheck | **PASS** |
| 1b | `npm.cmd run build` (backend) | TypeScript build to `dist` | **PASS** |
| 2 | `npm.cmd run db:migrate` | Apply `0002_ba_recommendation_statuses` | **PASS** |
| 3 | `npm.cmd run db:seed` | Safe customer top-up, repeatable seed | **PASS** |
| 4 | `npm.cmd run db:verify` | Five dataset counts and integrity | **PASS** — 50/50/59/138/188 |
| 5 | `npm.cmd run test:ba-forecast` | Pure forecasting formulas | **7/7 PASS** |
| 6 | `npm.cmd run test:ba-api` against `http://127.0.0.1:4010` | Analytics API integration | **13/13 PASS** |
| 7 | `npm.cmd run verify` (frontend) | TypeScript typecheck after BA pages | **PASS** |
| 8 | `npm.cmd run build` (frontend) | Production build after BA pages | **PASS** — 2523 modules transformed |

## 2. Dataset verification output

| Dataset | Table | Count | Minimum | Result |
|---|---|---:|---:|---|
| Products | `products` | 50 | 50 | PASS |
| Customers | `customers` | 50 | 50 | PASS |
| Sales | `sales` | 59 | 50 | PASS |
| Sale Items | `sale_items` | 138 | 50 | PASS |
| Inventory Movements | `inventory_movements` | 188 | 50 | PASS |

Integrity: first sale **2026-07-26**, last sale **2026-11-17**, **0** cancelled sales.

## 3. Forecast unit tests — 7/7

1. Linear regression slope — PASS (`slope=1`).
2. Date arithmetic across month boundary — PASS (`2026-01-31 + 1d`).
3. Constant history uses weighted moving average — PASS (`7d estimate=700`).
4. Material trend uses linear regression — PASS.
5. Insufficient history is not forecast — PASS (empty forecast, reason returned).
6. Product demand estimates stockout risk — PASS (`predicted=300`, `days=5`, `critical`).
7. Sparse product history is not forecast — PASS (`null` prediction, `unknown` risk).

## 4. Analytics API integration tests — 13/13

1. Admin login — PASS.
2. Dataset endpoint returns actual counts — PASS.
3. All five datasets have at least 50 records — PASS.
4. Descriptive analytics uses real records — PASS.
5. Average order value equals revenue ÷ transactions — PASS.
6. Predictive analytics returns a statistical forecast — PASS (30 rows, method returned).
7. Forecast periods 7/30/90 are exposed — PASS.
8. Product demand forecast is tied to history — PASS.
9. Prescriptive analytics returns evidence-linked recommendations — PASS.
10. Workflow connects all three stages — PASS (3 ordered steps with handoffs).
11. Recommendation status can be recorded by admin — PASS.
12. Staff cannot access predictive analytics — PASS (HTTP 403).
13. Staff can view dataset counts — PASS (HTTP 200).

The API test reset the inspected recommendation status back to `pending` with the note `Verified by automated API test.` so the database was left in a neutral decision state.

## 5. UI checks performed

- Opened `/login` in the in-app browser: page rendered with no unexpected console errors.
- Opened `/analytics/overview` while unauthenticated: protected route redirected to `/login`; only expected 401 responses from `/auth/me` and `/auth/csrf` were observed.
- Production build succeeded, confirming all BA routes, charts, and pages compile into the distributable bundle.

**Manual verification still recommended before submission:** log in as admin and visually exercise the dataset strip, filter apply/reset, forecast chart, recommendation status buttons, and product/horizon selection on `/analytics/process`. This step requires entering local credentials interactively and was intentionally not automated in the browser script to avoid exposing secrets.

## 6. Prior baseline evidence (unchanged modules)

- Security suite previously recorded **18/18 PASS** in `backend/security-test-output.txt`.
- AI mocked suite previously recorded **19/19 PASS**.
- Live Groq verification previously recorded provider reachable and admin/staff 200/403 behavior.

These suites were not re-run after the BA changes because the BA work did not alter their modules; run them again if the deployment environment changes.

## 7. Known issues / limitations

- No functional defects were found in the executed BA checks.
- Forecast quality is limited by the available sales window; the API explicitly reports `sufficientData`, method, and limitations.
- No instructor rating sheet was found in the workspace; an editable template was created.
- Authenticated browser interaction is the only remaining manual verification item.
