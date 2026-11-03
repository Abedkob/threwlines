import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { issueLicense } from "@/lib/db/licensing";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    return jsonResponse(await issueLicense(session.userId, body));
  } catch (error) {
    return handleError(error);
  }
}
