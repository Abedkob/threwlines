"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { money } from "@/lib/format";
import type { ExpenseCategory, Service } from "@/types/db";

function ServiceRow({
  service,
  deleting,
  onDeleteIntent,
  onRefresh,
  onError,
}: {
  service: Service;
  deleting: boolean;
  onDeleteIntent: () => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(String(service.default_price));
  const [description, setDescription] = useState(service.description ?? "");
  const [active, setActive] = useState(service.active);
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(price);
    if (!name.trim() || !Number.isFinite(numeric) || numeric < 0) {
      onError("Enter a service name and valid default price.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/services/${service.id}`, {
        method: "PATCH",
        ...jsonBody({
          name,
          default_price: numeric,
          description: description.trim() || null,
          default_quantity: 1,
          active,
        }),
      });
      setEditing(false);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Service could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) {
      onDeleteIntent();
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/services/${service.id}`, { method: "DELETE" });
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Service could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-row">
      {editing ? (
        <form className="settings-inline-edit" onSubmit={save}>
          <input
            className="service-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Service name"
            required
          />
          <div className="money-input">
            <span>$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              aria-label="Default price"
              required
            />
          </div>
          <input className="service-description-input" value={description} onChange={(event)=>setDescription(event.target.value)} aria-label="Service description" placeholder="Default description" />
          <label className="check-row service-active-control"><input type="checkbox" checked={active} onChange={(event)=>setActive(event.target.checked)}/> Active</label>
          <button
            className="icon-button save-action"
            disabled={busy}
            aria-label="Save service"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            className="icon-button service-cancel-action"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </form>
      ) : (
        <>
          <div className="settings-row-copy">
            <strong>{service.name}</strong>
            <small>{service.active ? "Active" : "Inactive"}{service.description ? ` · ${service.description}` : ""}</small>
          </div>
          <span className="settings-value">{money(service.default_price)}</span>
          <div className="settings-row-actions">
            <button
              className="icon-button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${service.name}`}
            >
              <Pencil size={14} />
            </button>
            <button
              className={`delete-button ${deleting ? "confirming" : ""}`}
              onClick={remove}
              disabled={busy}
              aria-label={
                deleting
                  ? `Confirm deleting ${service.name}`
                  : `Delete ${service.name}`
              }
            >
              {deleting ? "Confirm" : <Trash2 size={14} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  deleting,
  onDeleteIntent,
  onRefresh,
  onError,
}: {
  category: ExpenseCategory;
  deleting: boolean;
  onDeleteIntent: () => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/expenses/categories/${category.id}`, {
        method: "PATCH",
        ...jsonBody({ name }),
      });
      setEditing(false);
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Category could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) {
      onDeleteIntent();
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/expenses/categories/${category.id}`, { method: "DELETE" });
      await onRefresh();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Category could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-row">
      {editing ? (
        <form className="settings-inline-edit category-edit" onSubmit={save}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Category name"
            required
          />
          <button
            className="icon-button save-action"
            disabled={busy}
            aria-label="Save category"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </form>
      ) : (
        <>
          <div className="settings-row-copy">
            <strong>{category.name}</strong>
            <small>Expense category</small>
          </div>
          <div className="settings-row-actions">
            <button
              className="icon-button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${category.name}`}
            >
              <Pencil size={14} />
            </button>
            <button
              className={`delete-button ${deleting ? "confirming" : ""}`}
              onClick={remove}
              disabled={busy}
              aria-label={
                deleting
                  ? `Confirm deleting ${category.name}`
                  : `Delete ${category.name}`
              }
            >
              {deleting ? "Confirm" : <Trash2 size={14} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function SettingsClient() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [serviceData, categoryData] = await Promise.all([
        apiFetch<Service[]>("/api/services"),
        apiFetch<ExpenseCategory[]>("/api/expenses/categories"),
      ]);
      setServices(serviceData);
      setCategories(categoryData);
      setDeleteTarget("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function addService(event: FormEvent) {
    event.preventDefault();
    const price = Number(servicePrice);
    if (!serviceName.trim() || !Number.isFinite(price) || price < 0) {
      setError("Enter a service name and valid default price.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/services", {
        method: "POST",
        ...jsonBody({
          name: serviceName,
          default_price: price,
          description: serviceDescription.trim() || null,
          default_quantity: 1,
          active: true,
        }),
      });
      setServiceName("");
      setServicePrice("");
      setServiceDescription("");
      setNotice("Service added.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Service could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/expenses/categories", {
        method: "POST",
        ...jsonBody({ name: categoryName }),
      });
      setCategoryName("");
      setNotice("Category added.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Category could not be added.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className="surface loading-state">
        <span className="spinner" />
        Loading settings…
      </div>
    );
  return (
    <div className="settings-view">
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="settings-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="settings-intro">
        <span>
          <Settings2 size={19} />
        </span>
        <div>
          <p className="eyebrow">Shared configuration</p>
          <h2>Keep the team&apos;s vocabulary consistent.</h2>
          <p>
            Services drive payment defaults. Categories keep expense reporting
            comparable.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="surface settings-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Revenue catalog</p>
              <h2>Services</h2>
            </div>
            <span>{services.length} entries</span>
          </header>
          <form className="settings-add-form" onSubmit={addService}>
            <input
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
              placeholder="Service name"
              aria-label="New service name"
              required
            />
            <div className="money-input">
              <span>$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={servicePrice}
                onChange={(event) => setServicePrice(event.target.value)}
                placeholder="0.00"
                aria-label="Default price"
                required
              />
            </div>
            <input value={serviceDescription} onChange={(event)=>setServiceDescription(event.target.value)} placeholder="Default description" aria-label="Default description" />
            <button className="button button-primary" disabled={saving}>
              <Plus size={14} />
              Add
            </button>
          </form>
          <div className="settings-list">
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                deleting={deleteTarget === `service:${service.id}`}
                onDeleteIntent={() => setDeleteTarget(`service:${service.id}`)}
                onRefresh={load}
                onError={setError}
              />
            ))}
          </div>
        </section>
        <section className="surface settings-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Expense taxonomy</p>
              <h2>Categories</h2>
            </div>
            <span>{categories.length} entries</span>
          </header>
          <form
            className="settings-add-form category-add"
            onSubmit={addCategory}
          >
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Category name"
              aria-label="New category name"
              required
            />
            <button className="button button-primary" disabled={saving}>
              <Plus size={14} />
              Add
            </button>
          </form>
          <div className="settings-list">
            {categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                deleting={deleteTarget === `category:${category.id}`}
                onDeleteIntent={() =>
                  setDeleteTarget(`category:${category.id}`)
                }
                onRefresh={load}
                onError={setError}
              />
            ))}
          </div>
          <p className="settings-footnote">
            At least one category is required. Categories already used by
            expenses cannot be deleted; renaming updates every linked expense
            automatically.
          </p>
        </section>
      </div>
    </div>
  );
}
