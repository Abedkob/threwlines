# Supabase → Local PostgreSQL Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hosted Supabase with a local PostgreSQL database, custom JWT auth, local file storage, and Next.js API routes — keeping all UI, domain logic, and SQL functions intact.

**Architecture:** A `pg` connection pool replaces the Supabase JS client. Custom JWT auth (bcryptjs + jose) replaces Supabase Auth. Domain modules under `lib/db/` export the same function signatures backed by raw SQL. Client components call new API routes instead of the Supabase browser client.

**Tech Stack:** PostgreSQL 14+, node-postgres (`pg`), bcryptjs, jose, Next.js API routes, local filesystem for uploads.

**Spec:** `docs/superpowers/specs/2026-11-03-supabase-to-local-postgres-design.md`

## Global Constraints

- PostgreSQL 14+ (for `security_invoker` views).
- Node 18+ (for `crypto.subtle` in license token signing).
- The `pgcrypto` and `pg_trgm` extensions must be available.
- No ORM — all queries are parameterized SQL strings via `pg`.
- `@/` alias for all imports. Two-space indent, semicolons, double quotes.
- Every function that previously accepted `SupabaseClient` drops that parameter. Server-side functions receive `userId: string` where they need the actor. Client-side code calls API routes.
- The `query-cache.ts` browser cache is preserved as-is; it wraps API fetch calls the same way it wrapped Supabase calls.
- `types/db.ts` is unchanged — all existing types remain.
- No UI, CSS, or layout changes.

## Review Focus

1. **SQL injection via string interpolation** — every dynamic value must use `$N` parameterized placeholders, never template literals. The ILIKE search patterns for contacts are the highest risk since the Supabase builder escaped them implicitly.
2. **Missing `p_actor_id` in adapted SQL functions** — `auth.uid()` appears in ~25 functions. A function that still references it will crash at runtime with "function auth.uid() does not exist". Run `grep -r 'auth.uid' scripts/local-schema.sql` after Task 1 to verify zero matches.
3. **Numeric type coercion from pg** — `pg` returns `numeric` columns as strings. Every query that reads `amount`, `balance_due`, `total_amount`, `default_price`, etc. must `Number()` the value, matching the existing Supabase normalization pattern.
4. **Cookie handling across middleware and API routes** — the JWT cookie must use `httpOnly`, `secure` (in production), `sameSite: lax`, and `path: /`. A mismatch means silent auth failures.
5. **CORS on license API routes** — external apps call these endpoints. Missing `access-control-allow-origin` headers will cause silent failures in client apps. Test with `curl -H "Origin: https://example.com"`.

---

### Task 1: Database Foundation — Pool, Query Helpers, and Adapted Schema

**Files:**
- Create: `lib/db/pool.ts`
- Create: `lib/db/query.ts`
- Create: `scripts/local-schema.sql`
- Create: `scripts/local-seed.sql`
- Test: `lib/db/query.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var
- Produces: `pool` (singleton Pool), `query(sql, params?) → { rows, rowCount }`, `queryOne(sql, params?) → row | null`, `queryCount(sql, params?) → number`, `rpc(fnName, params?) → result`

- [ ] **Step 1: Install dependencies**

```bash
npm install pg bcryptjs jose
npm install -D @types/pg @types/bcryptjs
```

- [ ] **Step 2: Write the failing test for query helpers**

Create `lib/db/query.test.ts` using `node:test` and `node:assert/strict`. Test that `query`, `queryOne`, and `queryCount` call the pool correctly. Use a mock pool pattern — a local object with a `query` method that records calls and returns canned results.

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// Tests verify:
// - query() returns { rows, rowCount } from pool.query
// - queryOne() returns first row or null when empty
// - queryCount() returns the count column as a number
// - rpc() calls SELECT fn($1, $2, ...) and returns the result
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="query"`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 4: Implement `lib/db/pool.ts`**

```typescript
// Exports: pool (pg.Pool singleton reading DATABASE_URL)
// Lazy initialization: pool is created on first access.
import { Pool } from "pg";
```

- [ ] **Step 5: Implement `lib/db/query.ts`**

