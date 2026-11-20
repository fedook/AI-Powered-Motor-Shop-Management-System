# CIA Triad Security - AI-Powered Motor Shop Management System

## 1. Introduction
This document explains how the **CIA Triad (Confidentiality, Integrity, Availability)** is applied in the implemented AI-Powered Motor Shop Management System. It describes actual controls present in the codebase, supporting files, API routes, database structures, and executed test evidence. It does **not** claim complete security or compliance; limitations and recommendations are included.

## 2. What is the CIA Triad?
- **Confidentiality:** Ensure sensitive information is accessible only to authorized users and services.
- **Integrity:** Ensure data and operations remain accurate, consistent, and protected from unauthorized or invalid modification.
- **Availability:** Ensure authorized users can access required functionality reliably, with graceful handling of failures.

## 3. Importance in this system
The system manages credentials, customer PII, pricing/cost data, inventory quantities, sales transactions, and AI-assisted business insights. Breaches or errors can lead to unauthorized data access, financial/stock inconsistencies, fraud, or operational downtime. CIA controls protect authentication, RBAC, transactional correctness, auditability, and service resilience.

## 4. System Security Architecture
- **Frontend (React/Vite/TS):** `frontend/src/*` handles UI, route guards (`frontend/src/routes/ProtectedRoute.tsx`), and API calls via Axios with cookie/CSRF handling (`frontend/src/services/api.ts`). No secrets stored client-side (only `VITE_API_URL`).
- **Backend (Express/TS):** `backend/src/app.ts`, `server.ts`, routes/controllers/services/middleware/validators implement authN/authZ, validation, CSRF/origin checks, rate limiting, error handling, and business logic.
- **Database (PostgreSQL/Drizzle):** `backend/src/db/schema/*`, migrations in `backend/src/db/migrations/*`, transactional operations in services (notably sales/inventory).
- **AI (Groq, backend-only):** `backend/src/services/groq.service.ts`, `ai.service.ts`, `ai-prompt.service.ts`, `ai-conversation.service.ts`, `ai-context.service.ts`; exposed via `/api/ai/*` with auth/rate limits, per-user conversation ownership and read-only DB aggregates.
- **Observability/audit:** `audit_logs` table and `backend/src/services/audit.service.ts`, health endpoint `/api/health`.

See `docs/SECURITY-ARCHITECTURE.md` for data flows and diagrams.

## 5. Confidentiality

### 5.1 Implemented controls (actual)
| Control | Implementation (files/routes/tables) | Notes / evidence |
|---|---|---|
| Password hashing | `backend/src/services/auth.service.ts`, `user.service.ts`, bcrypt usage; `users.password_hash` in `backend/src/db/schema/users.ts` | Passwords never stored/returned in plaintext. |
| JWT authentication | `backend/src/services/auth.service.ts`, `backend/src/middleware/auth.ts`, `backend/src/utils/jwt.ts` (as implemented), cookie handling in `app.ts`/auth flow | Protected endpoints require valid auth (`/api/products` unauth -> 401). |
| Token/session controls | `users.token_version`, logout/logout-all/password change revocation logic in auth services/routes | Supports invalidation of sessions on sensitive changes. |
| HTTP-only auth cookies + CSRF | `backend/src/middleware/csrf.ts`, `backend/src/routes/auth.routes.ts` (`/auth/csrf`), Axios interceptor in `frontend/src/services/api.ts` | State-changing browser requests protected with CSRF token/header and origin checks. |
| RBAC / authorization | `backend/src/middleware/authorize.ts`, route guards in `backend/src/routes/*.ts`, frontend role routes in `frontend/src/App.tsx` | Staff blocked from admin endpoints (users, audit logs, admin analytics/insights); enforced server-side. |
| Data scoping/minimization | `analytics.service.ts`, `sales.service.ts`, `ai-context.service.ts`, controllers | Staff sales scoped to own; sensitive cost/profit/customer PII restricted from unauthorized/AI contexts where applicable. |
| AI conversation isolation | `services/ai-conversation.service.ts`, `routes/ai.routes.ts`, `db/schema/ai.ts` | Every conversation read/write/delete is filtered by `user_id`; cross-user ids return 404. History is bounded to recent turns and validated as user/assistant only, so the trusted system prompt cannot be replaced. |
| CORS & origin allowlist | `backend/src/app.ts` (`FRONTEND_URL` allowlist, credentials, allowed headers) | Rejects disallowed origins. |
| Security headers | Helmet in `backend/src/app.ts`, additional `Permissions-Policy`, `Cache-Control: no-store` | Reduces browser-based exposure risks. |
| Secret handling | `backend/.env.example`, `backend/src/config/env.ts`, Groq key only in backend (`groq.service.ts`) | No `GROQ_API_KEY` in frontend env/source; frontend uses only `VITE_API_URL`. |
| Sensitive logging redaction | Error/audit/logger utilities (`backend/src/utils/logger.ts`, audit service) | Avoids leaking secrets in logs; AI secret-scan on responses. |

