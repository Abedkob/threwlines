// Which request paths bypass the session check in middleware.ts. Kept here,
// free of imports, so the decision is unit tested as behaviour: everything
// this returns true for is reachable by anyone on the internet.

// Exact-match endpoints. Must stay narrow.
const PUBLIC_AUTH = new Set(["/api/auth/login", "/api/auth/logout", "/api/health"]);

// Public API surfaces, matched as a whole path or as a path prefix. The
// licensing API is called by third-party customer applications that carry no
// session cookie, and its base path is the discovery document clients read
// before they hold any credential - so the base itself must match, not only
// the routes beneath it.
const PUBLIC_TREES = ["/api/license/v1"];

// The licensing API description is published for integrators, so it has to be
// reachable without a session - otherwise fetching it returns the login page
// and every generated client starts from a redirect.
const PUBLIC_PATHS = ["/licensing-openapi.json", "/licensing-docs.html"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_AUTH.has(pathname)) return true;
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // A bare startsWith would also match a sibling route whose name merely
  // begins with these characters, such as /api/license/v1evil.
  return PUBLIC_TREES.some((tree) => pathname === tree || pathname.startsWith(tree + "/"));
}
