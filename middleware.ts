import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/token";
// The allow-list lives in lib/public-paths.ts so it can be unit tested as
// behaviour. Anything it admits is reachable without a session.
import { isPublicPath } from "@/lib/public-paths";

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-threwlines-auth-user");
  requestHeaders.delete("x-threwlines-auth-email");

  if (isPublicPath(request.nextUrl.pathname)) {
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
