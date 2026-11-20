# Security Architecture - AI-Powered Motor Shop Management System

## 1. Overview
This document describes the implemented security architecture of the AI-Powered Motor Shop Management System, including frontend/backend controls, authentication and authorization flows, database and API protections, Groq AI isolation, and data flows mapped to CIA Triad enforcement.

## 2. Frontend security architecture
**Stack:** React 18, Vite 5, TypeScript, Tailwind, Axios, React Router (`frontend/`).

- **Route protection:** `frontend/src/routes/ProtectedRoute.tsx` and route composition in `frontend/src/App.tsx` gate pages by authentication and role (admin-only routes for Users, Audit Logs).
- **Auth/session state:** `frontend/src/context/AuthContext.tsx` manages current user/session state via backend-authenticated endpoints; UI does not trust client-only role checks for enforcement.
- **API client:** `frontend/src/services/api.ts` (Axios)
  - Uses `withCredentials: true` for cookie-based auth.
  - Sends `X-CSRF-Token` for mutating requests when available.
  - Handles CSRF refresh/retry logic and normalizes API errors.
  - Base URL from `VITE_API_URL` only.
- **No frontend secrets:** No `GROQ_API_KEY`, JWT secrets, or DB credentials in frontend code/env; AI requests go to backend `/api/ai/*`.
- **UX safety:** Loading/empty/error states, confirmation dialogs for destructive actions, and form validation feedback (server remains source of truth).

## 3. Backend security architecture
**Stack:** Node.js, Express 4, TypeScript (`backend/src/`).

- **Entry/middleware pipeline:** `backend/src/app.ts`, `server.ts`
  - `helmet` security headers, disabled `x-powered-by`, `Permissions-Policy`, `Cache-Control: no-store`
  - CORS with explicit origin allowlist (`FRONTEND_URL`), credentials, limited methods/headers
  - Request context/logging/timeout, JSON/body size limits
  - Cookie parsing, global rate limiting, CSRF/origin protection for state-changing API requests
  - Centralized 404 and error handling (`middleware/error-handler.ts`)
- **AuthN/AuthZ:** `middleware/auth.ts`, `middleware/authorize.ts`, `services/auth.service.ts`
  - JWT verification (cookie and/or Bearer as supported), user/token-version checks
  - Role-based authorization and ownership/scoping in services/controllers
- **Validation:** Zod schemas in `validators/*` + `middleware/validate.ts` on routes
- **Business/security services:** `services/*` implement RBAC-aware queries, transactional sales/inventory, audit logging, and AI safeguards
- **Availability controls:** `middleware/rate-limit.ts` (global/auth/AI), health controller (`/api/health`), controlled upstream failure handling

## 4. Authentication flow
```mermaid
sequenceDiagram
  autonumber
  participant U as User (Browser)
  participant F as Frontend (React)
  participant B as Backend (Express)
  participant D as PostgreSQL

  U->>F: Submit login/register form
  F->>B: POST /api/auth/login or /register (credentials)
  B->>B: Validate input (Zod)
  B->>D: Find/create user, verify bcrypt hash
  D-->>B: User record
  B->>B: Issue JWT (with token version/claims), set httpOnly auth cookie, issue CSRF token/cookie
  B-->>F: 200 {user, csrfToken}
  F->>F: Store session user state (no secrets), keep CSRF for mutating calls
  F->>B: GET /api/auth/me (cookie) on load/refresh
  B-->>F: Authenticated user profile
```

**Key controls:** bcrypt hashing (`users.password_hash`), JWT secrets from env, token revocation/versioning (`users.token_version`), rate-limited auth endpoints, duplicate email prevention.

## 5. Authorization flow
```mermaid
flowchart TD
  A[Incoming API request] --> B[auth middleware: verify JWT/session]
  B -->|invalid/missing| C[401 Unauthorized]
  B -->|valid| D[authorize middleware / route policy]
  D -->|role/permission denied| E[403 Forbidden]
  D -->|allowed| F[Controller/Service]
  F --> G[Data scoping & business rules]
  G --> H[(PostgreSQL)]
  H --> I[Response with authorized fields only]
```

