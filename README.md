# Nosterys Vault

Internal CRM, work tracker, billing console, and licensing issuer for a small team. Runs against a local PostgreSQL database with its own JWT auth — no external services required at runtime.

## Local setup

1. Install PostgreSQL 14 or newer and ensure the `pgcrypto` and `pg_trgm` extensions are available.
2. Create a database (any name works; the examples below use `nosterys_vault`):

   ```bash
   createdb nosterys_vault
   ```

3. Apply the consolidated schema and the seed data:

   ```bash
   psql -d nosterys_vault -f scripts/local-schema.sql
   psql -d nosterys_vault -f scripts/local-seed.sql
   ```

   `local-schema.sql` consolidates every migration the project needs: core tables, performance indexes, roles, billing, and licensing. `local-seed.sql` creates the initial superadmin profile — change the password hash before shipping to real users.

4. Copy `.env.local.example` to `.env.local` and fill in the values:

   - `DATABASE_URL` — your `postgres://user:password@host:port/dbname`
   - `JWT_SECRET` — a long random secret used to sign session cookies
   - `UPLOAD_DIR` — optional; defaults to `./data/uploads` for local file storage
   - Licensing variables — generate with `node scripts/generate-license-signing-keys.mjs`

5. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

   The app runs at <http://localhost:3000>. Sign in with the seeded superadmin.

## Validation commands

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Billing

The billing tables live in `scripts/local-schema.sql`. Invoice numbering, server-calculated totals, snapshots, payments, status refresh, and monthly generation are implemented as protected SQL functions and reached through Next.js API routes.

The app assigns invoice numbers only when a draft is actually saved. Finalizing freezes company, customer, and template data. Printing uses the browser's Print / Save PDF flow with A4 print CSS; enable "Background graphics" for exact template colors. Company images accept PNG, JPEG, or WebP up to 2 MB and are stored under `UPLOAD_DIR`.

## Licensing

The licensing foundation links every entitlement to a CRM contact and optionally to its originating invoice or contract. Full license keys are returned once when issued; only their digest, prefix, and last four characters are stored. Mutations run through protected database functions.

Generate asymmetric signing keys with `node scripts/generate-license-signing-keys.mjs`, set the printed values in `.env.local`, and follow [the licensing API runbook](docs/licensing-api.md). The public API supports activation, validation, deactivation, rate limiting, signed offline grace tokens, and a JWKS endpoint for external applications.

## Authentication

Sessions are signed JWTs stored in an `httpOnly`, `sameSite: lax`, `secure`-in-production cookie. The `middleware.ts` layer redirects unauthenticated traffic to `/login` and injects `x-nosterys-auth-user` / `x-nosterys-auth-email` request headers on authenticated routes. The `/api/auth/login` and `/api/auth/logout` endpoints plus the public licensing API (`/api/license/v1/*`) are the only paths exempted from the session check.

Everyone with superadmin credentials has unrestricted access; expense edit controls and admin billing endpoints enforce this role server-side. Browser code never ships a privileged database credential.
