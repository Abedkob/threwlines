import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { getDashboardSummary } from "@/lib/db/settings";

export async function GET(_request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    return jsonResponse(await getDashboardSummary(session.userId));
  } catch (error) {
    return handleError(error);
  }
}
