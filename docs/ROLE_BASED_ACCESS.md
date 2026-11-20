# Role-based access control

## 1. Principle

The existing role catalogue was extended; it was not replaced. Every protected analytics route has an explicit permission, and every role has an explicit allow-list in `backend/src/config/constants.ts`.

## 2. New permissions

| Permission | Admin | Staff | Purpose |
|---|---|---|---|
| `analytics:datasets` | Yes | Yes | Read live dataset counts and integrity |
| `analytics:descriptive` | Yes | No | Read financial descriptive results |
| `analytics:predictive` | Yes | No | Read forecasts |
| `analytics:prescriptive` | Yes | No | Read and decide recommendations |
| `analytics:workflow` | Yes | No | Read the connected stage trace |

`analytics:dashboard`, `analytics:sales`, and `analytics:products` retain their previous behavior.

## 3. Access matrix

| Feature | Admin | Staff |
|---|---|---|
| BA Overview case study sections 1–9 | Yes | Yes |
| Live dataset counts | Yes | Yes |
| BA Overview financial results (sections 10–12) | Yes | Restricted message |
| BA Dashboard (`/reports`, `/analytics`) | Yes | Restricted message / route guard |
| BA Connected Process (`/analytics/process`) | Yes | Restricted message / route guard |
| Recommendation status update | Yes | 403 |
| AI business insights | Yes | 403 (existing behavior) |
| AI chat with real DB facts | Yes | Yes, with staff-safe context |

## 4. Enforcement layers

1. **Backend:** `requireAuth` plus `requirePermission` on every analytics route.
2. **Service:** role is passed into service entry points; restricted data is not returned to staff.
3. **Frontend:** admin routes are wrapped in `ProtectedRoute roles={["admin"]}`; pages also check `user.role` and show restricted states.
4. **AI:** context builder excludes customer PII and sensitive financial fields for staff; prompt rules prevent staff from receiving prohibited analytics.

## 5. Verified behavior

The integration test script verified:

- staff `GET /api/analytics/prescriptive` → 403;
- staff `GET /api/analytics/datasets` → 200 with counts;
- admin recommendation status update → 200 and persisted status.

See [TESTING_REPORT.md](./TESTING_REPORT.md) for the recorded results.
