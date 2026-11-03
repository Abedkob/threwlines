"use client";

import { FormEvent, useState } from "react";
import { Box, X } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import type { LicensedProduct } from "@/types/db";

const initial = {
  name: "",
  code: "",
  description: "",
  default_max_activations: 1,
  default_offline_grace_days: 7,
  default_validation_hours: 24,
  default_entitlements: "{}",
  active: true,
};

export function ProductModal({ product, onClose, onSaved }: { product?: LicensedProduct | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(product ? {
    name: product.name,
    code: product.code,
    description: product.description ?? "",
    default_max_activations: product.default_max_activations,
    default_offline_grace_days: product.default_offline_grace_days,
    default_validation_hours: product.default_validation_hours,
    default_entitlements: JSON.stringify(product.default_entitlements, null, 2),
    active: product.active,
  } : initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const entitlements = JSON.parse(form.default_entitlements);
      if (!entitlements || Array.isArray(entitlements) || typeof entitlements !== "object") {
        throw new Error("Default entitlements must be a JSON object.");
      }
      await apiFetch(product?.id ? `/api/licensing/products/${product.id}` : "/api/licensing/products", {
        method: product?.id ? "PATCH" : "POST",
        ...jsonBody({
          ...form,
          code: form.code.trim().toLowerCase(),
          default_entitlements: entitlements,
        }),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Product could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-layer licensing-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal licensing-product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <header className="modal-header">
          <div><p className="eyebrow">Product registry</p><h2 id="product-modal-title">{product ? "Edit licensed product" : "Add a licensed product"}</h2><p className="modal-subtitle">Set the activation and offline defaults inherited by new licenses.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <form onSubmit={save}>
          <div className="licensing-modal-body">
            <div className="licensing-form-intro"><span><Box size={18} /></span><div><strong>Reusable product policy</strong><p>Each customer license can override these defaults without changing the product.</p></div></div>
            <div className="form-grid">
              <label className="field"><span>Product name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Desktop Suite" required /></label>
              <label className="field"><span>Product code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\s+/g, "-").toLowerCase() })} placeholder="desktop-suite" pattern="[a-z0-9][a-z0-9_\-]{1,39}" required /></label>
              <label className="field span-2"><span>Description</span><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <label className="field"><span>Default activations</span><input type="number" min="1" max="10000" value={form.default_max_activations} onChange={(event) => setForm({ ...form, default_max_activations: Number(event.target.value) })} /></label>
              <label className="field"><span>Validation interval (hours)</span><input type="number" min="1" max="720" value={form.default_validation_hours} onChange={(event) => setForm({ ...form, default_validation_hours: Number(event.target.value) })} /></label>
              <label className="field"><span>Offline grace (days)</span><input type="number" min="0" max="365" value={form.default_offline_grace_days} onChange={(event) => setForm({ ...form, default_offline_grace_days: Number(event.target.value) })} /></label>
              <label className="field"><span>Availability</span><select value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === "true" })}><option value="true">Active</option><option value="false">Disabled</option></select></label>
              <label className="field span-2"><span>Default entitlements (JSON)</span><textarea className="license-json-input" rows={4} value={form.default_entitlements} onChange={(event) => setForm({ ...form, default_entitlements: event.target.value })} spellCheck={false} /></label>
            </div>
            {error && <div className="drawer-error" role="alert">{error}</div>}
          </div>
          <footer className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Saving..." : product ? "Save changes" : "Save product"}</button></footer>
        </form>
      </section>
    </div>
  );
}
