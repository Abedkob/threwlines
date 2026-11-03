import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/token";

export type Session = { userId: string; email: string; role: string };

export async function getSession(cookieStore: ReadonlyRequestCookies): Promise<Session | null> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  return { userId: payload.sub, email: payload.email, role: payload.role };
}
