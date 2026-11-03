import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// These tests read source rather than importing it: the route modules resolve
// through the "@/" tsconfig alias, which the node test runner does not apply.

const API_ROOT = "app/api";

function routeFiles(dir = API_ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path.split("\\").join("/")] : [];
  });
}

// Endpoints that are unauthenticated by design: the login/logout pair and the
// public licensing API, where the licence key in the request body is itself
// the credential, guarded by per-IP and per-key rate limiting.
const PUBLIC_ROUTES = [
  "app/api/auth/login/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/uploads/[...path]/route.ts",
];
const isPublic = (file: string) =>
  PUBLIC_ROUTES.includes(file) || file.startsWith("app/api/license/");

// Operations the product reserves for superadmins. Expense *creation* is
// deliberately absent: the "Log an expense" form is open to every member, and
// only editing and deleting a ledger entry are restricted.
const SUPERADMIN_ROUTES = [
  "app/api/expenses/[id]/route.ts",
  "app/api/billing/settings/route.ts",
];

const MUTATING = /export async function (POST|PATCH|PUT|DELETE)\b/;

test("every mutating API route authenticates the caller", () => {
  const unguarded = routeFiles()
    .filter((file) => !isPublic(file))
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!MUTATING.test(source)) return false;
      return !/requireSession|requireSuperadmin/.test(source);
    });
  assert.deepEqual(unguarded, [], `unguarded mutating routes: ${unguarded.join(", ")}`);
});

test("superadmin-only routes check the role, not just the session", () => {
  for (const file of SUPERADMIN_ROUTES) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /requireSuperadmin/,
      `${file} must gate on role: row-level security no longer backstops it`,
    );
    assert.doesNotMatch(
      source,
      /await requireSession\(/,
      `${file} still has a session-only guard on some handler`,
    );
  }
});

test("the route scan actually found the API surface", () => {
  const files = routeFiles();
  assert.ok(files.length >= 20, `only found ${files.length} route files`);
  assert.ok(files.includes("app/api/expenses/[id]/route.ts"));
});

test("raise_exception messages reach the user instead of becoming Internal error", () => {
  const source = readFileSync("lib/api/helpers.ts", "utf8");
  const raiseAt = source.indexOf("P0001");
  const catchAllAt = source.indexOf("/^[0-9A-Z]{5}$/");
  assert.ok(raiseAt > 0, "P0001 is not handled at all");
  assert.ok(
    raiseAt < catchAllAt,
    "P0001 must be handled before the generic SQLSTATE catch-all, or every " +
      "`raise exception` in the schema is flattened to a 500",
  );
  assert.match(source, /classifyMessage/, "message classification should be shared");
});

test("the schema still raises the user-facing errors this depends on", () => {
  const schema = readFileSync("scripts/local-schema.sql", "utf8");
  const raises = schema.match(/raise exception/g) ?? [];
  assert.ok(raises.length > 50, `expected the validation messages, found ${raises.length}`);
});
