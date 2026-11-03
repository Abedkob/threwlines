import { NextResponse } from "next/server";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getSession } from "@/lib/auth/session";
import type { Cursor } from "@/types/db";

export async function requireSession(
  cookies: ReadonlyRequestCookies,
): Promise<{ userId: string; email: string; role: string }> {
  const session = await getSession(cookies);
  if (!session) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Internal error";
  return errorResponse(message, 500);
}

export async function readBody(request: Request): Promise<Record<string, any>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // fall through to the 400 below
  }
  throw errorResponse("Invalid JSON body.", 400);
}

export function pick<T>(source: Record<string, any>, keys: readonly string[]): T {
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (key in source && source[key] !== undefined) out[key] = source[key];
  }
  return out as T;
}

export function intParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number.parseInt(params.get(name) ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function cursorParam(params: URLSearchParams): Cursor | null {
  const createdAt = params.get("cursor_created_at");
  const id = params.get("cursor_id");
  return createdAt && id ? { createdAt, id } : null;
}
