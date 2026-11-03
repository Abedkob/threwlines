import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_NAME } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/token";
import { queryOne } from "@/lib/db/query";

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  app_role: string;
};

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("Email and password are required.", 400);

  const profile = await queryOne<ProfileRow>(
    "select id, email, name, password_hash, app_role from profiles where lower(email) = $1",
    [email],
  );
  const valid = profile ? await verifyPassword(password, profile.password_hash) : false;
  if (!profile || !valid) return fail("Invalid email or password.", 401);

  const token = await signSessionToken({
    sub: profile.id,
    email: profile.email,
    role: profile.app_role,
  });
  const response = NextResponse.json({
    ok: true,
    user: { id: profile.id, name: profile.name, email: profile.email, role: profile.app_role },
  });
  const host = request.nextUrl.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isLocal,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
