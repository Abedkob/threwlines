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

// Role gate for the handful of operations the product reserves for
// superadmins. The schema no longer carries row-level security, so for any
// write that does not go through a protected SQL function this is the only
// thing standing between a member and the data.
export async function requireSuperadmin(
  cookies: ReadonlyRequestCookies,
): Promise<{ userId: string; email: string; role: string }> {
  const session = await requireSession(cookies);
  if (session.role !== "superadmin") {
    throw NextResponse.json({ error: "Superadmin access required." }, { status: 403 });
  }
  return session;
}

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Postgres SQLSTATE classes we treat as user input errors (400). The raw
// Postgres message would leak schema/column names, so we return a generic
// label per class instead of the pg text.
const PG_INPUT_CODES: Record<string, string> = {
  "23502": "A required field is missing.",       // not_null_violation
  "23505": "A value must be unique.",             // unique_violation
  "23503": "A referenced record does not exist.", // foreign_key_violation
  "23514": "A value is not allowed.",             // check_violation
  "22001": "A value is too long.",                // string_data_right_truncation
  "22P02": "A value is not in the right format.", // invalid_text_representation
  "22023": "A value is out of range.",            // invalid_parameter_value
};

// SQLSTATE P0001 is raise_exception: the code Postgres stamps on every
// `raise exception` in our own functions. Those messages are written for the
// user ("Due date cannot be before invoice date"), so they are the one class
// of database error whose text we deliberately pass through.
const PG_RAISE_EXCEPTION = "P0001";

// Map an intentional, user-safe message to a real HTTP code. Returns null when
// the message is not one we recognise, so callers can decide the fallback.
function classifyMessage(message: string) {
  const text = message.toLowerCase();
  if (/not found|does not exist/.test(text)) return errorResponse(message, 404);
  if (/unauthoriz|not authenticated|session expired/.test(text)) return errorResponse(message, 401);
  if (/forbidden|superadmin|not allowed|permission denied|access required/.test(text)) {
    return errorResponse(message, 403);
  }
  if (/invalid|required|missing|must be|must use|must belong|cannot|too long|too short|out of range|duplicate name|must not|at least one/.test(text)) {
    return errorResponse(message, 400);
  }
  return null;
}

export function handleError(error: unknown) {
  // A handler that already threw a Response (e.g. requireSession throwing a
  // 401) is passed through verbatim.
  if (error instanceof Response) return error;

  const message = error instanceof Error ? error.message : "";

  // Postgres errors carry a SQLSTATE code — recognise the input-shape ones
  // and respond with a safe, generic 400 instead of echoing the raw message.
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code in PG_INPUT_CODES) {
      return errorResponse(PG_INPUT_CODES[code], 400);
    }
    // Our own `raise exception` messages are written for the user. Classify
    // them like any other intentional error rather than burying them: the
    // schema raises 72 of these and they are the only thing telling someone
    // which field is wrong.
    if (code === PG_RAISE_EXCEPTION && message) {
      return classifyMessage(message) ?? errorResponse(message, 400);
    }
    if (code && /^[0-9A-Z]{5}$/.test(code)) {
      // Any other SQLSTATE is a server-side problem; do not leak the text.
      console.error("[api] db error:", error);
      return errorResponse("Internal error.", 500);
    }
  }

  // Map intentional, user-safe errors from the data layer to real HTTP codes.
  // Everything else is treated as internal: logged server-side and reported
  // as a generic 500 so we don't leak DB constraint names or stack signatures.
  const classified = classifyMessage(message);
  if (classified) return classified;
  console.error("[api] unhandled error:", error);
  return errorResponse("Internal error.", 500);
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
