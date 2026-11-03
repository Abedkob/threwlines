"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, X } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { validateEntitlementsJson, validateLicensePolicy } from "@/lib/licensing-validation";
import type { Contact, Invoice, IssuedLicense, LicensedProduct, LicenseType } from "@/types/db";

const today = new Date().toISOString().slice(0, 10);
function inOneYear() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function IssueLicenseModal({ contacts, products, invoices, presetContactId, onClose, onIssued }: {
  contacts: Contact[];
  products: LicensedProduct[];
  invoices: Invoice[];
  presetContactId?: string;
  onClose: () => void;
  onIssued: () => Promise<void>;
}) {
  const firstProduct = products.find((product) => product.active);
  const [form, setForm] = useState({
    contact_id: presetContactId ?? "",
    product_id: firstProduct?.id ?? "",
    source_invoice_id: "",
    license_type: "subscription" as LicenseType,
    starts_at: today,
    expires_at: inOneYear(),
    max_activations: firstProduct?.default_max_activations ?? 1,
    offline_grace_days: firstProduct?.default_offline_grace_days ?? 7,
    validation_hours: firstProduct?.default_validation_hours ?? 24,
    entitlements: "{}",
    internal_notes: "",
  });
  const [issued, setIssued] = useState<IssuedLicense | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const customerInvoices = useMemo(() => invoices.filter((invoice) => invoice.contact_id === form.contact_id), [invoices, form.contact_id]);

  function chooseProduct(id: string) {
    const product = products.find((candidate) => candidate.id === id);
    setForm((current) => ({
      ...current,
      product_id: id,
      max_activations: product?.default_max_activations ?? current.max_activations,
      offline_grace_days: product?.default_offline_grace_days ?? current.offline_grace_days,
      validation_hours: product?.default_validation_hours ?? current.validation_hours,
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const issue = validateLicensePolicy(form);
      if (issue) throw new Error(issue);
      const parsed = validateEntitlementsJson(form.entitlements);
      if (parsed.error) throw new Error(parsed.error);
      const result = await apiFetch<IssuedLicense>("/api/licensing/licenses/issue", {
        method: "POST",
        ...jsonBody({ ...form, entitlements: parsed.value }),
      });
      setIssued(result);
      await onIssued();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "License could not be issued.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.license_key);
    setCopied(true);
  }

  if (issued) return (
    <div className="modal-layer licensing-modal-layer" role="presentation">
      <section className="modal issued-license-modal" role="dialog" aria-modal="true" aria-labelledby="issued-license-title">
        <div className="issued-license-success"><span><ShieldCheck size={25} /></span><p className="eyebrow">License issued</p><h2 id="issued-license-title">Copy this key now</h2><p>The complete key is shown once. The vault stores only its cryptographic fingerprint.</p></div>
        <div className="issued-license-key"><KeyRound size={16} /><code>{issued.license_key}</code></div>
        <div className="license-one-time-note"><strong>One-time secret</strong><span>Save it in the customer&apos;s secure delivery channel. It cannot be recovered later.</span></div>
        <footer className="modal-actions"><button className="button button-secondary" onClick={copyKey}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy license key"}</button><button className="button button-primary" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );

  return (
    <div className="modal-layer licensing-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal issue-license-modal" role="dialog" aria-modal="true" aria-labelledby="issue-license-title">
        <header className="modal-header"><div><p className="eyebrow">Customer entitlement</p><h2 id="issue-license-title">Issue a license</h2><p className="modal-subtitle">Connect the product, commercial record, and activation policy.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <form onSubmit={save}>
          <div className="licensing-modal-body issue-license-grid">
            <section className="license-form-section"><div className="section-heading"><div><p className="eyebrow">Ownership</p><h3>Customer and product</h3></div></div><div className="form-grid">
              <label className="field span-2"><span>Contact</span><select value={form.contact_id} onChange={(event) => setForm({ ...form, contact_id: event.target.value, source_invoice_id: "" })} required><option value="">Choose a customer</option>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.billing_name || contact.name}</option>)}</select></label>
              <label className="field"><span>Product</span><select value={form.product_id} onChange={(event) => chooseProduct(event.target.value)} required><option value="">Choose a product</option>{products.filter((product) => product.active).map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
              <label className="field"><span>License type</span><select value={form.license_type} onChange={(event) => setForm({ ...form, license_type: event.target.value as LicenseType })}><option value="subscription">Subscription</option><option value="perpetual">Perpetual</option><option value="trial">Trial</option></select></label>
              <label className="field span-2"><span>Source invoice (optional)</span><select value={form.source_invoice_id} onChange={(event) => setForm({ ...form, source_invoice_id: event.target.value })} disabled={!form.contact_id}><option value="">No linked invoice</option>{customerInvoices.map((invoice) => <option value={invoice.id} key={invoice.id}>{invoice.invoice_number} - {invoice.status.replace("_", " ")}</option>)}</select></label>
            </div></section>
            <section className="license-form-section"><div className="section-heading"><div><p className="eyebrow">Policy</p><h3>Validity and activation</h3></div></div><div className="form-grid">
              <label className="field"><span>Starts</span><input type="date" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} required /></label>
              <label className="field"><span>Expires</span><input type="date" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} disabled={form.license_type === "perpetual"} required={form.license_type !== "perpetual"} /></label>
              <label className="field"><span>Activation limit</span><input type="number" min="1" max="10000" value={form.max_activations} onChange={(event) => setForm({ ...form, max_activations: Number(event.target.value) })} /></label>
              <label className="field"><span>Validate every</span><div className="input-suffix"><input type="number" min="1" max="720" value={form.validation_hours} onChange={(event) => setForm({ ...form, validation_hours: Number(event.target.value) })} /><span>hours</span></div></label>
              <label className="field"><span>Offline grace</span><div className="input-suffix"><input type="number" min="0" max="365" value={form.offline_grace_days} onChange={(event) => setForm({ ...form, offline_grace_days: Number(event.target.value) })} /><span>days</span></div></label>
              <label className="field"><span>Entitlements (JSON)</span><textarea className="license-json-input" rows={3} value={form.entitlements} onChange={(event) => setForm({ ...form, entitlements: event.target.value })} spellCheck={false} /></label>
              <label className="field span-2"><span>Internal notes</span><textarea rows={3} value={form.internal_notes} onChange={(event) => setForm({ ...form, internal_notes: event.target.value })} /></label>
            </div></section>
            {error && <div className="drawer-error issue-license-error" role="alert">{error}</div>}
          </div>
          <footer className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !products.length}>{busy ? "Issuing..." : "Issue license"}</button></footer>
        </form>
      </section>
    </div>
  );
}
