import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { generateMonthlyInvoices } from "@/lib/db/billing";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    return jsonResponse(await generateMonthlyInvoices(session.userId, body.month));
  } catch (error) {
    return handleError(error);
  }
}
