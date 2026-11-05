import test from "node:test";
import assert from "node:assert/strict";
import { isPublicPath } from "./public-paths.ts";

// Which paths bypass the session check is a security decision, so it is
// asserted as behaviour rather than read out of middleware.ts as source.
// Anything true here is reachable by anyone on the internet.

test("the licensing endpoints are public", () => {
  for (const path of [
    "/api/license/v1/licenses/activate",
    "/api/license/v1/licenses/validate",
    "/api/license/v1/licenses/heartbeat",
    "/api/license/v1/licenses/deactivate",
    "/api/license/v1/.well-known/jwks.json",
  ]) {
    assert.equal(isPublicPath(path), true, `${path} must not require a session`);
  }
});

test("the discovery document is public", () => {
  // The prefix was "/api/license/v1/" with a trailing slash, so the base path
  // itself fell through to the session check and answered a client's very
  // first call with a 401.
  assert.equal(isPublicPath("/api/license/v1"), true);
});

test("the published spec and docs page are public", () => {
  // Fetching these behind the session check returns the login page, so every
  // generated client would start from a redirect.
  assert.equal(isPublicPath("/licensing-openapi.json"), true);
  assert.equal(isPublicPath("/licensing-docs.html"), true);
});

test("login, logout and health are public", () => {
  assert.equal(isPublicPath("/api/auth/login"), true);
  assert.equal(isPublicPath("/api/auth/logout"), true);
  assert.equal(isPublicPath("/api/health"), true);
});

test("the application and its private API stay behind the session check", () => {
  for (const path of [
    "/",
    "/dashboard",
    "/licensing",
    "/api/contacts",
    "/api/billing/invoices",
    "/api/auth/me",
  ]) {
    assert.equal(isPublicPath(path), false, `${path} must require a session`);
  }
});

test("a path that merely starts with a public one is not public", () => {
  // A bare startsWith on "/api/license/v1" would open every sibling route
  // whose name begins with those characters.
  for (const path of [
    "/api/license",
    "/api/license/v1evil",
    "/api/license/v1x/licenses/activate",
    "/api/license/v2/licenses/activate",
    "/licensing-openapi.json.map",
    "/licensing-docs.html.bak",
    "/api/auth/login-as",
  ]) {
    assert.equal(isPublicPath(path), false, `${path} must not be treated as public`);
  }
});
