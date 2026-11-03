import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { recordInvoicePayment } from "@/lib/db/billing";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await recordInvoicePayment(session.userId, {
      invoiceId: id,
      amount: Number(body.amount),
      method: body.method,
      paidOn: body.paidOn,
      transactionReference: body.transactionReference,
      notes: body.notes,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
