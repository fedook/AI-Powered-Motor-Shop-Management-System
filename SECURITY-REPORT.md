# Motor Shop Management System — Security Hardening Report

**Date:** 17 November 2026
**Scope:** Confidentiality, Integrity and Availability (CIA) hardening with strict role-based
access control (RBAC), with emphasis on preventing Staff accounts from receiving confidential
financial/administrator data — including through the Groq AI assistant, conversation history and
dashboard APIs.
**Constraint honoured:** the existing application was audited and hardened in place. Auth, database,
POS, AI Markdown/HCI rendering and existing endpoints were preserved, not rebuilt.

---

## 1. Executive summary

The backend now enforces a single, centralized permission policy for every protected route.
Roles are always loaded from PostgreSQL by `requireAuth`; client-supplied roles are ignored.
All AI requests pass through a deterministic, pre-provider policy gate, and the AI context is built
by separate Admin and Staff builders so Staff context can never contain revenue, profit, COGS,
margins, valuation, financial analytics or administrator data.

Two real field-leak defects were found by the new tests and fixed:

1. **Staff inventory rows leaked `purchasePrice`** — the raw database column was spread into the
   response before the role guard (`backend/src/services/inventory.service.ts`).
2. **Staff sale detail leaked per-item `costPrice`** — the same spread pattern exposed COGS per line
   (`backend/src/services/sales.service.ts`).

Both are now stripped structurally (destructured out of the row) rather than merely overwritten.

Final automated results:

| Suite | Command | Result |
|---|---|---|
| Backend typecheck | `npm run verify` (backend) | Pass |
| Backend build | `npm run build` (backend) | Pass |
| AI security/behaviour tests | `npm run test:ai` | **25 / 25 passed** |
| Live API security tests | `npm run test:security` | **36 / 36 passed** |
| Frontend typecheck | `npm run verify` (frontend) | Pass |
| Frontend production build | `npm run build` (frontend) | Pass (2520 modules, AI route lazy-loaded) |

---

## 2. Method

1. Full read-through of existing auth, middleware, routes, services, validators, database schema,
   AI pipeline, frontend role usage and test scripts.
2. Introduced a permission catalogue and centralized enforcement, then rewired every route.
3. Split role-sensitive data at the service boundary (dashboard, inventory, products, customers,
   sales, AI context, AI history).
4. Added a deterministic policy gate before any Groq call, plus role-specific system prompts.
5. Added 18 live HTTP security tests and 7 AI unit/behaviour tests without removing any existing test.
6. Ran typecheck, build, unit and live tests; fixed every failure (including the two real leaks).

No destructive operations were performed against production data. Tests targeted the local
verification database and only used ordinary business flows (listing, creating test sales/products,
reading conversations, policy refusals).

---

## 3. Confidentiality

### 3.1 Central RBAC policy

`backend/src/config/constants.ts` defines:

- `PERMISSIONS` — the complete catalogue of permissions.
- `ADMIN_ONLY_PERMISSIONS` — financial, destructive and administrative capabilities.
- `ROLE_PERMISSIONS` — explicit allow-lists (`admin` = all, `staff` = operational subset).

Staff allow-list:

```
analytics:dashboard, products:read, categories:read, inventory:read,
customers:read, customers:write, sales:read, sales:create,
ai:chat, ai:status, ai:conversations
```

`backend/src/middleware/authorize.ts` provides `requirePermission`, `hasPermission` and
`permissionsFor`. A denial:
- returns `403` with a non-disclosing message,
- logs a structured warning with request id,
- writes an `AUTHORIZATION_DENIED` audit record (fire-and-forget so auditing cannot block the
  response).

The role is read from `req.user`, which `requireAuth` reloads from PostgreSQL (including
`tokenVersion`) on every request. A forged/stale client role has no effect.

### 3.2 Endpoint permission matrix

