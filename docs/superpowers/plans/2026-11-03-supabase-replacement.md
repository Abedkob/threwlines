# Supabase Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move off Supabase onto self-hosted Postgres with our own session auth and the licensing API as an ordinary Next.js route, without changing the public licensing contract or any screen's behaviour.

**Architecture:** Supabase is Postgres, so the schema, the indexes and all 19 protected SQL functions move across essentially unchanged. The work concentrates in four seams: the database client, the identity RLS reads, session auth, and the licensing Edge Function. Because 79 of the 85 Supabase calls live in three files under `lib/`, and components only ever call those files' exported functions, the component tree is not touched.

**Tech Stack:** Postgres 16 in Docker, `postgres.js` driver, Node's built-in `crypto.scrypt` for password hashing, Next.js 15.2 route handlers, `node:test`.

**Spec:** None written separately. The Spec section below is the agreed scope, captured from the 2026-11-03 conversation in which the user chose to replace Supabase, driven by control and lock-in, self-hosted.

---

## Spec

**Intent.** The team does not want its data, auth and server functions tied to one vendor's platform. The replacement must be something they can run, back up and move themselves.

**Goals.**

1. Postgres runs under the team's control, with the existing schema, indexes and protected functions intact.
2. Authorisation is still enforced in the database, independently of application code, as `AGENTS.md` requires — not moved into app-level checks.
3. The public licensing API keeps its exact contract: same paths, same request and response shapes, same signed-token format, same JWKS. External applications already depend on it.
4. Every screen behaves as it does today. The exported signatures of `lib/db.ts`, `lib/billing.ts` and `lib/licensing.ts` do not change, so no component is edited.
5. No Supabase package, key or configuration remains in the repository when the plan completes.

**Non-goals.** Changing the schema, the business logic in the protected functions, or any screen's behaviour or appearance. Adding an ORM. Multi-tenancy, user self-registration, or password reset flows — three known users are provisioned by hand. Changing the Tailwind migration's state.

**Anti-goals.** A licensing API that is "mostly" compatible: a deployed customer application failing to activate is the worst outcome in this plan, and it fails in the field rather than in CI. Authorisation that silently stops being enforced because a connection forgot who it was for — a system that returns all rows instead of none is far more dangerous than one that errors. A half-migration where some queries go through Supabase and some do not.

**Decisions made while planning (the planner's call, not the user's):** `postgres.js` over an ORM, because the business logic already lives in 19 SQL functions and an ORM would be a second abstraction over an abstraction; Node's built-in `scrypt` over `argon2`, to avoid a native dependency in a project whose stated motivation is independence; RLS retained with identity supplied by `SET LOCAL`, rather than moving authorisation into TypeScript; local filesystem for company assets, since there are two call sites and one private bucket.

## Global Constraints

- Postgres **16**. The driver is `postgres.js` (`postgres@^3`), pinned at install.
- No Supabase package may be imported after Task 9. No new hosted-service SDK replaces it.
- **Authorisation stays in the database.** RLS policies remain enabled on every table they cover today. Application code supplies identity; it does not decide access. Any task that cannot express a rule in RLS reports it rather than moving the check into TypeScript.
- **The licensing API's public contract is frozen**: paths `/v1/licenses/activate`, `/v1/licenses/validate`, `/v1/licenses/heartbeat`, `/v1/licenses/deactivate`, `/v1/.well-known/jwks.json` and `/.well-known/jwks.json`; the existing request and response bodies; the existing signed-token payload fields (`iss`, `iat`, `nbf`, `check_after`, `grace_until`, `exp`); and the existing JWKS shape. `docs/licensing-api.md` and `supabase/functions/license-api/index.ts` are the reference.
- The exported function signatures of `lib/db.ts`, `lib/billing.ts` and `lib/licensing.ts` do not change.
- Never commit `.env.local`, private signing keys, password hashes, or plaintext licence keys.
- Money is `numeric` in Postgres. It must not round-trip through a JavaScript `number` anywhere a total is computed or stored.
- Every task ends with `npm run typecheck`, `npm run lint` (zero warnings), `npm test`, and `npm run build` passing before its commit.
- Two-space indentation, semicolons, double quotes. `PascalCase` components and exported types, `camelCase` functions and variables. Tests use `node:test` and `node:assert/strict`, named `lib/<domain>.test.ts`.