**Examples enforced server-side:**
- Admin-only: `/api/users`, `/api/audit-logs`, `/api/analytics/sales`, `/api/analytics/products`, `/api/ai/business-insights`, product/category/inventory writes, sale cancellation.
- Staff: permitted product/category/customer/sales/inventory operations with scoped visibility (e.g. own sales) and restricted sensitive fields (cost/profit where applicable).

## 6. Database security and integrity design
**ORM/DB:** Drizzle ORM + PostgreSQL (`backend/src/db/schema/*`, migrations).

- **Schema protections:** UUID PKs, FK relations (`onDelete` policies), unique indexes (emails, SKU, transaction/idempotency keys), check constraints (non-negative money/stock, quantity deltas, valid totals/status rules), enums, timestamps.
- **Tables:** `users`, `customers`, `categories`, `products`, `sales`, `sale_items`, `inventory_movements`, `audit_logs`, `ai_conversations`, `ai_messages`.
- **Transactional integrity:** Sales and inventory updates executed with transactional/service logic to keep `sales`, `sale_items`, `products.stock_quantity`, and `inventory_movements` consistent; idempotency keys prevent duplicate processing.
- **Least data exposure:** Queries/services select role-appropriate fields; parameterized ORM queries reduce injection risk.
- **Migrations/seeders:** `db:generate`, `db:migrate`, `db:seed`; seeder is repeatable, env-driven, and avoids deleting existing production records.

```mermaid
erDiagram
  USERS ||--o{ SALES : processes
  USERS ||--o{ INVENTORY_MOVEMENTS : records
  USERS ||--o{ AUDIT_LOGS : acts
  CUSTOMERS ||--o{ SALES : places
  CATEGORIES ||--o{ PRODUCTS : contains
  PRODUCTS ||--o{ SALE_ITEMS : sold_as
  PRODUCTS ||--o{ INVENTORY_MOVEMENTS : tracked_by
  SALES ||--o{ SALE_ITEMS : includes
  USERS ||--o{ AI_CONVERSATIONS : owns
  AI_CONVERSATIONS ||--o{ AI_MESSAGES : contains
```

## 7. Groq AI security architecture
**Components:** `backend/src/routes/ai.routes.ts`, `controllers/ai.controller.ts`, `services/ai.service.ts`, `services/ai-prompt.service.ts`, `services/ai-conversation.service.ts`, `services/ai-context.service.ts`, `services/groq.service.ts`.

```mermaid
sequenceDiagram
  autonumber
  participant F as Frontend
  participant B as Backend API
  participant H as Conversation Store
  participant C as AI Context Builder
  participant D as PostgreSQL
  participant G as Groq API

  F->>B: POST /api/ai/chat or /business-insights (auth + CSRF)
  B->>B: AuthZ + AI rate limit + input validation
  B->>H: Verify conversation owner, load bounded ordered history
  H->>D: Owner-scoped ai_conversations / ai_messages query
  D-->>H: Recent user/assistant turns only
  alt Business intent
    B->>C: Build role-scoped, aggregate context
    C->>D: Read-only aggregate queries
    D-->>C: Verified metrics (no unnecessary PII)
  else General intent (greeting, identity, general knowledge)
    B->>B: Skip database context entirely
  end
  alt Groq configured
    B->>G: Trusted system prompt + ordered history + verified context (no tools/SQL)
    G-->>B: Model response
    B->>B: Response safety/size checks, audit log
    B->>H: Persist user and assistant turns
    B-->>F: Answer/insights + mode + availability metadata
  else Groq unavailable/unconfigured
    B->>B: Friendly fallback or deterministic fallback, audit log
    B->>H: Persist labeled fallback turn
    B-->>F: Graceful response (core app unaffected)
  end
```