| Endpoint group | Permission | Admin | Staff |
|---|---|---|---|
| `GET /analytics/dashboard` | `analytics:dashboard` | ✅ | ✅ (role-scoped payload) |
| `GET /analytics/sales`, `/analytics/products` | `analytics:sales`, `analytics:products` | ✅ | ❌ 403 |
| `GET /products`, `/products/:id` | `products:read` | ✅ | ✅ (no `purchasePrice`) |
| `POST/PUT/DELETE /products` | `products:write` | ✅ | ❌ 403 |
| `GET /categories` | `categories:read` | ✅ | ✅ |
| `POST/PUT/DELETE /categories` | `categories:write` | ✅ | ❌ 403 |
| `GET /inventory`, `/inventory/summary`, `/inventory/movements` | `inventory:read` | ✅ | ✅ (no cost/valuation) |
| `POST /inventory/movements` | `inventory:write` | ✅ | ❌ 403 |
| `GET /customers`, `/customers/:id` | `customers:read` | ✅ | ✅ (basic profile only) |
| `POST/PUT /customers` | `customers:write` | ✅ | ✅ |
| `DELETE /customers/:id` | `customers:delete` | ✅ | ❌ 403 |
| `GET /sales`, `/sales/:id` | `sales:read` | ✅ (all) | ✅ (own sales only) |
| `POST /sales` | `sales:create` | ✅ | ✅ |
| `POST /sales/:id/cancel` | `sales:cancel` | ✅ | ❌ 403 |
| `GET/POST/PUT/DELETE /users` | `users:manage` | ✅ | ❌ 403 |
| `GET /audit-logs` | `audit:read` | ✅ | ❌ 403 |
| `POST /ai/chat` | `ai:chat` | ✅ | ✅ (policy-gated) |
| `POST /ai/business-insights` | `ai:insights` | ✅ | ❌ 403 |
| `GET /ai/status` | `ai:status` | ✅ | ✅ |
| `GET/POST/DELETE /ai/conversations` | `ai:conversations` | ✅ | ✅ (owner-only) |

### 3.3 Dashboard minimisation

`getDashboard(role, userId)` returns different shapes:

- **Admin:** business totals, revenue today, monthly revenue series, inventory retail/cost value,
  per-product revenue, category retail value.
- **Staff:** product/customer/low-stock counts, units on hand, personal `mySalesToday` /
  `mySalesTotal`, own recent transactions, best sellers **by units only** (no revenue),
  category mix **by units only** (no valuation), and an explicitly empty `monthlySales`.

Staff never receive: `totalRevenue`, `totalSales`, `revenueToday`, `retailValue`, `costValue`,
per-item revenue or monthly revenue.

### 3.4 Product, inventory, customer and sales data minimisation

- **Products:** `serializeProduct` adds `purchasePrice` only for admins; selling price and stock
  remain available for POS.
- **Inventory:** staff rows now structurally exclude `purchasePrice` and `retailValue`; the summary
  excludes `retailValue` and `costValue`.
- **Customers:** staff receive basic contact profile plus `restrictedFinancials: true`; `stats`
  (purchase count/total spent) and `recentPurchases` are omitted. Each such view writes a
  `CUSTOMER_VIEW` audit record noting `financialHistory: "restricted"`.
- **Sales:** staff list is scoped to their own transactions; sale detail is owner-scoped for staff;
  per-item `costPrice` is admin-only; staff sale detail also suppresses customer email.

### 3.5 AI confidentiality (Groq)

Layered defence:

1. **Pre-provider policy gate** — `detectPolicyViolation(message, role)` runs before any context is
   built or provider call is made. For Staff it blocks:
   - financial terms (`revenue`, `profit`, `margin`, `markup`, `COGS`, `purchase cost`, `expense`,
     `income`, `forecast`, `valuation`, `retail value`, `average sale`, `sales analytics`, etc.);
   - administrator data (`audit logs`, `user management`, `staff accounts`, `business insights`,
     `strategic plan`, `administrator dashboard/reports`);
   - prompt-injection/credential-extraction/SQL patterns for **all** roles.
   A refusal returns HTTP 200 with `dataScope: "policy"`, `ai.provider: "policy"`,
   `errorCode: "AI_POLICY_BLOCK"`, **no `facts` and no `metrics`**, and writes an
   `AI_POLICY_BLOCK` audit record.
