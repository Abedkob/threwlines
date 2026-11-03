# Migration: Supabase → Local PostgreSQL

**Date:** 2026-11-03
**Status:** Draft — awaiting approval before implementation

## Intent

Move the idevelopit-vault backend off hosted Supabase and onto a fully local stack: PostgreSQL for the database, custom JWT auth, local filesystem for file uploads, and Next.js API routes for the license API. The app keeps its existing UI, domain logic, and SQL functions — only the infrastructure layer changes.

**Why now:** Full control over the stack, no hosted dependency, zero ongoing cost, and the ability to run the entire system offline or on any server.

## Goals

1. **Zero UI changes** — every page, component, and CSS file stays untouched.
2. **Keep all SQL functions** — the ~25 PL/pgSQL RPCs are battle-tested; adapt them to work without `auth.uid()` but don't rewrite their logic.
3. **Same auth flow** — email/password login, JWT sessions in cookies, middleware-based route protection.
4. **Same file upload UX** — logo/stamp upload in settings, signed/served in invoice previews.
5. **License API parity** — the public API endpoints (activate, validate, deactivate, JWKS) keep their contracts.

## Non-goals

- Migrating existing production data (that's a separate runbook).
- Adding new auth providers (OAuth, magic link, etc.).
- Changing the database schema beyond what's needed to remove Supabase dependencies.
- Building a user registration flow (the app is invite-only; users are seeded).

## Anti-goals (what would make this a failure)

- Losing any business logic from the SQL functions.
- Breaking the license API contract (external apps depend on it).
- Introducing an ORM or heavy abstraction that obscures the SQL.
- Ending up with two auth systems running side by side.

---

## Architecture

### 1. Database — Local PostgreSQL via `pg`

**What changes:**
- Replace `@supabase/supabase-js` query builder with the `pg` package (node-postgres).
- All queries become parameterized SQL strings.
- A connection pool (`Pool`) is created once and shared across server components and API routes.

**Schema adaptations:**
- Remove all `references auth.users(id)` — the `profiles` table becomes the user table with its own `id` (uuid), `email`, `password_hash`, and keeps existing columns.
- Remove the `handle_new_user()` trigger on `auth.users` — user creation is manual/seeded.
- Remove all RLS policies and `enable row level security` — auth is enforced at the application layer (middleware + API routes), not at the database level.
- Remove `auth.uid()` calls from all SQL functions — pass the user ID as an explicit parameter (`p_actor_id uuid`).
- Remove `storage.buckets` and `storage.objects` references — file storage moves to the filesystem.
- Keep all enums, tables, views, triggers, indexes, and check constraints as-is.
- The `is_superadmin()` function changes from reading `auth.uid()` to accepting a `p_user_id uuid` parameter.

**New file structure:**
```
lib/
  db/
    pool.ts          — pg Pool singleton, reads DATABASE_URL from env
    query.ts         — helper: query(sql, params) → rows, queryOne, queryCount
    contacts.ts      — replaces supabase.from("contacts") calls
    billing.ts       — replaces supabase.from("invoices") + .rpc("create_invoice") calls
    licensing.ts     — replaces supabase.from("licenses") + .rpc("issue_license") calls
    tasks.ts         — replaces supabase.from("tasks") calls
    expenses.ts      — replaces supabase.from("expenses") calls
    settings.ts      — replaces supabase.from("app_settings") calls
    profiles.ts      — replaces supabase.from("profiles") calls
```

Each domain module exports the same function signatures as the current `lib/db.ts`, `lib/billing.ts`, and `lib/licensing.ts` — but internally runs SQL instead of the Supabase client. Components import from the new modules with identical call shapes, minimizing churn.

**RPC migration pattern:**
```typescript
// Before (Supabase):
const { data, error } = await supabase.rpc("create_invoice", { p_invoice: invoice, p_items: items });

// After (pg):
const { rows } = await query(
  "SELECT public.create_invoice($1::jsonb, $2::jsonb, $3::uuid) AS id",
  [JSON.stringify(invoice), JSON.stringify(items), userId]
);
```

The SQL functions themselves stay in `.sql` files and are applied via `psql` or a migration runner.

### 2. Authentication — Custom JWT

**Stack:** `bcryptjs` for password hashing, `jose` for JWT signing/verification.

**New files:**
```
lib/auth/
  password.ts     — hashPassword(), verifyPassword() using bcryptjs
  token.ts        — signSessionToken(), verifySessionToken() using jose + HS256
  session.ts      — getSession(cookies) → { userId, email, role } | null
  constants.ts    — JWT_SECRET (from env), TOKEN_EXPIRY, COOKIE_NAME
```

**How it works:**
1. **Login** (`POST /api/auth/login`): validate email + password against `profiles.password_hash`, sign a JWT with `{ sub: id, email, role }`, set it as an `httpOnly` cookie.
2. **Middleware** (`middleware.ts`): read the JWT cookie, verify it, set `x-idv-auth-user` and `x-idv-auth-email` headers (same as now). Redirect unauthenticated users to `/login`.
3. **Server components**: call `getSession(cookies())` to get the current user. No Supabase client needed.
4. **Client components**: no longer need the Supabase browser client. Auth state comes from a React context that reads from a `/api/auth/me` endpoint or from the server-rendered layout.
5. **Logout** (`POST /api/auth/logout`): clear the cookie.

**profiles table changes:**
```sql
ALTER TABLE profiles
  DROP CONSTRAINT profiles_pkey CASCADE,
  ADD COLUMN email text NOT NULL UNIQUE,
  ADD COLUMN password_hash text NOT NULL,
  ADD COLUMN app_role text NOT NULL DEFAULT 'member',
  ADD PRIMARY KEY (id);
-- id is now a self-generated uuid, not a reference to auth.users
```

**SQL function adaptation example:**
```sql
-- Before:
CREATE FUNCTION is_superadmin() ...
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND app_role = 'superadmin') $$;

-- After:
CREATE FUNCTION is_superadmin(p_user_id uuid) ...
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND app_role = 'superadmin') $$;
```

Every function that called `auth.uid()` gets a `p_actor_id uuid` parameter instead. The application layer always passes it from the verified session.

### 3. File Storage — Local Filesystem

**Directory:** `data/uploads/company-assets/` (gitignored).

**New files:**
```
lib/storage/
  local.ts        — uploadFile(kind, file) → path, getFileUrl(path) → url, deleteFile(path)
app/api/uploads/[...path]/route.ts  — serves files from data/uploads/ with auth check
```

**How it works:**
- `uploadFile("logo", file)` saves to `data/uploads/company-assets/logo/<uuid>.png` and returns the relative path.
- `getFileUrl(path)` returns `/api/uploads/company-assets/logo/<uuid>.png`.
- The API route checks the session cookie before serving the file (same auth as the rest of the app).
- No signed URLs needed — the auth check on the API route is sufficient for an internal tool.

**What changes in components:**
- `uploadCompanyAsset()` in `lib/billing.ts` → calls `lib/storage/local.ts` instead of `supabase.storage`.
- `signedAssetUrl()` → becomes `getFileUrl()`, returns a plain path.
- Invoice preview and settings just use `<img src={url}>` as before.

### 4. License API — Next.js API Routes

The Deno edge function at `supabase/functions/license-api/` becomes Next.js route handlers.

**New files:**
```
app/api/license/v1/licenses/activate/route.ts
app/api/license/v1/licenses/validate/route.ts
app/api/license/v1/licenses/deactivate/route.ts
app/api/license/v1/.well-known/jwks.json/route.ts
```

**What changes:**
- `Deno.serve` → Next.js `POST`/`GET` handler exports.
- `Deno.env.get()` → `process.env`.
- The Supabase service-role client → the same `pg` pool, calling functions directly.
- `supabase/functions/_shared/license-token.ts` moves to `lib/auth/license-token.ts` (already pure JS/crypto, no Deno-specific APIs besides `crypto.subtle` which Node 18+ has).
- CORS handling moves to Next.js middleware or the route handlers.
- Rate limiting stays in PostgreSQL (the `license_rate_limit_hit` function is unchanged).

**API contract is preserved:** same paths (just hosted under `/api/license/` instead of the Supabase function URL), same request/response shapes, same JWT token format.

### 5. Client-Side Changes

**Remove entirely:**
- `@supabase/ssr` and `@supabase/supabase-js` packages.
- `lib/supabase/` directory (client.ts, server.ts, config.ts).
- Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).

