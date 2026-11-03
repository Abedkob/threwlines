import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { listTemplates, saveTemplate } from "@/lib/db/billing";

export async function GET() {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listTemplates());
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    const id = await saveTemplate(session.userId, body);
    return jsonResponse({ id });
  } catch (error) {
    return handleError(error);
  }
}
