import type {
  BillingLineInput,
  ClientContract,
  DocumentTemplate,
  Invoice,
  InvoicePaymentMethod,
  InvoicePaymentRecord,
  PagedResult,
} from "@/types/db";
import { query, queryOne, rpc } from "./query.ts";
import { deleteRow, pageBounds, paged } from "./shared.ts";
import { invalidateBrowserQueries } from "../query-cache.ts";

function notifyBillingChanged() {
  if (typeof window === "undefined") return;
  invalidateBrowserQueries();
  window.dispatchEvent(new Event("idevelopit-vault:billing-changed"));
  window.dispatchEvent(new Event("idevelopit-vault:data-changed"));
}

const CONTACT_SUMMARY = "json_build_object('id', c.id, 'name', c.name, 'billing_name', c.billing_name)";
const CONTACT_FULL = `json_build_object('id', c.id, 'name', c.name, 'billing_name', c.billing_name,
  'billing_contact', c.billing_contact, 'billing_address', c.billing_address,
  'email', c.email, 'whatsapp', c.whatsapp)`;
const INVOICE_NUMERIC = ["subtotal", "discount", "total_amount", "amount_paid", "balance_due"];

export function numbers<T extends Record<string, any>>(row: T, keys: string[]): T {
  const copy = { ...row };
  keys.forEach((key) => {
    if (key in copy) copy[key as keyof T] = Number(copy[key]) as T[keyof T];
  });
  return copy;
}

export function withEffectiveInvoiceStatus<T extends Invoice>(invoice: T): T {
  const today = new Date().toISOString().slice(0, 10);
  if (
    invoice.balance_due > 0 &&
    invoice.due_date < today &&
    (invoice.status === "sent" || invoice.status === "partially_paid")
  ) {
    return { ...invoice, status: "overdue" };
  }
  return invoice;
}

// Storage moves in a separate task; these stay as stubs until then.
export async function uploadCompanyAsset(_kind: "logo" | "stamp", _file: File): Promise<string> {
  throw new Error("Not yet migrated");
}

export async function signedAssetUrl(_path?: string | null): Promise<string | null> {
  throw new Error("Not yet migrated");
}

export async function listTemplates() {
  const { rows } = await query<DocumentTemplate>(
    "select * from document_templates order by document_type, name",
  );
  return rows;
}

export async function saveTemplate(userId: string, template: Partial<DocumentTemplate>, id?: string | null) {
  const result = await rpc<string>("save_document_template", [userId, template, id ?? null]);
  invalidateBrowserQueries(["reference:templates"]);
  return result;
}

export async function deleteTemplate(template: DocumentTemplate) {
  if (template.is_default) throw new Error("Choose another default before deleting this template.");
  await deleteRow("document_templates", template.id);
  invalidateBrowserQueries(["reference:templates"]);
}

export async function listContracts() {
  const { rows } = await query<any>(
    `select ct.*,
       ${CONTACT_SUMMARY} as contact,
       coalesce((select json_agg(ci.* order by ci.sort_order) from contract_items ci where ci.contract_id = ct.id), '[]'::json) as items
     from client_contracts ct
     left join contacts c on c.id = ct.contact_id
     order by ct.created_at desc`,
  );
  return rows.map((row) => ({
    ...row,
    items: (row.items ?? []).map((item: any) => numbers(item, ["quantity", "unit_price"])),
  })) as ClientContract[];
}

export async function saveContract(
  userId: string,
  contract: Record<string, unknown>,
  items: BillingLineInput[],
  id?: string | null,
) {
  return rpc<string>("save_contract", [userId, contract, items, id ?? null]);
}

export async function createInvoice(
  userId: string,
  invoice: Record<string, unknown>,
  items: BillingLineInput[],
) {
  const result = await rpc<string>("create_invoice", [userId, invoice, items]);
  notifyBillingChanged();
  return result;
}

export async function updateInvoice(
  userId: string,
  id: string,
  invoice: Record<string, unknown>,
  items: BillingLineInput[],
) {
  await rpc("admin_update_invoice", [userId, id, invoice, items]);
  notifyBillingChanged();
}

export async function deleteInvoice(userId: string, id: string) {
  await rpc("delete_invoice", [userId, id]);
  notifyBillingChanged();
}

export async function cancelInvoice(userId: string, id: string) {
  await rpc("cancel_invoice", [userId, id]);
  notifyBillingChanged();
}

export async function createInvoiceFromContract(
  userId: string,
  contractId: string,
  start: string,
  end: string,
) {
  return rpc<string>("create_invoice_from_contract", [userId, contractId, start, end]);
}

export async function generateMonthlyInvoices(userId: string, month: string) {
  return rpc<{ created: unknown[]; skipped: unknown[]; errors: unknown[] }>(
    "generate_monthly_invoices",
    [userId, month],
  );
}

