"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Laptop,
  LoaderCircle,
  RefreshCcw,
  ShieldOff,
  X,
} from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { fmtDay, maskedLicenseKey, money, relDate } from "@/lib/format";
import type { License } from "@/types/db";

function patchLicense(id: string, patch: Record<string, unknown>) {
  return apiFetch(`/api/licensing/licenses/${id}`, { method: "PATCH", ...jsonBody(patch) });
}

export function LicenseDetailDrawer({ licenseId, onClose, onChanged }: { licenseId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [license, setLicense] = useState<License | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [edit, setEdit] = useState({ expires_at: "", max_activations: 1, offline_grace_days: 7, validation_hours: 24, internal_notes: "" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const row = await apiFetch<License>(`/api/licensing/licenses/${licenseId}`);
      setLicense(row);
      setEdit({
        expires_at: row.expires_at?.slice(0, 10) ?? "",
        max_activations: row.max_activations,
        offline_grace_days: row.offline_grace_days,
        validation_hours: row.validation_hours,
        internal_notes: row.internal_notes ?? "",
      });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "License could not load.");
    } finally {
      setBusy(false);
    }
  }, [licenseId]);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await Promise.all([load(), onChanged()]);
      setMessage(success);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The license could not be updated.");
      setBusy(false);
    }
  }

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    await run(() => patchLicense(licenseId, edit), "License policy updated.");
  }

  if (!license) return <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="contact-drawer license-detail-drawer"><header className="drawer-header"><div><p className="eyebrow">License registry</p><h2>Loading license</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header><div className="feed-loading"><LoaderCircle size={17} className="spin-icon" /> Loading...</div>{message && <div className="drawer-error">{message}</div>}</aside></div>;

  const activeActivations = license.activations?.filter((activation) => !activation.deactivated_at) ?? [];
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="contact-drawer license-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="license-detail-title">
        <header className="drawer-header license-detail-header"><div><p className="eyebrow">{license.product.code}</p><h2 id="license-detail-title">{license.product.name}</h2><span className={`license-state license-state-${license.effective_status}`}><i />{license.effective_status}</span></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <div className="drawer-body">
          <section className="license-key-pass"><div><small>Customer entitlement</small><code>{maskedLicenseKey(license)}</code></div><span>{license.license_type}</span></section>

          <section className="drawer-section license-owner-card"><div className="section-heading"><div><p className="eyebrow">Customer</p><h3>{license.contact.billing_name || license.contact.name}</h3></div><Link href="/contacts" className="contact-ledger-link">Open CRM <ArrowUpRight size={12} /></Link></div>{license.source_invoice ? <Link href={`/invoices/${license.source_invoice.id}`} className="license-commercial-link"><span><strong>{license.source_invoice.invoice_number}</strong><small>Source invoice · {license.source_invoice.status.replace("_", " ")}</small></span><span><strong>{money(license.source_invoice.total_amount, license.source_invoice.currency)}</strong><small>{money(license.source_invoice.balance_due, license.source_invoice.currency)} due</small></span><ArrowUpRight size={13} /></Link> : <p className="empty-inline">No commercial document linked.</p>}</section>

          <section className="drawer-section"><div className="section-heading"><div><p className="eyebrow">Activation capacity</p><h3>{license.active_activations} of {license.max_activations} in use</h3></div><span className="section-total">{license.last_seen_at ? `Seen ${relDate(license.last_seen_at)}` : "Never activated"}</span></div><div className="license-capacity-track"><span style={{ width: `${Math.min(100, license.active_activations / license.max_activations * 100)}%` }} /></div><div className="license-activation-list">{activeActivations.length ? activeActivations.map((activation) => <article className="license-activation-row" key={activation.id}><span className="license-device-icon"><Laptop size={16} /></span><div><strong>{activation.device_label || activation.platform || "Application installation"}</strong><small>{activation.platform || "Unknown platform"} · v{activation.application_version || "unknown"}</small><em>Activated {fmtDay(activation.first_activated_at)} · last seen {relDate(activation.last_seen_at)}</em></div><button className="icon-button" title="Deactivate installation" aria-label="Deactivate installation" disabled={busy} onClick={() => void run(() => apiFetch(`/api/licensing/licenses/${license.id}/activations/${activation.id}`, { method: "DELETE" }), "Installation deactivated.")}><Ban size={15} /></button></article>) : <div className="contact-ledger-empty"><Laptop size={18} /><div><strong>No active installations</strong><p>The first successful activation will appear here.</p></div></div>}</div>{activeActivations.length > 0 && <button className="button button-secondary license-reset-button" disabled={busy} onClick={() => void run(() => apiFetch(`/api/licensing/licenses/${license.id}/reset`, { method: "POST" }), "All activations reset.")}><RefreshCcw size={14} /> Reset all activations</button>}</section>

          <section className="drawer-section"><div className="section-heading"><div><p className="eyebrow">Policy</p><h3>Validity and heartbeat</h3></div></div><form onSubmit={savePolicy}><div className="form-grid"><label className="field"><span>Expires</span><input type="date" value={edit.expires_at} disabled={license.license_type === "perpetual"} onChange={(event) => setEdit({ ...edit, expires_at: event.target.value })} /></label><label className="field"><span>Activation limit</span><input type="number" min="1" max="10000" value={edit.max_activations} onChange={(event) => setEdit({ ...edit, max_activations: Number(event.target.value) })} /></label><label className="field"><span>Validate every (hours)</span><input type="number" min="1" max="720" value={edit.validation_hours} onChange={(event) => setEdit({ ...edit, validation_hours: Number(event.target.value) })} /></label><label className="field"><span>Offline grace (days)</span><input type="number" min="0" max="365" value={edit.offline_grace_days} onChange={(event) => setEdit({ ...edit, offline_grace_days: Number(event.target.value) })} /></label><label className="field span-2"><span>Internal notes</span><textarea rows={3} value={edit.internal_notes} onChange={(event) => setEdit({ ...edit, internal_notes: event.target.value })} /></label></div><div className="section-actions"><button className="button button-secondary" disabled={busy}><CheckCircle2 size={14} /> Save policy</button></div></form></section>

          <section className="drawer-section license-state-actions"><div className="section-heading"><div><p className="eyebrow">Access state</p><h3>Control this entitlement</h3></div></div><div>{license.status === "active" ? <button className="button button-secondary" disabled={busy} onClick={() => void run(() => patchLicense(license.id, { status: "suspended" }), "License suspended.")}><ShieldOff size={14} /> Suspend</button> : license.status === "suspended" ? <button className="button button-secondary" disabled={busy} onClick={() => void run(() => patchLicense(license.id, { status: "active" }), "License reactivated.")}><CheckCircle2 size={14} /> Reactivate</button> : null}<button className="button button-danger" disabled={busy || license.status === "revoked"} onClick={() => { if (window.confirm("Revoke this license permanently? Existing activation tokens will be invalidated.")) void run(() => patchLicense(license.id, { status: "revoked" }), "License revoked."); }}><Ban size={14} /> Revoke permanently</button></div></section>

          <section className="drawer-section"><div className="section-heading"><div><p className="eyebrow">Audit trail</p><h3>Lifecycle events</h3></div><Activity size={15} /></div><div className="license-event-list">{license.events?.map((event) => <article key={event.id}><span className={`license-event-mark license-event-${event.event_type}`} /><div><strong>{event.event_type.replace("_", " ")}</strong><small>{event.result_code.replaceAll("_", " ").toLowerCase()}</small></div><time>{fmtDay(event.occurred_at)}</time></article>)}</div></section>
          {message && <div className="drawer-error" role="status">{message}</div>}
        </div>
      </aside>
    </div>
  );
}