Exports: `query(sql, params?)`, `queryOne(sql, params?)`, `queryCount(sql, params?)`, `rpc(fnName, args?)`. All use the pool from `pool.ts`. `rpc` builds `SELECT fn($1, ...) AS result` and returns the result column.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="query"`
Expected: PASS

- [ ] **Step 7: Create `scripts/local-schema.sql`**

Combine and adapt all existing SQL foundations into one file, in order:
1. Extensions: `pgcrypto`, `pg_trgm`
2. Enums from `schema.sql`
3. `profiles` table — **remove** `references auth.users(id)`, **add** `email text NOT NULL UNIQUE`, `password_hash text NOT NULL`
4. All other tables from `schema.sql` (services, expense_categories, contacts, activities, payments, tasks, task_items, expenses) — unchanged
5. **Remove** `handle_new_user()` trigger and function (no `auth.users`)
6. **Remove** all `enable row level security` and RLS policy creation
7. Billing tables and enums from `billing-foundation.sql` — remove RLS policies, remove `storage.buckets` references
8. Performance indexes and functions from `performance.sql` — the `dashboard_summary()` function's `my_open_tasks` query changes: it accepts `p_user_id uuid` instead of using `auth.uid()`
9. Roles setup from `roles-and-expense-editing.sql` — remove the `auth.users` backfill, remove `auth.uid()` references from policies, **remove all RLS policies**
10. Licensing tables and functions from `licensing-foundation.sql`
11. Billing functions from `billing-functions.sql`

**Critical adaptation:** Replace every `auth.uid()` call with an explicit parameter:
- `is_superadmin()` → `is_superadmin(p_user_id uuid)`
- `dashboard_summary()` → `dashboard_summary(p_user_id uuid)` (for `my_open_tasks`)
- Every billing function that calls `is_superadmin()` passes `p_actor_id` through
- Every function that sets `created_by` from `auth.uid()` uses `p_actor_id` instead
- License admin functions get `p_actor_id uuid` parameter; license API functions (activate, validate, deactivate) keep their existing signature since they don't use `auth.uid()`

- [ ] **Step 8: Verify no `auth.uid` or `auth.users` references remain**

```bash
grep -n 'auth\.uid\|auth\.users' scripts/local-schema.sql
```

Expected: zero matches.

- [ ] **Step 9: Create `scripts/local-seed.sql`**

Seed a default superadmin user. Use `gen_random_uuid()` for the id, a bcrypt hash for the password (pre-computed for a known dev password like `vault-dev-2026`), and the existing seed data from `scripts/seed.sql` adapted to reference the new profile row.

- [ ] **Step 10: Commit**

```bash
git add lib/db/pool.ts lib/db/query.ts lib/db/query.test.ts scripts/local-schema.sql scripts/local-seed.sql package.json package-lock.json
git commit -m "Add pg pool, query helpers, and adapted local schema"
```

---

### Task 2: Auth System — JWT, Login/Logout, Middleware

**Files:**
- Create: `lib/auth/password.ts`
- Create: `lib/auth/token.ts`
- Create: `lib/auth/session.ts`
- Create: `lib/auth/constants.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/me/route.ts`
- Modify: `middleware.ts`
- Modify: `app/(auth)/login/page.tsx`
- Test: `lib/auth/token.test.ts`

**Interfaces:**
- Consumes: `query`/`queryOne` from Task 1, `JWT_SECRET` env var
- Produces: `hashPassword(plain) → hash`, `verifyPassword(plain, hash) → boolean`, `signSessionToken(payload) → token`, `verifySessionToken(token) → payload | null`, `getSession(cookies) → { userId, email, role } | null`

- [ ] **Step 1: Write the failing test for token signing/verification**

```typescript
// lib/auth/token.test.ts
// Tests verify:
// - signSessionToken() returns a non-empty string
// - verifySessionToken() on a valid token returns { sub, email, role }
// - verifySessionToken() on an expired token returns null
// - verifySessionToken() on a tampered token returns null
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="token"`
Expected: FAIL

- [ ] **Step 3: Implement `lib/auth/constants.ts`**

Exports: `JWT_SECRET` (from `process.env.JWT_SECRET`), `TOKEN_EXPIRY` (`"7d"`), `COOKIE_NAME` (`"idv-session"`).

- [ ] **Step 4: Implement `lib/auth/password.ts`**

Exports: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`. Uses `bcryptjs` with 12 rounds.

- [ ] **Step 5: Implement `lib/auth/token.ts`**

Exports: `signSessionToken(payload: { sub: string; email: string; role: string }): Promise<string>`, `verifySessionToken(token: string): Promise<{ sub: string; email: string; role: string } | null>`. Uses `jose` with HS256 and `JWT_SECRET`.

- [ ] **Step 6: Implement `lib/auth/session.ts`**

Exports: `getSession(cookieStore: ReadonlyRequestCookies): Promise<{ userId: string; email: string; role: string } | null>`. Reads the `COOKIE_NAME` cookie, calls `verifySessionToken`, returns the payload or null.

- [ ] **Step 7: Run token test to verify it passes**

Run: `npm test -- --test-name-pattern="token"`
Expected: PASS

- [ ] **Step 8: Implement `POST /api/auth/login`**

`app/api/auth/login/route.ts`: reads `{ email, password }` from body, queries `profiles` by email, verifies password with `verifyPassword`, signs a JWT with `signSessionToken`, sets it as an `httpOnly` cookie. Returns `{ ok: true, user: { id, name, email, role } }` on success, `{ ok: false, message }` on failure.

- [ ] **Step 9: Implement `POST /api/auth/logout`**

`app/api/auth/logout/route.ts`: clears the session cookie. Returns `{ ok: true }`.

- [ ] **Step 10: Implement `GET /api/auth/me`**

`app/api/auth/me/route.ts`: calls `getSession(cookies())`, queries profile by userId, returns `{ user: { id, name, email, role, color } }` or 401.

- [ ] **Step 11: Rewrite `middleware.ts`**

Remove all Supabase imports and client creation. Import `verifySessionToken` from `lib/auth/token` and `COOKIE_NAME` from `lib/auth/constants`. Read the JWT from the cookie, verify it, set `x-idv-auth-user` and `x-idv-auth-email` headers on success. Redirect unauthenticated users to `/login`, redirect authenticated users away from `/login` to `/dashboard`. Keep the same `config.matcher`.

