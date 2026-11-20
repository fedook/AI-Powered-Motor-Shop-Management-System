# AI-Powered Motor Shop Management System

A full-stack, database-backed motor shop management system built with a React/Vite/TypeScript frontend, an Express/TypeScript REST API, Drizzle ORM on PostgreSQL (Neon-compatible), and backend-only Groq AI integration. Security is implemented and tested against CIA Triad principles (Confidentiality, Integrity, Availability).

> **Status:** Implemented and locally verified. Live Groq integration was verified against the Neon database with model `openai/gpt-oss-120b`: `/api/ai/status` reported the provider reachable, and `/api/ai/chat` and `/api/ai/business-insights` returned live Groq responses. The assistant is now fully conversational (greetings, identity, general knowledge, follow-ups) with per-user persistent conversation history, while business answers still use real DB aggregates. When Groq is unavailable or rate-limited, the system returns clearly labeled deterministic answers built from real DB aggregates. Core operations remain available (see [Groq AI Integration Status](#5-groq-ai-integration-status)).

## Table of contents
- [1. Project structure](#1-project-structure)
- [2. Prerequisites & selected versions](#2-prerequisites--selected-versions)
- [3. Local setup and run instructions](#3-local-setup-and-run-instructions)
- [4. Demo credentials](#4-demo-credentials)
- [5. Groq AI integration status](#5-groq-ai-integration-status)
- [6. Implemented features](#6-implemented-features)
- [7. Database tables](#7-database-tables)
- [8. API endpoints](#8-api-endpoints)
- [9. Security (CIA Triad) and test results](#9-security-cia-triad-and-test-results)
- [10. Deployment (Vercel + Render + Neon)](#10-deployment-vercel--render--neon)
- [11. Remaining issues / limitations](#11-remaining-issues--limitations)
- [12. Business Analytics delivery](#12-business-analytics-delivery)

## 1. Project structure
```text
AI-Powered Motor Shop Management System/
├── frontend/                 # React + Vite + TypeScript + Tailwind SPA
│   ├── src/{components,pages,layouts,routes,services,context,types,utils,assets}
│   ├── .env.example
│   └── package.json
├── backend/                  # Express + TypeScript REST API
│   ├── scripts/security-tests.ts, scripts/ai-tests.ts
│   ├── src/
│   │   ├── app.ts, server.ts
│   │   ├── config/ controllers/ middleware/ routes/ services/ validators/ utils/ types/
│   │   └── db/{schema,migrations,seeders,index.ts,migrate.ts}
│   ├── drizzle.config.ts
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── README.md                 # Full Business Analytics documentation index
│   ├── CIA-TRIAD-SECURITY.md
│   ├── SECURITY-TEST-REPORT.md
│   └── SECURITY-ARCHITECTURE.md
├── scripts/
│   └── create-distribution.ps1   # Safe source-only ZIP (excludes .env / node_modules)
├── .gitignore
└── README.md
```

## 2. Prerequisites & selected versions
- **Node.js:** >= 20 (engines set in backend). npm (use `npm.cmd` on Windows PowerShell where script execution policy blocks `npm`).
- **PostgreSQL:** Neon Serverless PostgreSQL (production) or any PostgreSQL-compatible instance (local verified with PostgreSQL 17).
- **Git:** optional; repository may not be initialized.

### Selected package versions (documented)
| Area | Package | Version |
|---|---|---|
| Frontend | react / react-dom | 18.3.1 |
| Frontend | vite | 5.4.21 |
| Frontend | typescript | 5.9.3 |
| Frontend | tailwindcss | 3.4.18 |
| Frontend | react-router-dom | 6.30.1 |
| Frontend | axios | 1.13.2 |
| Frontend | lucide-react | 0.468.0 |
| Frontend | recharts | 2.15.4 |
| Backend | express | 4.21.2 |
| Backend | typescript | 5.9.3 |
| Backend | drizzle-orm | 0.44.7 |
| Backend | drizzle-kit | 0.31.4 |
| Backend | pg | 8.16.3 |
| Backend | zod | 4.1.12 |
| Backend | jsonwebtoken | 9.0.2 |
| Backend | bcrypt | 6.0.0 |
| Backend | helmet | 8.1.0 |
| Backend | express-rate-limit | 8.1.0 |
| Backend | cors | 2.8.5 |
| AI | groq-sdk | 1.6.0 (official Groq SDK, backend-only) |

## 3. Local setup and run instructions

### 3.1 Clone/open project
Place the project at your working directory (example: `C:\AI-Powered Motor Shop Management System`).

### 3.2 Database
Provision a PostgreSQL database and obtain a connection string.
- **Neon (recommended):** create a project/database, copy the pooled connection string for `DATABASE_URL`. If migrations require a direct (non-pooled) endpoint, set `DIRECT_DATABASE_URL`.
- **Local Postgres:** e.g. `postgresql://postgres:postgres@localhost:5432/motorshop`.

### 3.3 Backend setup
```bash
cd backend
npm.cmd install            # or: npm install
copy .env.example .env     # Windows (PowerShell: Copy-Item .env.example .env)
```
Edit `backend/.env` with real values (see `backend/.env.example`). Required: `DATABASE_URL`, `JWT_SECRET`, and seeder demo credentials if you will seed. **Never commit `.env`.**

Run migrations and seed (safe to re-run; seeder avoids duplicates and does not delete production data):
```bash
npm.cmd run db:generate    # generate migrations from schema (optional if using committed migration)
npm.cmd run db:migrate     # apply migrations
npm.cmd run db:seed        # create demo admin/staff/customers/categories/products/sales/movements
```
Start API:
```bash
npm.cmd run dev            # development (tsx watch), default http://localhost:7000
# or
npm.cmd run build && npm.cmd run start
```
Health check: `GET http://localhost:7000/api/health`

Other scripts: `npm.cmd run db:studio`, `npm.cmd run verify` (typecheck), `npm.cmd run test:ai` (mocked Groq/AI tests, no live key required), `npm.cmd run test:security` (API security tests; requires running API + seeded env credentials).

### 3.4 Frontend setup
```bash
cd frontend
npm.cmd install
copy .env.example .env     # Windows
```
`frontend/.env`:
```env
VITE_API_URL=http://localhost:7000/api
```
Run/build:
```bash
npm.cmd run dev            # Vite dev server (default http://localhost:5173)
npm.cmd run build          # tsc --noEmit && vite build -> frontend/dist
npm.cmd run preview
```

### 3.5 Local verification performed (evidence)
- Backend typecheck/build: `npm.cmd run verify` and `npm.cmd run build` **passed**.
- Frontend build: `npm.cmd run build` (`tsc --noEmit && vite build`) **passed**.
- DB migration & seed: `db:migrate` and `db:seed` **succeeded** against local PostgreSQL 17. Latest verified dataset counts (repeatable): **50 products, 50 customers, 59 sales, 138 sale items, 188 inventory movements, 0 cancelled sales**.
- API runtime: backend on `http://localhost:7000`, `/api/health` reported DB up.
- Automated security tests executed via `npm.cmd run test:security` (`backend/scripts/security-tests.ts`). Latest fully recorded run (pre-Groq migration, local PostgreSQL 17) is in `backend/security-test-output.txt`: **18 total, 18 passed, 0 failed**. After the Groq migration, the security script was updated to Groq naming/assertions but the full suite was not re-run against a live Groq-configured backend in this environment; backend typecheck/build and `test:ai` (19/19) pass.
- Post-migration live AI verification (Neon DB, backend on port 7001): `/api/health` DB up/`aiProvider: groq`; `/api/ai/status?refresh=1` reachable/model `openai/gpt-oss-120b`; `/api/ai/chat` and `/api/ai/business-insights` HTTP 200 with `provider: groq`; unauthenticated chat 401; staff chat 200 and staff insights/users/audit 403 `FORBIDDEN`.
- Live conversational E2E (Neon DB, backend on port 7000): **22/22 checks passed**. Greetings/identity/general knowledge routed to general mode with live Groq replies, business questions routed to business mode with real figures, follow-ups (`that product`, `its sales`) kept context, history persisted in order, and cross-user conversation access returned 404 while unauthenticated access returned 401.
- Business Analytics: `npm.cmd run db:verify` passed (all five datasets ≥50), `npm.cmd run test:ba-forecast` passed **7/7**, `npm.cmd run test:ba-api` passed **13/13** against backend port 4010, frontend typecheck and production build passed. Details in [docs/TESTING_REPORT.md](./docs/TESTING_REPORT.md).

## 4. Demo credentials
Demo accounts are **created by the seeder** using environment variables in `backend/.env` (never hardcoded in source):
- **Admin:** email `ADMIN_EMAIL` (default in `.env.example`: `admin@motorshop.local`), password from `ADMIN_PASSWORD`
- **Staff:** email `STAFF_EMAIL` (default: `staff@motorshop.local`), password from `STAFF_PASSWORD`
- **Staff (2nd):** `staff2@motorshop.local` (seeded), password from `STAFF_PASSWORD`

> Do **not** use demo credentials in production. Rotate secrets and set strong passwords. Seeder is designed not to delete existing production records.

## 5. Groq AI integration status
- **Integration:** Implemented backend-only via the official `groq-sdk` (`backend/src/services/groq.service.ts`, `ai.service.ts`, `ai-context.service.ts`, `ai-prompt.service.ts`, `ai-conversation.service.ts`), targeting `https://api.groq.com/openai/v1`. Configuration: `GROQ_API_KEY`, `GROQ_MODEL` (default `openai/gpt-oss-120b`), `GROQ_TIMEOUT_MS`. Frontend calls only backend endpoints (`/api/ai/chat`, `/api/ai/business-insights`, `/api/ai/status`, `/api/ai/conversations`) and never receives API keys.
- **Conversational personality:** A single trusted system prompt (`MOTORSHOP_AI_SYSTEM_PROMPT`) defines the MotorShop AI identity as a friendly, professional, patient and knowledgeable assistant. Greetings, introductions, identity/capability questions, thanks, small talk, clarification and general knowledge are answered naturally by Groq without database queries. Business questions (sales, revenue, stock, best/slow sellers, analytics) are routed to the verified-data path. Rule-based intent routing only classifies general vs business; every natural reply is generated by Groq.
- **Conversation memory:** Turns are persisted server-side in `ai_conversations` / `ai_messages` and scoped to the authenticated owner. The API sends the system prompt plus ordered recent history on every request (bounded to the last 10 messages; business turns use the last 6 with smaller per-message limits). This lets follow-ups like “why is it popular?” or “how can we increase its sales?” resolve to the product discussed earlier.
- **Model verification:** `openai/gpt-oss-120b` was confirmed live both in `GET /openai/v1/models` and by a successful `chat/completions` call before being used. The configured model is validated at runtime; if it is unavailable, the API returns `AI_MODEL_UNAVAILABLE` rather than silently switching to an unverified model.
- **Response tuning:** General chat uses temperature `0.65` / 700 output tokens; business analysis uses `0.35` / 1,000 output tokens; admin insight reports use `0.3` / 1,600 tokens. Empty responses are rejected and mapped to `AI_EMPTY_RESPONSE`; timeouts and quota errors use friendly, non-leaking fallbacks.
- **Data accuracy/safety:** Uses real DB aggregates only (no invented stats), read-only/advisory (no tools, no SQL execution, no DB mutations), excludes customer PII and sensitive fields from staff context as designed, validates/limits prompt/response, bounds and role-validates history, blocks system-prompt overrides, scans responses for secret leakage, and audits AI actions.
- **Error mapping:** `AI_NOT_CONFIGURED`, `AI_CONFIGURATION_ERROR` (invalid key), `AI_MODEL_UNAVAILABLE`, `AI_QUOTA_EXCEEDED` (429), `AI_TIMEOUT`, `AI_NETWORK_ERROR`, `AI_EMPTY_RESPONSE`, `AI_PROVIDER_UNAVAILABLE`, `AI_REQUEST_REJECTED`, `AI_UPSTREAM_ERROR`.
- **Graceful degradation:** If `GROQ_API_KEY` is missing, chat returns a friendly fallback message with `ai.available=false` and `errorCode=AI_NOT_CONFIGURED`, and insights return deterministic fallback recommendations with `ai.available=false`. Provider failures/rate limits also fall back deterministically without leaking secrets. Core motor shop modules (products, inventory, customers, sales, analytics, users, audit) continue to function.
- **Current environment status (live verified):** Against the Neon database, `/api/health` reported DB up with `aiProvider: groq`; `GET /api/ai/status?refresh=1` returned `provider: groq`, `providerReachable: true`, `model: openai/gpt-oss-120b`; `POST /api/ai/chat` and `POST /api/ai/business-insights` both returned HTTP 200 with `provider: groq` and `ai.available=true`. Unauthenticated chat still returned 401. On the Groq free tier (8000 TPM) a burst can hit `429`, which is handled as `AI_QUOTA_EXCEEDED` with a labeled deterministic fallback instead of a crash.
- **Automated tests:** `npm.cmd run test:ai` runs 19 mocked Groq/AI cases (configuration, success, invalid key, rate limit, unsupported model, timeout, network, empty response, probe, validation, authorization intent, prompt/identity, general-vs-business routing, contextual follow-ups, conversation validation/window, fallback content/focus) and currently passes **19/19**. A separate live E2E covers the conversational scenarios listed in section 3.5.

## 6. Implemented features
- **Authentication & users:** Register/login/logout, `/auth/me`, CSRF endpoint, profile update, password change, bcrypt password hashing, JWT auth, cookie-based session support, protected routes (frontend + backend), duplicate-email prevention, validation, admin user management (create/update/delete/list), self-role change prevented, token version/revocation handling.
- **RBAC (backend-enforced):** Admin has full access (users, audit logs, product/category/inventory writes, sale cancellation, admin analytics/insights). Staff is limited (view products/categories, manage customers as permitted, process/view permitted sales, view inventory, limited AI chat) with server-side authorization and scoped data (e.g. staff sales scoped to own; sensitive cost/profit fields hidden from staff where applicable).
- **Dashboard:** Real DB aggregates (products/customers/sales/revenue, low stock, recent transactions, best sellers, monthly overview, inventory summary).
- **Products & Categories:** CRUD (admin writes), search/filter/sort/pagination, pricing/stock fields, category relations and protections.
- **Inventory:** Stock in/out/adjustment movements, movement history, low-stock monitoring/valuation, **no negative stock**, every change recorded in `inventory_movements`.
- **Customers:** CRUD with validation, search/list/detail and purchase history (admin delete restrictions consistent with integrity).
- **Sales/POS:** Multi-item POS, customer selection, discounts (authorized), payment methods (cash/GCash/bank transfer/other), totals/change, receipts, history/search/filter, idempotency key duplicate protection, stock checks, transactional sale+item+inventory updates, admin cancellation flow with restock/audit.
- **Reports & Analytics:** Dashboard/sales/product analytics endpoints and UI (daily/weekly/monthly trends via grouping, revenue/best/least sellers, inventory valuation/low stock) computed from actual PostgreSQL records.
- **Business Analytics:** Connected descriptive → predictive → prescriptive layer with live dataset verification, statistical forecasts (linear regression / weighted moving average), stockout and reorder estimates, evidence-linked recommendations with auditable statuses, a 13-section case study page, and an interactive three-stage workflow. See [docs/README.md](./docs/README.md).
- **AI Assistant:** Dedicated conversational assistant (MotorShop AI) with natural greetings/identity/general knowledge, per-user persisted conversations (new, switch, clear/delete), loading/auto-scroll/error states, and admin business insights using backend-aggregated data; advisory only; secure failure handling.
- **Audit Logs (admin):** Viewable log of security/business actions with request/user context.
- **Security & availability controls:** Helmet headers, CORS allowlist, rate limiting, request timeouts/limits, CSRF+origin protections for state changes, centralized error handling, health endpoint, parameterized queries/ORM, DB constraints/transactions.
- **Frontend UX:** Responsive layouts, reusable components, loading/empty/error/success states, confirmation dialogs for destructive actions, search/filter/pagination, charts (Recharts). No mock/hardcoded business records.

## 7. Database tables
Implemented in `backend/src/db/schema/*` (Drizzle) with UUID PKs, FKs, indexes, checks, enums, timestamps, and numeric money fields.

| Table | Purpose / key fields (summary) |
|---|---|
| `users` | `id,name,email,password_hash,role(admin|staff),token_version,last_login_at,created_at,updated_at`; unique lowercased email, constraints. |
| `customers` | `id,full_name,email,contact_number,address,created_at,updated_at`; uniqueness/indexes/checks. |
| `categories` | `id,name,description,created_at,updated_at`; unique name. |
| `products` | `id,category_id(FK),name,sku,description,purchase_price,selling_price,stock_quantity,minimum_stock,image_url,created_at,updated_at`; unique SKU, non-negative/consistency checks, indexes. |
| `sales` | `id,customer_id(FK nullable),user_id(FK),transaction_number,subtotal,discount,total_amount,payment_method,amount_paid,change_amount,status(completed|cancelled),idempotency_key,cancelled_at,cancelled_by,cancellation_reason,created_at`; totals/amount checks, unique txn/idempotency. |
| `sale_items` | `id,sale_id(FK),product_id(FK),quantity,unit_price,cost_price,subtotal`; per-sale/product uniqueness, positive quantity, integrity checks. |
| `inventory_movements` | `id,product_id(FK),user_id(FK nullable),movement_type(stock_in|stock_out|adjustment|sale|sale_cancellation),quantity,previous_quantity,new_quantity,reason,created_at`; delta/consistency checks prevent invalid/negative states. |
| `audit_logs` | `id,user_id(FK nullable),action,entity_type,entity_id,details(jsonb),request_id,ip_address,created_at`; indexed for querying. |
| `ai_conversations` | `id,user_id(FK -> users, cascade),title,created_at,updated_at`; owner-scoped index, non-blank title check. |
| `ai_messages` | `id,conversation_id(FK -> ai_conversations, cascade),role,content,metadata(jsonb),created_at`; role constrained to `user`/`assistant`, chronological index, role/content checks. |
| `ba_recommendation_statuses` | `key,status(pending|accepted|rejected|completed),note,decided_by(FK nullable),decided_at,created_at`; stores only admin decisions on generated recommendations. |

Migrations: `backend/src/db/migrations/0000_typical_human_cannonball.sql` (core schema), `0001_dry_silver_fox.sql` (AI conversations/messages), and `0002_ba_recommendation_statuses.sql` (Business Analytics decision trail). Seeder: `backend/src/db/seeders/seed.ts`.

## 8. API endpoints
Base: `/api` (JSON envelope responses, consistent status/error codes).

| Method | Endpoint | Auth/Role | Description |
|---|---|---|---|
| GET | `/health` | Public | Health check (DB/AI status) |
| POST | `/auth/register` | Public (rate-limited) | Register account |
| POST | `/auth/login` | Public (rate-limited) | Login (sets auth/CSRF cookies) |
| POST | `/auth/logout` | Optional auth | Logout |
| GET | `/auth/me` | Auth | Current user |
| GET | `/auth/csrf` | Auth | CSRF token |
| PUT | `/auth/profile` | Auth | Update profile |
| PUT | `/auth/password` | Auth | Change password (revokes sessions) |
| POST | `/auth/logout-all` | Auth | Logout all sessions |
| GET | `/products` | Auth | List/search/filter products |
| GET | `/products/:id` | Auth | Product detail |
| POST | `/products` | Admin | Create product |
| PUT | `/products/:id` | Admin | Update product |
| DELETE | `/products/:id` | Admin | Delete product |
| GET | `/categories` | Auth | List categories |
| POST | `/categories` | Admin | Create category |
| PUT | `/categories/:id` | Admin | Update category |
| DELETE | `/categories/:id` | Admin | Delete category |
| GET | `/customers` | Auth | List/search customers |
| GET | `/customers/:id` | Auth | Customer detail/history |
| POST | `/customers` | Auth | Create customer |
| PUT | `/customers/:id` | Auth | Update customer |
| DELETE | `/customers/:id` | Admin | Delete customer |
| GET | `/sales` | Auth (scoped) | List sales (staff scoped to own) |
| GET | `/sales/:id` | Auth (scoped) | Sale/receipt detail |
| POST | `/sales` | Auth | Create sale (transactional, idempotent) |
| POST | `/sales/:id/cancel` | Admin | Cancel sale (restock/audit) |
| GET | `/inventory` | Auth | Inventory view/summary |
| GET | `/inventory/summary` | Auth | Inventory summary |
| GET | `/inventory/movements` | Auth | Movement history |
| POST | `/inventory/movements` | Admin | Record stock movement/adjustment |
| GET | `/analytics/dashboard` | Auth | Dashboard aggregates |
| GET | `/analytics/sales` | Admin | Sales analytics |
| GET | `/analytics/products` | Admin | Product analytics |
| GET | `/analytics/datasets` | Admin + staff | Live counts for the five required datasets |
| GET | `/analytics/descriptive` | Admin | Descriptive analytics from filtered DB records |
| GET | `/analytics/predictive` | Admin | Statistical revenue/demand forecasting |
| GET | `/analytics/prescriptive` | Admin | Evidence-linked recommendations and purchasing plan |
| GET | `/analytics/workflow` | Admin | Connected three-stage trace for a selected product |
| PATCH | `/analytics/recommendations/:key/status` | Admin | Record human decision on a recommendation |
| GET | `/ai/status` | Auth (rate-limited) | Groq provider configuration/reachability probe |
| POST | `/ai/chat` | Auth (rate-limited) | Conversational AI chat; body `{message, conversationId?, history?}`; returns `answer`, `conversationId`, `mode`, optional `facts/alerts/dataAsOf`, `ai` metadata |
| POST | `/ai/business-insights` | Admin (rate-limited) | AI insights / deterministic fallback; optional `conversationId` persists the turn |
| GET | `/ai/conversations` | Auth (owner-scoped) | List the current user's conversations (title, message count, timestamps) |
| POST | `/ai/conversations` | Auth (owner-scoped) | Create a conversation (title optional) |
| GET | `/ai/conversations/:id` | Auth (owner-scoped) | Conversation detail with ordered messages; 404 for other users |
| DELETE | `/ai/conversations/:id` | Auth (owner-scoped) | Delete own conversation and messages; 404 for other users |
| GET | `/users` | Admin | List users |
| POST | `/users` | Admin | Create user |
| PUT | `/users/:id` | Admin | Update user (no self-role escalation) |
| DELETE | `/users/:id` | Admin | Delete user |
| GET | `/audit-logs` | Admin | List audit logs |

(Exact validation schemas and query params are defined in `backend/src/routes/*` and `backend/src/validators/*`.)

## 9. Security (CIA Triad) and test results
- **Confidentiality:** bcrypt hashing, JWT (httpOnly cookie + Bearer support), CSRF protection for state changes, RBAC/ownership checks, CORS allowlist, Helmet, secret handling (backend-only env vars), restricted customer/cost data exposure.
- **Integrity:** Zod validation, DB constraints/FKs/checks, transactions for sales/inventory, no-negative-stock enforcement, idempotent sale processing, controlled cancellation, audit logging, AI response validation and no DB mutation capability.
- **Availability:** centralized error handling, health endpoint, pooling/connection config, rate limiting, request size/time limits, graceful AI/provider failure handling, frontend loading/error states.

**Executed automated tests:** `backend/scripts/security-tests.ts` (`npm.cmd run test:security`). Latest recorded run in `backend/security-test-output.txt`: **18/18 passed**. Evidence and per-test details are documented in `docs/SECURITY-TEST-REPORT.md`. (Earlier runs required reconciliation of IN-01 status expectations and AI failure-handling assertions to reflect secure behavior: validation rejection and controlled 502/503 non-leaking responses.)

See also: `docs/CIA-TRIAD-SECURITY.md`, `docs/SECURITY-ARCHITECTURE.md`.

## 10. Deployment (Vercel + Render + Neon)

### 10.1 Neon (PostgreSQL)
1. Create a Neon project and database.
2. Copy **pooled** connection string to `DATABASE_URL` for the Render app. If your migration tooling needs a direct endpoint, set `DIRECT_DATABASE_URL` (used by migrations/seeders in this project config).
3. Run migrations against the production database **once** from a trusted environment/CI with production env vars: `npm run db:generate` (if needed) and `npm run db:migrate`.
4. **Do not run destructive operations or demo seeding against production.** If demo data is required in a non-production staging DB, seed only there with non-production credentials.

### 10.2 Backend on Render (Web Service)
- **Root/build:** `backend`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start` (runs `node dist/server.js`)
- **Health check path:** `/api/health`
- **Environment variables (production):** set `NODE_ENV=production`, `PORT` (Render-provided), `FRONTEND_URL=https://<your-vercel-domain>`, `DATABASE_URL` (Neon pooled), `DIRECT_DATABASE_URL` if used, strong `JWT_SECRET`, `JWT_EXPIRES_IN`, `GROQ_API_KEY`, `GROQ_MODEL` (e.g. `openai/gpt-oss-120b`), `GROQ_TIMEOUT_MS=25000`, `TRUST_PROXY=1`, and cookie settings as needed (`COOKIE_SAME_SITE=none` with Secure cookies for cross-site Vercel↔Render; `COOKIE_DOMAIN` if applicable). **Do not use demo passwords or development secrets.** Remove any legacy `GEMINI_*` variables.
- Ensure migrations are applied before serving traffic. Document rollback by redeploying previous build and using DB backups/point-in-time recovery per Neon policy.

### 10.3 Frontend on Vercel
- **Root:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variable:** `VITE_API_URL=https://<your-render-backend-domain>/api` (no secrets; `VITE_*` vars are exposed to browser—**never** put API keys here)
- Deploy and confirm SPA routing works with your Vercel config (rewrite all routes to `index.html` if needed).

### 10.4 Production checklist
- HTTPS enabled end-to-end; secure cookies in production.
- CORS restricted to deployed frontend origin(s).
- Strong JWT secret, rotated credentials, no committed `.env` files.
- Groq key only in backend environment (`GROQ_API_KEY`); never use a `VITE_*` AI key.
- Monitor `/api/health`, rate limits, logs, and Neon connection usage/backups.

## 11. Remaining issues / limitations
- **Groq rate limits:** live Groq responses are verified, but the free tier enforces 8000 tokens per minute for `openai/gpt-oss-120b`. Bursts (e.g. status probe + chat + insights in quick succession) can return `429 AI_QUOTA_EXCEEDED`; chat returns a friendly labeled fallback and insights return the labeled deterministic fallback. Upgrade to Groq Dev Tier or space requests for heavier use. AI generation endpoints are also limited to 20 requests per 10 minutes per user; conversation history endpoints use the wider global limiter.
- **Production deployment not verified here:** Render environment variables and Vercel `VITE_API_URL` must be set as documented; this environment only verified local backend/frontend builds and a local backend run against Neon.
- **Security testing scope:** automated script covers key API flows (authZ, validation, idempotency, rate limiting, health, AI-safe handling) but is not a substitute for full penetration testing, SAST/DAST, dependency audit, or load testing.
- **CSRF/JWT details:** browser flow uses httpOnly JWT cookie + readable CSRF cookie/header; Bearer tokens also accepted—review deployment cookie/domain/same-site settings carefully for cross-origin setups.
- **CO-08 in tests** includes codebase-review evidence (static verification) in addition to runtime checks; keep CI checks to prevent secret exposure.
- **DB state after tests:** security tests create a test sale and trigger failed logins (rate-limit) against the configured DB; inventory remained consistent in runs but the dataset is not a pristine post-seed snapshot.
- **Environment:** local dev verified on Windows/PowerShell with embedded/local Postgres and `npm.cmd`; adapt commands for Unix shells (`npm`).
- No claim of complete security/compliance is made without evidence; see docs for implemented/partial controls and recommendations.
- **Authenticated BA UI walkthrough:** the new pages compile and unauthenticated redirects work, but a manual admin login walkthrough is still recommended before final submission (see `docs/TESTING_REPORT.md`).

## 12. Business Analytics delivery

- **Pages:** `/analytics/overview` (13-section case study), `/reports` and `/analytics` (BA dashboard), `/analytics/process` (connected workflow).
- **Backend services:** `backend/src/services/forecast.ts` (pure statistical helpers) and `backend/src/services/ba.service.ts` (one shared snapshot for all three stages).
- **Datasets:** live verification reports 50 products, 50 customers, 59 sales, 138 sale items, and 188 inventory movements.
- **Documentation:** start at [docs/README.md](./docs/README.md); the requirement-by-requirement assessment is in [docs/FINAL_COMPLIANCE_REPORT.md](./docs/FINAL_COMPLIANCE_REPORT.md).
- **Safe packaging:** run `powershell -ExecutionPolicy Bypass -File scripts/create-distribution.ps1` to create a source-only ZIP with `.env` secrets and `node_modules` excluded.
