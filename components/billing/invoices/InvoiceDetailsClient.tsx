"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LoaderCircle,
  PencilLine,
  Printer,
  ReceiptText,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { InvoiceAdminEditor } from "@/components/billing/invoices/InvoiceAdminEditor";
import { InvoiceDocument } from "@/components/billing/invoices/InvoiceDocument";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, assetUrl, jsonBody } from "@/lib/api/client";
import { money } from "@/lib/format";
import type {
  AppSettings,
  Invoice,
  InvoicePaymentMethod,
} from "@/types/db";

export function InvoiceDetailsClient({ id }: { id: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const role = useAuth().user.role;
  const [assets, setAssets] = useState({ logo: null as string | null, stamp: null as string | null });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [payment, setPayment] = useState({
    amount: "",
    paidOn: new Date().toISOString().slice(0, 10),
    method: "cash" as InvoicePaymentMethod,
    reference: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [row, company] = await Promise.all([
        apiFetch<Invoice>(`/api/billing/invoices/${id}`),
        apiFetch<AppSettings | null>("/api/billing/settings"),
      ]);
      setInvoice(row);
      setSettings(company);
      const snapshot = (row.company_snapshot ?? {}) as Record<string, string>;
      setAssets({
        logo: assetUrl(row.finalized_at ? snapshot.logoUrl : company?.logo_url),
        stamp: assetUrl(row.finalized_at ? snapshot.stampUrl : company?.stamp_url),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice could not load.");
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const paymentProgress = useMemo(
    () => invoice?.total_amount
      ? Math.min(100, (invoice.amount_paid / invoice.total_amount) * 100)
      : 0,
    [invoice],
  );
  const isSuperadmin = role === "superadmin";
  const canAcceptPayment =
    isSuperadmin &&
    !["draft", "cancelled"].includes(invoice?.status ?? "draft") &&
    (invoice?.balance_due ?? 0) > 0;

  async function finalize() {
    setBusy(true);
    try {
      await apiFetch(`/api/billing/invoices/${id}/finalize`, { method: "POST" });
      setMessage("Invoice finalized. Company, client and template details are frozen.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice could not be finalized.");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm(`Cancel ${invoice?.invoice_number}? This keeps the record and prevents new payments.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/billing/invoices/${id}/cancel`, { method: "POST" });
      setMessage("Invoice cancelled.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice could not be cancelled.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!invoice || deleteConfirmation !== invoice.invoice_number) return;
    setBusy(true);
    try {
      await apiFetch(`/api/billing/invoices/${invoice.id}`, { method: "DELETE" });
      router.replace("/invoices");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invoice could not be deleted.");
      setDeleting(false);
      setBusy(false);
    }
  }

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!invoice) return;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setMessage("Enter a payment greater than zero.");
    if (amount > invoice.balance_due) return setMessage("Payment exceeds the remaining balance.");
    setBusy(true);
    try {
      await apiFetch(`/api/billing/invoices/${id}/payments`, {
        method: "POST",
        ...jsonBody({
          amount,
          method: payment.method,
          paidOn: payment.paidOn,
          transactionReference: payment.reference,
          notes: payment.notes,
        }),
      });
      setPayment({ ...payment, amount: "", reference: "", notes: "" });
      setMessage("Payment recorded.");
      await load();
      setPaymentOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not save.");
      setBusy(false);
    }
  }

  if (!invoice) {
    return <div className="surface loading-state">{busy && <LoaderCircle className="spin-icon" />}{message || "Loading invoice…"}</div>;
  }

  return (
    <main className="page-stack invoice-detail-page">
      <header className="surface invoice-detail-header no-print" data-number={invoice.invoice_number}>
        <div className="invoice-detail-title">
          <Link href="/invoices" className="invoice-back"><ArrowLeft size={16} /> Invoices</Link>
          <div>
            <p className="eyebrow">Document control</p>
            <h1>{invoice.invoice_number}</h1>
            <div className="invoice-detail-meta">
              <span className={`status-pill status-${invoice.status}`}>{invoice.status.replace("_", " ")}</span>
              <span>{invoice.contact?.billing_name || invoice.contact?.name}</span>
              <span>Issued {invoice.invoice_date}</span>
            </div>
          </div>
        </div>
        <div className="invoice-detail-actions">
          {isSuperadmin && (
            <div className="invoice-admin-actions">
              <span className="admin-access-label" title="These controls are restricted to superadmins"><ShieldCheck size={13} /> Superadmin</span>
              <button className="button button-secondary" onClick={() => setEditing(true)} disabled={busy}><PencilLine size={15} /> Edit</button>
              <button className="button invoice-delete-trigger" onClick={() => { setDeleteConfirmation(""); setDeleting(true); }} disabled={busy}><Trash2 size={15} /> Delete</button>
            </div>
          )}
          <div className="invoice-lifecycle-actions">
            {isSuperadmin && <button className="button invoice-payment-trigger" onClick={() => setPaymentOpen(true)} disabled={busy || !canAcceptPayment} title={!canAcceptPayment ? invoice.status === "draft" ? "Finalize this invoice before recording a payment" : invoice.status === "cancelled" ? "Cancelled invoices cannot accept payments" : "This invoice has no remaining balance" : "Record a payment against this invoice"}><Banknote size={16} /> Add payment</button>}
            {isSuperadmin && invoice.status === "draft" && <button className="button button-primary" onClick={() => void finalize()} disabled={busy}><FileCheck2 size={16} /> Finalize</button>}
            {isSuperadmin && !["paid", "cancelled"].includes(invoice.status) && <button className="button button-danger" onClick={() => void cancel()} disabled={busy}><XCircle size={16} /> Cancel</button>}
            <button className="button button-secondary" onClick={() => window.print()}><Printer size={16} /> Print / PDF</button>
          </div>
        </div>
      </header>

      {message && <div className="drawer-error no-print" role="status">{message}</div>}

      <section className="invoice-balance-strip no-print" aria-label="Invoice totals">
        <article><CircleDollarSign size={18} /><span>Invoice total</span><strong>{money(invoice.total_amount, invoice.currency)}</strong></article>
        <article><CheckCircle2 size={18} /><span>Received</span><strong>{money(invoice.amount_paid, invoice.currency)}</strong></article>
        <article className="balance-due-card"><Clock3 size={18} /><span>Balance due</span><strong>{money(invoice.balance_due, invoice.currency)}</strong></article>
        <article><CalendarDays size={18} /><span>Due date</span><strong>{invoice.due_date}</strong></article>
      </section>

      <section className="invoice-preview-stage">
        <div className="preview-stage-label no-print"><span>Live document preview</span><span>{invoice.finalized_at ? "Historical snapshot" : "Uses live customer and company data"}</span></div>
        <InvoiceDocument invoice={invoice} liveSettings={settings} logoUrl={assets.logo} stampUrl={assets.stamp} />
      </section>

      <section className="payment-workspace no-print">
        <div className="surface receipt-history">
          <header><div><p className="eyebrow">Receipt trail</p><h2>Payment history</h2></div><div className="receipt-header-actions"><span>{invoice.invoice_payments?.length ?? 0} receipts</span>{isSuperadmin && <button className="button button-secondary receipt-add-button" onClick={() => setPaymentOpen(true)} disabled={!canAcceptPayment}><Banknote size={14} /> Add payment</button>}</div></header>
          <div className="payment-progress"><div style={{ width: `${paymentProgress}%` }} /><span>{Math.round(paymentProgress)}% collected</span></div>
          {invoice.invoice_payments?.length ? (
            <div className="receipt-timeline">{invoice.invoice_payments.map((receipt, index) => <article key={receipt.id}><span className="receipt-node"><ReceiptText size={13} /></span><div><strong>{receipt.payment_method.toUpperCase()}</strong><small>{receipt.paid_on}{receipt.transaction_reference ? ` · Ref ${receipt.transaction_reference}` : ""}</small>{receipt.notes && <p>{receipt.notes}</p>}</div><b>{money(receipt.amount, invoice.currency)}</b><em>#{String(index + 1).padStart(2, "0")}</em></article>)}</div>
          ) : (
            <div className="panel-empty compact-empty"><Banknote size={22} /><strong>No payments yet</strong><p>Record the first receipt when money arrives.</p></div>
          )}
        </div>

        <div className="payment-capture">
          <header><p className="eyebrow">Collection control</p><h2>{invoice.balance_due <= 0 ? "Invoice settled" : invoice.status === "draft" ? "Awaiting finalization" : invoice.status === "cancelled" ? "Invoice cancelled" : "Ready for payment"}</h2><p>{invoice.balance_due <= 0 ? "The full invoice balance has been received." : invoice.status === "draft" ? "Finalize the draft before recording money received." : invoice.status === "cancelled" ? "Cancelled invoices cannot accept new payments." : `${money(invoice.balance_due, invoice.currency)} remains to be collected.`}</p></header>
          <div className="payment-action-card"><span className="payment-action-icon"><Banknote size={19} /></span><div><strong>{canAcceptPayment ? "Record money received" : "Payment entry unavailable"}</strong><p>{canAcceptPayment ? "Create a dated receipt and update the invoice balance." : !isSuperadmin ? "Only a superadmin can record financial activity." : "The current invoice status does not allow another payment."}</p></div>{isSuperadmin && <button className="button button-primary" onClick={() => setPaymentOpen(true)} disabled={!canAcceptPayment}>Add payment</button>}</div>
          {!isSuperadmin && invoice.balance_due > 0 && <div className="admin-locked-note"><ShieldCheck size={16} /><div><strong>Superadmin control</strong><p>Only a superadmin can record or change financial activity.</p></div></div>}
        </div>
      </section>

      {editing && <InvoiceAdminEditor invoice={invoice} onClose={() => setEditing(false)} onSaved={async () => { await load(); setMessage("Invoice revision saved."); }} />}

      {paymentOpen && canAcceptPayment && (
        <div className="modal-layer invoice-payment-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPaymentOpen(false)}>
          <section className="modal invoice-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
            <header className="modal-header invoice-payment-header">
              <div className="invoice-payment-heading"><span><Banknote size={19} /></span><div><p className="eyebrow">New receipt</p><h2 id="payment-modal-title">Add payment</h2><p className="modal-subtitle">Record money received for {invoice.invoice_number}.</p></div></div>
              <button className="icon-button" onClick={() => setPaymentOpen(false)} aria-label="Close payment form"><X size={18} /></button>
            </header>
            <form onSubmit={pay}>
              <div className="payment-balance-summary">
                <div><small>Invoice total</small><strong>{money(invoice.total_amount, invoice.currency)}</strong></div>
                <div><small>Already received</small><strong>{money(invoice.amount_paid, invoice.currency)}</strong></div>
                <div className="payment-balance-due"><small>Balance due</small><strong>{money(invoice.balance_due, invoice.currency)}</strong></div>
              </div>
              <div className="payment-modal-fields">
                <label className="field payment-amount-field"><span>Amount received</span><div className="payment-amount-control"><input autoFocus type="number" min="0.01" step="0.01" max={invoice.balance_due} value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} placeholder="0.00" required /><button type="button" onClick={() => setPayment({ ...payment, amount: String(invoice.balance_due) })}>Use full balance</button></div></label>
                <label className="field"><span>Payment date</span><input type="date" value={payment.paidOn} onChange={(event) => setPayment({ ...payment, paidOn: event.target.value })} required /></label>
                <label className="field"><span>Payment method</span><select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value as InvoicePaymentMethod })}><option value="cash">Cash</option><option value="omt">OMT</option><option value="whish">Whish</option></select></label>
                <label className="field"><span>Transaction reference</span><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Optional reference" /></label>
                <label className="field span-2"><span>Internal note</span><textarea rows={3} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} placeholder="Optional context about this receipt" /></label>
              </div>
              <div className="payment-after-preview"><span><CheckCircle2 size={16} /><span>Balance after payment</span></span><strong>{money(Math.max(0, invoice.balance_due - (Number(payment.amount) || 0)), invoice.currency)}</strong></div>
              <footer className="modal-actions invoice-payment-footer"><span><ShieldCheck size={14} /> Superadmin receipt entry</span><button type="button" className="button button-secondary" onClick={() => setPaymentOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy}><Banknote size={15} /> {busy ? "Recording…" : "Record payment"}</button></footer>
            </form>
          </section>
        </div>
      )}

      {deleting && (
        <div className="modal-layer invoice-delete-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleting(false)}>
          <section className="modal invoice-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="invoice-delete-title" aria-describedby="invoice-delete-description">
            <header>
              <span className="delete-warning-icon"><AlertTriangle size={21} /></span>
              <button className="icon-button" onClick={() => setDeleting(false)} aria-label="Close delete confirmation"><X size={18} /></button>
            </header>
            <div className="invoice-delete-copy">
              <p className="eyebrow">Permanent removal</p>
              <h2 id="invoice-delete-title">Delete {invoice.invoice_number}?</h2>
              <p id="invoice-delete-description">This removes the invoice, {invoice.items?.length ?? 0} line items, and {invoice.invoice_payments?.length ?? 0} payment receipts. This action cannot be undone.</p>
            </div>
            <div className="invoice-delete-checkpoint">
              <label className="field"><span>Type <strong>{invoice.invoice_number}</strong> to confirm</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={invoice.invoice_number} /></label>
            </div>
            <footer className="modal-actions">
              <span><ShieldCheck size={14} /> Superadmin authorization required</span>
              <button className="button button-secondary" onClick={() => setDeleting(false)}>Keep invoice</button>
              <button className="button button-danger" disabled={busy || deleteConfirmation !== invoice.invoice_number} onClick={() => void remove()}><Trash2 size={15} /> {busy ? "Deleting…" : "Delete permanently"}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
