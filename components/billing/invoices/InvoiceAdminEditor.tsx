"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save, ShieldCheck, X } from "lucide-react";
import { BillingLineEditor } from "@/components/billing/shared/BillingLineEditor";
import {
  CustomerBillingProfile,
  customerBillingValue,
  type CustomerBillingValue,
} from "@/components/billing/shared/CustomerBillingProfile";
import { calculateTotals, validateInvoice } from "@/lib/billing-validation";
import { syncCustomerBilling } from "@/lib/customer-billing";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { money } from "@/lib/format";
import type {
  BillingLineInput,
  Contact,
  DocumentTemplate,
  Invoice,
  PagedResult,
  Service,
} from "@/types/db";

type Props = {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function InvoiceAdminEditor({ invoice, onClose, onSaved }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [items, setItems] = useState<BillingLineInput[]>(
    invoice.items?.map((item) => ({ ...item })) ?? [],
  );
  const [billing, setBilling] = useState<CustomerBillingValue>(
    customerBillingValue(invoice.contact),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    contact_id: invoice.contact_id,
    contract_id: invoice.contract_id ?? "",
    template_id: invoice.template_id ?? "",
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,
    service_period_start: invoice.service_period_start ?? "",
    service_period_end: invoice.service_period_end ?? "",
    currency: invoice.currency,
    contract_reference: invoice.contract_reference ?? "",
    purchase_order_reference: invoice.purchase_order_reference ?? "",
    discount: invoice.discount,
    notes: invoice.notes ?? "",
    terms: invoice.terms ?? "",
    payment_instructions: invoice.payment_instructions ?? "",
  });
  const totals = useMemo(
    () => calculateTotals(items, form.discount),
    [form.discount, items],
  );

  useEffect(() => {
    void Promise.all([
      apiFetch<Service[]>("/api/services"),
      apiFetch<PagedResult<Contact>>("/api/contacts?page=1&pageSize=100&filter=customers"),
      apiFetch<DocumentTemplate[]>("/api/billing/templates"),
    ])
      .then(([serviceRows, contactPage, templateRows]) => {
        setServices(serviceRows);
        setContacts(contactPage.rows);
        setTemplates(
          templateRows.filter((template) => template.document_type === "invoice"),
        );
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  function chooseCustomer(id: string) {
    const contact = contacts.find((candidate) => candidate.id === id);
    setForm((current) => ({ ...current, contact_id: id }));
    setBilling(customerBillingValue(contact));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const issue = validateInvoice({ ...form, items });
    if (issue) return setMessage(issue);
    if (totals.total < invoice.amount_paid) {
      return setMessage(
        `The revised total cannot be below ${money(invoice.amount_paid, invoice.currency)}, because that amount has already been received.`,
      );
    }
    setBusy(true);
    try {
      await syncCustomerBilling(form.contact_id, billing);
      await apiFetch(`/api/billing/invoices/${invoice.id}`, {
        method: "PATCH",
        ...jsonBody({ invoice: form, items }),
      });
      await onSaved();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice changes could not save.");
    } finally {
      setBusy(false);
    }
  }

  const selectedContact =
    contacts.find((contact) => contact.id === form.contact_id) ?? invoice.contact;

  return (
    <div
      className="modal-layer invoice-admin-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal invoice-admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-editor-title"
      >
        <header className="modal-header invoice-admin-header">
          <div className="invoice-admin-heading">
            <span className="admin-shield"><ShieldCheck size={18} /></span>
            <div>
              <p className="eyebrow">Superadmin revision</p>
              <h2 id="invoice-editor-title">Edit {invoice.invoice_number}</h2>
              <p className="modal-subtitle">
                Update the customer, schedule, terms, and billed services.
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close editor">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={save}>
          <div className="admin-revision-strip">
            <span className={`status-pill status-${invoice.status}`}>
              {invoice.status.replace("_", " ")}
            </span>
            <div><small>Current total</small><strong>{money(invoice.total_amount, invoice.currency)}</strong></div>
            <div><small>Revised total</small><strong>{money(totals.total, form.currency)}</strong></div>
            <div><small>Already received</small><strong>{money(invoice.amount_paid, invoice.currency)}</strong></div>
          </div>

          {invoice.finalized_at && (
            <div className="admin-revision-note">
              <AlertTriangle size={16} />
              <p><strong>This invoice is finalized.</strong> Saving creates an administrative revision. Recorded payments remain attached and the customer/template snapshot is refreshed.</p>
            </div>
          )}

          <div className="billing-workbench invoice-admin-workbench">
            <section className="drawer-section billing-form-panel">
              <div className="section-heading"><div><p className="eyebrow">Invoice record</p><h3>Customer and schedule</h3></div></div>
              <div className="form-grid">
                <label className="field span-2"><span>Customer</span><select value={form.contact_id} onChange={(event) => chooseCustomer(event.target.value)} required>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.billing_name || contact.name}</option>)}</select></label>
                <label className="field"><span>Template</span><select value={form.template_id} onChange={(event) => setForm({ ...form, template_id: event.target.value })}><option value="">Default template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                <label className="field"><span>Currency</span><input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
                <label className="field"><span>Invoice date</span><input type="date" value={form.invoice_date} onChange={(event) => setForm({ ...form, invoice_date: event.target.value })} /></label>
                <label className="field"><span>Due date</span><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
                <label className="field"><span>Period start</span><input type="date" value={form.service_period_start} onChange={(event) => setForm({ ...form, service_period_start: event.target.value })} /></label>
                <label className="field"><span>Period end</span><input type="date" value={form.service_period_end} onChange={(event) => setForm({ ...form, service_period_end: event.target.value })} /></label>
                <label className="field"><span>Contract reference</span><input value={form.contract_reference} onChange={(event) => setForm({ ...form, contract_reference: event.target.value })} /></label>
                <label className="field"><span>PO reference</span><input value={form.purchase_order_reference} onChange={(event) => setForm({ ...form, purchase_order_reference: event.target.value })} /></label>
                <label className="field"><span>Discount</span><input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} /></label>
                <label className="field"><span>Internal notes</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                <label className="field span-2"><span>Payment instructions</span><textarea rows={2} value={form.payment_instructions} onChange={(event) => setForm({ ...form, payment_instructions: event.target.value })} /></label>
                <label className="field span-2"><span>Terms</span><textarea rows={2} value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} /></label>
              </div>
            </section>
            <CustomerBillingProfile contact={selectedContact} value={billing} onChange={setBilling} />
          </div>

          <section className="drawer-section billing-items-section invoice-admin-lines">
            <div className="section-heading"><div><p className="eyebrow">Financial revision</p><h3>Services and pricing</h3></div><strong className="section-total">{money(totals.total, form.currency)}</strong></div>
            <BillingLineEditor items={items} services={services} onChange={setItems} />
          </section>

          {message && <div className="drawer-error invoice-admin-error" role="alert">{message}</div>}
          <footer className="modal-actions invoice-admin-footer">
            <span><ShieldCheck size={14} /> Restricted to superadmins</span>
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button className="button button-primary" disabled={busy}><Save size={15} /> {busy ? "Saving…" : "Save revision"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
