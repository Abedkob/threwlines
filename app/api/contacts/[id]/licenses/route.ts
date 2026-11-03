import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { listContactLicenses } from "@/lib/db/licensing";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    return jsonResponse(await listContactLicenses(id));
  } catch (error) {
    return handleError(error);
  }
}
