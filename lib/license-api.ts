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
};

export function cors(req: Request): Record<string, string> {
  const configured = (process.env.LICENSE_ALLOWED_ORIGINS ?? "*").split(",").map((value) => value.trim());
  const origin = req.headers.get("origin") ?? "";
  const allowed = configured.includes("*") ? "*" : configured.includes(origin) ? origin : configured[0] ?? "";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, content-type, x-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

export function preflight(req: Request) {
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

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function readLicenseBody(req: Request) {
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > 16_384) throw new Error("INVALID_REQUEST");
  const parsed = await req.json();
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

export async function rateLimit(req: Request, operation: string, limit: number) {
  const forwarded = clientIp(req);
  const ip = forwarded === "unknown" ? req.headers.get("cf-connecting-ip") || "unknown" : forwarded;
  const bucket = `${operation}:${await hash(ip)}`;
  return Boolean(await rpc("license_rate_limit_hit", [bucket, limit, 60]));
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