### 5.2 Practical example
A Staff account authenticating normally **cannot** access admin-only APIs: `GET /api/users` and `GET /api/audit-logs` return **403** when called by staff (verified in security tests CO-05/CO-06). Role changes/privileged operations are restricted to admin paths and backend checks.

### 5.3 Relevant files and routes
- Files: `backend/src/app.ts`, `middleware/auth.ts`, `middleware/authorize.ts`, `middleware/csrf.ts`, `services/auth.service.ts`, `services/groq.service.ts`, `services/ai-conversation.service.ts`, `frontend/src/services/api.ts`, `frontend/src/routes/ProtectedRoute.tsx`
- Routes: `/api/auth/*`, `/api/users`, `/api/audit-logs`, `/api/ai/*` (including `/api/ai/conversations`)
- Tables: `users`, `audit_logs`, `ai_conversations`, `ai_messages`

## 6. Integrity

### 6.1 Implemented controls (actual)
| Control | Implementation (files/routes/tables) | Notes / evidence |
|---|---|---|
| Request validation (Zod) | `backend/src/validators/*.ts`, `backend/src/middleware/validate.ts`, route schemas | Invalid payloads rejected (e.g. negative price -> 422 validation error in IN-01). |
| DB constraints & FKs | `backend/src/db/schema/*.ts`, migration SQL | PK/FK/unique/check constraints prevent invalid references/values (invalid category FK rejected IN-03). |
| Transactional business ops | `backend/src/services/sales.service.ts`, inventory/product services using DB transactions/locking patterns (`FOR UPDATE` where applicable) | Sale creation and inventory deductions kept consistent; duplicate/idempotent handling. |
| No negative stock | Schema checks (`products.stock_quantity >= 0`, movement delta checks) + service validation | Excessive/invalid deductions rejected (IN-02). |
| Duplicate transaction protection | `sales.idempotency_key` unique constraint, sales service idempotency logic | Same idempotent sale returned once; stock deducted once (IN-04). |
| Controlled cancellation/corrections | `POST /api/sales/:id/cancel` (admin-only), status/cancellation fields in `sales` | Staff cannot cancel sales (403, IN-06); cancellations audited/restock handled in service logic. |
| Audit logging | `audit_logs` table, `backend/src/services/audit.service.ts`, audit calls across services/controllers | Security/business actions recorded (user, action, entity, request context). |
| AI integrity safeguards | `ai.service.ts`, `ai-prompt.service.ts`, `ai-conversation.service.ts`, `groq.service.ts` read-only/no tools, response checks, trusted prompt + bounded validated history | AI cannot execute SQL or modify DB or override the system prompt via user messages; prompt-injection-style requests did not expose secrets/credentials and were handled safely (controlled error or labeled fallback). |

### 6.2 Practical example
When a sale is processed, the system validates stock and records sale, sale items, and inventory movements within transactional logic; if validation fails (e.g. insufficient stock) the operation is rejected and inconsistent partial updates are avoided. Idempotency ensures retries do not double-deduct stock (verified in latest clean run: `s1=201 s2=201 same=true stock 20->19`).

### 6.3 Relevant files and routes
- Files: `backend/src/services/sales.service.ts`, `inventory.service.ts`, `validators/sale.validator.ts`, `validators/product.validator.ts`, `middleware/validate.ts`, `db/schema/sales.ts`, `db/schema/inventory.ts`
- Routes: `/api/sales`, `/api/sales/:id/cancel`, `/api/inventory/movements`, `/api/products`
- Tables: `products`, `sales`, `sale_items`, `inventory_movements`, `audit_logs`

## 7. Availability

