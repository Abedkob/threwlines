"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  CalendarClock,
  ChevronRight,
  CircleOff,
  KeyRound,
  Laptop,
  LoaderCircle,
  Plus,
  Search,
  Unplug,
  ShieldCheck,
} from "lucide-react";
import { IssueLicenseModal } from "@/components/licensing/IssueLicenseModal";
import { ApiConnectionPanel } from "@/components/licensing/ApiConnectionPanel";
import { LicenseDetailDrawer } from "@/components/licensing/LicenseDetailDrawer";
import { ProductModal } from "@/components/licensing/ProductModal";
import { Pagination } from "@/components/ui/Pagination";
import { apiFetch } from "@/lib/api/client";
import { fmtDay, initials, maskedLicenseKey, relDate } from "@/lib/format";
import type { Contact, Invoice, License, LicenseEffectiveStatus, LicensedProduct, PagedResult } from "@/types/db";

const filters: Array<"all" | LicenseEffectiveStatus> = ["all", "active", "scheduled", "expired", "suspended", "revoked"];

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function LicensingClient() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [products, setProducts] = useState<LicensedProduct[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueReady, setIssueReady] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [productDraft, setProductDraft] = useState<LicensedProduct | null | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const [licenseRows, productRows] = await Promise.all([
        apiFetch<License[]>("/api/licensing/licenses"),
        apiFetch<LicensedProduct[]>("/api/licensing/products"),
      ]);
      setLicenses(licenseRows);
      setProducts(productRows);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Licensing registry could not load.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function startIssuing() {
    setBusy(true);
    setMessage("");
    try {
      if (!issueReady) {
        const [contactPage, invoiceRows] = await Promise.all([
          apiFetch<PagedResult<Contact>>("/api/contacts?page=1&pageSize=100&filter=customers"),
          apiFetch<Invoice[]>("/api/billing/payment-invoices"),
        ]);
        setContacts(contactPage.rows);
        setInvoices(invoiceRows);
        setIssueReady(true);
      }
      setIssueOpen(true);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "License editor data could not load.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("license");
    if (id) setSelected(id);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return licenses.filter((license) => {
      if (filter !== "all" && license.effective_status !== filter) return false;
      if (!needle) return true;
      return [license.contact.name, license.contact.billing_name, license.product.name, license.product.code, license.key_prefix, license.key_last_four]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [licenses, filter, query]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize],
  );
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const metrics = useMemo(() => ({
    active: licenses.filter((license) => license.effective_status === "active").length,
    expiring: licenses.filter((license) => { const days = daysUntil(license.expires_at); return license.effective_status === "active" && days !== null && days >= 0 && days <= 30; }).length,
    activations: licenses.reduce((sum, license) => sum + license.active_activations, 0),
    blocked: licenses.filter((license) => ["suspended", "revoked", "expired"].includes(license.effective_status)).length,
  }), [licenses]);

  return (
    <div className="licensing-view">
      <section className="license-command-strip">
        <div className="license-command-copy"><span className="license-command-icon"><KeyRound size={20} /></span><div><p className="eyebrow">Entitlement registry</p><h1>Licensing</h1><p>Connect every product activation to its customer, invoice, and lifecycle.</p></div></div>
        <div className="license-command-actions"><button className="button button-secondary" onClick={() => setApiOpen((current) => !current)}><Unplug size={15} /> {apiOpen ? "Hide API" : "Connect app"}</button><button className="button button-secondary" onClick={() => setProductDraft(null)}><Box size={15} /> Add product</button><button className="button button-primary" onClick={() => void startIssuing()} disabled={busy || !products.some((product) => product.active)}><Plus size={15} /> Issue license</button></div>
      </section>

      {apiOpen && <ApiConnectionPanel products={products} onClose={() => setApiOpen(false)} />}

      {products.length > 0 && <section className="license-product-rail" aria-label="Licensed products"><div><p className="eyebrow">Product policies</p><strong>{products.length} registered</strong></div><div>{products.map((product) => <button key={product.id} onClick={() => setProductDraft(product)}><span className={product.active ? "product-live" : "product-disabled"}><Box size={14} /></span><span><strong>{product.name}</strong><small>{product.code} · {product.default_max_activations} activation{product.default_max_activations === 1 ? "" : "s"}</small></span><em>{product.active ? "Active" : "Disabled"}</em></button>)}</div></section>}

      <section className="license-metric-grid" aria-label="License overview">
        <article><span><ShieldCheck size={17} /></span><div><small>Active licenses</small><strong>{metrics.active}</strong><em>customer entitlements</em></div></article>
        <article className={metrics.expiring ? "license-metric-warning" : ""}><span><CalendarClock size={17} /></span><div><small>Expiring in 30 days</small><strong>{metrics.expiring}</strong><em>renewals to review</em></div></article>
        <article><span><Laptop size={17} /></span><div><small>Live activations</small><strong>{metrics.activations}</strong><em>connected installations</em></div></article>
        <article className={metrics.blocked ? "license-metric-muted" : ""}><span><CircleOff size={17} /></span><div><small>Unavailable</small><strong>{metrics.blocked}</strong><em>expired or blocked</em></div></article>
      </section>

      {message && <div className="page-error" role="alert">{message}<button onClick={() => setMessage("")}>Dismiss</button></div>}

      <section className="surface license-registry-surface">
        <header className="surface-toolbar license-registry-toolbar"><div className="toolbar-heading"><p className="eyebrow">Customer access</p><h2>License registry</h2></div><label className="license-search"><Search size={14} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search customer, product, or key" aria-label="Search licenses" /></label><div className="segmented license-filter" aria-label="Filter licenses">{filters.map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => { setFilter(item); setPage(1); }}>{item}{filter === item && <span>{visible.length}</span>}</button>)}</div></header>

        <div className="license-table-wrap"><table className="billing-table license-table"><thead><tr><th>License</th><th>Customer</th><th>Validity</th><th>Status</th><th>Activations</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{pageRows.map((license) => { const capacity = Math.min(100, license.active_activations / license.max_activations * 100); const expiry = daysUntil(license.expires_at); return <tr key={license.id} onClick={() => setSelected(license.id)}><td><div className="license-id-cell"><span className="license-product-mark"><KeyRound size={15} /></span><span><strong>{license.product.name}</strong><code>{maskedLicenseKey(license)}</code></span></div></td><td><div className="license-customer-cell"><span>{initials(license.contact.billing_name || license.contact.name)}</span><div><strong>{license.contact.billing_name || license.contact.name}</strong><small>{license.source_invoice ? `Invoice ${license.source_invoice.invoice_number}` : "Direct entitlement"}</small></div></div></td><td><div className="license-validity-cell"><strong>{license.expires_at ? fmtDay(license.expires_at) : "Perpetual"}</strong><small>{expiry === null ? "No expiration" : expiry < 0 ? "Expired" : expiry === 0 ? "Expires today" : `${expiry} days remaining`}</small></div></td><td><span className={`license-state license-state-${license.effective_status}`}><i />{license.effective_status}</span></td><td><div className="license-capacity-cell"><span><strong>{license.active_activations}/{license.max_activations}</strong><small>{license.last_seen_at ? `Seen ${relDate(license.last_seen_at)}` : "Not activated"}</small></span><em><i style={{ width: `${capacity}%` }} /></em></div></td><td><button className="invoice-open-link" onClick={(event) => { event.stopPropagation(); setSelected(license.id); }} aria-label={`Open ${license.product.name} license`}><ChevronRight size={14} /></button></td></tr>; })}</tbody></table></div>

        <div className="mobile-license-list">{pageRows.map((license) => <button className="mobile-license-card" key={license.id} onClick={() => setSelected(license.id)}><span className="mobile-license-head"><span className="license-product-mark"><KeyRound size={14} /></span><span><strong>{license.product.name}</strong><small>{license.contact.billing_name || license.contact.name}</small></span><span className={`license-state license-state-${license.effective_status}`}><i />{license.effective_status}</span></span><code>{maskedLicenseKey(license)}</code><span className="mobile-license-foot"><span><small>Expires</small><strong>{license.expires_at ? fmtDay(license.expires_at) : "Perpetual"}</strong></span><span><small>Activations</small><strong>{license.active_activations}/{license.max_activations}</strong></span><ChevronRight size={15} /></span></button>)}</div>

        {busy && <div className="feed-loading"><LoaderCircle className="spin-icon" size={16} /> Loading licenses...</div>}
        {!busy && !visible.length && <div className="panel-empty billing-panel-empty"><span><KeyRound size={19} /></span><div><strong>{licenses.length ? "No licenses match" : "No licenses issued"}</strong><p>{licenses.length ? "Change the filter or search term." : products.length ? "Issue the first customer entitlement." : "Add a product before issuing a license."}</p></div></div>}
        {!busy && visible.length > 0 && <Pagination page={page} pageSize={pageSize} total={visible.length} totalPages={totalPages} disabled={busy} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      </section>

      {issueOpen && <IssueLicenseModal contacts={contacts} products={products} invoices={invoices} onClose={() => setIssueOpen(false)} onIssued={load} />}
      {productDraft !== undefined && <ProductModal product={productDraft} onClose={() => setProductDraft(undefined)} onSaved={load} />}
      {selected && <LicenseDetailDrawer licenseId={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}
