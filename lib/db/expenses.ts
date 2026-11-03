import type {
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  PagedResult,
} from "@/types/db";
import { query, queryCount, rpc } from "./query.ts";
import {
  deleteRow,
  insertRow,
  notifyDataChanged,
  pageBounds,
  paged,
  updateRow,
} from "./shared.ts";

type ExpenseInput = {
  amount: number;
  category_id: string;
  description: string | null;
  spent_on: string;
  paid_by: string;
};

export async function listExpensesPage(options: {
  page: number;
  pageSize: number;
}): Promise<PagedResult<Expense>> {
  const bounds = pageBounds(options.page, options.pageSize);
  const total = await queryCount("select count(*) from expenses");
  const { rows } = await query<Expense>(
    `select e.*,
       case when ec.id is null then null
            else json_build_object('id', ec.id, 'name', ec.name) end as category,
       case when p.id is null then null
            else json_build_object('id', p.id, 'name', p.name, 'color', p.color) end as payer
     from expenses e
     left join expense_categories ec on ec.id = e.category_id
     left join profiles p on p.id = e.paid_by
     order by e.spent_on desc, e.id desc
     limit $1 offset $2`,
    [bounds.pageSize, bounds.from],
  );
  return paged(
    rows.map((expense) => ({ ...expense, amount: Number(expense.amount) })),
    total,
    bounds.page,
    bounds.pageSize,
  );
}

export async function getExpenseSummary(): Promise<ExpenseSummary> {
  const data = await rpc<any>("expense_summary");
  return {
    total: Number(data?.total ?? 0),
    categories: (data?.categories ?? []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      total: Number(row.total),
    })),
    payers: (data?.payers ?? []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      total: Number(row.total),
      entries: Number(row.entries),
    })),
  };
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { rows } = await query<ExpenseCategory>(
    "select * from expense_categories order by name",
  );
  return rows;
}

export async function createExpense(userId: string, input: ExpenseInput) {
  await insertRow("expenses", { ...input, created_by: userId }, "id");
  notifyDataChanged();
}

export async function updateExpense(id: string, input: ExpenseInput) {
  await updateRow("expenses", id, input);
  notifyDataChanged();
}

export async function deleteExpense(id: string) {
  await deleteRow("expenses", id);
  notifyDataChanged();
}

export async function assertUniqueName(
  table: "services" | "expense_categories",
  name: string,
  excludeId?: string,
) {
  if (table !== "services" && table !== "expense_categories")
    throw new Error("Invalid table.");
  const params: unknown[] = [name.trim()];
  let sql = `select count(*) from ${table} where lower(name) = lower($1)`;
  if (excludeId) {
    params.push(excludeId);
    sql += " and id <> $2";
  }
  if ((await queryCount(sql, params)) > 0)
    throw new Error(`"${name.trim()}" already exists.`);
}

export async function createExpenseCategory(name: string) {
  await assertUniqueName("expense_categories", name);
  await insertRow("expense_categories", { name: name.trim() }, "id");
  notifyDataChanged();
}

export async function updateExpenseCategory(id: string, name: string) {
  await assertUniqueName("expense_categories", name, id);
  await updateRow("expense_categories", id, { name: name.trim() });
  notifyDataChanged();
}

export async function deleteExpenseCategory(id: string) {
  const categoryCount = await queryCount("select count(*) from expense_categories");
  if (categoryCount <= 1) throw new Error("Keep at least one expense category.");
  const used = await queryCount(
    "select count(*) from expenses where category_id = $1",
    [id],
  );
  if (used)
    throw new Error("This category is used by an expense and cannot be deleted.");
  await deleteRow("expense_categories", id);
  notifyDataChanged();
}
