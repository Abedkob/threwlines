import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT, exportJWK, generateKeyPair, importJWK } from "jose";

// A real ES256 keypair, so these exercise the signing and verifying paths rather
// than a stub. The module reads the env lazily, so setting it before the dynamic
// import below is enough.
const pair = await generateKeyPair("ES256", { extractable: true });
const privateJwk = await exportJWK(pair.privateKey);
const publicJwk = await exportJWK(pair.publicKey);

process.env.LICENSE_SIGNING_PRIVATE_JWK = JSON.stringify(privateJwk);
process.env.LICENSE_SIGNING_PUBLIC_JWK = JSON.stringify(publicJwk);
process.env.LICENSE_SIGNING_KEY_ID = "test-key-1";

const { signLicenseToken, verifyLicenseToken } = await import("./license-token.ts");

const PAYLOAD = {
  aud: "abedz",
  sub: "licence-1",
  aid: "activation-1",
  tv: 1,
  entitlements: { seats: 3 },
  validationHours: 24,
  offlineGraceDays: 14,
};

// Hand-sign a token the way a past release did, so the issuer under test is the
// only thing that differs from what the current signer produces.
async function tokenWithIssuer(issuer: string, kid = "test-key-1") {
  const now = Math.floor(Date.now() / 1000);
  const key = await importJWK(privateJwk, "ES256");
  return new SignJWT({ aid: "activation-1", tv: 1, entitlements: {}, check_after: now + 3600, grace_until: now + 86400 })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid })
    .setIssuer(issuer)
    .setAudience("abedz")
    .setSubject("licence-1")
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 86400)
    .sign(key);
}

test("a token this server signs carries the current issuer", async () => {
  const { token, claims } = await signLicenseToken(PAYLOAD);
  assert.equal(claims.iss, "nosterys");
  const verified = await verifyLicenseToken(token, "abedz");
  assert.equal(verified.iss, "nosterys");
  assert.equal(verified.sub, "licence-1");
});

test("a licence activated before the rename still validates", async () => {
  // Every activation token in the field carries iss "threwlines". Rejecting it
  // would lock out every installed client until it re-activated, which is the
  // one outcome the rebrand must not cause. This test is why verify accepts a
  // list of issuers rather than a single value.
  const legacy = await tokenWithIssuer("threwlines");
  const verified = await verifyLicenseToken(legacy, "abedz");
  assert.equal(verified.iss, "threwlines");
  assert.equal(verified.aid, "activation-1");
});

test("a token from an unrelated issuer is refused", async () => {
  const foreign = await tokenWithIssuer("someone-else");
  await assert.rejects(() => verifyLicenseToken(foreign, "abedz"), /TOKEN_INVALID/);
});

test("the accepted issuers are exactly the current one and the pre-rename one", async () => {
  // Keeps the compatibility list from quietly growing into an any-issuer gate.
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync("lib/auth/license-token.ts", "utf8"),
  );
  const line = source.split("\n").find((text) => text.startsWith("const ACCEPTED_ISSUERS"));
  assert.ok(line, "could not find ACCEPTED_ISSUERS");
  const names = [...line.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["nosterys", "threwlines"]);
});

test("a token signed under a different key id is refused", async () => {
  const wrongKey = await tokenWithIssuer("nosterys", "some-other-key");
  await assert.rejects(() => verifyLicenseToken(wrongKey, "abedz"), /TOKEN_INVALID/);
});

test("a token for another product is refused when the product is known", async () => {
  const { token } = await signLicenseToken(PAYLOAD);
  await assert.rejects(() => verifyLicenseToken(token, "other-product"), /TOKEN_INVALID/);
});
