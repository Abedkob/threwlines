"use client";

import { FormEvent, useState } from "react";
import { Save, Trash2, X } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { useDialogFocus } from "@/lib/useDialogFocus";
import type { Expense, ExpenseCategory, Profile } from "@/types/db";

export function EditExpenseModal({
  expense,
  categories,
  profiles,
  onClose,
  onSaved,
  onDeleted,
}: {
  expense: Expense;
  categories: ExpenseCategory[];
  profiles: Profile[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(expense.amount));
  const [categoryId, setCategoryId] = useState(
    expense.category_id ?? categories[0]?.id ?? "",
  );
  const [description, setDescription] = useState(expense.description ?? "");
  const [spentOn, setSpentOn] = useState(expense.spent_on);
  const [paidBy, setPaidBy] = useState(
    expense.paid_by ?? profiles[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid expense amount.");
      return;
    }
    if (!categoryId || !paidBy) {
      setError("Choose a category and payer.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        ...jsonBody({
          amount: numericAmount,
          category_id: categoryId,
          description: description.trim() || null,
          spent_on: spentOn,
          paid_by: paidBy,
        }),
      });
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Expense changes could not be saved.",
      );
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      await onDeleted();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Expense could not be deleted.",
      );
      setDeleting(false);
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
        className="modal small-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-expense-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Superadmin control</p>
            <h2 id="edit-expense-title">Edit expense</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Amount</span>
              <div className="money-input">
                <span>$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Paid by</span>
              <select
                value={paidBy}
                onChange={(event) => setPaidBy(event.target.value)}
                required
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={spentOn}
                onChange={(event) => setSpentOn(event.target.value)}
                required
              />
            </label>
            <label className="field span-2">
              <span>Description</span>
              <textarea
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What was this for?"
              />
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div
            className={`expense-danger-zone ${confirmDelete ? "confirming" : ""}`}
          >
            <div>
              <strong>
                {confirmDelete
                  ? "Delete this expense permanently?"
                  : "Delete expense"}
              </strong>
              <p>
                {confirmDelete
                  ? "This action cannot be undone."
                  : "Only superadmins can remove ledger entries."}
              </p>
            </div>
            {confirmDelete && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Keep expense
              </button>
            )}
            <button
              type="button"
              className="button button-danger"
              onClick={remove}
              disabled={saving || deleting}
            >
              <Trash2 size={15} />
              {deleting
                ? "Deleting..."
                : confirmDelete
                  ? "Delete permanently"
                  : "Delete"}
            </button>
          </div>
          <footer className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={saving || deleting}
            >
              <Save size={15} />
              {saving ? "Saving..." : "Save changes"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
