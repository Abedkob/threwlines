import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, intParam } from "@/lib/api/helpers";
import { listMyOpenTasks } from "@/lib/db/tasks";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const limit = Math.min(intParam(request.nextUrl.searchParams, "limit", 5), 50);
    return jsonResponse(await listMyOpenTasks(session.userId, limit));
  } catch (error) {
    return handleError(error);
  }
}