**Controls:** backend-only `groq-sdk` (`https://api.groq.com/openai/v1`) and backend-only API key, single configured model (`GROQ_MODEL`, default `openai/gpt-oss-120b`) validated at runtime, no DB mutation/SQL execution capability (no tools registered), centralized trusted system prompt that users cannot override, bounded/role-validated history, strict owner scoping on conversation reads/writes/deletes (cross-user ids return 404), prompt/response constraints, secret-scan, PII/cost minimization in context, request timeout (`GROQ_TIMEOUT_MS`, `maxRetries: 0`) and mapped provider errors, plus graceful degradation. AI generation endpoints are rate-limited separately from conversation history endpoints so normal history use cannot exhaust the AI budget.

## 8. API protection
- **Authentication & CSRF:** JWT/cookie auth, `X-CSRF-Token` validation for state changes, origin allowlist/CORS.
- **Authorization:** per-route role checks and service-level scoping.
- **Validation:** Zod schemas for params/query/body.
- **Abuse resistance:** global/auth/AI rate limiters, body size limits, request timeouts.
- **Error handling:** centralized, consistent error envelope and safe messages; request IDs for traceability.
- **Transport/deployment:** HTTPS and secure cookie settings expected in production; reverse proxy trust configurable (`TRUST_PROXY`).

## 9. End-to-end data flow (POS example)
```mermaid
flowchart LR
  U[Cashier/Admin User] --> FE[React POS Page]
  FE -->|POST /api/sales + CSRF + cookie| BE[Express + Validators + AuthZ]
  BE --> SVC[Sales Service Transaction]
  SVC --> DB[(PostgreSQL: sales, sale_items, products, inventory_movements)]
  SVC --> AUD[audit_logs]
  DB --> BE
  BE --> FE[Receipt/Result JSON]
```

## 10. CIA Triad enforcement mapping
| Principle | Key mechanisms | Primary code areas |
|---|---|---|
| Confidentiality | bcrypt, JWT/cookies, CSRF, RBAC, CORS, Helmet, secret isolation, scoped data/AI context | `middleware/auth|authorize|csrf`, `services/auth|ai|groq`, `app.ts`, `frontend/src/services/api.ts` |
| Integrity | Zod validation, DB constraints/FKs/checks, transactions, idempotency, no negative stock, audit logging, AI read-only safeguards | `validators/*`, `db/schema/*`, `services/sales|inventory|ai`, `audit.service.ts` |
| Availability | Health checks, rate limiting, timeouts/limits, pooling config, centralized errors, graceful AI fallback, resilient UI states | `controllers/health.controller.ts`, `middleware/rate-limit|error-handler|request-context`, `services/groq|ai`, frontend pages |

## 11. Evidence and verification
- Automated security tests: `backend/scripts/security-tests.ts` (`npm run test:security`), results recorded in `backend/security-test-output.txt` and summarized in `docs/SECURITY-TEST-REPORT.md`.
- Automated AI tests: `backend/scripts/ai-tests.ts` (`npm run test:ai`), **19/19** passing mocked Groq error/fallback/status plus prompt/intent/conversation-validation cases.
- Live conversational E2E (Neon DB, Groq `openai/gpt-oss-120b`): **22/22** checks passed, including general-vs-business routing, real aggregate answers, contextual follow-ups, ordered history persistence, and cross-user isolation (404) / unauthenticated access (401).
- Live Groq verification (Neon DB): `/api/ai/status` reachable with model `openai/gpt-oss-120b`; `/api/ai/chat` and `/api/ai/business-insights` returned `provider: groq`, `available: true`. The full security suite was not re-run against the Groq build in this environment.
- Security control documentation and limitations: `docs/CIA-TRIAD-SECURITY.md`.

This architecture reflects the implemented system and should be updated alongside code or configuration changes. It does not constitute a formal compliance certification.