## Review Focus

1. **A deployed customer application fails to activate.** The licensing API is the only part of this system with external callers, and a contract drift — a renamed field, a changed status code, a token claim in a different unit — surfaces in the field, not in CI. Task 4 pins the contract with tests written from the current implementation *before* the new one exists.
2. **RLS silently stops being enforced.** If the pool hands back a connection whose `app.user_id` was never set, policies evaluate against an empty identity. The dangerous case is a policy written so that an empty identity matches everything, or a connection that happens to be the table owner and bypasses RLS entirely. Task 2 pins this with a test that an unidentified connection returns **zero** rows, and Task 3 with a test that the table owner is not used at runtime.
3. **Identity leaks between requests.** `SET LOCAL` is transaction-scoped; a query run outside a transaction, or a pooled connection reused after a `SET` that was not `LOCAL`, carries the previous request's user into the next one. Task 2 pins this with a test that runs two interleaved identities over the same pool and asserts neither sees the other's rows.
4. **Invoice totals change by a penny.** `numeric` arriving as a JavaScript `number` loses precision above 2^53 scaled, and more immediately turns `10.10` into `10.1` on the way back. Task 2 pins the driver's numeric handling with a test on a known invoice total; Task 7 pins it again through the billing path.
5. **Session cookies are forgeable or leak.** A session id that is guessable, unsigned, or not `HttpOnly`/`SameSite` gives access to everything, since all three users are superadmin. Task 5 pins the cookie's attributes and that a tampered session id is rejected.

---

## File Structure

**Created:**

- `docker-compose.yml` — Postgres 16, named volume, port bound to localhost only.
- `scripts/00-bootstrap.sql` — role creation and database setup that Supabase did implicitly; runs before the existing numbered scripts.
- `scripts/auth-local.sql` — replaces the `auth.users` coupling: adds `password_hash` and `email` to `profiles`, drops the Supabase trigger, and defines `app_user_id()` reading `current_setting('app.user_id', true)`.
- `lib/db/pool.ts` — the `postgres.js` instance, numeric/date type handling, and connection configuration.
- `lib/db/session.ts` — `withUser(userId, fn)`: opens a transaction, issues `SET LOCAL app.user_id`, runs the callback. The only sanctioned way to reach the database at runtime.
- `lib/auth/password.ts` — `hashPassword`, `verifyPassword` over `node:crypto` `scrypt`.
- `lib/auth/session.ts` — session creation, cookie read/write, and verification.
- `app/api/licenses/[...route]/route.ts` — the licensing API as a Next.js route handler.
- `lib/licensing/token.ts` — the port of `supabase/functions/_shared/license-token.ts`.
- `lib/licensing/contract.test.ts` — the frozen public contract.
- `docs/self-hosting.md` — how to run, back up and restore it.

**Modified:**

- `scripts/*.sql` — 17 `auth.uid()`/`auth.jwt()` references become `app_user_id()`.
- `lib/db.ts` (45 call sites), `lib/billing.ts` (23), `lib/licensing.ts` (11) — bodies rewritten, signatures unchanged.
- `middleware.ts`, `app/(auth)/login/page.tsx`, `components/layout/Sidebar.tsx`, `app/(app)/layout.tsx` — the four auth call sites.
- `package.json` — `postgres` in, three `@supabase/*` out.

**Deleted (Task 9):** `lib/supabase/`, `supabase/`, and the Supabase environment variables.

---

### Task 1: Postgres running locally with the real schema

**Files:**
- Create: `docker-compose.yml`, `scripts/00-bootstrap.sql`, `scripts/auth-local.sql`, `docs/self-hosting.md`
- Test: `lib/db/schema.test.ts`

