"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CircleDollarSign,
  Pencil,
  Plus,
  Receipt,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, buildQuery, jsonBody } from "@/lib/api/client";
import { Pagination } from "@/components/ui/Pagination";
import { EditExpenseModal } from "@/components/expenses/EditExpenseModal";
import { fmtDay, initials, money } from "@/lib/format";
import type {
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  PagedResult,
  Profile,
} from "@/types/db";

export function ExpensesClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const requestedPageSize = [25, 50, 100].includes(
    Number(searchParams.get("pageSize")),
  )
    ? Number(searchParams.get("pageSize"))
    : 25;
  const [result, setResult] = useState<PagedResult<Expense>>({
    rows: [],
    page: requestedPage,
    pageSize: requestedPageSize,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<ExpenseSummary>({
    total: 0,
    categories: [],
    payers: [],
  });
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const role = useAuth().user.role;
  const [editing, setEditing] = useState<Expense | null>(null);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [expenseData, summaryData, categoryData, profileData] =
        await Promise.all([
          apiFetch<PagedResult<Expense>>(
            `/api/expenses${buildQuery({
              page: requestedPage,
              pageSize: requestedPageSize,
            })}`,
          ),
          apiFetch<ExpenseSummary>("/api/expenses/summary"),
          apiFetch<ExpenseCategory[]>("/api/expenses/categories"),
          apiFetch<Profile[]>("/api/profiles"),
        ]);
      setResult(expenseData);
      setSummary(summaryData);
      setCategories(categoryData);
      setProfiles(profileData);
      setCategoryId((current) => current || categoryData[0]?.id || "");
      setPaidBy((current) => current || profileData[0]?.id || "");
      return expenseData;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Expenses could not be loaded.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestedPage, requestedPageSize]);
  useEffect(() => {
    void load();
  }, [load]);
  const total = summary.total;
  const categoryTotals = summary.categories;
  const payerTotals = summary.payers;
  const updateQuery = useCallback(
    (updates: Record<string, string | number>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) =>
        next.set(key, String(value)),
      );
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
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
      await apiFetch("/api/expenses", {
        method: "POST",
        ...jsonBody({
          amount: numeric,
          category_id: categoryId,
          description: description.trim() || null,
          spent_on: spentOn,
          paid_by: paidBy,
        }),
      });
      setAmount("");
      setDescription("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Expense could not be logged.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className="surface loading-state">
        <span className="spinner" />
        Loading expenses…
      </div>
    );
  return (
    <div className="expenses-view">
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      <div className="expenses-grid">
        <section className="surface expense-entry-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">New outflow</p>
              <h2>Log an expense</h2>
            </div>
            <span className="expense-entry-icon">
              <CircleDollarSign size={18} />
            </span>
          </header>
          <form className="expense-form" onSubmit={submit}>
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
                  placeholder="0.00"
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
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What was this for?"
              />
            </label>
            <button
              className="button button-primary span-2"
              disabled={saving || !categories.length || !profiles.length}
            >
              <Plus size={15} />
              {saving ? "Logging…" : "Log expense"}
            </button>
          </form>
        </section>
        <section className="surface expense-breakdown-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Category mix</p>
              <h2>Where it went</h2>
            </div>
            <strong className="large-total">{money(total)}</strong>
          </header>
          <div className="expense-category-list">
            {categoryTotals.map((category, index) => (
              <div className="category-breakdown" key={category.id}>
                <span className="category-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <div>
                    <strong>{category.name}</strong>
                    <span>{money(category.total)}</span>
                  </div>
                  <div className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${total ? (category.total / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="surface payer-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Team balance</p>
              <h2>Who paid</h2>
            </div>
          </header>
          <div className="payer-list">
            {payerTotals.map((profile) => (
              <article className="payer-row" key={profile.id}>
                <span
                  className="avatar"
                  style={{ backgroundColor: profile.color }}
                >
                  {initials(profile.name)}
                </span>
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.entries} expenses</small>
                </div>
                <span>{money(profile.total)}</span>
                <div className="payer-share">
                  <span
                    style={{
                      width: `${total ? (profile.total / total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="surface recent-expenses">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Ledger</p>
              <h2>Recent expenses</h2>
            </div>
            <div className="ledger-heading-meta">
              {role === "superadmin" && (
                <span className="admin-badge">
                  <ShieldCheck size={12} /> Superadmin
                </span>
              )}
              <span>{result.total} entries</span>
            </div>
          </header>
          {result.rows.length ? (
            <>
              <div className="expense-table-wrap">
                <table className="expense-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Paid by</th>
                      <th>Date</th>
                      <th>Amount</th>
                      {role === "superadmin" && <th aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((expense) => (
                      <tr key={expense.id}>
                        <td>
                          <span className="receipt-icon">
                            <Receipt size={14} />
                          </span>
                          <strong>
                            {expense.description || "Untitled expense"}
                          </strong>
                        </td>
                        <td>
                          <span className="category-chip">
                            {expense.category?.name ?? "Uncategorized"}
                          </span>
                        </td>
                        <td>
                          {expense.payer ? (
                            <span className="owner-cell">
                              <span
                                className="mini-avatar"
                                style={{ backgroundColor: expense.payer.color }}
                              >
                                {initials(expense.payer.name)}
                              </span>
                              {expense.payer.name}
                            </span>
                          ) : (
                            <span className="muted">Unknown</span>
                          )}
                        </td>
                        <td>
                          <span className="date-cell">
                            <CalendarDays size={12} />
                            {fmtDay(expense.spent_on)}
                          </span>
                        </td>
                        <td>
                          <strong>{money(expense.amount)}</strong>
                        </td>
                        {role === "superadmin" && (
                          <td>
                            <button
                              className="icon-button expense-edit-button"
                              onClick={() => setEditing(expense)}
                              aria-label={`Edit ${expense.description || "expense"}`}
                            >
                              <Pencil size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-expense-list" aria-label="Expense ledger">
                {result.rows.map((expense) => (
                  <article className="mobile-expense-card" key={expense.id}>
                    <span className="receipt-icon">
                      <Receipt size={15} />
                    </span>
                    <div className="mobile-expense-copy">
                      <strong>
                        {expense.description || "Untitled expense"}
                      </strong>
                      <span>
                        <span className="category-chip">
                          {expense.category?.name ?? "Uncategorized"}
                        </span>
                        <span className="date-cell">
                          <CalendarDays size={12} />
                          {fmtDay(expense.spent_on)}
                        </span>
                      </span>
                      <small>{expense.payer?.name ?? "Unknown payer"}</small>
                    </div>
                    <strong className="mobile-expense-amount">
                      {money(expense.amount)}
                    </strong>
                    {role === "superadmin" && (
                      <button
                        className="icon-button mobile-expense-edit"
                        onClick={() => setEditing(expense)}
                        aria-label={`Edit ${expense.description || "expense"}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="panel-empty compact">
              <span>
                <Receipt size={18} />
              </span>
              <div>
                <strong>No expenses yet</strong>
                <p>Log the first purchase using the form.</p>
              </div>
            </div>
          )}
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            totalPages={result.totalPages}
            onPageChange={(page) => updateQuery({ page })}
            onPageSizeChange={(pageSize) => updateQuery({ pageSize, page: 1 })}
          />
        </section>
      </div>
      {editing && (
        <EditExpenseModal
          expense={editing}
          categories={categories}
          profiles={profiles}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          onDeleted={async () => {
            setEditing(null);
            // Deleting the last row on a page leaves it empty; step back so the
            // ledger does not read "51-50 of 50" with nothing under it.
            const next = await load();
            if (next && next.rows.length === 0 && next.total > 0 && requestedPage > 1) {
              updateQuery({ page: requestedPage - 1 });
            }
          }}
        />
      )}
    </div>
  );
}
