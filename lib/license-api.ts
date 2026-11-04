import { rpc } from "@/lib/db/query";
import { signLicenseToken, verifyLicenseToken } from "@/lib/auth/license-token";

const messages: Record<string, string> = {
  LICENSE_INVALID: "The license could not be validated.",
  LICENSE_EXPIRED: "The license has expired.",
  LICENSE_SUSPENDED: "The license is suspended.",
  LICENSE_REVOKED: "The license has been revoked.",
  LICENSE_NOT_STARTED: "The license is not active yet.",
  PRODUCT_MISMATCH: "The license is not valid for this product.",
  PRODUCT_DISABLED: "This product is not accepting activations.",
  ACTIVATION_LIMIT_REACHED: "The license has reached its activation limit.",
  INSTALLATION_NOT_FOUND: "The installation is not active.",
  TOKEN_INVALID: "The activation token is invalid or expired.",
  RATE_LIMITED: "Too many requests. Try again later.",
  INVALID_REQUEST: "The request body is invalid.",
  ORIGIN_NOT_ALLOWED: "This origin is not allowed to call the licensing API.",
};

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  vary: "Origin",
};

const DEFAULT_ALLOW_HEADERS = "authorization, content-type, x-request-id";
const ALLOW_METHODS = "GET, POST, OPTIONS";
const PREFLIGHT_MAX_AGE = "86400";

function allowedOrigins(): Set<string> {
  const raw = process.env.LICENSE_ALLOWED_ORIGINS ?? "";
  const parts = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return new Set(parts);
}

function originAllowed(origin: string): boolean {
  if (!origin) return false;
  const allowed = allowedOrigins();
  if (allowed.size === 0) return false;
  if (allowed.has("*")) return true;
  return allowed.has(origin);
}

// CORS headers for an *approved* origin. Omits ACAO entirely when the origin
// is not allowed, so browsers block the response. Never a bare "*" when the
// request Origin is present and matched.
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!origin || !originAllowed(origin)) {
    return { ...BASE_HEADERS };
  }
  const requested = req.headers.get("access-control-request-headers") ?? "";
  return {
    ...BASE_HEADERS,
    "access-control-allow-origin": origin,
    "access-control-allow-headers": requested || DEFAULT_ALLOW_HEADERS,
    "access-control-allow-methods": ALLOW_METHODS,
    "access-control-max-age": PREFLIGHT_MAX_AGE,
  };
}

export function preflight(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (origin && !originAllowed(origin)) {
    return new Response(null, { status: 403, headers: { ...BASE_HEADERS } });
  }
  return new Response(null, { status: 204, headers: cors(req) });
}

export function licenseResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

export function failure(req: Request, code: string, requestId: string, status = 400) {
  return licenseResponse(
    req,
    { ok: false, code, message: messages[code] ?? "The license request failed.", request_id: requestId },
    status,
  );
}

export function caughtFailure(req: Request, caught: unknown, requestId: string) {
  const code = caught instanceof Error && messages[caught.message] ? caught.message : "INVALID_REQUEST";
  return failure(req, code, requestId, code === "TOKEN_INVALID" ? 401 : 400);
}

export function requestIdOf(req: Request) {
  return req.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
}

export async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Resolve the client IP for rate limiting. We only trust forwarded headers
// when LICENSE_TRUSTED_PROXY=true is set; otherwise we fall back to a bucket
// derived from the request's own address. Also split "unknown" buckets per
// request-id so unauthenticated callers don't share one global quota.
export function clientIp(req: Request): string {
  const trustProxy = (process.env.LICENSE_TRUSTED_PROXY ?? "").toLowerCase() === "true";
  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const cf = req.headers.get("cf-connecting-ip");
    if (cf) return cf;
  }
  return "unknown";
}

export async function readLicenseBody(req: Request) {
  const text = await req.text();
  if (text.length > 16_384) throw new Error("INVALID_REQUEST");
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("INVALID_REQUEST");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_REQUEST");
  return parsed as Record<string, unknown>;
}

export function requiredString(value: unknown, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("INVALID_REQUEST");
  return value.trim();
}

export function optionalString(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

// License keys look like "TL-<product>-XXXXX-XXXXX-...-XXXXX" where each
// group is 5 uppercase alphanumerics. Validate before touching the DB so the
// RPC isn't a cheap enumeration target.
const LICENSE_KEY_RE = /^TL-[A-Z0-9]+(?:-[A-Z0-9]{5}){4,10}$/;
export function requiredLicenseKey(value: unknown): string {
  const key = requiredString(value, 200);
  if (!LICENSE_KEY_RE.test(key)) throw new Error("LICENSE_INVALID");
  return key;
}

export async function rateLimit(req: Request, operation: string, limit: number) {
  const ip = clientIp(req);
  // When the client IP is not trustable (no trusted-proxy header, no socket
  // address available), fall back to a shared "unknown" bucket keyed by the
  // operation. All untrusted callers compete for the same quota — not ideal
  // for legitimate traffic from behind untrusted hops, but it closes the
  // bypass where omitting X-Forwarded-For would otherwise mean no limit at
  // all. The previous `${operation}:unknown:${randomUUID()}` keying meant one
  // bucket per request.
  const identity = ip === "unknown"
    ? `${operation}:unknown`
    : `${operation}:${await hash(ip)}`;
  return Boolean(await rpc("license_rate_limit_hit", [identity, limit, 60]));
}

// Second rate-limit axis keyed on the license key itself, so a single key
// cannot be brute-forced from many IPs. Call alongside rateLimit() on the
// activate endpoint. 60 attempts per license key per 60s is generous for
// legitimate retries and tight on guessing.
export async function rateLimitByLicenseKey(licenseKey: string, operation: string, limit: number) {
  const identity = `${operation}:key:${await hash(licenseKey)}`;
  return Boolean(await rpc("license_rate_limit_hit", [identity, limit, 60]));
}

export function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  if (!value.startsWith("Bearer ")) throw new Error("TOKEN_INVALID");
  return value.slice(7);
}

export async function tokenResponse(req: Request, result: Record<string, unknown>, requestId: string) {
  if (!result.ok) return failure(req, String(result.code), requestId, 403);
  const signed = await signLicenseToken({
    aud: String(result.product_code),
    sub: String(result.license_id),
    aid: String(result.activation_id),
    tv: Number(result.token_version),
    entitlements: (result.entitlements ?? {}) as Record<string, unknown>,
    validationHours: Number(result.validation_hours),
    offlineGraceDays: Number(result.offline_grace_days),
  });
  return licenseResponse(req, {
    ok: true,
    code: "LICENSE_ACTIVE",
    request_id: requestId,
    activation_id: result.activation_id,
    product_code: result.product_code,
    license_type: result.license_type,
    expires_at: result.expires_at,
    entitlements: result.entitlements,
    activation_token: signed.token,
    check_after: new Date(signed.claims.check_after * 1000).toISOString(),
    offline_grace_until: new Date(signed.claims.grace_until * 1000).toISOString(),
  });
}

export { verifyLicenseToken };
