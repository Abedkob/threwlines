import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { saveLicensedProduct } from "@/lib/db/licensing";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await saveLicensedProduct(session.userId, body, id);
    return jsonResponse({ id });
  } catch (error) {
    return handleError(error);
  }
}
