import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { saveContract } from "@/lib/db/billing";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await saveContract(session.userId, body.contract ?? {}, body.items ?? [], id);
    return jsonResponse({ id });
  } catch (error) {
    return handleError(error);
  }
}
