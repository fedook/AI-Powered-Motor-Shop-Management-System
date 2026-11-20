# Database schema notes

## 1. Existing schema preserved

The Business Analytics feature reuses the existing Drizzle/Neon schema: `users`, `customers`, `categories`, `products`, `sales`, `sale_items`, `inventory_movements`, `audit_logs`, `ai_conversations`, and `ai_messages`. No existing table, column, API contract, or authentication flow was replaced.

## 2. One new table

`backend/src/db/schema/ba.ts` defines:

| Column | Type | Purpose |
|---|---|---|
| `key` | `varchar(200)` primary key | Deterministic recommendation key including product and horizon |
| `status` | enum `pending`, `accepted`, `rejected`, `completed` | Human decision |
| `note` | `text` nullable | Optional reviewer note |
| `decided_by` | `uuid` nullable FK → `users.id` | Reviewer, set null if user deleted |
| `decided_at` | `timestamptz` default now | Decision timestamp |
| `created_at` | `timestamptz` default now | Record creation |

The table stores **only decisions**, never generated sales figures. Analytics are always recalculated from source records.

## 3. Migration

File: `backend/src/db/migrations/0002_ba_recommendation_statuses.sql`

Safety features:

- enum creation is guarded with `DO $$ ... EXCEPTION WHEN duplicate_object`;
- table uses `CREATE TABLE IF NOT EXISTS`;
- FK constraint addition is guarded against duplicates.

The migration was applied with `npm.cmd run db:migrate` and completed successfully.

## 4. Journal

`backend/src/db/migrations/meta/_journal.json` includes the `0002_ba_recommendation_statuses` entry so Drizzle tracks the migration.

## 5. Seed safety

`backend/src/db/seeders/seed.ts` now tops customers up to 50 when fewer exist. It does not delete, truncate, or overwrite existing rows. Verified after seeding: products 50, customers 50, sales 59, sale items 138, inventory movements 188.

## 6. Read-only analytics

All descriptive, predictive, and prescriptive reads go through parameterized Drizzle queries in `ba.service.ts`. The only write introduced by this feature is the recommendation status update plus its audit log entry.
