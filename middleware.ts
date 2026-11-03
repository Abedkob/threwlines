import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/token";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const isLogin = request.nextUrl.pathname === "/login";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-idv-auth-user");
  requestHeaders.delete("x-idv-auth-email");

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session) {
    requestHeaders.set("x-idv-auth-user", session.sub);
    requestHeaders.set("x-idv-auth-email", session.email);
  }

  if (!session && !isLogin) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
