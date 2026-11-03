import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { createInvoiceFromContract } from "@/lib/db/billing";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    const invoiceId = await createInvoiceFromContract(session.userId, id, body.start, body.end);
    return jsonResponse({ id: invoiceId });
  } catch (error) {
    return handleError(error);
  }
}
