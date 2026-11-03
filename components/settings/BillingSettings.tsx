"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, FileText, LoaderCircle, Upload, WalletCards } from "lucide-react";
import { apiFetch, assetUrl, jsonBody } from "@/lib/api/client";
import type { AppSettings } from "@/types/db";

export function BillingSettings() {
  const [value, setValue] = useState<AppSettings | null>(null);
  const [previews, setPreviews] = useState<{ logo: string | null; stamp: string | null }>({ logo: null, stamp: null });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const settings = await apiFetch<AppSettings | null>("/api/billing/settings");
        if (!settings) throw new Error("Billing settings have not been initialised.");
        setValue(settings);
        setPreviews({ logo: assetUrl(settings.logo_url), stamp: assetUrl(settings.stamp_url) });
      } catch (error) { setMessage(error instanceof Error ? error.message : "Billing settings could not load."); }
      finally { setBusy(false); }
    })();
  }, []);
  function set<K extends keyof AppSettings>(key: K, next: AppSettings[K]) {
    setValue((current) => current ? { ...current, [key]: next } : current);
  }
  async function upload(kind: "logo" | "stamp", file?: File) {
    if (!file || !value) return;
    setBusy(true); setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      const response = await fetch("/api/billing/settings/upload", { method: "POST", body: formData });
      const uploaded = await response.json().catch(() => ({ error: response.statusText }));
      if (!response.ok) throw new Error(uploaded.error || response.statusText);
      const key = kind === "logo" ? "logo_url" : "stamp_url";
      set(key, uploaded.path as string);
      setPreviews((current) => ({ ...current, [kind]: URL.createObjectURL(file) }));
      setMessage(`${kind === "logo" ? "Logo" : "Stamp"} uploaded.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!value) return;
    if (!value.company_name.trim()) return setMessage("Company name is required.");
    if (value.default_due_days < 0 || value.next_invoice_number < 1) return setMessage("Check due days and next invoice number.");
    if (value.omt_enabled && (!value.omt_recipient_name?.trim() || !value.omt_phone?.trim())) return setMessage("OMT recipient and phone are required while OMT is enabled.");
    if (value.whish_enabled && (!value.whish_recipient_name?.trim() || !value.whish_phone?.trim())) return setMessage("Whish recipient and phone are required while Whish is enabled.");
    setBusy(true); setMessage("");
    try { await apiFetch("/api/billing/settings", { method: "PATCH", ...jsonBody(value) }); setMessage("Billing settings saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  }
  if (!value) return <section className="settings-card billing-settings"><div className="feed-loading">{busy && <LoaderCircle className="spin-icon" size={16} />} {message || "Loading billing settings…"}</div></section>;
  const text = (key: keyof AppSettings, label: string, type = "text") => <label className="field"><span>{label}</span><input type={type} value={String(value[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} /></label>;
  const area = (key: keyof AppSettings, label: string) => <label className="field span-2"><span>{label}</span><textarea rows={3} value={String(value[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} /></label>;
  return <form className="billing-settings" onSubmit={save}>
    <header className="settings-intro billing-settings-intro"><span><Building2 size={19}/></span><div><p className="eyebrow">Billing foundation</p><h2>Company & invoice settings</h2><p>These defaults flow into contracts and invoices. Finalized invoices keep snapshots.</p></div><button className="button button-primary" disabled={busy}>Save billing settings</button></header>
    <div className="billing-settings-grid">
      <section className="settings-card"><div className="section-heading"><div><p className="eyebrow"><Building2 size={14}/> Company profile</p><h3>Shown on invoices</h3></div></div><div className="form-grid">
        {text("company_name","Company name")}{text("company_tagline","Tagline")}{text("company_phone","Phone","tel")}{text("company_email","Email","email")}{text("company_website","Website","url")}
        <div className="field span-2 asset-fields">{(["logo","stamp"] as const).map((kind) => <label className="asset-upload" key={kind}>{previews[kind] ? <img src={previews[kind]!} alt={`${kind} preview`} /> : <Upload size={22}/>}<span>{kind === "logo" ? "Upload logo" : "Upload stamp"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(kind,e.target.files?.[0])}/></label>)}</div>
      </div></section>
      <section className="settings-card"><div className="section-heading"><div><p className="eyebrow"><FileText size={14}/> Invoice defaults</p><h3>Numbering and content</h3></div></div><div className="form-grid">
        {text("invoice_prefix","Prefix")}{text("next_invoice_number","Next number","number")}{text("invoice_number_padding","Number padding","number")}{text("default_currency","Currency")}{text("default_due_days","Due days","number")}{area("default_terms","Terms")}{area("default_footer","Footer")}{area("default_payment_instructions","Payment instructions")}
      </div></section>
      <section className="settings-card span-2"><div className="section-heading"><div><p className="eyebrow"><WalletCards size={14}/> Payment methods</p><h3>Cash, OMT and Whish only</h3></div></div><div className="form-grid">
        <label className="check-row"><input type="checkbox" checked={value.cash_enabled} onChange={(e)=>set("cash_enabled",e.target.checked)}/> Enable cash</label>
        <label className="check-row"><input type="checkbox" checked={value.omt_enabled} onChange={(e)=>set("omt_enabled",e.target.checked)}/> Enable OMT</label>{text("omt_recipient_name","OMT recipient")}{text("omt_phone","OMT phone","tel")}
        <label className="check-row"><input type="checkbox" checked={value.whish_enabled} onChange={(e)=>set("whish_enabled",e.target.checked)}/> Enable Whish</label>{text("whish_recipient_name","Whish recipient")}{text("whish_phone","Whish phone","tel")}
      </div></section>
    </div>{message && <div className="drawer-error" role="status">{message}</div>}
  </form>;
}