2. **Role-specific context builders** — `buildAdminBusinessContext()` vs
   `buildStaffOperationalContext(userId)`. Staff context contains inventory, products, stock,
   demand-by-units, slow movers and the caller's own sales counters only. It contains no monetary
   fields.
3. **Role-specific system prompts** — `ADMIN_AI_SYSTEM_PROMPT` vs `STAFF_AI_SYSTEM_PROMPT`.
   The Staff prompt explicitly forbids revealing or estimating financial/admin data and tells the
   model to refuse and offer operational help instead.
4. **Business insights guard** — the route requires `ai:insights`, and the service also checks
   `role === "admin"` (defence in depth) before building an admin context.
5. **Conversation ownership** — every read/append/delete first verifies the conversation belongs to
   the caller. Cross-account access returns a non-disclosing `404`.
6. **Role-aware history filtering** — assistant messages now persist `dataScope`
   (`business` / `operational` / `general` / `policy`). Staff history reads (`getRecentHistory`) and
   conversation detail (`getConversationDetail`) drop `business`-scoped messages, including legacy
   rows marked `mode: "business"`. This prevents a user who was previously an administrator from
   reading old financial answers after a role change, and prevents those answers being re-sent to
   Groq as context.
7. **Advisory-only AI** — no tools, no SQL execution, no record mutation. Timeout, quota, auth,
   model and network failures map to controlled codes with deterministic, data-grounded fallbacks.
8. **Server-owned history** — the request schema still accepts a `history` field for backwards
   compatibility, but the service ignores it. Prompt context comes only from the owner-checked
   conversation, so a client cannot fabricate assistant turns or preload a fake administrator answer.

---

## 4. Integrity

- Every mutation still passes through its existing Zod validator (`validate` middleware) before the
  controller; permissions run first so unauthorized callers cannot probe validation behaviour.
- Sale creation remains transactional with row locks, optimistic stock checks, server-side totals,
  idempotency keys and a `SALE_CREATE` audit record.
- Stock movements remain validated (quantity bounds, product existence, negative-stock prevention).
- Foreign-key errors, duplicate/idempotent sales, insufficient stock and invalid prices were
  re-verified live (IN-01 … IN-05).
- Staff cannot create products, record inventory movements, manage categories, delete customers or
  cancel sales (IN-06, IN-08 … IN-11).
- AI conversations are append-only for users and owner-scoped; unknown ids return 404 (CO-18).
- Malformed AI payloads are rejected with `422` before any provider call (CO-19).

---

## 5. Availability

Preserved/verified controls:

- **Health monitoring:** `GET /api/health` reports application status, database reachability and
  latency, uptime, environment and AI configuration. It returned `200` / `database: up` before and
  after the security probes (AV-01, AV-04).
- **Rate limiting:** global 900 / 15 min per IP; auth 10 / 15 min (successful logins skipped);
  AI 20 / 10 min per authenticated user; search 120 / min. Auth limiting was exercised (AV-02).
- **AI resilience:** Groq timeout (`GROQ_TIMEOUT_MS`), provider quota/auth/model/network mapping to
  stable error codes, deterministic fallbacks grounded in verified data, and no unhandled errors
  (AV-03, plus the existing 10 mocked-provider tests).
- **Least-privilege regression check:** Staff retained `200` access to products, inventory, sales and
  customers (CO-20), so hardening did not break day-to-day operations.
- **Non-blocking audit writes:** an audit failure cannot fail a user request or a denial response.

---

## 6. Audit logging

Tamper-evident operational trail via `recordAudit`:

| Action | Trigger |
|---|---|
| `AUTHORIZATION_DENIED` | Any permission denial (records permission, role, method, path) |
| `AI_POLICY_BLOCK` | Staff financial/admin request or prompt-injection attempt |
| `CUSTOMER_VIEW` | Staff opening a customer profile (records restricted scope) |
| `AI_QUERY` / `AI_INSIGHTS` | AI chat / insight generation (existing) |
| `LOGIN_SUCCESS` / `LOGIN_FAILED` / `LOGOUT` / `REGISTER` | Auth events (existing) |
| `PRODUCT_*`, `CATEGORY_*`, `CUSTOMER_*`, `SALE_*`, `INVENTORY_MOVEMENT`, `USER_*` | Mutations (existing) |