- [ ] **Step 12: Rewrite `app/(auth)/login/page.tsx`**

Remove `createClient` and `hasSupabaseConfig` imports. The `signIn` function POSTs to `/api/auth/login` with `{ email, password }`. On success, `router.replace("/dashboard")`. Remove the "Add Supabase URL" notice. Change the footer text from "Supabase Auth" to "Secure session".

- [ ] **Step 13: Commit**

```bash
git add lib/auth/ app/api/auth/ middleware.ts "app/(auth)/login/page.tsx"
git commit -m "Add custom JWT auth system replacing Supabase Auth"
```

---

### Task 3: Domain Data Layer — Contacts, Tasks, Expenses, Profiles

**Files:**
- Create: `lib/db/contacts.ts`
- Create: `lib/db/tasks.ts`
- Create: `lib/db/expenses.ts`
- Create: `lib/db/profiles.ts`
- Create: `lib/db/settings.ts`
- Test: `lib/db/contacts.test.ts`

**Interfaces:**
- Consumes: `query`, `queryOne`, `queryCount`, `rpc` from Task 1
- Produces: Every function currently exported from `lib/db.ts`, with identical return types but without the `SupabaseClient` parameter. Mutation functions take `userId: string` where the original called `getCurrentUserId()`.

The key signatures (all async, same return types as current):

**contacts.ts:** `listContactsPage(options)`, `getContact(id)`, `listContactIdentities()`, `listContactActivities(contactId, cursor?, limit?)`, `listContactPayments(contactId, cursor?, limit?)`, `listPipelineContacts(options)`, `listAttentionContacts(limit?)`, `createContact(userId, input)`, `createContacts(userId, inputs)`, `updateContact(id, input)`, `moveContact(userId, contact, stage)`, `addActivity(userId, contactId, channel, note)`, `addPayment(input)`, `getContactPaymentSummary(contactId)`

**tasks.ts:** `listTasksPage(options)`, `listMyOpenTasks(userId, limit?)`, `createTask(userId, input)`, `updateTask(id, input)`, `deleteTask(id)`, `addTaskItem(userId, taskId, content, parentId, sortOrder)`, `updateTaskItem(id, input)`, `deleteTaskItem(id)`

**expenses.ts:** `listExpensesPage(options)`, `getExpenseSummary()`, `listExpenseCategories()`, `createExpense(userId, input)`, `updateExpense(id, input)`, `deleteExpense(id)`, `createExpenseCategory(name)`, `updateExpenseCategory(id, name)`, `deleteExpenseCategory(id)`

**profiles.ts:** `listProfiles()`, `getProfile(id)`, `getCurrentUserRole(userId)`

**settings.ts:** `listServices()`, `createService(input)`, `updateService(id, input)`, `deleteService(id)`, `getNavigationCounts()`, `getDashboardSummary(userId)`

- [ ] **Step 1: Write the failing test for contacts query patterns**

```typescript
// lib/db/contacts.test.ts — test the SQL building logic
// Tests verify:
// - listContactsPage with filter="leads" includes the correct WHERE IN clause
// - listContactsPage with query="test" builds an ILIKE OR clause
// - createContact returns the new contact id
// - pageBounds calculates correct OFFSET/LIMIT for page 2, size 25
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="contacts"`
Expected: FAIL

- [ ] **Step 3: Implement `lib/db/contacts.ts`**

Translate each Supabase query chain into a parameterized SQL string. The contact summary SELECT becomes a JOIN query:
```sql
SELECT c.*, row_to_json(p.*) AS owner
FROM contacts c
LEFT JOIN profiles p ON p.id = c.assigned_to
WHERE ...
ORDER BY c.last_touched_at ASC, c.id ASC
LIMIT $N OFFSET $M
```
The count query runs separately with `SELECT count(*) ...`.

For search, use `c.name ILIKE $N OR c.email ILIKE $N ...` with `%${sanitized}%` passed as a parameter (never interpolated).

For cursor pagination (activities, payments), translate the `.or()` cursor filter to `WHERE (created_at < $1) OR (created_at = $1 AND id < $2)`.

For `listPipelineContacts`, run parallel queries per stage (same as current).

- [ ] **Step 4: Implement `lib/db/tasks.ts`**

Translate task queries. The task SELECT with join becomes:
```sql
SELECT t.*, row_to_json(p.*) AS assignee, 
  COALESCE(json_agg(ti.* ORDER BY ti.sort_order, ti.created_at) FILTER (WHERE ti.id IS NOT NULL), '[]') AS items
FROM tasks t
LEFT JOIN profiles p ON p.id = t.assigned_to
LEFT JOIN task_items ti ON ti.task_id = t.id
WHERE ...
GROUP BY t.id, p.id
```

- [ ] **Step 5: Implement `lib/db/expenses.ts`**

Translate expense queries. The expense SELECT with joins:
```sql
SELECT e.*, row_to_json(ec.*) AS category, row_to_json(p.*) AS payer
FROM expenses e
LEFT JOIN expense_categories ec ON ec.id = e.category_id
LEFT JOIN profiles p ON p.id = e.paid_by
```
`getExpenseSummary` calls `rpc("expense_summary")`.

- [ ] **Step 6: Implement `lib/db/profiles.ts`**