**Interfaces:**
- Produces: a Postgres 16 instance on `localhost:5432`, database `throughline`, an owner role and a non-owner application role `app_rw`; `DATABASE_URL` in `.env.local.example`; a `profiles` table with `email` and `password_hash` and no dependency on `auth.users`.

- [ ] **Step 1: Write the failing test** — `lib/db/schema.test.ts` connects with `DATABASE_URL` and asserts all 18 tables exist (`activities`, `app_settings`, `client_contracts`, `contacts`, `document_templates`, `expense_categories`, `expenses`, `invoice_balances`, `invoice_payments`, `license_activations`, `license_events`, `license_registry`, `licensed_products`, `payments`, `profiles`, `services`, `task_items`, `tasks`), that `profiles` has `email` and `password_hash` and no foreign key to any `auth` schema, and that `app_rw` is **not** the owner of `profiles`. Function existence is asserted in Task 3, after the identity swap — several protected functions reference `auth.uid()` in their bodies and cannot be created until Task 3 replaces it.

- [ ] **Step 2: Run it to verify it fails** — `node --experimental-strip-types --test lib/db/schema.test.ts`. Expected: connection refused.

- [ ] **Step 3: Write `docker-compose.yml`** — Postgres 16, a named volume, and the port published to `127.0.0.1` only so the database is not exposed to the network.

- [ ] **Step 4: Write `scripts/00-bootstrap.sql`** — create the `app_rw` role with `login` and no `bypassrls`, grant it table and function privileges but not ownership. Ownership matters: a table owner bypasses RLS, which would make Review Focus item 2 unfalsifiable.

- [ ] **Step 5: Write `scripts/auth-local.sql`** — the `auth.users` decoupling, applied immediately after `schema.sql`: drop the `after insert on auth.users` trigger and the `profiles.id` foreign key to `auth.users`, leaving `profiles.id` a plain `uuid primary key default gen_random_uuid()`, and add `email text unique not null` and `password_hash text not null`. Without this the schema cannot be created at all, since the `auth` schema does not exist outside Supabase.

- [ ] **Step 6: Apply the scripts in order** — `00-bootstrap.sql`, `schema.sql`, `auth-local.sql`, `performance.sql`, `roles-and-expense-editing.sql`, `billing-foundation.sql`, `billing-functions.sql`, `licensing-foundation.sql`. Statements that fail on `auth.uid()` are expected and belong to Task 3: record each one in the report, with the file and the statement, so Task 3 has the list. Do not edit those scripts here.

- [ ] **Step 7: Document the run, backup and restore commands** in `docs/self-hosting.md`, including `pg_dump` and the restore path.

- [ ] **Step 8: Run the test to verify it passes, then the four gates, then commit.**

```bash
git add docker-compose.yml scripts/00-bootstrap.sql scripts/auth-local.sql docs/self-hosting.md lib/db/schema.test.ts .env.local.example
git commit -m "Run Postgres 16 locally with the existing schema"
```

### Task 2: The database client and the identity seam

**Files:**
- Create: `lib/db/pool.ts`, `lib/db/session.ts`, `scripts/app-identity.sql`
- Test: `lib/db/session.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 1.
- Produces:
  - `sql` — the `postgres.js` instance, from `lib/db/pool.ts`
  - `withUser<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T>` — from `lib/db/session.ts`
  - `app_user_id()` — a SQL function returning `current_setting('app.user_id', true)::uuid`

- [ ] **Step 1: Write the failing tests** — four, each pinning a Review Focus item:

```ts
test("a connection with no identity sees no rows", async () => {
  const rows = await sql`select id from contacts`;
  assert.equal(rows.length, 0);
});

test("withUser scopes identity to its transaction", async () => {
  const seen = await withUser(USER_A, (tx) => tx`select app_user_id() as id`);
  assert.equal(seen[0].id, USER_A);
  const after = await sql`select app_user_id() as id`;
  assert.equal(after[0].id, null);
});