Audit records capture user id, action, entity, details and request metadata (IP/user agent/request
id where available).

---

## 7. Test inventory and results

### 7.1 Live API security suite — `backend/scripts/security-tests.ts` (36/36)

**Confidentiality (19):**
`CO-01` unauthenticated rejection · `CO-02` invalid JWT · `CO-03` admin login · `CO-04` staff login ·
`CO-05` staff → users 403 · `CO-06` staff → audit logs 403 · `CO-07` staff → AI insights 403 ·
`CO-08` no Groq key in frontend config · `CO-09` staff dashboard field minimisation (with admin
control) · `CO-10` staff inventory cost/valuation omission (with admin control) ·
`CO-11` staff product cost omission (with admin control) · `CO-12` staff customer financial
withholding (with admin control) · `CO-13` staff sales analytics 403 · `CO-14` staff product
analytics 403 · `CO-15` cross-account conversation read/delete 404 · `CO-16` staff financial query
refused pre-provider with no facts · `CO-17` staff prompt injection refused without leakage ·
`CO-18` unknown conversation 404 · `CO-21` staff sale items omit `costPrice` (with admin control).

**Integrity (12):**
`CO-19` malformed AI body rejected · `IN-01` negative price · `IN-02` excessive stock deduction ·
`IN-03` invalid foreign key · `IN-04` idempotent sale / single stock deduction · `IN-05` insufficient
stock · `IN-06` staff cannot cancel sale · `IN-08` staff cannot create products · `IN-09` staff cannot
record movements · `IN-10` staff cannot manage categories · `IN-11` staff cannot delete customers.

**Availability (4):**
`AV-01` health · `AV-02` auth rate limiting · `AV-03` graceful AI failure · `AV-04` health after
security probes.

**CIA cross-check (1):**
`CO-20` staff retains permitted operational reads.

### 7.2 AI behaviour suite — `backend/scripts/ai-tests.ts` (25/25)

Includes the 19 pre-existing tests (provider configuration, error mapping, timeouts, status probe,
validation, intent routing, prompts, context/fallbacks, history bounds) plus 6 new tests:

- Staff financial/admin requests blocked before the provider (7 phrasings) while admin is allowed.
- Prompt-injection refusal for both roles, with no secret leakage.
- Role-specific system prompts enforce staff restrictions.
- Response metrics exclude financial figures for staff (and include them for admin).
- Conversation history filtering hides business-scoped answers from staff (incl. legacy `mode`).
- Staff fallbacks/recommendations contain no monetary figures; profitability focus explains the
  restriction.

### 7.3 Commands executed

```
backend:  npm run verify         -> pass
backend:  npm run build          -> pass
backend:  npm run test:ai        -> 25 passed, 0 failed
backend:  npm run test:security  -> 36 passed, 0 failed
frontend: npm run verify         -> pass
frontend: npm run build          -> pass (vite production build)
```

**Important test caveats**

- The live suite requires `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STAFF_EMAIL`, `STAFF_PASSWORD` and a
  running API (`API_BASE_URL`, default `http://localhost:7000/api`). Use a **non-production**
  database: the suite creates a few verification products/sales/customers.
- `AV-02` intentionally exhausts the auth limiter. Restart the API (or wait 15 minutes) before
  re-running the suite so the initial logins are not rate-limited.
- AI live tests exercise the deterministic policy path (no paid Groq call); provider behaviour is
  covered by mocked unit tests.

---

## 8. Modified files