Simple `SELECT * FROM profiles ORDER BY name`. `getCurrentUserRole` queries the profile by id and returns the `app_role`.

- [ ] **Step 7: Implement `lib/db/settings.ts`**

`listServices`: `SELECT * FROM services ORDER BY name`.
`getNavigationCounts`: `rpc("navigation_counts")`.
`getDashboardSummary(userId)`: calls `rpc("dashboard_summary", [userId])` plus a separate invoice_balances query for billing totals (matching the current pattern).
`getAppSettings`: `SELECT * FROM app_settings WHERE id = 1`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="contacts"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/db/contacts.ts lib/db/tasks.ts lib/db/expenses.ts lib/db/profiles.ts lib/db/settings.ts lib/db/contacts.test.ts
git commit -m "Add domain data modules backed by pg queries"
```

---

### Task 4: Billing and Licensing Data Modules

**Files:**
- Create: `lib/db/billing.ts`
- Create: `lib/db/licensing.ts`
- Test: `lib/db/billing.test.ts`

**Interfaces:**
- Consumes: `query`, `queryOne`, `rpc` from Task 1
- Produces: Every function currently exported from `lib/billing.ts` and `lib/licensing.ts`, without the `SupabaseClient` parameter. Functions that called `supabase.auth.getUser()` take `userId: string` instead.

**billing.ts:** `getAppSettings()`, `saveAppSettings(userId, settings)`, `listTemplates()`, `saveTemplate(template, id?)`, `deleteTemplate(template)`, `listContracts()`, `saveContract(contract, items, id?)`, `createInvoice(invoice, items)`, `updateInvoice(id, invoice, items)`, `deleteInvoice(id)`, `cancelInvoice(id)`, `createInvoiceFromContract(contractId, start, end)`, `generateMonthlyInvoices(month)`, `listInvoicesPage(options)`, `getInvoice(id)`, `finalizeInvoice(id)`, `recordInvoicePayment(input)`, `listContactInvoiceLedger(contactId)`, `listInvoicePaymentRecords()`, `listPaymentInvoices()`

**licensing.ts:** `listLicensedProducts()`, `saveLicensedProduct(product, id?)`, `listLicenses()`, `listContactLicenses(contactId)`, `getLicenseDetails(licenseId)`, `issueLicense(license)`, `updateLicense(licenseId, patch)`, `deactivateLicenseActivation(activationId, reason?)`, `resetLicenseActivations(licenseId)`, `maskedLicenseKey(license)`

- [ ] **Step 1: Write the failing test for billing RPC patterns**

```typescript
// lib/db/billing.test.ts
// Tests verify:
// - createInvoice calls rpc("create_invoice") with correct params
// - listInvoicesPage builds correct SQL with status filter
// - withEffectiveInvoiceStatus marks overdue invoices correctly
// - numeric fields are coerced from strings to numbers
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="billing"`
Expected: FAIL

- [ ] **Step 3: Implement `lib/db/billing.ts`**

RPC calls translate to: `rpc("create_invoice", [JSON.stringify(invoice), JSON.stringify(items)])`.

Direct table queries translate to parameterized SQL. The invoice SELECT with joins is complex:
```sql
SELECT ib.*, row_to_json(c.*) AS contact,
  COALESCE(json_agg(DISTINCT ii.*) FILTER (WHERE ii.id IS NOT NULL), '[]') AS items,
  COALESCE(json_agg(DISTINCT ip.*) FILTER (WHERE ip.id IS NOT NULL), '[]') AS invoice_payments,
  row_to_json(dt.*) AS template
FROM invoice_balances ib
LEFT JOIN contacts c ON c.id = ib.contact_id
LEFT JOIN invoice_items ii ON ii.invoice_id = ib.id
LEFT JOIN invoice_payments ip ON ip.invoice_id = ib.id
LEFT JOIN document_templates dt ON dt.id = ib.template_id
WHERE ib.id = $1
GROUP BY ib.id, c.id, dt.id
```

Keep `withEffectiveInvoiceStatus` and `numbers` helpers as internal functions (same logic).

Storage functions (`uploadCompanyAsset`, `signedAssetUrl`) are handled in Task 7 — leave stubs that throw "Not yet migrated" for now.

- [ ] **Step 4: Implement `lib/db/licensing.ts`**

Direct queries against `licensed_products`, `license_registry`, `license_activations`, `license_events`. RPC calls for admin operations pass through `rpc()`.

`maskedLicenseKey` is pure logic — copy as-is.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="billing"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/db/billing.ts lib/db/licensing.ts lib/db/billing.test.ts
git commit -m "Add billing and licensing data modules backed by pg"
```

---

### Task 5: API Routes for Client Components

