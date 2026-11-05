import { importJWK, SignJWT, jwtVerify, type JWTPayload } from "jose";

const ISSUER = "nosterys";
// Tokens issued before the rename carry "threwlines" and are still installed on
// customer machines. Verification accepts both so the rebrand does not force
// every client to re-activate; signing only ever uses ISSUER, so the old value
// drains away as tokens refresh at check_after.
const ACCEPTED_ISSUERS = ["nosterys", "threwlines"];
const ALG = "ES256";

export type LicenseTokenClaims = JWTPayload & {
  aid: string;
  tv: number;
  entitlements: Record<string, unknown>;
  check_after: number;
  grace_until: number;
  // iss, aud, sub, iat, nbf, exp, jti come from JWTPayload itself.
};

function getKeyId() {
  return process.env.LICENSE_SIGNING_KEY_ID ?? "threwlines-license-1";
}

async function privateKey() {
  const raw = process.env.LICENSE_SIGNING_PRIVATE_JWK;
  if (!raw) throw new Error("LICENSE_SIGNING_PRIVATE_JWK is not configured");
  const jwk = JSON.parse(raw);
  return importJWK(jwk, ALG);
}

async function publicKey() {
  const raw = process.env.LICENSE_SIGNING_PUBLIC_JWK;
  if (!raw) throw new Error("TOKEN_CONFIGURATION_ERROR");
  const jwk = JSON.parse(raw);
  return importJWK(jwk, ALG);
}

export async function signLicenseToken(payload: {
  aud: string;
  sub: string;
  aid: string;
  tv: number;
  entitlements: Record<string, unknown>;
  validationHours: number;
  offlineGraceDays: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const checkAfter = now + payload.validationHours * 3600;
  const graceUntil = checkAfter + payload.offlineGraceDays * 86400;
  const jti = crypto.randomUUID();
  const kid = getKeyId();
  const key = await privateKey();
  const token = await new SignJWT({
    aid: payload.aid,
    tv: payload.tv,
    entitlements: payload.entitlements,
    check_after: checkAfter,
    grace_until: graceUntil,
  })
    .setProtectedHeader({ alg: ALG, typ: "JWT", kid })
    .setIssuer(ISSUER)
    .setAudience(payload.aud)
    .setSubject(payload.sub)
    .setJti(jti)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(graceUntil)
    .sign(key);
  return {
    token,
    claims: {
      iss: ISSUER,
      aud: payload.aud,
      sub: payload.sub,
      aid: payload.aid,
      tv: payload.tv,
      entitlements: payload.entitlements,
      jti,
      iat: now,
      nbf: now - 5,
      check_after: checkAfter,
      grace_until: graceUntil,
      exp: graceUntil,
    } satisfies LicenseTokenClaims,
  };
}

// Verify an activation token. Pass expectedAudience to bind the check to a
// specific product_code (so a token issued for product A cannot be presented
// against product B's routes). Omit it when the route doesn't know the
// product up-front (validate/deactivate — they still cross-check sub/aid
// against the DB row that the aid resolves to).
export async function verifyLicenseToken(token: string, expectedAudience?: string): Promise<LicenseTokenClaims> {
  const kid = getKeyId();
  const key = await publicKey();
  try {
    const { payload, protectedHeader } = await jwtVerify(token, key, {
      algorithms: [ALG],
      issuer: ACCEPTED_ISSUERS,
      audience: expectedAudience,
    });
    if (protectedHeader.alg !== ALG) throw new Error("TOKEN_INVALID");
    if (protectedHeader.kid !== kid) throw new Error("TOKEN_INVALID");
    const aid = payload.aid;
    const tv = payload.tv;
    const entitlements = payload.entitlements;
    if (typeof aid !== "string" || typeof tv !== "number") throw new Error("TOKEN_INVALID");
    if (!payload.sub) throw new Error("TOKEN_INVALID");
    return {
      ...payload,
      aid,
      tv,
      entitlements: (entitlements ?? {}) as Record<string, unknown>,
      check_after: typeof payload.check_after === "number" ? payload.check_after : 0,
      grace_until: typeof payload.grace_until === "number" ? payload.grace_until : 0,
    };
  } catch (caught) {
    if (caught instanceof Error && caught.message === "TOKEN_INVALID") throw caught;
    throw new Error("TOKEN_INVALID");
  }
}

export function publicJwks() {
  const raw = process.env.LICENSE_SIGNING_PUBLIC_JWK;
  if (!raw) throw new Error("LICENSE_SIGNING_PUBLIC_JWK is not configured");
  const key = JSON.parse(raw);
  return { keys: [{ ...key, kid: getKeyId(), use: "sig", alg: ALG }] };
}
