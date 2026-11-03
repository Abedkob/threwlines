import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, errorResponse, handleError, readBody } from "@/lib/api/helpers";
import { getAppSettings, saveAppSettings } from "@/lib/db/settings";

export async function GET() {
  try {
    await requireSession(await cookies());
    return jsonResponse(await getAppSettings());
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    if (session.role !== "superadmin") return errorResponse("Forbidden", 403);
    const body = await readBody(request);
    await saveAppSettings(session.userId, body);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
