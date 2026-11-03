"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarSync,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  LoaderCircle,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";
import { InvoiceTemplateChooser } from "@/components/billing/invoices/InvoiceTemplateChooser";
import { Pagination } from "@/components/ui/Pagination";
import { BillingLineEditor, emptyBillingLine } from "@/components/billing/shared/BillingLineEditor";
import {
  CustomerBillingProfile,
  customerBillingValue,
  type CustomerBillingValue,
} from "@/components/billing/shared/CustomerBillingProfile";
import { calculateTotals, validateInvoice } from "@/lib/billing-validation";
import { syncCustomerBilling } from "@/lib/customer-billing";
import { apiFetch, buildQuery, jsonBody } from "@/lib/api/client";
import { fmtDay, money, plural } from "@/lib/format";
import type { BillingLineInput, Contact, DocumentTemplate, Invoice, PagedResult, Service } from "@/types/db";

const today = new Date().toISOString().slice(0, 10);
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

const initial = {
  contact_id: "",
  contract_id: "",
  template_id: "",
  invoice_date: today,
  due_date: addDays(today, 7),
  service_period_start: "",
  service_period_end: "",
  currency: "USD",
  contract_reference: "",
  purchase_order_reference: "",
  discount: 0,
  notes: "",
  terms: "",
  payment_instructions: "",
};
const statuses = ["all", "draft", "sent", "partially_paid", "paid", "overdue", "cancelled"];

function customerInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CU";
}
function collectionProgress(invoice: Invoice) {
  if (invoice.total_amount <= 0) return invoice.balance_due <= 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(invoice.amount_paid / invoice.total_amount * 100)));
}
function isInvoiceLate(invoice: Invoice) {
  return invoice.balance_due > 0 && !["paid", "cancelled"].includes(invoice.status) && invoice.due_date < today;
}

