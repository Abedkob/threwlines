import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/constants";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const host = request.nextUrl.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: !isLocal,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
