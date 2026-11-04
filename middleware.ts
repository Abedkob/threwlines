import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/token";

// Exact-match endpoints that must bypass the session check.
// Must stay narrow — anything added here is unauthenticated.
const PUBLIC_AUTH = new Set(["/api/auth/login", "/api/auth/logout", "/api/health"]);

// Path prefixes for public API surfaces. The licensing API is called by
// third-party customer applications that carry no session cookie.
const PUBLIC_PREFIXES = ["/api/license/v1/"];
// The licensing API description is published for integrators, so it has to
// be reachable without a session - otherwise fetching it returns the login
// page and every generated client starts from a redirect.
const PUBLIC_PATHS = ["/licensing-openapi.json", "/licensing-docs.html"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_AUTH.has(pathname)) return true;
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-threwlines-auth-user");
  requestHeaders.delete("x-threwlines-auth-email");

  if (isPublic(request.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isLogin = request.nextUrl.pathname === "/login";

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session) {
    requestHeaders.set("x-threwlines-auth-user", session.sub);
    requestHeaders.set("x-threwlines-auth-email", session.email);
  }

  if (!session && !isLogin) {
    // API routes get a JSON 401 instead of an HTML redirect, so apiFetch
    // (which follows redirects) does not silently swallow a 307 as a
    // successful empty response.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (session && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