test("two identities over one pool do not leak", async () => {
  const [a, b] = await Promise.all([
    withUser(USER_A, (tx) => tx`select app_user_id() as id`),
    withUser(USER_B, (tx) => tx`select app_user_id() as id`),
  ]);
  assert.equal(a[0].id, USER_A);
  assert.equal(b[0].id, USER_B);
});

test("numeric money survives the round trip", async () => {
  const [row] = await sql`select 10.10::numeric as amount`;
  assert.equal(row.amount, "10.10");
});
```

- [ ] **Step 2: Run them to verify they fail** — expected: module not found.

- [ ] **Step 3: Write `scripts/app-identity.sql`** — define `app_user_id()` as `stable` returning `current_setting('app.user_id', true)::uuid`, returning `null` rather than erroring when the setting is absent, which is what makes the no-identity-sees-no-rows test meaningful.

- [ ] **Step 4: Implement `lib/db/pool.ts`** — connect as `app_rw`, never the owner. Configure `postgres.js` to return `numeric` as a string, so money never becomes a JavaScript `number`.

- [ ] **Step 5: Implement `withUser` in `lib/db/session.ts`** — a transaction that issues `set_config('app.user_id', $1, true)` as its first statement. The `true` is the local flag and is what makes identity transaction-scoped; without it the setting outlives the request on a pooled connection.

- [ ] **Step 6: Run the tests to verify they pass, then the four gates, then commit.**

```bash
git add lib/db/pool.ts lib/db/session.ts lib/db/session.test.ts scripts/app-identity.sql
git commit -m "Add the database client and transaction-scoped identity"
```

### Task 3: Move RLS off Supabase's identity helpers

**Files:**
- Modify: `scripts/schema.sql`, `scripts/billing-foundation.sql`, `scripts/billing-functions.sql`, `scripts/licensing-foundation.sql`, `scripts/performance.sql`, `scripts/roles-and-expense-editing.sql`
- Create: `scripts/rls-verification.sql`
- Test: `lib/db/rls.test.ts`

**Interfaces:**
- Consumes: `withUser`, `app_user_id()` from Task 2.

- [ ] **Step 1: Write the failing test** — for each table carrying RLS today, assert that a member identity sees its permitted rows and that a second member cannot read or write rows the policy forbids; and assert specifically that the superadmin-only expense edit path rejects a `member` identity. Include one test asserting **zero** `auth.uid()` or `auth.jwt()` occurrences remain under `scripts/`.

- [ ] **Step 2: Run it to verify it fails** — expected: 17 occurrences found.

- [ ] **Step 3: Replace each `auth.uid()` with `app_user_id()` and each `auth.jwt()` claim read with the equivalent lookup against `profiles`** — 17 references across the six files. The `app_role` column already exists from `roles-and-expense-editing.sql`, so role checks read it rather than a JWT claim.

- [ ] **Step 4: Write `scripts/rls-verification.sql`** as a read-only check listing every table with RLS enabled and its policy count, in the style of the existing `*-verification.sql` files.

- [ ] **Step 5: Run the tests to verify they pass, then the four gates, then commit.**

```bash
git add scripts/ lib/db/rls.test.ts
git commit -m "Move RLS identity from Supabase auth helpers to app_user_id()"
```

### Task 4: The licensing API, contract first

Done early and deliberately: this is the only externally visible surface, and a mistake here fails in a customer's deployment rather than in CI.

**Files:**
- Create: `lib/licensing/token.ts`, `lib/licensing/contract.test.ts`, `app/api/licenses/[...route]/route.ts`
- Reference (do not modify): `supabase/functions/license-api/index.ts`, `supabase/functions/_shared/license-token.ts`, `docs/licensing-api.md`

**Interfaces:**
- Consumes: `withUser`, `sql` from Task 2.
- Produces: `signLicenseToken`, `verifyLicenseToken`, `publicJwks` from `lib/licensing/token.ts`, with the same signatures the Deno module exports today.

- [ ] **Step 1: Write the contract tests first, read from the existing implementation** — one test per endpoint, asserting the exact response body shape and status code for a success and for each error the current code can return (`TOKEN_INVALID` among them), plus a test that `publicJwks()` returns the same JWKS shape, and a test that a token signed by the new code verifies against the old module's `verifyLicenseToken`. Write these from `index.ts` and `docs/licensing-api.md`; do not infer the contract from what feels reasonable.

- [ ] **Step 2: Run them to verify they fail** — expected: route not found.

- [ ] **Step 3: Port `_shared/license-token.ts` to `lib/licensing/token.ts`** — same payload fields (`iss`, `iat`, `nbf`, `check_after`, `grace_until`, `exp`), same algorithm, same key material loaded from the environment. Deno's `crypto` calls become Node's.

- [ ] **Step 4: Implement the route handler** — the five paths, dispatched as the Deno version dispatches them, including the bare `/.well-known/jwks.json` alias.

- [ ] **Step 5: Run the contract tests to verify they pass, then the four gates, then commit.**

```bash
git add lib/licensing/ app/api/licenses/
git commit -m "Port the licensing API to a Next.js route with its contract pinned"
```

### Task 5: Session auth

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/session.ts`
- Modify: `middleware.ts`, `app/(auth)/login/page.tsx`, `components/layout/Sidebar.tsx`, `app/(app)/layout.tsx`
- Test: `lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `withUser`, `sql` from Task 2; `profiles.email` and `profiles.password_hash` from Task 1's `auth-local.sql`.
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `createSession(userId: string): Promise<string>`, `readSession(): Promise<{ userId: string; role: string } | null>`, `destroySession(): Promise<void>`
  - `verifySessionId(id: string): Promise<{ userId: string } | null>` and `sessionCookieOptions(opts: { production: boolean }): { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string }`, both used by the tests below
  - a `sessions` table, added by `scripts/sessions.sql`
  - a `scripts/create-user.ts` utility, since there is no self-registration

- [ ] **Step 1: Write the failing tests**

```ts
test("a tampered session id is rejected", async () => {
  const id = await createSession(USER_A);
  assert.equal(await verifySessionId(id.slice(0, -1) + "x"), null);
});

