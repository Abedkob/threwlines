import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, intParam, cursorParam, pick } from "@/lib/api/helpers";
import { addPayment, listContactPayments } from "@/lib/db/contacts";
import type { NewPaymentInput } from "@/types/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const search = request.nextUrl.searchParams;
    const limit = Math.min(intParam(search, "limit", 20), 100);
    return jsonResponse(await listContactPayments(id, cursorParam(search), limit));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    const input = pick<Omit<NewPaymentInput, "contact_id">>(body, [
      "service_id",
      "custom_description",
      "amount",
      "status",
      "paid_on",
    ]);
    const payment = await addPayment({ ...input, contact_id: id } as NewPaymentInput);
    return jsonResponse(payment, 201);
  } catch (error) {
    return handleError(error);
  }
}