### Backend — policy and enforcement
- `src/config/constants.ts` — permission catalogue, role allow-lists, new audit actions.
- `src/middleware/authorize.ts` — `requirePermission`/`hasPermission`/`permissionsFor`, denial audit.
- `src/routes/product.routes.ts`, `category.routes.ts`, `inventory.routes.ts`, `customer.routes.ts`,
  `sales.routes.ts`, `analytics.routes.ts`, `user.routes.ts`, `audit.routes.ts`, `ai.routes.ts` —
  every protected route mapped to exactly one permission.

### Backend — data minimisation
- `src/services/analytics.service.ts` — role-split dashboard, admin assertions on financial analytics.
- `src/services/inventory.service.ts` — staff cost/valuation exclusion; fixed raw `purchasePrice`
  spread; slow-moving product query.
- `src/services/product.service.ts` — role-aware serialization (`purchasePrice` admin-only).
- `src/services/customer.service.ts` — staff basic profile + `restrictedFinancials`, `CUSTOMER_VIEW`
  audit.
- `src/services/sales.service.ts` — fixed per-item `costPrice` spread; owner-scoped staff sale detail.
- `src/controllers/analytics.controller.ts`, `product.controller.ts`, `inventory.controller.ts`,
  `customer.controller.ts`, `sales.controller.ts` — pass the database-backed actor/role to services.

### Backend — AI security
- `src/services/ai-prompt.service.ts` — admin/staff system prompts, policy detection, refusal text.
- `src/services/ai-context.service.ts` — admin/staff context builders, role-specific metrics,
  fallbacks and recommendations.
- `src/services/ai.service.ts` — pre-provider policy gate, role prompts/contexts, `dataScope`
  persistence, admin insights guard, role-aware fallback messaging, policy audit.
- `src/services/ai-conversation.service.ts` — `isMessageVisibleToRole`, role-filtered history/detail.
- `src/controllers/ai.controller.ts` — pass role to conversation detail.

### Backend — tests
- `scripts/security-tests.ts` — 18 new live HTTP tests (CO-09 … CO-21, IN-08 … IN-11, AV-04).
- `scripts/ai-tests.ts` — 6 new AI policy/metrics/history/fallback tests; existing 19 retained.

### Frontend — role-aware UX (backend remains the enforcement layer)
- `src/types/index.ts` — role-optional dashboard financial fields, `restrictedFinancials`,
  `dataScope`.
- `src/pages/Dashboard.tsx` — separate admin and staff dashboards.
- `src/pages/Inventory.tsx` — retail value card hidden for staff.
- `src/pages/Customers.tsx` — restricted-financials notice for staff.
- `src/pages/AiAssistant.tsx` — role-aware suggestions/copy, scoped metric labels, policy badge,
  staff operational-help panel, friendly policy reason labels; Markdown/GFM rendering preserved.
- `src/components/layout/Sidebar.tsx` and `src/App.tsx` — Reports, Users and Audit Logs admin-only.

`Products`, `Categories` and `Reports` were verified to already gate admin-only controls and remain
unchanged in this pass. Existing auth, POS, conversation switching/new/delete, toasts and the
lazy-loaded `/ai` route are preserved.

---

## 9. Render environment variables

### Backend service (Render)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | ✅ | `production` |
| `PORT` | auto | Render injects it |
| `DATABASE_URL` | ✅ | Neon **pooled** connection string |
| `DIRECT_DATABASE_URL` | optional | Direct connection for migrations/seed |
| `JWT_SECRET` | ✅ | Long random value; rotate to invalidate sessions |
| `JWT_EXPIRES_IN` | optional | e.g. `1d` |
| `GROQ_API_KEY` | ✅ for AI | Server-side only; never exposed to the frontend |
| `GROQ_MODEL` | optional | default `openai/gpt-oss-120b` |
| `GROQ_TIMEOUT_MS` | optional | default `25000` |
| `FRONTEND_URL` | ✅ | Exact origin for CORS/CSRF |
| `COOKIE_SAME_SITE` | ✅ | `none` for cross-site (Render API + external frontend) |
| `COOKIE_DOMAIN` | optional | Only if sharing a parent domain |
| `TRUST_PROXY` | ✅ | `1` behind Render's proxy (correct client IP / rate limiting) |
| `DB_POOL_MAX` | optional | e.g. `10` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `STAFF_EMAIL` / `STAFF_PASSWORD` | seed only | Remove or rotate after seeding |