test("the session cookie is HttpOnly, SameSite=Lax and Secure in production", () => {
  const c = sessionCookieOptions({ production: true });
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, "lax");
  assert.equal(c.secure, true);
});

test("verifyPassword rejects a wrong password and accepts the right one", async () => {
  const hash = await hashPassword("correct horse");
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong horse", hash), false);
});
```

- [ ] **Step 2: Run them to verify they fail.**

- [ ] **Step 3: Implement `lib/auth/password.ts`** over `node:crypto` `scrypt`, with a per-password random salt and `timingSafeEqual` for comparison.

- [ ] **Step 4: Implement `lib/auth/session.ts`** — a session id from `crypto.randomBytes(32)`, stored hashed in a `sessions` table with an expiry, read back through the cookie.

- [ ] **Step 5: Replace the four call sites** — `signInWithPassword` in the login page, `signOut` in `Sidebar`, `getClaims` in `middleware.ts`, and the session read in `app/(app)/layout.tsx`. Behaviour the user sees does not change, including the "add the Supabase URL" notice, which becomes a "database not configured" notice.

- [ ] **Step 6: Write `scripts/create-user.ts`** to provision the three accounts.

- [ ] **Step 7: Run the tests to verify they pass, then the four gates, then commit.**

```bash
git add lib/auth/ middleware.ts app components scripts/create-user.ts
git commit -m "Replace Supabase Auth with session cookies and scrypt"
```

### Task 6: Port `lib/db.ts`

The largest single file, 45 call sites, and the one every screen depends on.

**Files:**
- Modify: `lib/db.ts`
- Test: `lib/db.test.ts`

**Interfaces:**
- Consumes: `withUser`, `sql` from Task 2.
- Produces: the same exported functions with the same signatures, including `getCurrentUserId` and `getCurrentUserRole`, which now read the session rather than Supabase claims.

- [ ] **Step 1: Write the failing tests** — for each exported function that reads or writes, one test asserting the shape it returns today, against seeded data. Include the dashboard and navigation-count paths, which call protected functions rather than tables.

- [ ] **Step 2: Run them to verify they fail.**

- [ ] **Step 3: Rewrite each `.from(...)` chain as SQL and each `.rpc(name, args)` as `select * from name(...)`**, all inside `withUser`. The 19 function names are unchanged, so the SQL is a direct translation.

- [ ] **Step 4: Run the tests to verify they pass, then the four gates, then commit.**

### Task 7: Port `lib/billing.ts` and company-asset storage

**Files:**
- Modify: `lib/billing.ts`
- Create: `lib/storage/assets.ts`
- Test: extend `lib/billing-validation.test.ts`

**Interfaces:**
- Consumes: `withUser` from Task 2.
- Produces: `storeAsset(path: string, file: Buffer): Promise<void>`, `signedAssetUrl(path: string, ttlSeconds: number): Promise<string>` — replacing the two `storage.from("company-assets")` calls with the same behaviour and the same 3,600-second expiry.

- [ ] **Step 1: Write the failing tests** — the 23 billing call sites' behaviour, plus: an uploaded asset is readable through a signed URL, an expired signature is rejected, and a path outside the asset root is rejected. Include a test that an invoice total with two decimal places survives create, finalize and payment unchanged as a string.

- [ ] **Step 2: Run them to verify they fail.**

- [ ] **Step 3: Implement the storage module** — files under a configured root, URLs signed with an HMAC over path and expiry. Assets stay private: the route verifies the signature before serving.

- [ ] **Step 4: Rewrite the 23 call sites.**

- [ ] **Step 5: Run the tests to verify they pass, then the four gates, then commit.**

### Task 8: Port `lib/licensing.ts`

**Files:**
- Modify: `lib/licensing.ts`
- Test: extend `lib/licensing-validation.test.ts`

**Interfaces:**
- Consumes: `withUser` from Task 2; `signLicenseToken` from Task 4.

- [ ] **Step 1: Write the failing tests** — the 11 call sites' behaviour, and specifically that issuing a licence returns the full key exactly once while persisting only its digest, prefix and last four characters.

- [ ] **Step 2: Run them to verify they fail.**

- [ ] **Step 3: Rewrite the 11 call sites.**

- [ ] **Step 4: Run the tests to verify they pass, then the four gates, then commit.**

### Task 9: Decommission Supabase

**Files:**
- Delete: `lib/supabase/`, `supabase/`
- Modify: `package.json`, `README.md`, `AGENTS.md`, `.env.local.example`, `docs/licensing-api.md`
- Test: extend `lib/db/schema.test.ts`

- [ ] **Step 1: Write the failing test** — assert no file under `app/`, `components/`, `lib/` or `scripts/` contains the string `supabase` (case-insensitive), and that `package.json` has no `@supabase/*` dependency.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Delete `lib/supabase/` and `supabase/`, and remove the three `@supabase/*` packages.**

- [ ] **Step 4: Update the docs** — `README.md`'s setup section, the Security paragraph in `AGENTS.md` that names service-role keys and Edge Functions, `.env.local.example`, and `docs/licensing-api.md`'s deployment instructions, which now describe a Next.js route rather than `supabase functions deploy`.

- [ ] **Step 5: Run the test to verify it passes, then the four gates, then commit.**

```bash
git add -A
git commit -m "Remove Supabase"
```

---

## Open question for the user, to answer before Task 4

The licensing signing keys currently live in Supabase's secret store. Where should they live once it is gone — environment variables on the host, a file with restricted permissions, or something else? Task 4 needs the answer, and the existing public keys must keep working, because deployed applications have already fetched them through JWKS.