**Files:**
- Create: `app/api/contacts/route.ts`
- Create: `app/api/contacts/[id]/route.ts`
- Create: `app/api/contacts/[id]/activities/route.ts`
- Create: `app/api/contacts/[id]/payments/route.ts`
- Create: `app/api/contacts/[id]/move/route.ts`
- Create: `app/api/contacts/[id]/licenses/route.ts`
- Create: `app/api/contacts/[id]/invoices/route.ts`
- Create: `app/api/contacts/bulk/route.ts`
- Create: `app/api/contacts/identities/route.ts`
- Create: `app/api/contacts/pipeline/route.ts`
- Create: `app/api/tasks/route.ts`
- Create: `app/api/tasks/[id]/route.ts`
- Create: `app/api/tasks/[id]/items/route.ts`
- Create: `app/api/tasks/[id]/items/[itemId]/route.ts`
- Create: `app/api/expenses/route.ts`
- Create: `app/api/expenses/[id]/route.ts`
- Create: `app/api/expenses/categories/route.ts`
- Create: `app/api/expenses/categories/[id]/route.ts`
- Create: `app/api/dashboard/route.ts`
- Create: `app/api/navigation/route.ts`
- Create: `app/api/profiles/route.ts`
- Create: `app/api/services/route.ts`
- Create: `app/api/services/[id]/route.ts`
- Create: `lib/api/helpers.ts`

**Interfaces:**
- Consumes: `getSession` from Task 2, all domain modules from Tasks 3–4
- Produces: REST endpoints matching every data operation client components need

- [ ] **Step 1: Implement `lib/api/helpers.ts`**

Shared helpers for API routes:
```typescript
export async function requireSession(cookies: ReadonlyRequestCookies): Promise<{ userId: string; email: string; role: string }>
// Calls getSession, throws 401 response if null

export function jsonResponse(data: unknown, status?: number): NextResponse
export function errorResponse(message: string, status?: number): NextResponse
```

- [ ] **Step 2: Implement contacts API routes**

`GET /api/contacts` — calls `listContactsPage` with query params `page`, `pageSize`, `query`, `filter`.
`POST /api/contacts` — calls `createContact(userId, body)`.
`GET /api/contacts/[id]` — calls `getContact(id)`.
`PATCH /api/contacts/[id]` — calls `updateContact(id, body)`.
`POST /api/contacts/[id]/move` — calls `moveContact(userId, contact, stage)`.
`GET /api/contacts/[id]/activities` — calls `listContactActivities` with cursor params.
`POST /api/contacts/[id]/activities` — calls `addActivity`.
`GET /api/contacts/[id]/payments` — calls `listContactPayments` with cursor params.
`POST /api/contacts/[id]/payments` — calls `addPayment`.
`GET /api/contacts/[id]/licenses` — calls `listContactLicenses`.
`GET /api/contacts/[id]/invoices` — calls `listContactInvoiceLedger`.
`POST /api/contacts/bulk` — calls `createContacts`.
`GET /api/contacts/identities` — calls `listContactIdentities`.
`GET /api/contacts/pipeline` — calls `listPipelineContacts`.

- [ ] **Step 3: Implement tasks API routes**

`GET /api/tasks` — `listTasksPage` with query params.
`POST /api/tasks` — `createTask(userId, body)`.
`PATCH /api/tasks/[id]` — `updateTask(id, body)`.
`DELETE /api/tasks/[id]` — `deleteTask(id)`.
`POST /api/tasks/[id]/items` — `addTaskItem`.
`PATCH /api/tasks/[id]/items/[itemId]` — `updateTaskItem`.
`DELETE /api/tasks/[id]/items/[itemId]` — `deleteTaskItem`.

- [ ] **Step 4: Implement expenses API routes**

`GET /api/expenses` — `listExpensesPage`.
`POST /api/expenses` — `createExpense(userId, body)`.
`PATCH /api/expenses/[id]` — `updateExpense(id, body)`.
`DELETE /api/expenses/[id]` — `deleteExpense(id)`.
`GET /api/expenses/categories` — `listExpenseCategories`.
`POST /api/expenses/categories` — `createExpenseCategory`.
`PATCH /api/expenses/categories/[id]` — `updateExpenseCategory`.
`DELETE /api/expenses/categories/[id]` — `deleteExpenseCategory`.

- [ ] **Step 5: Implement dashboard, navigation, profiles, and services API routes**

`GET /api/dashboard` — `getDashboardSummary(userId)`.
`GET /api/navigation` — `getNavigationCounts`.
`GET /api/profiles` — `listProfiles`.
`GET /api/services` — `listServices`. `POST /api/services` — `createService`.
`PATCH /api/services/[id]` — `updateService`. `DELETE /api/services/[id]` — `deleteService`.

- [ ] **Step 6: Commit**

```bash
git add lib/api/helpers.ts app/api/contacts/ app/api/tasks/ app/api/expenses/ app/api/dashboard/ app/api/navigation/ app/api/profiles/ app/api/services/
git commit -m "Add API routes for all domain operations"
```

---

### Task 6: Billing and Licensing API Routes

**Files:**
- Create: `app/api/billing/invoices/route.ts`
- Create: `app/api/billing/invoices/[id]/route.ts`
- Create: `app/api/billing/invoices/[id]/finalize/route.ts`
- Create: `app/api/billing/invoices/[id]/cancel/route.ts`
- Create: `app/api/billing/invoices/[id]/payments/route.ts`
- Create: `app/api/billing/invoices/generate/route.ts`
- Create: `app/api/billing/contracts/route.ts`
- Create: `app/api/billing/contracts/[id]/route.ts`
- Create: `app/api/billing/contracts/[id]/invoice/route.ts`
- Create: `app/api/billing/templates/route.ts`
- Create: `app/api/billing/templates/[id]/route.ts`
- Create: `app/api/billing/settings/route.ts`
- Create: `app/api/billing/payment-records/route.ts`
- Create: `app/api/billing/payment-invoices/route.ts`
- Create: `app/api/licensing/products/route.ts`
- Create: `app/api/licensing/products/[id]/route.ts`
- Create: `app/api/licensing/licenses/route.ts`
- Create: `app/api/licensing/licenses/[id]/route.ts`
- Create: `app/api/licensing/licenses/[id]/activations/[activationId]/route.ts`
- Create: `app/api/licensing/licenses/[id]/reset/route.ts`
- Create: `app/api/licensing/licenses/issue/route.ts`

