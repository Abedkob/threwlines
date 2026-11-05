"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  AtSign,
  Check,
  CircleDollarSign,
  ExternalLink,
  FileText,
  KeyRound,
  Laptop,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  LoaderCircle,
  X,
} from "lucide-react";
import { apiFetch, buildQuery, jsonBody } from "@/lib/api/client";
import { fmtDay, initials, maskedLicenseKey, money } from "@/lib/format";
import { HeatChip } from "@/components/contacts/HeatChip";
import type {
  ActivityChannel,
  Activity,
  Contact,
  ContactStage,
  ContactUpdate,
  Cursor,
  CursorResult,
  Invoice,
  License,
  Profile,
} from "@/types/db";
import { useDialogFocus } from "@/lib/useDialogFocus";

const stages: ContactStage[] = [
  "new",
  "contacted",
  "replied",
  "negotiating",
  "customer",
  "lost",
];
const channels: { value: ActivityChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other" },
];

function instagramHref(value: string | null) {
  const handle = value?.trim().replace(/^@/, "");
  return handle && /^[a-zA-Z0-9._]+$/.test(handle)
    ? `https://instagram.com/${encodeURIComponent(handle)}`
    : null;
}
function whatsappHref(value: string | null) {
  if (!value || !/^[+\d\s()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}
function emailHref(value: string | null) {
  const email = value?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? `mailto:${encodeURIComponent(email)}`
    : null;
}

export function ContactDrawer({
  contact,
  profiles,
  onClose,
  onChanged,
}: {
  contact: Contact;
  profiles: Profile[];
  onClose: () => void;
  onChanged: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ContactUpdate>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<ActivityChannel>("whatsapp");
  const [activityNote, setActivityNote] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [activityCursor, setActivityCursor] = useState<Cursor | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFeeds = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const [activityPage, invoiceRows, licenseRows] = await Promise.all([
        apiFetch<CursorResult<Activity>>(`/api/contacts/${contact.id}/activities`),
        apiFetch<Invoice[]>(`/api/contacts/${contact.id}/invoices`),
        apiFetch<License[]>(`/api/contacts/${contact.id}/licenses`),
      ]);
      setActivities(activityPage.rows);
      setActivityCursor(activityPage.nextCursor);
      setInvoices(invoiceRows);
      setLicenses(licenseRows);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Contact history could not be loaded.",
      );
    } finally {
      setLoadingFeed(false);
    }
  }, [contact.id]);

  useEffect(() => {
    setDraft({
      name: contact.name,
      instagram: contact.instagram,
      whatsapp: contact.whatsapp,
      email: contact.email,
      location: contact.location,
      billing_name: contact.billing_name,
      billing_contact: contact.billing_contact,
      billing_address: contact.billing_address,
      assigned_to: contact.assigned_to,
      notes: contact.notes,
    });
  }, [contact]);
  useEffect(() => {
    void loadFeeds();
  }, [loadFeeds]);
  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  const links = useMemo(
    () => ({
      instagram: instagramHref(contact.instagram),
      whatsapp: whatsappHref(contact.whatsapp),
      email: emailHref(contact.email),
    }),
    [contact],
  );
  const paymentSummary = useMemo(() => ({
    billed: invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0),
    collected: invoices.reduce((sum, invoice) => sum + invoice.amount_paid, 0),
    pending: invoices.reduce((sum, invoice) => sum + invoice.balance_due, 0),
    receipts: invoices.reduce((sum, invoice) => sum + (invoice.invoice_payments?.length ?? 0), 0),
  }), [invoices]);
  function set<K extends keyof ContactUpdate>(key: K, value: ContactUpdate[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await action();
      await onChanged(contact.id);
      await loadFeeds();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Changes could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function loadMoreActivities() {
    if (!activityCursor) return;
    setLoadingMore(true);
    try {
      const next = await apiFetch<CursorResult<Activity>>(
        `/api/contacts/${contact.id}/activities${buildQuery({
          cursor_created_at: activityCursor.createdAt,
          cursor_id: activityCursor.id,
        })}`,
      );
      setActivities((current) => [...current, ...next.rows]);
      setActivityCursor(next.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "More activity could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      apiFetch(`/api/contacts/${contact.id}`, { method: "PATCH", ...jsonBody({
        ...draft,
        name: draft.name?.trim(),
        instagram: draft.instagram?.trim() || null,
        whatsapp: draft.whatsapp?.trim() || null,
        email: draft.email?.trim() || null,
        location: draft.location?.trim() || null,
        billing_name: draft.billing_name?.trim() || null,
        billing_contact: draft.billing_contact?.trim() || null,
        billing_address: draft.billing_address?.trim() || null,
        notes: draft.notes?.trim() || null,
      }) }),
    );
  }
  async function changeStage(stage: ContactStage) {
    if (stage === contact.stage) return;
    await run(() => apiFetch(`/api/contacts/${contact.id}/move`, { method: "POST", ...jsonBody({ stage }) }));
  }
  async function logActivity(event: FormEvent) {
    event.preventDefault();
    if (!activityNote.trim()) return;
    await run(async () => {
      await apiFetch(`/api/contacts/${contact.id}/activities`, {
        method: "POST",
        ...jsonBody({ channel, note: activityNote.trim() }),
      });
      setActivityNote("");
    });
  }

  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        ref={dialogRef}
        className="contact-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
      >
        <header className="drawer-header">
          <div className="contact-title-row">
            <span className="contact-avatar">{initials(contact.name)}</span>
            <div>
              <div className="drawer-kicker">
                <HeatChip contact={contact} compact /> Contact record
              </div>
              <h2 id="contact-title">{contact.name}</h2>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close contact"
          >
            <X size={20} />
          </button>
        </header>

        <div className="drawer-body">
          <section className="drawer-section compact-section">
            <div className="contact-actions">
              {links.whatsapp ? (
                <a
                  className="contact-action"
                  href={links.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} />
                  WhatsApp
                  <ExternalLink size={12} />
                </a>
              ) : null}
              {links.instagram ? (
                <a
                  className="contact-action"
                  href={links.instagram}
                  target="_blank"
                  rel="noreferrer"
                >
                  <AtSign size={15} />
                  Instagram
                  <ExternalLink size={12} />
                </a>
              ) : null}
              {links.email ? (
                <a className="contact-action" href={links.email}>
                  <Mail size={15} />
                  Email
                </a>
              ) : null}
              {!links.whatsapp && !links.instagram && !links.email && (
                <p className="empty-inline">
                  Add a valid contact channel below.
                </p>
              )}
            </div>
            <div className="stage-strip" aria-label="Contact stage">
              {stages.map((stage) => (
                <button
                  key={stage}
                  className={`stage-step ${stage === contact.stage ? "selected" : ""}`}
                  onClick={() => changeStage(stage)}
                  disabled={saving}
                >
                  <span />
                  {stage}
                </button>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Contact details</p>
                <h3>Edit the essentials</h3>
              </div>
            </div>
            <form onSubmit={saveDetails}>
              <div className="form-grid">
                <label className="field span-2">
                  <span>Name</span>
                  <input
                    value={draft.name ?? ""}
                    onChange={(event) => set("name", event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Owner</span>
                  <select
                    value={draft.assigned_to ?? ""}
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
                  <span>Location</span>
                  <div className="input-icon">
                    <MapPin size={14} />
                    <input
                      value={draft.location ?? ""}
                      onChange={(event) => set("location", event.target.value)}
                      placeholder="City or area"
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Instagram</span>
                  <div className="input-icon">
                    <AtSign size={14} />
                    <input
                      value={draft.instagram ?? ""}
                      onChange={(event) => set("instagram", event.target.value)}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>WhatsApp</span>
                  <div className="input-icon">
                    <Phone size={14} />
                    <input
                      value={draft.whatsapp ?? ""}
                      onChange={(event) => set("whatsapp", event.target.value)}
                    />
                  </div>
                </label>
                <label className="field span-2">
                  <span>Email</span>
                  <div className="input-icon">
                    <Mail size={14} />
                    <input
                      type="email"
                      value={draft.email ?? ""}
                      onChange={(event) => set("email", event.target.value)}
                    />
                  </div>
                </label>
                <label className="field span-2">
                  <span>Billing name</span>
                  <input value={draft.billing_name ?? ""} onChange={(event) => set("billing_name", event.target.value)} placeholder="Defaults to the contact name" />
                </label>
                <label className="field">
                  <span>Billing contact</span>
                  <input value={draft.billing_contact ?? ""} onChange={(event) => set("billing_contact", event.target.value)} />
                </label>
                <label className="field">
                  <span>Billing address</span>
                  <input value={draft.billing_address ?? ""} onChange={(event) => set("billing_address", event.target.value)} />
                </label>
                <label className="field span-2">
                  <span>Notes</span>
                  <textarea
                    rows={4}
                    value={draft.notes ?? ""}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Shared context, preferences, and next steps"
                  />
                </label>
              </div>
              <div className="section-actions">
                <button className="button button-secondary" disabled={saving}>
                  <Check size={15} />
                  Save details
                </button>
              </div>
            </form>
          </section>

          {contact.stage === "customer" && (
            <section className="drawer-section contact-billing-ledger">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Connected billing</p>
                  <h3>Invoices &amp; payments</h3>
                </div>
                <Link href="/payments" className="contact-ledger-link">Payment ledger <ArrowUpRight size={12} /></Link>
              </div>
              <div className="contact-ledger-summary" aria-label="Customer billing summary">
                <div><span><FileText size={13} /></span><small>Billed</small><strong>{money(paymentSummary.billed, invoices[0]?.currency)}</strong></div>
                <div><span><Check size={13} /></span><small>Collected</small><strong>{money(paymentSummary.collected, invoices[0]?.currency)}</strong></div>
                <div className={paymentSummary.pending > 0 ? "has-balance" : ""}><span><CircleDollarSign size={13} /></span><small>Outstanding</small><strong>{money(paymentSummary.pending, invoices[0]?.currency)}</strong></div>
              </div>
              <div className="contact-invoice-list">
                {invoices.length ? invoices.map((invoice) => {
                  const progress = invoice.total_amount > 0 ? Math.min(100, Math.round(invoice.amount_paid / invoice.total_amount * 100)) : 0;
                  return <Link href={`/invoices/${invoice.id}`} className="contact-invoice-row" key={invoice.id}>
                    <span className="contact-invoice-mark"><FileText size={14} /></span>
                    <span className="contact-invoice-copy"><strong>{invoice.invoice_number}</strong><small>Issued {fmtDay(invoice.invoice_date)} · {invoice.invoice_payments?.length ?? 0} receipt{invoice.invoice_payments?.length === 1 ? "" : "s"}</small><span className="contact-invoice-progress"><i style={{ width: `${progress}%` }} /></span></span>
                    <span className="contact-invoice-balance"><strong>{invoice.balance_due > 0 ? money(invoice.balance_due, invoice.currency) : money(invoice.total_amount, invoice.currency)}</strong><small>{invoice.balance_due > 0 ? "outstanding" : "collected"}</small><em className={`status-pill status-${invoice.status}`}>{invoice.status.replace("_", " ")}</em></span>
                    <ArrowUpRight size={13} />
                  </Link>;
                }) : <div className="contact-ledger-empty"><FileText size={18} /><div><strong>No finalized invoices</strong><p>Finalize this customer&apos;s first invoice and it will appear here automatically.</p></div></div>}
              </div>
            </section>
          )}

          <section className="drawer-section contact-license-ledger">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Product access</p>
                <h3>Licenses &amp; activations</h3>
              </div>
              <Link href="/licensing" className="contact-ledger-link">License registry <ArrowUpRight size={12} /></Link>
            </div>
            <div className="contact-license-summary">
              <div><span><KeyRound size={13} /></span><small>Licenses</small><strong>{licenses.length}</strong></div>
              <div><span><Laptop size={13} /></span><small>Activations</small><strong>{licenses.reduce((sum, license) => sum + license.active_activations, 0)}</strong></div>
              <div><span><Check size={13} /></span><small>Active</small><strong>{licenses.filter((license) => license.effective_status === "active").length}</strong></div>
            </div>
            <div className="contact-license-list">
              {licenses.length ? licenses.map((license) => (
                <Link href={`/licensing?license=${license.id}`} className="contact-license-row" key={license.id}>
                  <span className="contact-license-mark"><KeyRound size={14} /></span>
                  <span className="contact-license-copy"><strong>{license.product.name}</strong><code>{maskedLicenseKey(license)}</code><small>{license.source_invoice ? `Linked to ${license.source_invoice.invoice_number}` : "Direct entitlement"}</small></span>
                  <span className="contact-license-capacity"><strong>{license.active_activations}/{license.max_activations}</strong><small>activations</small><em className={`license-state license-state-${license.effective_status}`}><i />{license.effective_status}</em></span>
                  <ArrowUpRight size={13} />
                </Link>
              )) : <div className="contact-ledger-empty"><KeyRound size={18} /><div><strong>No licenses issued</strong><p>Issue this customer&apos;s first product entitlement from the license registry.</p></div></div>}
            </div>
          </section>

          <section className="drawer-section activity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Relationship timeline</p>
                <h3>Activity</h3>
              </div>
              <span className="section-total">
                {activities.length}
                {activityCursor ? "+" : ""} entries loaded
              </span>
            </div>
            <form className="activity-composer" onSubmit={logActivity}>
              <select
                aria-label="Touchpoint channel"
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as ActivityChannel)
                }
              >
                {channels.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <textarea
                aria-label="Touchpoint note"
                value={activityNote}
                onChange={(event) => setActivityNote(event.target.value)}
                placeholder="What happened? What is the next move?"
                rows={3}
                required
              />
              <button
                className="button button-primary"
                disabled={saving || !activityNote.trim()}
              >
                Log touchpoint
              </button>
            </form>
            <div className="timeline">
              {loadingFeed ? (
                <div className="feed-loading">
                  <LoaderCircle size={16} className="spin-icon" />
                  Loading history…
                </div>
              ) : activities.length ? (
                activities.map((activity) => (
                  <article className="timeline-item" key={activity.id}>
                    <span
                      className={`timeline-node channel-${activity.channel ?? "other"}`}
                    />
                    <div className="timeline-content">
                      <div>
                        <span className="channel-label">
                          {activity.channel?.replace("_", " ") ?? "update"}
                        </span>
                        <time>{fmtDay(activity.created_at)}</time>
                      </div>
                      <p>{activity.note}</p>
                      <small>
                        {activity.author_profile?.name ?? "Team member"}
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <p className="empty-inline">
                  No activity yet. Log the first touchpoint above.
                </p>
              )}
            </div>
            {activityCursor && (
              <button
                className="load-more"
                onClick={loadMoreActivities}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <LoaderCircle size={14} className="spin-icon" />
                ) : (
                  <Plus size={14} />
                )}{" "}
                Load more activity
              </button>
            )}
          </section>
          {error && (
            <div className="drawer-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