### 7.1 Implemented controls (actual)
| Control | Implementation (files/routes/tables) | Notes / evidence |
|---|---|---|
| Centralized error handling | `backend/src/middleware/error-handler.ts`, `utils/api-error.ts` | Consistent error responses; AI operational errors surfaced appropriately. |
| Health checks | `backend/src/controllers/health.controller.ts`, `GET /api/health` | DB/AI status reporting (AV-01: 200, db up). |
| Rate limiting | `backend/src/middleware/rate-limit.ts` (global/auth/AI limiters), applied in routes/app | Repeated auth failures trigger 429 (AV-02). |
| Request limits/timeouts | `express.json/urlencoded` limits and timeout/context middleware in `app.ts`, `middleware/request-context.ts`; `GROQ_TIMEOUT_MS` timeout in `groq.service.ts` | Bounds resource usage and hanging requests. |
| DB connection/pooling config | `backend/src/db/index.ts`, `config/env.ts` (`DB_POOL_MAX`, pooled Neon `DATABASE_URL`) | Supports managed connections; graceful handling of failures. |
| Graceful AI degradation | `ai.service.ts`, `ai.controller.ts`, `groq.service.ts` | Chat returns controlled errors for unconfigured/upstream failures (e.g. 503 or 502) and insights return labeled deterministic fallback (including on `429` quota exhaustion); core app remains usable (AV-03 behavior). |
| Frontend resilience | Loading/error/empty states in pages/components, Axios error normalization | Users receive feedback without breaking core flows. |
| Graceful shutdown/startup validation | `backend/src/server.ts`, env validation in config | Required env validated; orderly startup/shutdown behavior. |

### 7.2 Practical example
In the latest live Groq verification (Neon DB), `/api/health` reported DB up with `aiProvider: groq`; `/api/ai/status` reported `providerReachable: true` with model `openai/gpt-oss-120b`; and both `/api/ai/chat` and `/api/ai/business-insights` returned HTTP 200 with `provider: groq`. A free-tier `429` during an earlier run was handled as `AI_QUOTA_EXCEEDED` with a labeled deterministic fallback, while core CRUD/POS/inventory operations and health remained available. If `GROQ_API_KEY` is missing, the system returns a controlled `503 AI_NOT_CONFIGURED` instead.

### 7.3 Relevant files and routes
- Files: `backend/src/app.ts`, `server.ts`, `middleware/rate-limit.ts`, `middleware/error-handler.ts`, `controllers/health.controller.ts`, `services/groq.service.ts`, `services/ai-conversation.service.ts`
- Routes: `/api/health`, `/api/ai/status`, `/api/ai/chat`, `/api/ai/business-insights`, `/api/ai/conversations`

## 8. Groq AI and the CIA Triad
- **Confidentiality:** Backend-only SDK/key (`GROQ_API_KEY` never sent to frontend), authorized endpoints, AI context built from aggregates without unnecessary customer PII; conversation history is isolated per authenticated user (owner-scoped queries, 404 for foreign ids); secrets not exposed in responses.
- **Integrity:** Read-only assistant (no tools/SQL/DB writes), centralized trusted system prompt sent on every request, bounded/role-validated history, prompt/response constraints, injection-resistant handling instructions, response secret-scan, facts separated from recommendations; audit of AI actions.
- **Availability:** Timeouts, quota/error mapping, and deterministic fallback/controlled errors so motor shop operations are not blocked by AI outages or missing configuration; conversation reads use a separate limiter from AI generation so history stays accessible.

## 9. Practical implementation examples
1. **Unauthorized access denied:** Missing/invalid token on protected route returns 401 (CO-01/CO-02).
2. **Least privilege:** Staff calling `/api/users` or `/api/audit-logs` gets 403 (CO-05/CO-06).
3. **Validated input:** Negative product price rejected with 422 validation details (IN-01).
4. **Inventory safety:** Movement/sale requests that would violate stock/quantity constraints are rejected (IN-02/IN-05).
5. **Idempotent sales:** Replayed transaction key returns same sale without double stock deduction (IN-04).
6. **AI failure handled safely:** Prompt-injection-style requests did not leak credentials; provider failures/quota exhaustion return friendly controlled fallbacks or labeled deterministic fallback (IN-07/AV-03).
7. **AI conversation isolation:** A staff account requesting an admin's conversation id receives 404; staff conversation lists never include other users' chats; unauthenticated conversation access returns 401 (verified in live conversational E2E).

