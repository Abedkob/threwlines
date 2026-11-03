import type {
  AppSettings,
  DashboardSummary,
  NavigationCounts,
  Service,
} from "@/types/db";
import { query, queryCount, queryOne, rpc } from "./query.ts";
import { assertUniqueName } from "./expenses.ts";
import { deleteRow, insertRow, updateRow } from "./shared.ts";

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
}

export async function updateService(id: string, input: ServiceInput) {
  await assertUniqueName("services", input.name, id);
  await updateRow("services", id, { ...input, name: input.name.trim() });
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

const APP_SETTINGS_COLUMNS = [
  "company_name",
  "company_tagline",
  "company_phone",
  "company_email",
  "company_website",
  "logo_url",
  "stamp_url",
  "invoice_prefix",
  "next_invoice_number",
  "invoice_number_padding",
  "default_currency",
  "default_due_days",
  "default_terms",
  "default_footer",
  "default_payment_instructions",
  "cash_enabled",
  "omt_enabled",
  "omt_recipient_name",
  "omt_phone",
  "whish_enabled",
  "whish_recipient_name",
  "whish_phone",
] as const;

export async function saveAppSettings(userId: string, settings: Partial<AppSettings>) {
  const record = settings as Record<string, unknown>;
  const columns = APP_SETTINGS_COLUMNS.filter((column) => record[column] !== undefined);
  const values: unknown[] = columns.map((column) => record[column]);
  values.push(userId);
  const assignments = [...columns.map((column, index) => `${column} = $${index + 1}`), `updated_by = $${values.length}`];
  await query(`update app_settings set ${assignments.join(", ")} where id = 1`, values);
}
