import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { createExpenseCategory, listExpenseCategories } from "@/lib/db/expenses";

export async function GET(_request: NextRequest) {
  try {
    await requireSession(await cookies());
    return jsonResponse(await listExpenseCategories());
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const body = await readBody(request);
    await createExpenseCategory(String(body.name ?? ""));
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
