import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { listLicenses } from "@/lib/db/licensing";

export async function GET() {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listLicenses());
  } catch (error) {
    return handleError(error);
  }
}
