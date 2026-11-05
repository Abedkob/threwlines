export const TOKEN_EXPIRY = "7d";
// Renamed with the brand. Sessions signed under the old name do not carry
// over, so everyone signs in once more after this ships.
export const COOKIE_NAME = "nosterys-session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

// Read lazily so the secret is resolved at call time, not import time.
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return new TextEncoder().encode(secret);
}
