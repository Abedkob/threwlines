import type {
  AppSettings,
  DashboardSummary,
  NavigationCounts,
  Service,
} from "@/types/db";
import { query, queryCount, queryOne, rpc } from "./query.ts";
import { assertUniqueName } from "./expenses.ts";
import { deleteRow, insertRow, notifyDataChanged, updateRow } from "./shared.ts";

type ServiceInput = Pick<
  Service,
  "name" | "description" | "default_quantity" | "default_price" | "active"
>;

export async function listServices(): Promise<Service[]> {
  const { rows } = await query<Service>("select * from services order by name");
  return rows.map((service) => ({
    ...service,
    default_price: Number(service.default_price),
    default_quantity: Number(service.default_quantity),
  }));
}

export async function createService(input: ServiceInput) {
  await assertUniqueName("services", input.name);
  await insertRow("services", { ...input, name: input.name.trim() }, "id");
  notifyDataChanged();
}

export async function updateService(id: string, input: ServiceInput) {
  await assertUniqueName("services", input.name, id);
  await updateRow("services", id, { ...input, name: input.name.trim() });
  notifyDataChanged();
}

export async function deleteService(id: string) {
  const usages = await Promise.all(
    [
      "select count(*) from payments where service_id = $1",
      "select count(*) from contract_items where service_id = $1",
      "select count(*) from invoice_items where service_id = $1",
    ].map((sql) => queryCount(sql, [id])),
  );
  if (usages.some((count) => count > 0))
    throw new Error(
      "This service is already in financial history. Mark it inactive instead.",
    );
  await deleteRow("services", id);
  notifyDataChanged();
}

export async function getNavigationCounts(): Promise<NavigationCounts> {
  const data = await rpc<any>("navigation_counts");
  return {
    stale_contacts: Number(data?.stale_contacts ?? 0),
    open_tasks: Number(data?.open_tasks ?? 0),
  };
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [data, billing] = await Promise.all([
    rpc<any>("dashboard_summary", [userId]),
    query<{ amount_paid: unknown; balance_due: unknown }>(
      `select amount_paid, balance_due from invoice_balances
       where finalized_at is not null and status <> 'cancelled'`,
    ),
  ]);
  const billingRows = billing.rows;
  return {
    need_attention: Number(data?.need_attention ?? 0),
    active_pipeline: Number(data?.active_pipeline ?? 0),
    negotiating: Number(data?.negotiating ?? 0),
    collected: billingRows.reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0),
    pending: billingRows.reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0),
    spent: Number(data?.spent ?? 0),
    my_open_tasks: Number(data?.my_open_tasks ?? 0),
    pipeline_counts: data?.pipeline_counts ?? {},
    expense_categories: (data?.expense_categories ?? []).map((row: any) => ({
      name: String(row.name),
      total: Number(row.total),
    })),
  };
}

export async function getAppSettings(): Promise<AppSettings | null> {
  return queryOne<AppSettings>("select * from app_settings where id = 1");
}
