import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { listContactIdentities } from "@/lib/db/contacts";

export async function GET(_request: NextRequest) {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listContactIdentities());
  } catch (error) {
    return handleError(error);
  }
}
