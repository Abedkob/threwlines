import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, errorResponse } from "@/lib/api/helpers";
import { saveAppSettings } from "@/lib/db/settings";
import { getFileUrl, uploadFile } from "@/lib/storage/local";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    if (session.role !== "superadmin") return errorResponse("Forbidden", 403);
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File)) return errorResponse("A file is required.", 400);
    if (kind !== "logo" && kind !== "stamp") return errorResponse("kind must be logo or stamp.", 400);
    const path = await uploadFile(kind, file);
    await saveAppSettings(session.userId, kind === "logo" ? { logo_url: path } : { stamp_url: path });
    return jsonResponse({ path, url: getFileUrl(path) });
  } catch (error) {
    return handleError(error);
  }
}
