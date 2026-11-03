import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { getNavigationCounts } from "@/lib/db/settings";

export async function GET(_request: NextRequest) {
  try {
    await requireSession(await cookies());
    return jsonResponse(await getNavigationCounts());
  } catch (error) {
    return handleError(error);
  }
}
