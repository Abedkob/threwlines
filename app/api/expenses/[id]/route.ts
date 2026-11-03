import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick } from "@/lib/api/helpers";
import { deleteExpense, updateExpense } from "@/lib/db/expenses";

type ExpenseBody = Parameters<typeof updateExpense>[1];

const EXPENSE_FIELDS = ["amount", "category_id", "description", "spent_on", "paid_by"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    const body = await readBody(request);
    await updateExpense(id, pick<ExpenseBody>(body, EXPENSE_FIELDS));
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(await cookies());
    const { id } = await params;
    await deleteExpense(id);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
