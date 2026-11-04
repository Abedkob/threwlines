# Deployment on Dokploy

This runbook assumes you already have a Dokploy instance reachable from a browser.

## 1. Create a Postgres service

In Dokploy → your project → **Create → Database → Postgres**.

- Image: `postgres:16-alpine` (or newer)
- Database name: `idevelopit_vault`
- User / password: whatever you like; Dokploy will show you the credentials and the in-cluster hostname (e.g. `idevelopit-vault-db`).
- Volume: enable the data volume (default `/var/lib/postgresql/data`).

Copy the connection string Dokploy prints. It looks like:

```
postgres://vault:<password>@idevelopit-vault-db:5432/idevelopit_vault
```

## 2. Create the application

In Dokploy → **Create → Application → GitHub** (or Docker).

- Source: this repo, branch `claude/website-brand-check-7b2fcb` (rename to `main` before you ship).
- Build type: **Dockerfile**. The repo ships one at the root; Dokploy picks it up automatically.
- Port: `3000`.
- Health check path: `/api/health`.

## 3. Set environment variables

Copy `/.env.production.example` into Dokploy → **Environment**. Fill the placeholders:

- `DATABASE_URL` — the one Postgres printed.
- `JWT_SECRET` — generate once with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
  Keep it stable; rotating logs everyone out.
- `LICENSE_SIGNING_KEY_ID`, `LICENSE_SIGNING_PRIVATE_JWK`, `LICENSE_SIGNING_PUBLIC_JWK` — generate once with:
  ```bash
  node scripts/generate-license-signing-keys.mjs
  ```
  The private JWK stays in Dokploy; never commit it. The public JWK can be reused across environments but using fresh ones for production is cleaner.
- `LICENSE_ALLOWED_ORIGINS` — comma-separated exact origins of apps that will call the licensing API (e.g. `https://your-desktop-app.example.com`). CORS fails closed in production — do not use `*`.
- `LICENSE_TRUSTED_PROXY=true` — Dokploy fronts the app with Traefik, which sets `X-Forwarded-For`.
- `UPLOAD_DIR=/data/uploads` — matches the volume you'll mount in the next step.

## 4. Mount a volume for uploads

Dokploy → the application → **Volumes** → add a bind or named volume at `/data`. Without this, logos and stamps vanish on every redeploy.

## 5. Point your private DNS at Dokploy

In Dokploy → the application → **Domains** → add `vault.yourcompany.internal` (or whatever name you want). Dokploy will:

- Configure Traefik to route that host to the app.
- Issue a Let's Encrypt cert if the DNS record is reachable publicly, OR issue nothing and expect you to supply one for LAN-only DNS.

In your DNS server (ActiveDirectory, Pi-hole, Unbound, router, …) create an **A** record for `vault.yourcompany.internal` → the Dokploy host's IP. Confirm with:

```bash
dig vault.yourcompany.internal
curl -I https://vault.yourcompany.internal/api/health
```

For LAN-only HTTPS: either accept the self-signed cert Traefik generates, or use a split-horizon DNS where the private name resolves publicly for ACME and privately for actual traffic.

## 6. Deploy and bootstrap the database

Click **Deploy** in Dokploy. Watch the build log; when it reports healthy, open the application's **Terminal / Run command** and run:

```bash
node scripts/init-db.mjs
```

That applies `scripts/local-schema.sql` and `scripts/local-seed.sql`. The script is idempotent; running it twice is a no-op.

## 7. Change the seeded admin password

The seed creates `admin@idevelopit.local` with password `vault-dev-2026`. **Do this before anyone else gets the URL.**

There is no change-password screen yet, so this is the only way — run it against the Postgres service once:

```sql
update profiles
set password_hash = crypt('<new-strong-password>', gen_salt('bf', 12))
where email = 'admin@idevelopit.local';
```

(Requires the `pgcrypto` extension, which `local-schema.sql` already enables.)

Repeat for each of the other two team members once you have created them.

## 8. Verify

- `curl https://vault.yourcompany.internal/api/health` → `{"ok":true}`
- Browser: `https://vault.yourcompany.internal/login` → login page
- Sign in → dashboard renders with real data
- `curl https://vault.yourcompany.internal/api/license/v1/.well-known/jwks.json` → 200 with the public key

## 9. Ongoing

- **Deploys**: push to the deployment branch; Dokploy rebuilds the image.
- **Schema changes**: add migration SQL to `scripts/local-schema.sql` or a new `scripts/migrations/<date>.sql`, apply with `node scripts/init-db.mjs` or psql.
- **Backups**: Dokploy's Postgres service has a built-in snapshot/backup panel — enable the schedule. For file uploads, back up the `/data` volume.
- **Logs**: Dokploy's log viewer shows `console.error`s from `handleError`'s internal-error branch and other server-side issues.
- **Updating `LICENSE_ALLOWED_ORIGINS`**: edit the env var in Dokploy and redeploy.

## What's intentionally *not* in this deploy

- **No login rate limiting.** Failed logins are not throttled. For a 3-user internal CRM behind private DNS this is low urgency, but add fail2ban at the proxy layer if the DNS becomes internet-reachable.
- **No single sign-on.** JWT cookie only; expires in 7 days.
- **No horizontal scaling.** `UPLOAD_DIR` is a local filesystem path; running two app containers requires swapping it for shared storage (NFS, S3, etc.).
