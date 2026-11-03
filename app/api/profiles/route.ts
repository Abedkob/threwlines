import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { listProfiles } from "@/lib/db/profiles";

export async function GET(_request: NextRequest) {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listProfiles());
  } catch (error) {
    return handleError(error);
  }
}
