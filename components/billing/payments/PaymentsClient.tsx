"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Filter,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { fmtDay, initials, money } from "@/lib/format";
import type {
  Invoice,
  InvoicePaymentMethod,
  InvoicePaymentRecord,
} from "@/types/db";

const today = new Date().toISOString().slice(0, 10);
const emptyPayment = {
  customerId: "",
  invoiceId: "",
  amount: "",
  paidOn: today,
  method: "cash" as InvoicePaymentMethod,
  reference: "",
  notes: "",
};

function customerName(record: InvoicePaymentRecord) {
  return record.invoice.contact.billing_name || record.invoice.contact.name;
}

export function PaymentsClient() {
  const [records, setRecords] = useState<InvoicePaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const role = useAuth().user.role;
  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [payment, setPayment] = useState(emptyPayment);
  const [open, setOpen] = useState(false);
  const [invoiceOptionsReady, setInvoiceOptionsReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const paymentRows = await apiFetch<InvoicePaymentRecord[]>("/api/billing/payment-records");
      setRecords(paymentRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment records could not load.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const collectibleInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.balance_due > 0 && !["draft", "cancelled"].includes(invoice.status)),
    [invoices],
  );

  const customers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    records.forEach((record) => map.set(record.invoice.contact.id, {
      id: record.invoice.contact.id,
      name: customerName(record),
    }));
    collectibleInvoices.forEach((invoice) => {
      if (invoice.contact) map.set(invoice.contact.id, {
        id: invoice.contact.id,
        name: invoice.contact.billing_name || invoice.contact.name,
      });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [collectibleInvoices, records]);

  const selectedCustomerInvoices = useMemo(
    () => collectibleInvoices.filter((invoice) => invoice.contact_id === payment.customerId),
    [collectibleInvoices, payment.customerId],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesCustomer = customerFilter === "all" || record.invoice.contact.id === customerFilter;
      const matchesMethod = methodFilter === "all" || record.payment_method === methodFilter;
      const matchesQuery = !term || [
        customerName(record),
        record.invoice.invoice_number,
        record.transaction_reference || "",
        record.notes || "",
      ].some((value) => value.toLowerCase().includes(term));
      return matchesCustomer && matchesMethod && matchesQuery;
    });
  }, [customerFilter, methodFilter, query, records]);

  const metrics = useMemo(() => ({
    collected: filtered.reduce((sum, record) => sum + record.amount, 0),
    customers: new Set(filtered.map((record) => record.invoice.contact.id)).size,
    receipts: filtered.length,
  }), [filtered]);

  async function startPayment() {
    setBusy(true);
    setMessage("");
    try {
      if (!invoiceOptionsReady) {
        setInvoices(await apiFetch<Invoice[]>("/api/billing/payment-invoices"));
        setInvoiceOptionsReady(true);
      }
      setPayment(emptyPayment);
      setOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Open invoices could not load.");
    } finally {
      setBusy(false);
    }
  }

  function chooseCustomer(customerId: string) {
    setPayment((current) => ({ ...current, customerId, invoiceId: "", amount: "" }));
  }

  function chooseInvoice(invoiceId: string) {
    const invoice = collectibleInvoices.find((row) => row.id === invoiceId);
    setPayment((current) => ({
      ...current,
      invoiceId,
      amount: invoice ? String(invoice.balance_due) : "",
    }));
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    const invoice = collectibleInvoices.find((row) => row.id === payment.invoiceId);
    const amount = Number(payment.amount);
    if (!invoice) return setMessage("Choose an invoice before recording the payment.");
    if (!Number.isFinite(amount) || amount <= 0) return setMessage("Enter a payment amount greater than zero.");
    if (amount > invoice.balance_due) return setMessage("Payment exceeds the invoice balance.");
    setBusy(true);
    try {
      await apiFetch(`/api/billing/invoices/${invoice.id}/payments`, {
        method: "POST",
        ...jsonBody({
          amount,
          method: payment.method,
          paidOn: payment.paidOn,
          transactionReference: payment.reference,
          notes: payment.notes,
        }),
      });
      setOpen(false);
      setInvoiceOptionsReady(false);
      setMessage("Payment recorded and linked to the customer invoice.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not be recorded.");
      setBusy(false);
    }
  }

  return (
    <div className="payments-view">
      <section className="payments-ledger-hero">
        <div className="payments-hero-icon" aria-hidden="true"><Landmark size={22} /><i /></div>
        <div className="payments-hero-copy">
          <p className="eyebrow">Billing / Cashbook</p>
          <h2>Every receipt, attached to a customer.</h2>
          <p>Review money received across invoices, trace its source, and keep the customer ledger complete.</p>
        </div>
        <div className="payments-hero-total">
          <span>Received in this view</span>
          <strong>{money(metrics.collected, filtered[0]?.invoice.currency || "USD")}</strong>
          <small>{metrics.receipts} payment {metrics.receipts === 1 ? "record" : "records"}</small>
        </div>
        {role === "superadmin" && <button className="button button-primary" onClick={() => void startPayment()} disabled={busy}><Plus size={15} /> Record payment</button>}
      </section>

      <section className="payment-metric-strip" aria-label="Payment ledger summary">
        <article><span><ReceiptText size={15} /></span><div><small>Receipts</small><strong>{metrics.receipts}</strong></div></article>
        <article><span><UsersRound size={15} /></span><div><small>Customers</small><strong>{metrics.customers}</strong></div></article>
        <article><span><CheckCircle2 size={15} /></span><div><small>Reconciled</small><strong>{records.length ? "Live" : "—"}</strong></div></article>
      </section>

      {message && <div className="page-error" role="status"><span>{message}</span><button onClick={() => setMessage("")}>Dismiss</button></div>}

      <section className="surface payment-ledger-surface">
        <header className="payment-ledger-toolbar">
          <div><p className="eyebrow">Receipt register</p><h2>Payment records</h2></div>
          <label className="payment-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, invoice or reference" /></label>
          <label className="payment-filter"><Filter size={13} /><select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} aria-label="Filter by customer"><option value="all">All customers</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
          <label className="payment-filter"><WalletCards size={13} /><select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} aria-label="Filter by payment method"><option value="all">All methods</option><option value="cash">Cash</option><option value="omt">OMT</option><option value="whish">Whish</option></select></label>
        </header>

        <div className="billing-table-wrap">
          <table className="billing-table payment-records-table">
            <thead><tr><th>Receipt</th><th>Customer</th><th>Invoice</th><th>Method</th><th>Received</th><th>Amount</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{filtered.map((record) => (
              <tr key={record.id}>
                <td><span className="payment-receipt-id"><span><ReceiptText size={14} /></span><span><strong>RCPT-{record.id.slice(0, 8).toUpperCase()}</strong><small>{record.transaction_reference || "No external reference"}</small></span></span></td>
                <td><span className="payment-customer"><span>{initials(customerName(record))}</span><span><strong>{customerName(record)}</strong><small>{record.invoice.contact.email || record.invoice.contact.whatsapp || "Customer account"}</small></span></span></td>
                <td><Link href={`/invoices/${record.invoice.id}`} className="payment-invoice-link"><strong>{record.invoice.invoice_number}</strong><small>{record.invoice.status.replace("_", " ")}</small></Link></td>
                <td><span className={`payment-method-chip method-${record.payment_method}`}><i />{record.payment_method.toUpperCase()}</span></td>
                <td><span className="payment-date"><CalendarDays size={12} />{fmtDay(record.paid_on)}</span></td>
                <td><strong className="payment-record-amount">{money(record.amount, record.invoice.currency)}</strong></td>
                <td><Link href={`/invoices/${record.invoice.id}`} className="invoice-open-link" aria-label={`Open ${record.invoice.invoice_number}`}><ArrowUpRight size={13} /></Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div className="mobile-payment-records" aria-label="Payment records">
          {filtered.map((record) => <Link href={`/invoices/${record.invoice.id}`} className="mobile-payment-record" key={record.id}>
            <span className="mobile-payment-head"><span className="payment-receipt-mark"><ReceiptText size={15} /></span><span><strong>{customerName(record)}</strong><small>{record.invoice.invoice_number}</small></span><b>{money(record.amount, record.invoice.currency)}</b></span>
            <span className="mobile-payment-meta"><span className={`payment-method-chip method-${record.payment_method}`}><i />{record.payment_method.toUpperCase()}</span><span>{fmtDay(record.paid_on)}</span><ChevronRight size={14} /></span>
          </Link>)}
        </div>

        {busy && <div className="feed-loading"><LoaderCircle className="spin-icon" size={16} /> Loading payment ledger…</div>}
        {!busy && filtered.length === 0 && <div className="panel-empty billing-panel-empty"><span><CircleDollarSign size={21} /></span><div><strong>No payment records found</strong><p>{records.length ? "Change the filters to see more receipts." : "Record a payment from an open invoice to start the ledger."}</p></div></div>}
      </section>

      {open && role === "superadmin" && (
        <div className="modal-layer payment-record-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="modal payment-record-modal" role="dialog" aria-modal="true" aria-labelledby="new-payment-title">
            <header className="modal-header">
              <div><p className="eyebrow">New receipt</p><h2 id="new-payment-title">Record customer payment</h2><p className="modal-subtitle">Choose the customer first. Only their open invoices will appear.</p></div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close payment form"><X size={18} /></button>
            </header>
            <form onSubmit={savePayment}>
              <div className="payment-record-form">
                <div className="payment-form-guard"><ShieldCheck size={15} /><span><strong>Controlled receipt entry</strong><small>The invoice establishes the customer link and updates its balance automatically.</small></span></div>
                <div className="form-grid">
                  <label className="field span-2"><span>Customer</span><select autoFocus value={payment.customerId} onChange={(event) => chooseCustomer(event.target.value)} required><option value="">Choose customer</option>{customers.filter((customer) => collectibleInvoices.some((invoice) => invoice.contact_id === customer.id)).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                  <label className="field span-2"><span>Open invoice</span><select value={payment.invoiceId} onChange={(event) => chooseInvoice(event.target.value)} disabled={!payment.customerId} required><option value="">{payment.customerId ? "Choose invoice" : "Choose a customer first"}</option>{selectedCustomerInvoices.map((invoice) => <option value={invoice.id} key={invoice.id}>{invoice.invoice_number} — {money(invoice.balance_due, invoice.currency)} due</option>)}</select></label>
                  <label className="field"><span>Amount received</span><input type="number" min="0.01" step="0.01" max={selectedCustomerInvoices.find((invoice) => invoice.id === payment.invoiceId)?.balance_due} value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} required /></label>
                  <label className="field"><span>Payment date</span><input type="date" value={payment.paidOn} onChange={(event) => setPayment({ ...payment, paidOn: event.target.value })} required /></label>
                  <label className="field"><span>Method</span><select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value as InvoicePaymentMethod })}><option value="cash">Cash</option><option value="omt">OMT</option><option value="whish">Whish</option></select></label>
                  <label className="field"><span>Transaction reference</span><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Optional" /></label>
                  <label className="field span-2"><span>Internal note</span><textarea rows={3} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} placeholder="Optional context about this receipt" /></label>
                </div>
              </div>
              <footer className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy || !payment.invoiceId}><Banknote size={15} />{busy ? "Recording…" : "Record payment"}</button></footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
