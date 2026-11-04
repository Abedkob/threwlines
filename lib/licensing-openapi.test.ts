import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

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
    const methods = [...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
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
  const source = readFileSync("lib/license-api.ts", "utf8");
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
  const middleware = readFileSync("middleware.ts", "utf8");
  assert.match(
    middleware,
    /PUBLIC_PATHS[\s\S]{0,200}licensing-openapi\.json/,
    "the spec must be an explicitly public path, or fetching it returns the login page",
  );
  assert.match(
    middleware,
    /PUBLIC_PATHS\.includes\(pathname\)/,
    "the public-path list must actually be consulted",
  );
});