**Replace with:**
- A lightweight auth context (`components/auth/AuthProvider.tsx`) that provides `{ user, role }` to client components.
- Client components that currently call `createClient()` → instead call server actions or API routes.

**Component migration pattern:**
```typescript
// Before (client component):
const supabase = createClient();
const { data } = await supabase.from("contacts").select("*");

// After (server action or API route):
// The component calls a server action that uses the pg pool directly.
// Or: the data is fetched in a server component and passed as props.
```

Most data fetching already happens in `*Client.tsx` components that run client-side. These will call new API routes (`/api/contacts`, `/api/tasks`, etc.) or server actions instead of the Supabase client.

### 6. Environment Variables

**Remove:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Add:**
```
DATABASE_URL=postgresql://user:password@localhost:5432/idevelopit_vault
JWT_SECRET=<random-64-char-hex>
UPLOAD_DIR=./data/uploads
LICENSE_SIGNING_PRIVATE_KEY=<existing JWK>
LICENSE_SIGNING_PUBLIC_KEY=<existing JWK>
```

---

## Migration Order

The work breaks into 6 phases. Each phase produces a working (or at least buildable) state.

### Phase 1: Database layer (foundation)
1. Install `pg` and `@types/pg`.
2. Create `lib/db/pool.ts` with connection pool.
3. Create `lib/db/query.ts` helpers.
4. Write the adapted schema SQL (remove `auth.users` references, add `email`/`password_hash` to profiles, remove RLS).
5. Adapt all SQL functions: replace `auth.uid()` with `p_actor_id` parameter.
6. Create a `scripts/local-schema.sql` that combines all foundations into one runnable file.
7. Add a seed script that creates a default admin user.