### Frontend static build

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | ✅ | e.g. `https://<api-host>/api` (baked in at build time) |

---

## 10. Deployment steps

1. **Rotate secrets** if the previous deployment exposed credentials: `JWT_SECRET`, `GROQ_API_KEY`,
   database password.
2. **Set backend env vars** on Render per the table above. Ensure `TRUST_PROXY=1` and
   `COOKIE_SAME_SITE=none` (plus `Secure` cookies, automatic with `NODE_ENV=production`).
3. **Build & start:** Render build `npm ci && npm run build`, start `npm start`
   (`node dist/server.js`).
4. **Migrate** the database with `npm run db:migrate` (use `DIRECT_DATABASE_URL` where required).
5. **Seed once** only if the database has no administrator: `npm run db:seed` with the seed env vars,
   then remove/rotate those variables. Never run seeders against production casually.
6. **Deploy the frontend** with `VITE_API_URL` pointing at the API, then rebuild static assets.
7. **Smoke test:**
   - `GET /api/health` → 200, `database: up`.
   - Admin login → dashboard shows revenue/valuation; Reports, Users, Audit Logs accessible.
   - Staff login → dashboard has no revenue/valuation/monthly sales; Reports/Users/Audit hidden and
     return 403 if called directly.
   - Staff asks the AI about revenue → policy refusal, no figures.
   - Staff opens a customer → basic profile only.
   - Admin AI insights still work.
8. **Optional staging run:** `API_BASE_URL=https://<staging>/api npm run test:security` against a
   non-production database.
9. **Monitor** logs for `AUTHORIZATION_DENIED`, `AI_POLICY_BLOCK`, `AI_QUOTA_EXCEEDED`, `AI_TIMEOUT`
   and health failures. Alert on repeated denials from one account.

---

## 11. Residual risks and recommendations

1. **Legacy AI messages with no metadata.** Messages written before metadata existed are treated as
   visible. All new assistant messages persist `dataScope`, and legacy `mode: "business"` rows are
   hidden from staff. Recommended optional backfill for complete assurance:
   ```sql
   UPDATE ai_messages
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{dataScope}', '"business"')
   WHERE role = 'assistant'
     AND metadata->>'mode' = 'business'
     AND metadata->>'dataScope' IS NULL;
   ```
2. **In-memory rate limiting.** Limits are per instance. A multi-instance Render deployment should
   use a shared store (e.g. Redis) to keep AI/auth limits effective globally.
3. **Fire-and-forget audits.** If PostgreSQL is unavailable while a denial/audit is written, that
   record can be lost (the request/denial still completes). Use a durable queue if audit loss is
   unacceptable.
4. **Regex policy gate is intentionally conservative** (fail-closed) and can block benign phrases
   containing words like "margin" or "forecast". The system prompt is the second layer; tune the
   patterns if staff report false positives.
5. **Provider-side data handling.** Admin context includes product names and aggregate revenue/
   margin figures sent to Groq; it excludes customer PII. Review Groq's data-retention terms if
   contractual confidentiality requires it. Staff context contains no monetary fields.
6. **Semantic bypass of the policy gate.** Paraphrases that avoid the trigger vocabulary rely on the
   role prompt and, crucially, on the fact that Staff context never contains monetary data. No
   client-side hiding is relied upon.
7. **Staff customer contact visibility** (name, email, phone, address) is intentional for POS/service
   lookup. Tighten to a lookup-only projection if that policy changes.
8. **Staff can see totals of their own sales** (needed for receipts). This is not business-wide
   revenue and is scoped by `user_id`.
9. **No browser E2E automation.** UI role gating is covered by TypeScript builds and API tests;
   add Playwright/Cypress coverage if UI regressions must be gated in CI.
10. **`dist/` is stale until rebuilt.** Always rebuild on deploy (`npm run build`).
11. **Security suite is live and stateful.** Never run it against production; restart the API before
    repeated runs because of the auth limiter.