## 10. Security controls and relevant source files
- `backend/src/app.ts` - middleware stack, CORS, headers, parsing limits, routing
- `backend/src/middleware/auth.ts`, `authorize.ts`, `csrf.ts`, `validate.ts`, `rate-limit.ts`, `error-handler.ts`, `request-context.ts`
- `backend/src/routes/*.ts` - endpoint-level authZ/validation/rate limits
- `backend/src/services/auth.service.ts`, `sales.service.ts`, `inventory.service.ts`, `ai.service.ts`, `ai-prompt.service.ts`, `ai-conversation.service.ts`, `groq.service.ts`, `audit.service.ts`
- `backend/src/db/schema/*.ts`, `db/migrations/*`, `db/seeders/seed.ts`
- `frontend/src/services/api.ts`, `routes/ProtectedRoute.tsx`, `context/AuthContext.tsx`, `App.tsx`
- `backend/scripts/security-tests.ts` - automated security test harness

## 11. Security testing results
Automated tests executed with `npm.cmd run test:security` (see `backend/security-test-output.txt` and `docs/SECURITY-TEST-REPORT.md`).

- **Latest reconciled run (pre-Groq migration):** 18 tests, **18 passed, 0 failed** (with `aiConfigured=true` and controlled `502 AI_UPSTREAM_ERROR` for the AI failure case, no secret leakage). The suite was updated to Groq naming/assertions but not re-run end-to-end against the Groq build here.
- **Groq migration checks:** backend typecheck/build pass; `npm.cmd run test:ai` passes **19/19** mocked cases (including prompt/identity, general-vs-business routing, contextual follow-ups and conversation validation); live `/api/ai/status`, `/api/ai/chat` and `/api/ai/business-insights` verified against Neon with `provider: groq`; staff chat/status succeeded while staff insights/users/audit returned 403; unauthenticated chat returned 401.
- **Conversational E2E (live Groq + Neon):** **22/22** checks passed. Verified natural replies for Hi/Hello/Good morning/Who are you/What can you do/How are you/Thank you/What is a motorcycle, business routing with real aggregates for best sellers and low stock, contextual follow-ups (`that product`, `its sales`), ordered persistence (24 stored messages), cross-user conversation 404, staff list isolation, unauthenticated 401, and delete/404 behavior.
- **Earlier runs:** required assertion reconciliation for IN-01 validation status and AI failure/leakage handling (422 and controlled 502/503 non-leaking responses). Test script assertions were corrected to match secure behavior; application security behavior was not weakened.

**Not performed/verified:** full security suite re-run against the Groq build, live-provider prompt-injection/quota/timeout matrix, full penetration test, SAST/DAST pipeline, load/stress testing, production WAF/infra hardening validation.

## 12. Known security limitations
- Full security suite not re-run against the Groq build; live Groq chat/insights success and error mappings were verified separately (`test:ai` + live conversational E2E).
- Groq free-tier token limits (8000 TPM for `openai/gpt-oss-120b`) can produce `429 AI_QUOTA_EXCEEDED` during bursts; handled with labeled fallbacks but may reduce AI availability under heavy use. AI generation is limited to 20 requests per 10 minutes per user.
- Conversation history is intentionally bounded (last 10 turns; last 6 on business turns), so very long-range memory is not retained in the prompt.
- Automated coverage is targeted API-level testing, not exhaustive security assurance.
- Cross-origin cookie/CSRF deployment settings (`SameSite`, domain, HTTPS) must be configured correctly per environment.
- In-memory or process-local behaviors (e.g. rate-limit counters) depend on runtime topology; distributed deployments may require shared stores.
- CO-08 partially evidenced by code review/static verification in the test script.
- Security tests mutate local data (e.g. create sale, trigger rate limits) and should be run against disposable/dev environments.

## 13. Recommendations
- Configure `GROQ_API_KEY` in a secure backend secret store (Render), set `GROQ_MODEL=openai/gpt-oss-120b` and `GROQ_TIMEOUT_MS=25000`, and monitor quota/rate-limit behavior.
- Add CI checks: dependency vulnerability scanning, secret scanning, lint/type/test gates.
- Expand tests: expired/rotated token cases, CSRF negative tests, authorization matrix per endpoint, concurrency/race tests, and DB failure injection.
- For production: enforce HTTPS, strict cookie attributes, centralized logging/alerting, WAF/reverse-proxy hardening, DB backups/PITR, and periodic credential rotation.
- Consider distributed rate limiting/session revocation stores for multi-instance deployments.

## 14. Conclusion
The system implements substantive Confidentiality, Integrity, and Availability controls across frontend, backend, database, and AI integration layers, with executed automated evidence for key scenarios. Live Groq AI responses were verified locally against Neon. Residual risks remain and require environment-specific hardening and further verification (especially the full security suite and production deployment) before making strong production security claims.
