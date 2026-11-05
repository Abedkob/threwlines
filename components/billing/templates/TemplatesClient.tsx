"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Eye,
  FileCog,
  FileText,
  GripVertical,
  Languages,
  LayoutPanelTop,
  LoaderCircle,
  Palette,
  PanelsTopLeft,
  Plus,
  Save,
  Settings2,
  Trash2,
  Type,
} from "lucide-react";
import { TemplateBackgroundPicker } from "@/components/billing/templates/TemplateBackgroundPicker";
import { TemplatePreview } from "@/components/billing/templates/TemplatePreview";
import { apiFetch, assetUrl, jsonBody } from "@/lib/api/client";
import { WAVE_BACKGROUND, isWaveBackground } from "@/lib/template-background";
import type { AppSettings, DocumentTemplate, DocumentType, TemplateConfig } from "@/types/db";

const base: TemplateConfig = {
  paperSize: "A4",
  orientation: "portrait",
  primaryColor: "#111827",
  backgroundStyle: WAVE_BACKGROUND,
  fontFamily: "Arial",
  logoWidth: 180,
  stampWidth: 150,
  sections: ["header", "billTo", "billingDetails", "items", "totals", "paymentInstructions", "terms", "stamp"],
  visibility: {
    companyPhone: true,
    companyEmail: true,
    companyWebsite: true,
    clientAddress: true,
    clientEmail: true,
    clientPhone: true,
    contractReference: true,
    purchaseOrderReference: true,
    discount: true,
    previousBalance: true,
  },
  labels: {
    invoiceTitle: "INVOICE",
    billTo: "BILL TO",
    services: "SERVICES PROVIDED",
    totalDue: "TOTAL DUE",
  },
};

const draft = (): DocumentTemplate => ({
  id: "",
  name: "New invoice template",
  document_type: "invoice",
  is_default: false,
  config: structuredClone(base),
  created_at: "",
  updated_at: "",
});

const sectionNames: Record<string, string> = {
  header: "Company and document identity",
  billTo: "Customer billing profile",
  billingDetails: "Dates and references",
  items: "Services and line items",
  totals: "Totals and balance due",
  paymentInstructions: "Payment instructions",
  payments: "Payment receipts",
  terms: "Terms and conditions",
  stamp: "Footer and company stamp",
};

const fieldNames: Record<string, string> = {
  companyPhone: "Company phone",
  companyEmail: "Company email",
  companyWebsite: "Company website",
  clientAddress: "Customer address",
  clientEmail: "Customer email",
  clientPhone: "Customer phone",
  contractReference: "Contract reference",
  purchaseOrderReference: "Purchase order reference",
  discount: "Discount line",
  previousBalance: "Previous balance",
};