**Interfaces:**
- Consumes: `requireSession` from Task 5, billing and licensing modules from Task 4
- Produces: REST endpoints for all billing and licensing client operations

- [ ] **Step 1: Implement billing API routes**

Each route calls `requireSession`, then the corresponding billing module function. Invoice mutations (`finalize`, `cancel`, `delete`, `recordPayment`) are POST routes for clarity.

`GET /api/billing/invoices` — `listInvoicesPage(params)`.
`POST /api/billing/invoices` — `createInvoice(body.invoice, body.items)`.
`GET /api/billing/invoices/[id]` — `getInvoice(id)`.
`PATCH /api/billing/invoices/[id]` — `updateInvoice(id, body.invoice, body.items)`.
`DELETE /api/billing/invoices/[id]` — `deleteInvoice(id)`.
`POST /api/billing/invoices/[id]/finalize` — `finalizeInvoice(id)`.
`POST /api/billing/invoices/[id]/cancel` — `cancelInvoice(id)`.
`POST /api/billing/invoices/[id]/payments` — `recordInvoicePayment(body)`.
`POST /api/billing/invoices/generate` — `generateMonthlyInvoices(body.month)`.
`GET /api/billing/contracts` — `listContracts()`.
`POST /api/billing/contracts` — `saveContract(body.contract, body.items)`.
`PATCH /api/billing/contracts/[id]` — `saveContract(body.contract, body.items, id)`.
`POST /api/billing/contracts/[id]/invoice` — `createInvoiceFromContract(id, body.start, body.end)`.
`GET /api/billing/templates` — `listTemplates()`.
`POST /api/billing/templates` — `saveTemplate(body)`.
`PATCH /api/billing/templates/[id]` — `saveTemplate(body, id)`.
`DELETE /api/billing/templates/[id]` — `deleteTemplate(body)`.
`GET /api/billing/settings` — `getAppSettings()`.
`PATCH /api/billing/settings` — `saveAppSettings(userId, body)`.
`GET /api/billing/payment-records` — `listInvoicePaymentRecords()`.
`GET /api/billing/payment-invoices` — `listPaymentInvoices()`.

- [ ] **Step 2: Implement licensing API routes**

