import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSession, jsonResponse, handleError, readBody, pick, intParam } from "@/lib/api/helpers";
import { createExpense, listExpensesPage } from "@/lib/db/expenses";

type ExpenseBody = Parameters<typeof createExpense>[1];

const EXPENSE_FIELDS = ["amount", "category_id", "description", "spent_on", "paid_by"] as const;

export async function GET(request: NextRequest) {
  try {
    await requireSession(await cookies());
    const params = request.nextUrl.searchParams;
    const result = await listExpensesPage({
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
    await createExpense(session.userId, pick<ExpenseBody>(body, EXPENSE_FIELDS));
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