function formatUpdatedAt(value: string) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function TemplatesClient() {
  const [rows, setRows] = useState<DocumentTemplate[]>([]);
  const [selected, setSelected] = useState<DocumentTemplate>(draft());
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async (selectId?: string) => {
    setBusy(true);
    try {
      const [templatesResult, settingsResult] = await Promise.allSettled([
        apiFetch<DocumentTemplate[]>("/api/billing/templates"),
        apiFetch<AppSettings | null>("/api/billing/settings"),
      ]);

      if (templatesResult.status === "rejected") throw templatesResult.reason;

      const data = templatesResult.value;
      setRows(data);
      const found = selectId ? data.find((template) => template.id === selectId) : data[0];
      setSelected(found ?? draft());

      if (settingsResult.status === "fulfilled") {
        setAppSettings(settingsResult.value);
        setLogoUrl(assetUrl(settingsResult.value?.logo_url));
      } else {
        setAppSettings(null);
        setLogoUrl(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Templates could not load.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateConfig(patch: Partial<TemplateConfig>) {
    setSelected((current) => ({ ...current, config: { ...current.config, ...patch } }));
  }

  async function save(current = selected) {
    setBusy(true);
    try {
      const { id } = await apiFetch<{ id: string }>(
        current.id ? `/api/billing/templates/${current.id}` : "/api/billing/templates",
        { method: current.id ? "PATCH" : "POST", ...jsonBody(current) },
      );
      setMessage("Template saved and ready to use.");
      await load(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not save.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/billing/templates/${selected.id}`, { method: "DELETE" });
      setMessage("Template deleted.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be deleted.");
      setBusy(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...selected.config.sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateConfig({ sections: next });
  }

  function createNewTemplate() {
    setSelected(draft());
    setMessage("");
  }

  const enabledFields = Object.values(selected.config.visibility).filter(Boolean).length;

  return (
    <div className="template-view document-studio">
      {message && (
        <div className="page-error template-message" role="status">
          <CheckCircle2 size={16} />
          <span>{message}</span>
          <button onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}

      <section className="template-studio-hero">
        <div className="template-studio-mark" aria-hidden="true">
          <PanelsTopLeft size={22} />
          <i />
        </div>
        <div>
          <p className="eyebrow">Document studio / Billing system</p>
          <h2>Build documents customers trust.</h2>
          <p>Set the visual system, content order, and language once. Every new invoice stays consistent.</p>
        </div>
        <div className="template-studio-summary" aria-label="Template library summary">
          <span><strong>{rows.length}</strong><small>Templates</small></span>
          <span><strong>{rows.filter((row) => row.is_default).length}</strong><small>Default</small></span>
          <span><strong>{enabledFields}</strong><small>Visible fields</small></span>
        </div>
        <button className="button button-primary" onClick={createNewTemplate}>
          <Plus size={15} /> New template
        </button>
      </section>

      <div className="template-workspace">
        <aside className="surface template-list" aria-label="Template library">
          <header className="template-panel-title">
            <div>
              <p className="eyebrow">Library</p>
              <h2>Templates</h2>
            </div>
            <span>{rows.length}</span>
          </header>

          <div className="template-library-list">
            {busy && rows.length === 0 ? (
              <div className="template-library-state"><LoaderCircle className="spin" size={18} /><span>Loading templates</span></div>
            ) : rows.length === 0 ? (
              <div className="template-library-state"><FileText size={19} /><strong>No templates yet</strong><span>Create your first reusable document system.</span></div>
            ) : rows.map((row) => {
              const wave = isWaveBackground(row.config.backgroundStyle);
              return (
                <button
                  key={row.id}
                  className={selected.id === row.id ? "active" : ""}
                  onClick={() => setSelected(row)}
                >
                  <span className={`template-library-thumb${wave ? " wave" : ""}`} aria-hidden="true"><i /></span>
                  <span className="template-library-copy">
                    <strong>{row.name}</strong>
                    <small>{row.document_type} · {row.config.orientation}</small>
                    <em>{formatUpdatedAt(row.updated_at)}</em>
                  </span>
                  {row.is_default && <span className="template-default-badge">Default</span>}
                </button>
              );
            })}
          </div>

          <footer className="template-library-footer">
            <span><i /> Shared billing library</span>
            <button className="icon-button" onClick={createNewTemplate} aria-label="Create a template"><Plus size={14} /></button>
          </footer>
        </aside>

        <section className="surface template-editor">
          <header className="template-editor-header">
            <div className="template-editor-identity">
              <span><FileCog size={18} /></span>
              <div>
                <p className="eyebrow">Configuration</p>
                <h2>{selected.name || "Untitled template"}</h2>
                <small>{selected.id ? `Updated ${formatUpdatedAt(selected.updated_at)}` : "New unsaved template"}</small>
              </div>
            </div>
            <span className="template-preview-status"><i /><Eye size={12} /> Preview updates live</span>
          </header>

          <div className="template-editor-body">
            <section className="template-config-section">
              <header><span><Settings2 size={16} /></span><div><h3>Document foundation</h3><p>Name the template and define where it is used.</p></div></header>
              <div className="form-grid template-foundation-grid">
                <label className="field span-2"><span>Template name</span><input value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} /></label>
                <label className="field"><span>Document type</span><select value={selected.document_type} onChange={(event) => setSelected({ ...selected, document_type: event.target.value as DocumentType })}><option value="invoice">Invoice</option><option value="contract">Contract</option><option value="receipt">Receipt</option></select></label>
                <label className="template-default-control"><input type="checkbox" checked={selected.is_default} onChange={(event) => setSelected({ ...selected, is_default: event.target.checked })} /><span><strong>Default template</strong><small>Use automatically for new {selected.document_type}s.</small></span></label>
              </div>
            </section>

            <section className="template-config-section">
              <header><span><Palette size={16} /></span><div><h3>Visual system</h3><p>Control the paper, typography, color, and brand atmosphere.</p></div></header>
              <div className="form-grid template-visual-grid">
                <label className="field"><span>Orientation</span><select value={selected.config.orientation} onChange={(event) => updateConfig({ orientation: event.target.value as "portrait" | "landscape" })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                <label className="field template-color-field"><span>Primary color</span><span className="template-color-control"><input type="color" value={selected.config.primaryColor} onChange={(event) => updateConfig({ primaryColor: event.target.value })} /><code>{selected.config.primaryColor.toUpperCase()}</code></span></label>
                <TemplateBackgroundPicker value={selected.config.backgroundStyle ?? "clean"} onChange={(backgroundStyle) => updateConfig({ backgroundStyle })} />
                <label className="field"><span><Type size={12} /> Font family</span><select value={selected.config.fontFamily} onChange={(event) => updateConfig({ fontFamily: event.target.value })}><option>Arial</option><option>Georgia</option><option>Helvetica</option><option>Times New Roman</option></select></label>
                <label className="field"><span>Logo width</span><span className="template-measure-control"><input type="range" min="60" max="280" value={selected.config.logoWidth} onChange={(event) => updateConfig({ logoWidth: Number(event.target.value) })} /><output>{selected.config.logoWidth}px</output></span></label>
                <label className="field"><span>Stamp width</span><span className="template-measure-control"><input type="range" min="60" max="220" value={selected.config.stampWidth} onChange={(event) => updateConfig({ stampWidth: Number(event.target.value) })} /><output>{selected.config.stampWidth}px</output></span></label>
              </div>
            </section>

            <section className="template-config-section">
              <header><span><LayoutPanelTop size={16} /></span><div><h3>Content architecture</h3><p>Arrange the document in the order customers should read it.</p></div></header>
              <div className="template-section-order-list">
                {selected.config.sections.map((section, index) => (
                  <div className="section-order" key={section}>
                    <GripVertical size={14} aria-hidden="true" />
                    <span className="section-order-index">{String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{sectionNames[section] ?? section}</strong><small>{section}</small></span>
                    <button className="icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${section} up`}><ArrowUp size={13} /></button>
                    <button className="icon-button" onClick={() => move(index, 1)} disabled={index === selected.config.sections.length - 1} aria-label={`Move ${section} down`}><ArrowDown size={13} /></button>
                  </div>
                ))}
              </div>
            </section>

            <section className="template-config-section">
              <header><span><Eye size={16} /></span><div><h3>Visible information</h3><p>Keep only the fields customers need to understand and pay the document.</p></div></header>
              <div className="template-visibility-grid">
                {Object.entries(selected.config.visibility).map(([key, value]) => (
                  <label className="template-visibility-control" key={key}>
                    <input type="checkbox" checked={value} onChange={(event) => updateConfig({ visibility: { ...selected.config.visibility, [key]: event.target.checked } })} />
                    <span><strong>{fieldNames[key] ?? key}</strong><small>{value ? "Shown on document" : "Hidden from document"}</small></span>
                    <i aria-hidden="true" />
                  </label>
                ))}
              </div>
            </section>

            <section className="template-config-section">
              <header><span><Languages size={16} /></span><div><h3>Document language</h3><p>Use the same customer-facing terminology across every invoice.</p></div></header>
              <div className="form-grid template-label-grid">
                {Object.entries(selected.config.labels).map(([key, value]) => (
                  <label className="field" key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><input value={value} onChange={(event) => updateConfig({ labels: { ...selected.config.labels, [key]: event.target.value } })} /></label>
                ))}
              </div>
            </section>
          </div>

          <footer className="template-actions">
            <span className="template-save-context"><i /> Changes affect new documents after saving.</span>
            {selected.id && <button className="button button-secondary" onClick={() => void save({ ...selected, id: "", name: `${selected.name} copy`, is_default: false })} disabled={busy}><Copy size={15} /> Duplicate</button>}
            {selected.id && !selected.is_default && <button className="button template-delete-button" onClick={() => void remove()} disabled={busy}><Trash2 size={15} /> Delete</button>}
            <button className="button button-primary" onClick={() => void save()} disabled={busy || !selected.name.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save template</button>
          </footer>
        </section>

        <TemplatePreview
          config={selected.config}
          documentType={selected.document_type}
          templateName={selected.name}
          appSettings={appSettings}
          logoUrl={logoUrl}
        />
      </div>
    </div>
  );
}
