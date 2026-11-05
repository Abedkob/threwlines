import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { LICENSE_API_BASE_PATH, licenseDiscovery } from "./license-discovery.ts";
import { isPublicPath } from "./public-paths.ts";

// The spec is published to integrators, so it has to describe the routes that
// actually exist. These tests compare it against the route tree and the error
// codes the code can emit, so the document cannot quietly go stale.

const SPEC_PATH = "public/licensing-openapi.json";
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

test("the spec is valid JSON with the parts a client needs", () => {
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.info?.title && spec.info?.version, "info.title and info.version are required");
  assert.ok(spec.servers?.[0]?.url.includes("/api/license/v1"), "servers must point at the public base path");
});

test("every $ref in the spec resolves", () => {
  const refs: string[] = [];
  (function walk(node: unknown) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") refs.push(value);
        else walk(value);
      }
    }
  })(spec);
  assert.ok(refs.length > 0, "expected the spec to use $ref");
  for (const ref of refs) {
    assert.ok(ref.startsWith("#/"), `only local refs are supported: ${ref}`);
    const target = ref
      .slice(2)
      .split("/")
      .reduce<any>((node, part) => node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
    assert.ok(target !== undefined, `dangling $ref: ${ref}`);
  }
});

// Walk app/api/license/** and turn each route.ts into the path the spec should
// document, relative to the /api/license/v1 base.
function publicRoutes(dir = "app/api/license/v1"): { path: string; methods: string[] }[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return publicRoutes(full);
    if (entry !== "route.ts") return [];
    const source = readFileSync(full, "utf8");
    // Routes declare a handler either as a function or by assigning a shared
    // one (export const POST = handleValidate). Matching only the first
    // form made this scan find no methods at all for an aliased route, so
    // the parity check below passed without checking anything.
    const methods = [...source.matchAll(/export (?:(?:async )?function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
      (m) => m[1].toLowerCase(),
    );
    const path = "/" + dir.split("\\").join("/").replace("app/api/license/v1", "").replace(/^\//, "");
    return [{ path: path === "/" ? "/" : path, methods }];
  });
}

test("the spec documents every public licensing route", () => {
  const routes = publicRoutes();
  assert.ok(routes.length >= 4, `expected at least 4 public routes, found ${routes.length}`);
  for (const route of routes) {
    const documented = spec.paths?.[route.path];
    assert.ok(documented, `route ${route.path} exists but is not in the spec`);
    for (const method of route.methods) {
      if (method === "options") continue; // CORS preflight, not part of the contract
      assert.ok(documented[method], `${method.toUpperCase()} ${route.path} is not documented`);
    }
  }
});

test("the spec does not document routes that do not exist", () => {
  const real = new Set(publicRoutes().map((r) => r.path));
  for (const path of Object.keys(spec.paths ?? {})) {
    assert.ok(real.has(path), `spec documents ${path}, which has no route`);
  }
});

test("the documented error codes are the ones the server can return", () => {
  const documented: string[] = spec.components.schemas.Failure.properties.code.enum;
  const source = readFileSync("lib/license-api.ts", "utf8");
  const messages = source.slice(source.indexOf("messages"), source.indexOf("messages") + 1200);
  const emitted = new Set([...messages.matchAll(/^\s*([A-Z_]{4,}):/gm)].map((m) => m[1]));
  for (const code of documented) {
    assert.ok(emitted.has(code), `spec lists ${code}, but lib/license-api.ts has no message for it`);
  }
});

test("activate is unauthenticated and the others are not", () => {
  // The licence key is the credential for activate; validate and deactivate
  // carry the activation token as a bearer.
  assert.deepEqual(spec.paths["/licenses/activate"].post.security, []);
  assert.deepEqual(spec.paths["/.well-known/jwks.json"].get.security, []);
  assert.equal(spec.paths["/licenses/validate"].post.security, undefined);
  assert.equal(spec.paths["/licenses/deactivate"].post.security, undefined);
  assert.ok(spec.security?.[0]?.ActivationToken, "a default security scheme must apply to the rest");
});

test("the licence key pattern matches the one the server validates against", () => {
  const specPattern = spec.components.schemas.ActivateRequest.properties.license_key.pattern;
  const source = readFileSync("lib/license-key.ts", "utf8");
  const serverPattern = source.match(/LICENSE_KEY_RE\s*=\s*\/(.+?)\/[gimsuy]*;/)?.[1];
  assert.ok(serverPattern, "could not find LICENSE_KEY_RE");
  assert.equal(specPattern, serverPattern, "the documented key format has drifted from the server's");
});

test("the spec is published as a static file clients can fetch", () => {
  assert.ok(existsSync(SPEC_PATH), "the spec must live under public/ to be served");
});

test("the spec is reachable without a session", () => {
  // It lives under public/, but middleware intercepts everything that is not
  // an image or a _next asset - so a .json file there redirects to /login
  // unless it is allowed explicitly. Integrators fetch this anonymously.
  assert.equal(
    isPublicPath("/" + SPEC_PATH.replace("public/", "")),
    true,
    "the spec must be an explicitly public path, or fetching it returns the login page",
  );
  // And the allow-list must be the one middleware consults.
  const middleware = readFileSync("middleware.ts", "utf8");
  assert.match(
    middleware,
    /isPublicPath\(request\.nextUrl\.pathname\)/,
    "the public-path list must actually be consulted",
  );
});

test("the rendered docs page is public, pinned and integrity-checked", () => {
  const page = readFileSync("public/licensing-docs.html", "utf8");
  assert.match(page, /\/licensing-openapi\.json/, "the page must render the published spec");
  // A CDN script without SRI means a compromised CDN runs arbitrary code on a
  // page we publish. A floating version means the renderer can change under it.
  const script = page.match(/<script[\s\S]*?cdn\.jsdelivr\.net[\s\S]*?>/)?.[0] ?? "";
  assert.ok(script, "expected the renderer to load from the pinned CDN");
  assert.match(script, /integrity="sha384-[A-Za-z0-9+/=]+"/, "the CDN script needs an SRI hash");
  assert.match(script, /crossorigin="anonymous"/, "SRI requires crossorigin on a cross-origin script");
  assert.match(script, /redoc@\d+\.\d+\.\d+\//, 'the renderer version must be pinned, not "latest"');

  assert.equal(
    isPublicPath("/licensing-docs.html"),
    true,
    "the docs page must be public, or it redirects integrators to /login",
  );
});

test("the docs page degrades to something useful if the renderer fails", () => {
  const page = readFileSync("public/licensing-docs.html", "utf8");
  assert.match(page, /tl-fallback/, "there must be fallback content inside the render target");
  assert.match(page, /Download spec/, "the raw spec must be reachable without the renderer");
});

test("heartbeat exists and cannot drift from validate", () => {
  // The Supabase Edge Function routed /v1/licenses/heartbeat and
  // /v1/licenses/validate to one handler, so shipping clients call either.
  // The Next rewrite dropped heartbeat, and a client polling it got the app's
  // HTML 404 page instead of a token - which reads as "the licence stopped
  // working". Both routes must delegate to the same module so a change to the
  // validation rules cannot apply to only one of them.
  const heartbeat = readFileSync("app/api/license/v1/licenses/heartbeat/route.ts", "utf8");
  const validate = readFileSync("app/api/license/v1/licenses/validate/route.ts", "utf8");
  const shared = /from "@\/lib\/license-validate"/;
  assert.match(heartbeat, shared, "heartbeat must use the shared validation handler");
  assert.match(validate, shared, "validate must use the same shared handler, not its own copy");
  assert.match(heartbeat, /export const POST/, "heartbeat must accept POST");
  assert.match(heartbeat, /export function OPTIONS/, "heartbeat needs the CORS preflight like its siblings");
});

test("every failure code the server can emit is documented", () => {
  // The test above checks documented is a subset of emitted. Without the
  // reverse direction a new code reaches integrators undocumented, which is
  // how LICENSE_NOT_STARTED, PRODUCT_DISABLED and INVALID_REQUEST stayed
  // missing from a published spec.
  const documented = new Set<string>(spec.components.schemas.Failure.properties.code.enum);
  const source = readFileSync("lib/license-api.ts", "utf8");
  const table = source.slice(source.indexOf("messages"), source.indexOf("messages") + 1200);
  const emitted = [...table.matchAll(/^\s*([A-Z_]{4,}):/gm)].map((m) => m[1]);

  // Present in the message table but unreachable: a disallowed origin gets an
  // empty 403 from preflight(), so no response body ever carries this code.
  // Returning it anywhere would quote it as a string literal, unlike the bare
  // key in the message table. If that happens, document it and drop it here.
  const UNREACHABLE = ["ORIGIN_NOT_ALLOWED"];
  for (const code of UNREACHABLE) {
    assert.ok(
      !source.includes(`"${code}"`),
      `${code} is now returned to clients - add it to the spec's enum and remove it from UNREACHABLE`,
    );
  }

  const missing = emitted.filter((code) => !documented.has(code) && !UNREACHABLE.includes(code));
  assert.deepEqual(missing, [], `codes the server emits but the spec omits: ${missing.join(", ")}`);
});

test("response timestamps are documented in the representation actually sent", () => {
  // tokenResponse converts the token's integer claims with toISOString(), so
  // the response carries strings while the claims carry Unix seconds. The spec
  // typed the response fields as integers, which makes a generated client fail
  // to deserialise a perfectly good activation.
  const lines = readFileSync("lib/license-api.ts", "utf8").split("\n");
  for (const field of ["check_after", "offline_grace_until"] as const) {
    const line = lines.find((text) => text.trimStart().startsWith(`${field}: `));
    assert.ok(line, `could not find where ${field} is serialised`);
    assert.ok(
      line.includes("toISOString()"),
      `${field} is no longer an ISO string - the spec says it is`,
    );
    const property = spec.components.schemas.ActivationResponse.properties[field];
    assert.equal(property.type, "string", `${field} is sent as an ISO string, not an integer`);
    assert.equal(property.format, "date-time", `${field} should declare format: date-time`);
  }
  // The claims inside the JWT keep the numeric form.
  assert.equal(spec.components.schemas.TokenClaims.properties.check_after.type, "integer");
  assert.equal(spec.components.schemas.TokenClaims.properties.grace_until.type, "integer");
});

test("the discovery document is published and needs no credential", () => {
  // It is the first call a client makes, before it holds any token, and it is
  // what lets a client store an origin instead of a full base URL.
  const documented = spec.paths["/"];
  assert.ok(documented?.get, "GET on the base path is not documented");
  assert.deepEqual(documented.get.security, [], "discovery must be unauthenticated");
});

test("every endpoint the discovery document advertises is a documented path", () => {
  // Otherwise a client follows the document to a route the spec never
  // described, and a generated client has no model for the response.
  const relative = Object.values(licenseDiscovery().endpoints).map(
    (path) => path.replace(LICENSE_API_BASE_PATH, "") || "/",
  );
  const missing = relative.filter((path) => !spec.paths[path]);
  assert.deepEqual(missing, [], `advertised but undocumented: ${missing.join(", ")}`);
});

test("the spec's base path is the one the discovery document advertises", () => {
  // servers[0].url carries it as "https://{host}/api/license/v1". If these
  // drift, the two halves of the document disagree about where the API lives.
  assert.ok(
    spec.servers[0].url.endsWith(LICENSE_API_BASE_PATH),
    `servers[0].url is ${spec.servers[0].url}, which does not end with ${LICENSE_API_BASE_PATH}`,
  );
});
