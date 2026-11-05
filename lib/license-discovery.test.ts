import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LICENSE_API_BASE_PATH, licenseDiscovery } from "./license-discovery.ts";

// A client that stores a full base URL has the API's path structure baked into
// its build, which is how a shipped client came to request
// /api/license/v1/v1/licenses/activate and read the app's HTML 404 as "the
// licence stopped working". The discovery document moves path ownership to the
// server: a client stores only an origin and asks where things are.

const doc = licenseDiscovery();

test("the document names every endpoint a client calls", () => {
  const names = Object.keys(doc.endpoints).sort();
  assert.deepEqual(names, ["activate", "deactivate", "heartbeat", "jwks", "validate"]);
});

test("every endpoint sits under the advertised base path", () => {
  // If these two can disagree, a client that joins base_path with an endpoint
  // name reconstructs exactly the doubled-prefix bug this document prevents.
  for (const [name, path] of Object.entries(doc.endpoints)) {
    assert.ok(
      path.startsWith(LICENSE_API_BASE_PATH + "/"),
      `endpoint ${name} is ${path}, which is not under ${LICENSE_API_BASE_PATH}`,
    );
  }
});

test("paths are root-relative so no host is ever reflected", () => {
  // Absolute URLs would have to come from the request's Host header, letting a
  // caller that controls that header point a client at another server. The
  // client resolves these against the origin it already dialled.
  const paths = [...Object.values(doc.endpoints), doc.base_path, doc.spec, doc.documentation];
  for (const path of paths) {
    assert.ok(path.startsWith("/"), `${path} must be root-relative`);
    assert.ok(!path.includes("//"), `${path} must not be protocol-relative or contain an empty segment`);
    assert.ok(!path.includes(":"), `${path} must not carry a scheme`);
  }
});

// Walk the route tree the way the published-spec test does, so a new endpoint
// shows up here as a failure rather than as a gap a client cannot discover.
function routePaths(dir = "app/api/license/v1"): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routePaths(full);
    if (entry !== "route.ts") return [];
    return ["/" + dir.split("\\").join("/").replace("app/api/license/", "")];
  });
}

test("the document covers every route in the tree", () => {
  const advertised = new Set(Object.values(doc.endpoints));
  // The discovery route itself is the base path, not one of its own endpoints.
  const missing = routePaths()
    .map((path) => "/api/license" + path)
    .filter((path) => path !== LICENSE_API_BASE_PATH)
    .filter((path) => !advertised.has(path));
  assert.deepEqual(missing, [], `routes a client cannot discover: ${missing.join(", ")}`);
});

test("the advertised issuer is the one the signer uses", () => {
  // A client that pins iss from this document and verifies tokens offline gets
  // locked out if the two drift.
  const source = readFileSync("lib/auth/license-token.ts", "utf8");
  const line = source.split("\n").find((text) => text.startsWith("const ISSUER = "));
  assert.ok(line, "could not find the ISSUER constant");
  assert.equal(doc.token.issuer, line.split('"')[1]);
});

test("the advertised algorithm is the one the signer uses", () => {
  const source = readFileSync("lib/auth/license-token.ts", "utf8");
  const line = source.split("\n").find((text) => text.startsWith("const ALG = "));
  assert.ok(line, "could not find the ALG constant");
  assert.equal(doc.token.algorithm, line.split('"')[1]);
});

test("the document is cheap to parse and carries no secrets", () => {
  const text = JSON.stringify(doc);
  assert.ok(text.length < 1000, `the document grew to ${text.length} bytes`);
  for (const word of ["PRIVATE", "private", "secret", "password", "DATABASE_URL"]) {
    assert.ok(!text.includes(word), `the document leaks ${word}`);
  }
});
