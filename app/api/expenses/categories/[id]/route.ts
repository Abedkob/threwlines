import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody } from "@/lib/api/helpers";
import { deleteExpenseCategory, updateExpenseCategory } from "@/lib/db/expenses";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await updateExpenseCategory(id, String(body.name ?? ""));
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    await deleteExpenseCategory(id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
