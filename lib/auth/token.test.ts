import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

const { signSessionToken, verifySessionToken } = await import("./token.ts");

const payload = { sub: "user-1", email: "a@b.co", role: "admin" };

test("token: sign returns a non-empty string", async () => {
  const token = await signSessionToken(payload);
  assert.equal(typeof token, "string");
  assert.ok(token.length > 0);
});

test("token: verify returns payload for a valid token", async () => {
  const token = await signSessionToken(payload);
  assert.deepEqual(await verifySessionToken(token), payload);
});

test("token: verify returns null for an expired token", async () => {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(key);
  assert.equal(await verifySessionToken(token), null);
});

test("token: verify returns null for a tampered token", async () => {
  const token = await signSessionToken(payload);
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ sub: "evil", email: "x@y.z", role: "admin" })).toString("base64url");
  assert.equal(await verifySessionToken(parts.join(".")), null);
  assert.equal(await verifySessionToken("garbage"), null);
});