`GET /api/licensing/products` — `listLicensedProducts()`.
`POST /api/licensing/products` — `saveLicensedProduct(body)`.
`PATCH /api/licensing/products/[id]` — `saveLicensedProduct(body, id)`.
`GET /api/licensing/licenses` — `listLicenses()`.
`GET /api/licensing/licenses/[id]` — `getLicenseDetails(id)`.
`PATCH /api/licensing/licenses/[id]` — `updateLicense(id, body)`.
`POST /api/licensing/licenses/issue` — `issueLicense(body)`.
`DELETE /api/licensing/licenses/[id]/activations/[activationId]` — `deactivateLicenseActivation(activationId, body.reason)`.
`POST /api/licensing/licenses/[id]/reset` — `resetLicenseActivations(id)`.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/ app/api/licensing/
git commit -m "Add billing and licensing API routes"
```

---

### Task 7: File Storage and License Public API

**Files:**
- Create: `lib/storage/local.ts`
- Create: `app/api/uploads/[...path]/route.ts`
- Create: `app/api/license/v1/licenses/activate/route.ts`
- Create: `app/api/license/v1/licenses/validate/route.ts`
- Create: `app/api/license/v1/licenses/deactivate/route.ts`
- Create: `app/api/license/v1/.well-known/jwks.json/route.ts`
- Create: `lib/auth/license-token.ts`
- Create: `app/api/billing/settings/upload/route.ts`
- Modify: `lib/db/billing.ts` (replace storage stubs)
- Create: `.gitignore` entry for `data/uploads/`
- Test: `lib/storage/local.test.ts`

**Interfaces:**
- Consumes: `rpc` from Task 1, env vars `LICENSE_SIGNING_PRIVATE_JWK`, `LICENSE_SIGNING_PUBLIC_JWK`, `LICENSE_SIGNING_KEY_ID`, `UPLOAD_DIR`, `LICENSE_ALLOWED_ORIGINS`
- Produces: `uploadFile(kind, file) → path`, `getFileUrl(path) → url`, `deleteFile(path)`, license API endpoints with same contract as the Deno edge function

- [ ] **Step 1: Write the failing test for local storage**

```typescript
// lib/storage/local.test.ts
// Tests verify:
// - uploadFile rejects files > 2MB
// - uploadFile rejects non-image MIME types
// - uploadFile returns a path under the kind directory
// - getFileUrl returns /api/uploads/... path
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="storage"`
Expected: FAIL

- [ ] **Step 3: Implement `lib/storage/local.ts`**

`uploadFile(kind: "logo" | "stamp", file: File): Promise<string>` — validates type/size, writes to `${UPLOAD_DIR}/company-assets/${kind}/${uuid}.${ext}`, returns the relative path.
`getFileUrl(path?: string | null): string | null` — returns `/api/uploads/company-assets/${path}` or null.
`deleteFile(path: string): Promise<void>` — removes the file from disk.

- [ ] **Step 4: Implement `app/api/uploads/[...path]/route.ts`**

`GET` handler: calls `getSession` for auth check, resolves the path under `UPLOAD_DIR`, validates it stays within the uploads directory (path traversal protection), reads the file, returns it with the correct `Content-Type` header.

- [ ] **Step 5: Run storage test to verify it passes**

Run: `npm test -- --test-name-pattern="storage"`
Expected: PASS

- [ ] **Step 6: Update `lib/db/billing.ts` storage functions**

Replace the "Not yet migrated" stubs:
- `uploadCompanyAsset(kind, file)` → calls `uploadFile` from `lib/storage/local.ts`
- `signedAssetUrl(path)` → calls `getFileUrl` from `lib/storage/local.ts`

- [ ] **Step 7: Implement `lib/auth/license-token.ts`**

Port `supabase/functions/_shared/license-token.ts` from Deno to Node:
- Replace `Deno.env.get(...)` with `process.env[...]`
- Keep all `crypto.subtle` calls as-is (Node 18+ compatible)
- Export `signLicenseToken`, `verifyLicenseToken`, `publicJwks` with identical signatures

- [ ] **Step 8: Implement license API routes**

Port `supabase/functions/license-api/index.ts` to four Next.js route handlers:

`GET /api/license/v1/.well-known/jwks.json` — returns `publicJwks()`.

`POST /api/license/v1/licenses/activate` — rate limit check via `rpc("license_rate_limit_hit", ...)`, parse body, hash installation_id, call `rpc("license_api_activate", ...)`, return token response. No session auth — these are public API endpoints.

`POST /api/license/v1/licenses/validate` — verify bearer token, rate limit, call `rpc("license_api_validate", ...)`.

`POST /api/license/v1/licenses/deactivate` — verify bearer token, rate limit, call `rpc("license_api_deactivate", ...)`.

Each route handles CORS explicitly using the same `cors()` logic from the Deno function, reading `LICENSE_ALLOWED_ORIGINS`.

- [ ] **Step 9: Create `POST /api/billing/settings/upload` route**

Handles `FormData` with a file field. Calls `requireSession`, validates superadmin role, calls `uploadFile(kind, file)` from `lib/storage/local.ts`, updates `app_settings` with the new path via `saveAppSettings`. Returns `{ path, url }`.

- [ ] **Step 10: Add `.gitignore` entry**

Append `data/uploads/` to `.gitignore`.

- [ ] **Step 11: Commit**

```bash
git add lib/storage/ lib/auth/license-token.ts app/api/uploads/ app/api/license/ app/api/billing/settings/ lib/db/billing.ts .gitignore
git commit -m "Add local file storage and license public API routes"
```

---

### Task 8: Migrate Client Components to API Routes

**Files:**
- Modify: 25 component files (listed below)
- Create: `components/auth/AuthProvider.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: API routes from Tasks 5–7, `getSession` from Task 2
- Produces: All client components fetch data from API routes instead of Supabase browser client

The 25 component files to migrate:
1. `components/contacts/ContactsClient.tsx`
2. `components/contacts/ContactDrawer.tsx`
3. `components/contacts/NewContactModal.tsx`
4. `components/contacts/BulkContactsModal.tsx`
5. `components/pipeline/PipelineClient.tsx`
6. `components/tasks/TasksClient.tsx`
7. `components/tasks/NewTaskModal.tsx`
8. `components/expenses/ExpensesClient.tsx`
9. `components/expenses/EditExpenseModal.tsx`
10. `components/dashboard/DashboardClient.tsx`
11. `components/billing/invoices/InvoicesClient.tsx`
12. `components/billing/invoices/InvoiceDetailsClient.tsx`
13. `components/billing/invoices/InvoiceAdminEditor.tsx`
14. `components/billing/contracts/ContractsClient.tsx`
15. `components/billing/payments/PaymentsClient.tsx`
16. `components/billing/templates/TemplatesClient.tsx`
17. `components/licensing/LicensingClient.tsx`
18. `components/licensing/LicenseDetailDrawer.tsx`
19. `components/licensing/IssueLicenseModal.tsx`
20. `components/licensing/ProductModal.tsx`
21. `components/settings/SettingsClient.tsx`
22. `components/settings/BillingSettings.tsx`
23. `components/layout/AppShell.tsx`
24. `components/layout/Sidebar.tsx`
25. `app/(app)/layout.tsx`

- [ ] **Step 1: Create `components/auth/AuthProvider.tsx`**

A React context that provides `{ user: { id, name, email, role, color } | null }`. The layout fetches the user from `/api/auth/me` server-side and passes it as a prop. The provider makes it available to all client components.

```typescript
"use client";
type AuthUser = { id: string; name: string; email: string; role: AppRole; color: string };
const AuthContext = createContext<{ user: AuthUser | null }>({ user: null });
export function AuthProvider({ user, children }: { user: AuthUser | null; children: ReactNode })
export function useAuth(): { user: AuthUser }
```

