"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, FileText, LoaderCircle, Upload, WalletCards } from "lucide-react";
import { apiFetch, assetUrl, jsonBody } from "@/lib/api/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppSettings } from "@/types/db";

export type BillingModule = "company" | "invoicing" | "payments";

// Each module is its own page, so the header has to describe the module the
// reader is actually on. It used to say "Company & invoice settings" above the
// payment-method form, which edits neither.
const MODULE_COPY: Record<BillingModule, { icon: typeof Building2; heading: string; blurb: string; save: string }> = {
  company: {
    icon: Building2,
    heading: "Company profile",
    blurb: "These details head every invoice and contract you send.",
    save: "Save company profile",
  },
  invoicing: {
    icon: FileText,
    heading: "Invoice defaults",
    blurb: "Numbering and the wording new invoices start from. Finalized invoices keep their own snapshot.",
    save: "Save invoice defaults",
  },
  payments: {
    icon: WalletCards,
    heading: "Payment methods",
    blurb: "Which methods customers can pay with, and the recipient details shown beside each one.",
    save: "Save payment methods",
  },
};

// Fallback for the combined view, which no route renders today.
const ALL_MODULES = {
  icon: Building2,
  heading: "Company & invoice settings",
  blurb: "These defaults flow into contracts and invoices. Finalized invoices keep snapshots.",
  save: "Save billing settings",
};

// Each settings module is its own page, so the component renders one
// section at a time. It still loads and saves the whole settings record:
// saveAppSettings only writes the columns it is given.
export function BillingSettings({ only }: { only?: BillingModule }) {
  const show = (module: BillingModule) => !only || only === module;
  const copy = only ? MODULE_COPY[only] : ALL_MODULES;
  const ModuleIcon = copy.icon;
  // These are payment-recipient details, so the API reserves them for
  // superadmins. Rendering the panel to a member would only show a 403.
  const isSuperadmin = useAuth().user.role === "superadmin";
  const [value, setValue] = useState<AppSettings | null>(null);
  const [previews, setPreviews] = useState<{ logo: string | null; stamp: string | null }>({ logo: null, stamp: null });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!isSuperadmin) { setBusy(false); return; }
    void (async () => {
      try {
        const settings = await apiFetch<AppSettings | null>("/api/billing/settings");
        if (!settings) throw new Error("Billing settings have not been initialised.");
        setValue(settings);
        setPreviews({ logo: assetUrl(settings.logo_url), stamp: assetUrl(settings.stamp_url) });
      } catch (error) { setMessage(error instanceof Error ? error.message : "Billing settings could not load."); }
      finally { setBusy(false); }
    })();
  }, [isSuperadmin]);
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
    // Only validate what this page can edit. Checking every module meant the
    // company page refused to save because of an empty OMT recipient - a field
    // on the payments page, which the person looking at the error cannot see.
    // show() is true for every module when there is no `only`, so the combined
    // view still validates the lot.
    if (show("company") && !value.company_name.trim()) return setMessage("Company name is required.");
    if (show("invoicing") && (value.default_due_days < 0 || value.next_invoice_number < 1)) return setMessage("Check due days and next invoice number.");
    if (show("payments") && value.omt_enabled && (!value.omt_recipient_name?.trim() || !value.omt_phone?.trim())) return setMessage("OMT recipient and phone are required while OMT is enabled.");
    if (show("payments") && value.whish_enabled && (!value.whish_recipient_name?.trim() || !value.whish_phone?.trim())) return setMessage("Whish recipient and phone are required while Whish is enabled.");
    setBusy(true); setMessage("");
    try { await apiFetch("/api/billing/settings", { method: "PATCH", ...jsonBody(value) }); setMessage("Billing settings saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  }
  if (!isSuperadmin) return null;
  if (!value) return <section className="settings-card billing-settings"><div className="feed-loading">{busy && <LoaderCircle className="spin-icon" size={16} />} {message || "Loading billing settings…"}</div></section>;
  const text = (key: keyof AppSettings, label: string, type = "text") => <label className="field"><span>{label}</span><input type={type} value={String(value[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} /></label>;
  const area = (key: keyof AppSettings, label: string) => <label className="field span-2"><span>{label}</span><textarea rows={3} value={String(value[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} /></label>;
  return <form className="billing-settings" onSubmit={save}>
    <header className="settings-intro billing-settings-intro"><span><ModuleIcon size={19}/></span><div><p className="eyebrow">Billing foundation</p><h2>{copy.heading}</h2><p>{copy.blurb}</p></div><button className="button button-primary" disabled={busy}>{copy.save}</button></header>
    <div className="billing-settings-grid">
      {show("company") && (<section className="settings-card"><div className="section-heading"><div><p className="eyebrow"><Building2 size={14}/> Company profile</p><h3>Shown on invoices</h3></div></div><div className="form-grid">
        {text("company_name","Company name")}{text("company_tagline","Tagline")}{text("company_phone","Phone","tel")}{text("company_email","Email","email")}{text("company_website","Website","url")}
        <div className="field span-2 asset-fields">{(["logo","stamp"] as const).map((kind) => <label className="asset-upload" key={kind}>{previews[kind] ? <img src={previews[kind]!} alt={`${kind} preview`} /> : <Upload size={22}/>}<span>{kind === "logo" ? "Upload logo" : "Upload stamp"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(kind,e.target.files?.[0])}/></label>)}</div>
      </div></section>)}
      {show("invoicing") && (<section className="settings-card"><div className="section-heading"><div><p className="eyebrow"><FileText size={14}/> Invoice defaults</p><h3>Numbering and content</h3></div></div><div className="form-grid">
        {text("invoice_prefix","Prefix")}{text("next_invoice_number","Next number","number")}{text("invoice_number_padding","Number padding","number")}{text("default_currency","Currency")}{text("default_due_days","Due days","number")}{area("default_terms","Terms")}{area("default_footer","Footer")}{area("default_payment_instructions","Payment instructions")}
      </div></section>)}
      {show("payments") && (<section className="settings-card span-2"><div className="section-heading"><div><p className="eyebrow"><WalletCards size={14}/> Payment methods</p><h3>Cash, OMT and Whish only</h3></div></div><div className="form-grid">
        <label className="check-row"><input type="checkbox" checked={value.cash_enabled} onChange={(e)=>set("cash_enabled",e.target.checked)}/> Enable cash</label>
        <label className="check-row"><input type="checkbox" checked={value.omt_enabled} onChange={(e)=>set("omt_enabled",e.target.checked)}/> Enable OMT</label>{text("omt_recipient_name","OMT recipient")}{text("omt_phone","OMT phone","tel")}
        <label className="check-row"><input type="checkbox" checked={value.whish_enabled} onChange={(e)=>set("whish_enabled",e.target.checked)}/> Enable Whish</label>{text("whish_recipient_name","Whish recipient")}{text("whish_phone","Whish phone","tel")}
      </div></section>)}
    </div>{message && <div className="drawer-error" role="status">{message}</div>}
  </form>;
}