export function InvoicesClient() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [result, setResult] = useState<PagedResult<Invoice>>({ rows: [], page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState(initial);
  const [items, setItems] = useState<BillingLineInput[]>([emptyBillingLine()]);
  const [billing, setBilling] = useState<CustomerBillingValue>(customerBillingValue());
  const [open, setOpen] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const invoicePage = await apiFetch<PagedResult<Invoice>>(
        `/api/billing/invoices${buildQuery({ status, page, pageSize })}`,
      );
      setResult(invoicePage);
      setRows(invoicePage.rows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoices could not load.");
    } finally {
      setBusy(false);
    }
  }, [page, pageSize, status]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => calculateTotals(items, form.discount), [items, form.discount]);
  const selectedCustomer = contacts.find((contact) => contact.id === form.contact_id) ?? null;
  const metrics = useMemo(() => ({
    billed: rows.reduce((sum, row) => sum + row.total_amount, 0),
    outstanding: rows.reduce((sum, row) => sum + row.balance_due, 0),
    paid: rows.filter((row) => row.status === "paid").length,
  }), [rows]);

  function chooseCustomer(id: string) {
    const contact = contacts.find((candidate) => candidate.id === id);
    setForm((current) => ({ ...current, contact_id: id }));
    setBilling(customerBillingValue(contact));
  }

  async function startInvoice() {
    setBusy(true);
    setMessage("");
    try {
      let availableTemplates = templates;
      if (!editorReady) {
        const [contactPage, serviceRows, templateRows] = await Promise.all([
          apiFetch<PagedResult<Contact>>("/api/contacts?page=1&pageSize=100&filter=customers"),
          apiFetch<Service[]>("/api/services"),
          apiFetch<DocumentTemplate[]>("/api/billing/templates"),
        ]);
        availableTemplates = templateRows.filter((template) => template.document_type === "invoice");
        setContacts(contactPage.rows);
        setServices(serviceRows);
        setTemplates(availableTemplates);
        setEditorReady(true);
      }
      const preferred = availableTemplates.find((template) => template.is_default) ?? availableTemplates[0];
      setForm({ ...initial, template_id: preferred?.id ?? "" });
      setItems([emptyBillingLine()]);
      setBilling(customerBillingValue());
      setOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice editor data could not load.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.template_id) return setMessage("Choose an invoice template before creating the draft.");
    const issue = validateInvoice({ ...form, items });
    if (issue) return setMessage(issue);
    setBusy(true);
    try {
      await syncCustomerBilling(form.contact_id, billing);
      const { id } = await apiFetch<{ id: string }>("/api/billing/invoices", {
        method: "POST",
        ...jsonBody({ invoice: form, items }),
      });
      setOpen(false);
      window.location.href = `/invoices/${id}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice could not be created.");
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const report = await apiFetch<{ created: unknown[]; skipped: unknown[]; errors: unknown[] }>(
        "/api/billing/invoices/generate",
        { method: "POST", ...jsonBody({ month: `${today.slice(0, 8)}01` }) },
      );
      setMessage(`${report.created.length} created · ${report.skipped.length} skipped · ${report.errors.length} errors`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Monthly generation failed.");
      setBusy(false);
    }
  }

  return (
    <div className="billing-view">
      <section className="stat-grid billing-stat-grid" aria-label="Invoice totals">
        <article className="stat-card"><span className="stat-icon"><ReceiptText size={17} /></span><div><p>Total billed</p><strong>{money(metrics.billed)}</strong><small>{plural(rows.length, "invoice")} in this view</small></div></article>
        <article className="stat-card attention-stat"><span className="stat-icon"><WalletCards size={17} /></span><div><p>Outstanding</p><strong>{money(metrics.outstanding)}</strong><small>still to collect</small></div></article>
        <article className="stat-card"><span className="stat-icon"><CheckCircle2 size={17} /></span><div><p>Paid</p><strong>{metrics.paid}</strong><small>{metrics.paid === 1 ? "settled invoice" : "settled invoices"}</small></div></article>
      </section>

      {message && <div className="page-error" role="status">{message}<button onClick={() => setMessage("")}>Dismiss</button></div>}

      <section className="surface billing-list-surface">
        <header className="surface-toolbar billing-toolbar">
          <div className="toolbar-heading"><p className="eyebrow">Billing ledger</p><h2>Invoices</h2></div>
          <div className="segmented billing-segmented" aria-label="Filter invoices">{statuses.map((item) => <button key={item} className={status === item ? "selected" : ""} onClick={() => { setStatus(item); setPage(1); }}>{item.replace("_", " ")}{status === item && <span>{result.total}</span>}</button>)}</div>
          <button className="button button-secondary" onClick={() => void generate()} disabled={busy}><CalendarSync size={15} /> Generate month</button>
          <button className="button button-primary" onClick={() => void startInvoice()} disabled={busy}><FilePlus2 size={15} /> New invoice</button>
        </header>

        <div className="billing-table-wrap"><table className="billing-table invoice-ledger-table"><thead><tr><th>Document</th><th>Customer</th><th>Schedule</th><th>Status</th><th>Collection</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((row) => {
          const customer = row.contact?.billing_name || row.contact?.name || "Unknown customer";
          const progress = collectionProgress(row);
          const late = isInvoiceLate(row);
          return <tr key={row.id} className={`invoice-row-${row.status}${late ? " invoice-row-late" : ""}`}>
            <td><Link className="invoice-document-cell" href={`/invoices/${row.id}`}><span className="invoice-file-mark"><ReceiptText size={15} /></span><span><strong className="ledger-id">{row.invoice_number}</strong><small>{row.contract_reference || row.purchase_order_reference || "Standalone invoice"}</small></span></Link></td>
            <td><span className="invoice-customer-cell"><span className="customer-monogram" aria-hidden="true">{customerInitials(customer)}</span><span><strong className="ledger-customer">{customer}</strong><small>{row.contact?.billing_contact || row.contact?.email || "Customer account"}</small></span></span></td>
            <td><span className="invoice-date-stack"><span><CalendarDays size={12} />Issued {fmtDay(row.invoice_date)}</span><small className={late ? "due-late" : undefined}>{late ? "Past due" : "Due"} {fmtDay(row.due_date)}</small></span></td>
            <td><span className={`status-pill status-${row.status}`}><i aria-hidden="true" />{row.status.replace("_", " ")}</span></td>
            <td><span className="collection-cell"><span className="collection-amounts tabular-nums"><strong>{money(row.total_amount, row.currency)}</strong><small>{row.balance_due > 0 ? `${money(row.balance_due, row.currency)} due` : "Settled"}</small></span><span className="collection-track" aria-label={`${progress}% collected`}><span style={{ width: `${progress}%` }} /></span><small>{progress}% collected</small></span></td>
            <td><Link className="invoice-open-link" href={`/invoices/${row.id}`} aria-label={`Open ${row.invoice_number}`}>View <ChevronRight size={13} /></Link></td>
          </tr>;
        })}</tbody></table></div>

        <div className="mobile-billing-list" aria-label="Invoices">{rows.map((row) => {
          const customer = row.contact?.billing_name || row.contact?.name || "Unknown customer";
          const progress = collectionProgress(row);
          const late = isInvoiceLate(row);
          return <Link href={`/invoices/${row.id}`} className={`mobile-billing-card mobile-invoice-card invoice-row-${row.status}${late ? " invoice-row-late" : ""}`} key={row.id}><span className="mobile-invoice-top"><span className="invoice-file-mark"><ReceiptText size={14} /></span><span><strong>{row.invoice_number}</strong><small>{customer}</small></span><span className={`status-pill status-${row.status}`}><i aria-hidden="true" />{row.status.replace("_", " ")}</span></span><span className="mobile-collection"><span><small>Collected</small><strong>{money(row.amount_paid, row.currency)}</strong></span><span className="collection-track" aria-label={`${progress}% collected`}><span style={{ width: `${progress}%` }} /></span><em>{progress}%</em></span><span className="mobile-invoice-foot"><small className={late ? "due-late" : undefined}>{late ? "Past due" : "Due"} {fmtDay(row.due_date)}</small><span><small>Balance</small><strong>{money(row.balance_due, row.currency)}</strong><ChevronRight size={14} /></span></span></Link>;
        })}</div>

        {busy && <div className="feed-loading"><LoaderCircle className="spin-icon" size={16} /> Loading…</div>}
        {!busy && !rows.length && <div className="panel-empty billing-panel-empty"><span><ReceiptText size={19} /></span><div><strong>No invoices here</strong><p>Create a draft or generate invoices from active contracts.</p></div></div>}
        {!busy && result.total > 0 && <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} disabled={busy} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      </section>

      {open && <div className="modal-layer"><section className="modal billing-modal" role="dialog" aria-modal="true">
        <header className="modal-header"><div><p className="eyebrow">New invoice</p><h2>Create draft</h2><p className="modal-subtitle">Customer details, services, and document design remain editable.</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></header>
        <form onSubmit={save}>
          <div className="billing-workbench">
            <section className="drawer-section billing-form-panel">
              <div className="section-heading"><div><p className="eyebrow">Invoice details</p><h3>Customer and dates</h3></div></div>
              <div className="form-grid">
                <label className="field span-2"><span>Customer</span><select value={form.contact_id} onChange={(event) => chooseCustomer(event.target.value)} required><option value="">Choose customer</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.billing_name || contact.name}</option>)}</select></label>
                <label className="field"><span>Invoice date</span><input type="date" value={form.invoice_date} onChange={(event) => setForm({ ...form, invoice_date: event.target.value })} /></label>
                <label className="field"><span>Due date</span><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
                <label className="field"><span>Period start</span><input type="date" value={form.service_period_start} onChange={(event) => setForm({ ...form, service_period_start: event.target.value })} /></label>
                <label className="field"><span>Period end</span><input type="date" value={form.service_period_end} onChange={(event) => setForm({ ...form, service_period_end: event.target.value })} /></label>
                <label className="field"><span>Currency</span><input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
                <label className="field"><span>Discount</span><input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} /></label>
                <label className="field"><span>Contract reference</span><input value={form.contract_reference} onChange={(event) => setForm({ ...form, contract_reference: event.target.value })} /></label>
                <label className="field"><span>PO reference</span><input value={form.purchase_order_reference} onChange={(event) => setForm({ ...form, purchase_order_reference: event.target.value })} /></label>
                <InvoiceTemplateChooser templates={templates} value={form.template_id} onChange={(template_id) => setForm({ ...form, template_id })} />
              </div>
            </section>
            <CustomerBillingProfile contact={selectedCustomer} value={billing} onChange={setBilling} />
          </div>

          <section className="drawer-section billing-items-section">
            <div className="section-heading"><div><p className="eyebrow">Line items</p><h3>Services and pricing</h3></div><strong className="section-total">{money(totals.total, form.currency)}</strong></div>
            <BillingLineEditor items={items} services={services} onChange={setItems} />
            <div className="invoice-form-total"><span>Subtotal {money(totals.subtotal, form.currency)}</span><strong>Total {money(totals.total, form.currency)}</strong></div>
          </section>
          <footer className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy || !form.template_id}>{busy ? "Creating…" : "Create draft"}</button></footer>
        </form>
      </section></div>}
    </div>
  );
}
