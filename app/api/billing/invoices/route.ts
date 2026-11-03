import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, intParam } from "@/lib/api/helpers";
import { createInvoice, listInvoicesPage } from "@/lib/db/billing";

export async function GET(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const params = request.nextUrl.searchParams;
    const result = await listInvoicesPage({
      status: params.get("status") ?? undefined,
      page: intParam(params, "page", 1),
      pageSize: intParam(params, "pageSize", 25),
    });
    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(await cookies());
    const body = await readBody(request);
    const id = await createInvoice(session.userId, body.invoice ?? {}, body.items ?? []);
    return jsonResponse({ id });
  } catch (error) {
    return handleError(error);
  }
}
