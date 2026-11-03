"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import type { ContactInput, ContactStage, Profile } from "@/types/db";
import { useDialogFocus } from "@/lib/useDialogFocus";

const emptyForm: ContactInput = {
  name: "",
  instagram: "",
  whatsapp: "",
  email: "",
  location: "",
  billing_name: "",
  billing_contact: "",
  billing_address: "",
  met_at: null,
  stage: "new",
  assigned_to: null,
  notes: "",
};

export function NewContactModal({
  profiles,
  onClose,
  onCreated,
}: {
  profiles: Profile[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState<ContactInput>({
    ...emptyForm,
    assigned_to: profiles[0]?.id ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  function set<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { id } = await apiFetch<{ id: string }>("/api/contacts", { method: "POST", ...jsonBody({
        ...form,
        name: form.name.trim(),
        instagram: form.instagram?.trim() || null,
        whatsapp: form.whatsapp?.trim() || null,
        email: form.email?.trim() || null,
        location: form.location?.trim() || null,
        billing_name: form.billing_name?.trim() || null,
        billing_contact: form.billing_contact?.trim() || null,
        billing_address: form.billing_address?.trim() || null,
        notes: form.notes?.trim() || null,
      }) });
      onCreated(id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Contact could not be created.",
      );
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-contact-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">New relationship</p>
            <h2 id="new-contact-title">Add contact</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field span-2">
              <span>Name</span>
              <input
                autoFocus
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Full name"
                required
              />
            </label>
            <label className="field">
              <span>Stage</span>
              <select
                value={form.stage}
                onChange={(event) =>
                  set("stage", event.target.value as ContactStage)
                }
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="negotiating">Negotiating</option>
                <option value="customer">Customer</option>
                <option value="lost">Lost</option>
              </select>
            </label>
            <label className="field">
              <span>Owner</span>
              <select
                value={form.assigned_to ?? ""}
                onChange={(event) =>
                  set("assigned_to", event.target.value || null)
                }
              >
                <option value="">Unassigned</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Instagram</span>
              <input
                value={form.instagram ?? ""}
                onChange={(event) => set("instagram", event.target.value)}
                placeholder="handle"
              />
            </label>
            <label className="field">
              <span>WhatsApp</span>
              <input
                value={form.whatsapp ?? ""}
                onChange={(event) => set("whatsapp", event.target.value)}
                placeholder="+961…"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(event) => set("email", event.target.value)}
                placeholder="name@company.com"
              />
            </label>
            <label className="field">
              <span>Location</span>
              <input
                value={form.location ?? ""}
                onChange={(event) => set("location", event.target.value)}
                placeholder="City or area"
              />
            </label>
            <label className="field span-2">
              <span>Billing name</span>
              <input value={form.billing_name ?? ""} onChange={(event) => set("billing_name", event.target.value)} placeholder="Optional company/name shown on invoices" />
            </label>
            <label className="field">
              <span>Billing contact</span>
              <input value={form.billing_contact ?? ""} onChange={(event) => set("billing_contact", event.target.value)} placeholder="Accounts contact" />
            </label>
            <label className="field">
              <span>Billing address</span>
              <input value={form.billing_address ?? ""} onChange={(event) => set("billing_address", event.target.value)} placeholder="Optional invoice address" />
            </label>
            <label className="field span-2">
              <span>Notes</span>
              <textarea
                value={form.notes ?? ""}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Context the whole team should know"
                rows={3}
              />
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={saving}>
              {saving ? "Adding…" : "Add contact"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
