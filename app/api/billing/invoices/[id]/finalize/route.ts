import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { finalizeInvoice } from "@/lib/db/billing";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    await finalizeInvoice(session.userId, id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
