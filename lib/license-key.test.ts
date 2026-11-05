import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LICENSE_KEY_RE, normalizeLicenseKey } from "./license-key.ts";

const CANONICAL = "TL-ABEDZ-7K2M4-9QX4B-820C0-47LDG";

function accepts(value: string) {
  return LICENSE_KEY_RE.test(normalizeLicenseKey(value));
}

test("a canonical key is accepted", () => {
  assert.ok(accepts(CANONICAL));
});

test("case and surrounding whitespace do not decide validity", () => {
  // Keys get read off invoices, emails and clipboards. The database hashes
  // upper(trim(key)), so a lowercase key would have matched there - it was
  // being refused by the pattern before it ever reached the lookup.
  assert.ok(accepts(CANONICAL.toLowerCase()), "a lowercase key must be accepted");
  assert.ok(accepts(`  ${CANONICAL}\n`), "padding must not matter");
  assert.ok(accepts("tl-abedz-7k2m4-9qx4b-820c0-47ldg  "), "both together must not matter");
});

test("normalisation produces the exact form the database hashes", () => {
  assert.equal(normalizeLicenseKey(` ${CANONICAL.toLowerCase()} `), CANONICAL);
  assert.equal(normalizeLicenseKey(CANONICAL), CANONICAL, "must be idempotent");
});

test("the database hashes the same normalisation we apply", () => {
  // If the SQL ever stops doing upper(trim(...)), normalising here would
  // silently start producing keys that do not match the stored digest.
  const schema = readFileSync("scripts/local-schema.sql", "utf8");
  assert.match(
    schema,
    /digest\(upper\(trim\(p_license_key\)\),'sha256'\)/,
    "license_api_activate must hash upper(trim(key)) for this normalisation to be sound",
  );
});

test("both the current and the pre-rename prefix are accepted", () => {
  // Keys issued as ThrewLines start TL-; keys issued as Nosterys Vault start
  // NV-. Refusing TL- would invalidate every licence already with a customer,
  // including printed and emailed copies.
  assert.ok(accepts("NV-ABEDZ-7K2M4-9QX4B-820C0-47LDG"), "the current NV- prefix must be accepted");
  assert.ok(accepts(CANONICAL), "the pre-rename TL- prefix must keep working");
  assert.ok(accepts("nv-abedz-7k2m4-9qx4b-820c0-47ldg"), "case must not decide it for NV- either");
});

test("the accepted prefixes are exactly those two", () => {
  // Keeps the compatibility alternation from drifting into a wildcard.
  const source = readFileSync("lib/license-key.ts", "utf8");
  const line = source.split("\n").find((text) => text.startsWith("export const LICENSE_KEY_RE"));
  assert.ok(line, "could not find LICENSE_KEY_RE");
  assert.match(line, /\(\?:NV\|TL\)/, "the pattern must name NV and TL and nothing else");
});

test("normalising does not widen what counts as a key", () => {
  assert.ok(!accepts("IDV-ABEDZ-7K2M4-9QX4B-820C0-47LDG"), "the superseded IDV- prefix stays invalid");
  assert.ok(!accepts("XX-ABEDZ-7K2M4-9QX4B-820C0-47LDG"), "an unknown prefix stays invalid");
  assert.ok(!accepts("TL-ABEDZ-7K2M-9QX4B-820C0-47LDG"), "a four-character group stays invalid");
  assert.ok(!accepts("TL-ABEDZ-7K2M4-9QX4B"), "too few groups stays invalid");
  assert.ok(!accepts("TL-ABEDZ-7K2M4-9QX4B-820C0-47LD!"), "punctuation stays invalid");
  assert.ok(!accepts(""), "an empty string stays invalid");
});