### Phase 2: Auth system
1. Create `lib/auth/` (password, token, session).
2. Create `POST /api/auth/login` and `POST /api/auth/logout` routes.
3. Create `GET /api/auth/me` route.
4. Rewrite `middleware.ts` to verify JWT instead of using Supabase.
5. Update the login page to POST to the new endpoint.
6. Create `AuthProvider` context for client components.

### Phase 3: Domain data modules
1. Rewrite `lib/db.ts` → `lib/db/contacts.ts`, `lib/db/tasks.ts`, `lib/db/expenses.ts`, `lib/db/profiles.ts`.
2. Rewrite `lib/billing.ts` → `lib/db/billing.ts`.
3. Rewrite `lib/licensing.ts` → `lib/db/licensing.ts`.
4. Each module exports identical function signatures, just backed by `pg` instead of Supabase.

### Phase 4: API routes for client components
1. Create API routes for each domain: `/api/contacts`, `/api/tasks`, `/api/billing`, etc.
2. Update all `*Client.tsx` components to call these routes instead of using the Supabase browser client.
3. Or: convert data fetching to server actions where it makes sense.

### Phase 5: File storage + License API
1. Create `lib/storage/local.ts`.
2. Create `app/api/uploads/` route.
3. Update `uploadCompanyAsset` and `signedAssetUrl`.
4. Convert the Deno edge function to Next.js API routes.
5. Move `license-token.ts` to `lib/auth/`.

### Phase 6: Cleanup
1. Remove `@supabase/ssr`, `@supabase/supabase-js` from package.json.
2. Delete `lib/supabase/`, `supabase/` directories.
3. Update `.env.local.example`.
4. Update `docs/licensing-api.md` with new endpoint URLs.
5. Run typecheck, lint, tests, build.

---

## Constraints

- **PostgreSQL 14+** required (for `security_invoker` views).
- **Node 18+** required (for `crypto.subtle` in license token signing).
- The local Postgres must have the `pgcrypto` extension (used for `gen_random_uuid()`, `digest()`, `gen_random_bytes()`).
- The `query-cache.ts` browser-side cache is retained as-is — it caches API responses the same way it cached Supabase responses.

## Risks

- **Volume:** ~36 files import from Supabase. Each needs updating. Typos in SQL string queries won't be caught at compile time (unlike the Supabase query builder).
- **`auth.uid()` in SQL:** Every security-definer function calls it. Missing one means a runtime error, not a build error. Mitigation: a verification SQL script that greps for `auth.uid` in all function bodies.
- **License API CORS:** The edge function had Supabase-managed CORS. The Next.js routes need explicit CORS headers for external app clients.

## Open decisions (builder's call)

- Whether to use a migration tool (like `node-pg-migrate`) or just raw `.sql` files applied with `psql`. **Builder's call: raw SQL files, consistent with the existing `scripts/` approach.**
- Whether client components fetch via API routes or server actions. **Builder's call: API routes for mutations (cleaner error handling), server components with direct `pg` queries for reads where possible, API routes where client-side fetching is needed (paginated lists, search).**