- [ ] **Step 2: Modify `app/(app)/layout.tsx`**

Remove Supabase imports. Use `getSession(cookies())` to get the user, query the profile via `getProfile(userId)` from `lib/db/profiles.ts` (server component, direct DB access). Wrap children in `<AuthProvider user={...}>`.

- [ ] **Step 3: Create a fetch helper for client components**

Add to `lib/api/client.ts`:
```typescript
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T>
// Calls fetch(path, { ...options, headers: { "Content-Type": "application/json" } })
// Throws on non-ok responses with the error message from the body
```

- [ ] **Step 4: Migrate contacts components**

For each of `ContactsClient`, `ContactDrawer`, `NewContactModal`, `BulkContactsModal`:
- Remove `import { createClient } from "@/lib/supabase/client"`
- Replace `createClient()` + domain function calls with `apiFetch` calls to the corresponding API routes
- Remove `SupabaseClient` usage entirely

Example pattern:
```typescript
// Before:
const supabase = createClient();
const data = await listContactsPage(supabase, options);

// After:
const data = await apiFetch<PagedResult<Contact>>(`/api/contacts?page=${p}&pageSize=${s}`);
```

For mutations, POST/PATCH/DELETE to the API route with the body.

- [ ] **Step 5: Migrate pipeline component**

`PipelineClient.tsx` — replace `createClient()` + `listPipelineContacts` with `apiFetch("/api/contacts/pipeline?...")`.

- [ ] **Step 6: Migrate tasks components**

`TasksClient.tsx`, `NewTaskModal.tsx` — same pattern.

- [ ] **Step 7: Migrate expenses components**

`ExpensesClient.tsx`, `EditExpenseModal.tsx` — same pattern.

- [ ] **Step 8: Migrate dashboard component**

`DashboardClient.tsx` — replace `createClient()` + `getDashboardSummary` + `listAttentionContacts` + `listMyOpenTasks` with API calls.

- [ ] **Step 9: Migrate billing components**

`InvoicesClient.tsx`, `InvoiceDetailsClient.tsx`, `InvoiceAdminEditor.tsx`, `ContractsClient.tsx`, `PaymentsClient.tsx`, `TemplatesClient.tsx` — same pattern. `signedAssetUrl` calls become `apiFetch("/api/billing/settings")` to get the URLs that are already resolved server-side.

- [ ] **Step 10: Migrate licensing components**

`LicensingClient.tsx`, `LicenseDetailDrawer.tsx`, `IssueLicenseModal.tsx`, `ProductModal.tsx` — same pattern.

- [ ] **Step 11: Migrate settings and layout components**

`SettingsClient.tsx`, `BillingSettings.tsx` — replace Supabase storage upload with a `FormData` POST to a new `POST /api/billing/settings/upload` route.
`AppShell.tsx`, `Sidebar.tsx` — replace `createClient()` + `getNavigationCounts` with `apiFetch("/api/navigation")`.

- [ ] **Step 12: Commit**

```bash
git add components/ app/(app)/layout.tsx lib/api/client.ts
git commit -m "Migrate all client components from Supabase to API routes"
```

---

### Task 9: Cleanup — Remove Supabase Dependencies

**Files:**
- Delete: `lib/supabase/client.ts`
- Delete: `lib/supabase/server.ts`
- Delete: `lib/supabase/config.ts`
- Delete: `lib/db.ts`
- Delete: `lib/billing.ts`
- Delete: `lib/licensing.ts`
- Delete: `lib/customer-billing.ts` (if its logic moved to API routes)
- Delete: `supabase/` directory
- Modify: `package.json` (remove `@supabase/ssr`, `@supabase/supabase-js`)
- Modify: `.env.local.example` (update env vars)
- Modify: `docs/licensing-api.md` (update endpoint URLs)

**Interfaces:**
- Consumes: all previous tasks completed
- Produces: a clean codebase with zero Supabase references

- [ ] **Step 1: Remove Supabase packages**

```bash
npm uninstall @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Delete old files**

Delete `lib/supabase/`, `lib/db.ts`, `lib/billing.ts`, `lib/licensing.ts`, `lib/customer-billing.ts`, and `supabase/` directory.

- [ ] **Step 3: Verify no remaining Supabase imports**

```bash
grep -rn "supabase" --include="*.ts" --include="*.tsx" lib/ components/ app/ middleware.ts
```

Expected: zero matches (except possibly comments or the word appearing in documentation).

- [ ] **Step 4: Update `.env.local.example`**

Remove: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
Add: `DATABASE_URL`, `JWT_SECRET`, `UPLOAD_DIR`, `LICENSE_SIGNING_PRIVATE_JWK`, `LICENSE_SIGNING_PUBLIC_JWK`, `LICENSE_SIGNING_KEY_ID`, `LICENSE_ALLOWED_ORIGINS`

- [ ] **Step 5: Update `docs/licensing-api.md`**

Change endpoint base from the Supabase function URL to `/api/license/v1/...`.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 7: Run lint**

```bash
npm run lint
```

Expected: zero warnings.

- [ ] **Step 8: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Run build**

```bash
npm run build
```

Expected: successful production build.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Remove Supabase dependencies and old data layer"
```
