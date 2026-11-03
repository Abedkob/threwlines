type TokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  aid: string;
  tv: number;
  entitlements: Record<string, unknown>;
  iat: number;
  nbf: number;
  check_after: number;
  grace_until: number;
  exp: number;
};

function encodeBytes(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBytes(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function encodeJson(value: unknown) {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

export async function signLicenseToken(payload: Omit<TokenPayload, "iss" | "iat" | "nbf" | "check_after" | "grace_until" | "exp"> & {
  validationHours: number;
  offlineGraceDays: number;
}) {
  const privateJwk = JSON.parse(process.env.LICENSE_SIGNING_PRIVATE_JWK ?? "null");
  if (!privateJwk) throw new Error("LICENSE_SIGNING_PRIVATE_JWK is not configured");
  const keyId = process.env.LICENSE_SIGNING_KEY_ID ?? "idv-license-1";
  const now = Math.floor(Date.now() / 1000);
  const checkAfter = now + payload.validationHours * 3600;
  const graceUntil = checkAfter + payload.offlineGraceDays * 86400;
  const claims: TokenPayload = {
    iss: "idevelopit-vault",
    aud: payload.aud,
    sub: payload.sub,
    aid: payload.aid,
    tv: payload.tv,
    entitlements: payload.entitlements,
    iat: now,
    nbf: now - 5,
    check_after: checkAfter,
    grace_until: graceUntil,
    exp: graceUntil,
  };
  const header = encodeJson({ alg: "ES256", typ: "JWT", kid: keyId });
  const body = encodeJson(claims);
  const input = new TextEncoder().encode(`${header}.${body}`);
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, input));
  return { token: `${header}.${body}.${encodeBytes(signature)}`, claims };
}

export async function verifyLicenseToken(token: string) {
  const [header, body, signature, extra] = token.split(".");
  if (!header || !body || !signature || extra) throw new Error("TOKEN_INVALID");
  const publicJwk = JSON.parse(process.env.LICENSE_SIGNING_PUBLIC_JWK ?? "null");
  if (!publicJwk) throw new Error("TOKEN_CONFIGURATION_ERROR");
  const key = await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    decodeBytes(signature),
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) throw new Error("TOKEN_INVALID");
  const claims = JSON.parse(new TextDecoder().decode(decodeBytes(body))) as TokenPayload;
  if (claims.iss !== "idevelopit-vault" || !claims.sub || !claims.aid || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("TOKEN_INVALID");
  return claims;
}

export function publicJwks() {
  const key = JSON.parse(process.env.LICENSE_SIGNING_PUBLIC_JWK ?? "null");
  if (!key) throw new Error("LICENSE_SIGNING_PUBLIC_JWK is not configured");
  return { keys: [{ ...key, kid: process.env.LICENSE_SIGNING_KEY_ID ?? "idv-license-1", use: "sig", alg: "ES256" }] };
}
