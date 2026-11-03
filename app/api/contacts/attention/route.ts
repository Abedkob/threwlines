import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, intParam } from "@/lib/api/helpers";
import { listAttentionContacts } from "@/lib/db/contacts";

export async function GET(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const limit = Math.min(intParam(request.nextUrl.searchParams, "limit", 5), 50);
    return jsonResponse(await listAttentionContacts(limit));
  } catch (error) {
    return handleError(error);
  }
}
