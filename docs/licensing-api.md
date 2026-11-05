# Nosterys Vault Licensing API

The licensing API is served by the Next.js route handlers under `/api/license/v1/`, backed by the local PostgreSQL database. Its database credential and signing private key remain server-side.

## Deploy

1. Apply `scripts/local-schema.sql` to the database named by `DATABASE_URL`. It includes the licensing tables.
2. Run `node scripts/generate-license-signing-keys.mjs` locally. Do not commit the generated private JWK.
3. Set the printed values, plus `LICENSE_ALLOWED_ORIGINS`, in the server environment (for example `.env.local`):

   ```bash
   LICENSE_SIGNING_KEY_ID=threwlines-license-1
   LICENSE_SIGNING_PRIVATE_JWK='<private JWK JSON>'
   LICENSE_SIGNING_PUBLIC_JWK='<public JWK JSON>'
   LICENSE_ALLOWED_ORIGINS=https://your-app.example
   ```

   `LICENSE_ALLOWED_ORIGINS` is a comma-separated allow-list. Browsers calling from an unlisted origin receive no CORS header and the request is blocked. Use `*` only in development.

4. Start the app (`npm run build && npm start`).
5. Run `scripts/licensing-verification.sql` and make one test activation.

Never place the database credential, `JWT_SECRET`, or the private signing JWK in `NEXT_PUBLIC_*` variables.

## Machine-readable spec

An OpenAPI 3.1 description of this API ships with the app:

```
https://<your-host>/licensing-openapi.json
```

A rendered reference is served alongside it:

```
https://<your-host>/licensing-docs.html
```

Import the JSON into Postman, Insomnia or Bruno, or generate a client from it. It is
also in the repository at `public/licensing-openapi.json`, and a test suite
checks it against the real routes, the server's error codes and the licence-key
pattern, so it cannot drift from the implementation.

## Base URL

```text
https://YOUR_HOST/api/license/v1
```

All POST bodies are JSON. Save the `activation_token` returned by activation and send it as `Authorization: Bearer TOKEN` for later calls. Generate and persist an installation UUID when the application first runs; do not use raw hardware identifiers.

## Activate

`POST /licenses/activate`

```json
{
  "license_key": "TL-DESKTOP-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
  "product_code": "desktop-suite",
  "installation_id": "local-installation-uuid",
  "device_label": "Reception PC",
  "platform": "windows",
  "application_version": "1.0.0"
}
```

## Validate

`POST /licenses/validate`

```json
{
  "installation_id": "local-installation-uuid",
  "application_version": "1.0.1"
}
```

The response rotates the activation token and returns `check_after` plus `offline_grace_until`. Applications should validate near `check_after`; they may continue offline only until the signed grace deadline.

## Deactivate

`POST /licenses/deactivate`

```json
{ "installation_id": "local-installation-uuid" }
```

Delete the local token only after the API confirms `ACTIVATION_DEACTIVATED`.

## Offline verification

Fetch `GET .well-known/jwks.json` (relative to the base URL above, i.e. `/api/license/v1/.well-known/jwks.json`), cache the ES256 public key by `kid`, and verify the token signature, issuer, audience, activation ID, and expiration locally. A client must never contain the private signing key.

## Stable errors

Clients should branch on `code`, not the human-readable `message`. Supported lifecycle codes include `LICENSE_INVALID`, `LICENSE_EXPIRED`, `LICENSE_SUSPENDED`, `LICENSE_REVOKED`, `PRODUCT_MISMATCH`, `ACTIVATION_LIMIT_REACHED`, `INSTALLATION_NOT_FOUND`, `TOKEN_INVALID`, and `RATE_LIMITED`.
