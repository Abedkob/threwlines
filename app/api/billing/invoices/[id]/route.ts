import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";

// The protected SQL function enforces superadmin; this allowlist stops any
// other column riding along in the request body.
const INVOICE_FIELDS = [
  "contact_id",
  "contract_id",
  "template_id",
  "invoice_date",
  "due_date",
  "service_period_start",
  "service_period_end",
  "currency",
  "contract_reference",
  "purchase_order_reference",
  "discount",
  "notes",
  "terms",
  "payment_instructions",
] as const;
import { deleteInvoice, getInvoice, updateInvoice } from "@/lib/db/billing";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    return jsonResponse(await getInvoice(id));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await updateInvoice(session.userId, id, pick(body.invoice ?? {}, INVOICE_FIELDS), body.items ?? []);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(await cookies());
    const { id } = await params;
    await deleteInvoice(session.userId, id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
