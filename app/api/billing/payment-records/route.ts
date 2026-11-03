import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError } from "@/lib/api/helpers";
import { listInvoicePaymentRecords } from "@/lib/db/billing";

export async function GET() {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listInvoicePaymentRecords());
  } catch (error) {
    return handleError(error);
  }
}