export async function listInvoicesPage(options: {
  status?: string;
  page: number;
  pageSize: number;
}): Promise<PagedResult<Invoice>> {
  const { page, pageSize, from } = pageBounds(options.page, options.pageSize);
  const today = new Date().toISOString().slice(0, 10);
  const params: unknown[] = [];
  let where = "";
  if (options.status === "overdue") {
    params.push(today);
    where = "where ib.status in ('sent', 'partially_paid', 'overdue') and ib.due_date < $1 and ib.balance_due > 0";
  } else if (options.status === "sent" || options.status === "partially_paid") {
    params.push(options.status, today);
    where = "where ib.status = $1 and ib.due_date >= $2";
  } else if (options.status && options.status !== "all") {
    params.push(options.status);
    where = "where ib.status = $1";
  }
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  const { rows } = await query<any>(
    `select ib.*, ${CONTACT_SUMMARY} as contact, count(*) over() as total_count
     from invoice_balances ib
     left join contacts c on c.id = ib.contact_id
     ${where}
     order by ib.created_at desc
     limit $${limitParam} offset $${offsetParam}`,
    [...params, pageSize, from],
  );
  let total = Number(rows[0]?.total_count ?? 0);
  if (!rows.length && from > 0) {
    const counted = await queryOne<{ count: string }>(
      `select count(*) from invoice_balances ib ${where}`,
      params,
    );
    total = Number(counted?.count ?? 0);
  }
  const invoices = rows.map(({ total_count: _count, ...row }) =>
    withEffectiveInvoiceStatus(numbers(row, INVOICE_NUMERIC) as Invoice),
  );
  return paged(invoices, total, page, pageSize);
}

export async function getInvoice(id: string) {
  const row = await queryOne<any>(
    `select ib.*, ${CONTACT_FULL} as contact,
       coalesce((select json_agg(ii.* order by ii.sort_order) from invoice_items ii where ii.invoice_id = ib.id), '[]'::json) as items,
       coalesce((select json_agg(ip.*) from invoice_payments ip where ip.invoice_id = ib.id), '[]'::json) as invoice_payments,
       row_to_json(dt.*) as template
     from invoice_balances ib
     left join contacts c on c.id = ib.contact_id
     left join document_templates dt on dt.id = ib.template_id
     where ib.id = $1`,
    [id],
  );
  if (!row) throw new Error("Invoice not found.");
  const invoice = withEffectiveInvoiceStatus(numbers(row, INVOICE_NUMERIC) as Invoice);
  invoice.items = (invoice.items ?? [])
    .map((item: any) => numbers(item, ["quantity", "unit_price", "line_total"]))
    .sort((a: any, b: any) => a.sort_order - b.sort_order);
  invoice.invoice_payments = (invoice.invoice_payments ?? []).map((payment: any) =>
    numbers(payment, ["amount"]),
  );
  return invoice;
}

export async function finalizeInvoice(userId: string, id: string) {
  await rpc("finalize_invoice", [userId, id]);
  notifyBillingChanged();
}

export async function recordInvoicePayment(
  userId: string,
  input: {
    invoiceId: string;
    amount: number;
    method: InvoicePaymentMethod;
    paidOn: string;
    transactionReference?: string;
    notes?: string;
  },
) {
  await rpc("record_invoice_payment", [
    userId,
    input.invoiceId,
    input.amount,
    input.method,
    input.paidOn,
    input.transactionReference || null,
    input.notes || null,
  ]);
  notifyBillingChanged();
}

export async function listContactInvoiceLedger(contactId: string) {
  const { rows } = await query<any>(
    `select ib.*,
       coalesce((select json_agg(ip.*) from invoice_payments ip where ip.invoice_id = ib.id), '[]'::json) as invoice_payments
     from invoice_balances ib
     where ib.contact_id = $1 and ib.finalized_at is not null
     order by ib.invoice_date desc, ib.created_at desc
     limit 100`,
    [contactId],
  );
  return rows.map((row) =>
    withEffectiveInvoiceStatus({
      ...numbers(row, INVOICE_NUMERIC),
      invoice_payments: (row.invoice_payments ?? []).map((payment: any) =>
        numbers(payment, ["amount"]),
      ),
    } as Invoice),
  ) as Invoice[];
}

export async function listInvoicePaymentRecords() {
  const { rows } = await query<any>(
    `select ip.*,
       json_build_object(
         'id', i.id, 'invoice_number', i.invoice_number, 'contact_id', i.contact_id,
         'status', i.status, 'currency', i.currency, 'total_amount', i.total_amount,
         'contact', json_build_object('id', c.id, 'name', c.name, 'billing_name', c.billing_name,
           'email', c.email, 'whatsapp', c.whatsapp)
       ) as invoice
     from invoice_payments ip
     join invoices i on i.id = ip.invoice_id
     join contacts c on c.id = i.contact_id
     order by ip.paid_on desc, ip.created_at desc
     limit 500`,
  );
  return rows.map((row) => numbers(row, ["amount"])) as InvoicePaymentRecord[];
}

export async function listPaymentInvoices() {
  const { rows } = await query<any>(
    `select ib.*, ${CONTACT_FULL} as contact
     from invoice_balances ib
     left join contacts c on c.id = ib.contact_id
     order by ib.invoice_date desc
     limit 500`,
  );
  return rows.map((row) =>
    withEffectiveInvoiceStatus(numbers(row, INVOICE_NUMERIC) as Invoice),
  ) as Invoice[];
}
