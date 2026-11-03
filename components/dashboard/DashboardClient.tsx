"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Flame,
  Layers3,
  Receipt,
  WalletCards,
} from "lucide-react";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";
import { HeatChip } from "@/components/contacts/HeatChip";
import { apiFetch } from "@/lib/api/client";
import { fmtDay, initials, money } from "@/lib/format";
import type {
  Contact,
  ContactStage,
  DashboardSummary,
  Profile,
  Task,
} from "@/types/db";

const pipelineStages: { stage: ContactStage; label: string }[] = [
  { stage: "new", label: "New" },
  { stage: "contacted", label: "Contacted" },
  { stage: "replied", label: "Replied" },
  { stage: "negotiating", label: "Negotiating" },
  { stage: "customer", label: "Customer" },
];
const emptySummary: DashboardSummary = {
  need_attention: 0,
  active_pipeline: 0,
  negotiating: 0,
  collected: 0,
  pending: 0,
  spent: 0,
  my_open_tasks: 0,
  pipeline_counts: {},
  expense_categories: [],
};

export function DashboardClient() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [attention, setAttention] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [summaryData, attentionData, taskData, profileData] =
        await Promise.all([
          apiFetch<DashboardSummary>("/api/dashboard"),
          apiFetch<Contact[]>("/api/contacts/attention?limit=5"),
          apiFetch<Task[]>("/api/tasks/mine?limit=5"),
          apiFetch<Profile[]>("/api/profiles"),
        ]);
      setSummary(summaryData);
      setAttention(attentionData);
      setTasks(taskData);
      setProfiles(profileData);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Dashboard could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function refreshContact(id: string) {
    setSelected(await apiFetch<Contact>(`/api/contacts/${id}`));
    await load();
  }
  function keyOpen(event: React.KeyboardEvent, contact: Contact) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(contact);
    }
  }
  const net = summary.collected - summary.spent;
  const maxPipeline = Math.max(
    1,
    ...pipelineStages.map(({ stage }) =>
      Number(summary.pipeline_counts[stage] ?? 0),
    ),
  );

  if (loading)
    return (
      <div className="surface loading-state">
        <span className="spinner" />
        Reading the team pulse…
      </div>
    );
  return (
    <div className="dashboard-view">
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      <section className="stat-grid" aria-label="Workspace totals">
        <article className="stat-card attention-stat">
          <span className="stat-icon">
            <Flame size={17} />
          </span>
          <div>
            <p>Need attention</p>
            <strong>{summary.need_attention}</strong>
            <small>across all active contacts</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <Layers3 size={17} />
          </span>
          <div>
            <p>Active pipeline</p>
            <strong>{summary.active_pipeline}</strong>
            <small>{summary.negotiating} negotiating</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <CircleDollarSign size={17} />
          </span>
          <div>
            <p>Collected</p>
            <strong>{money(summary.collected)}</strong>
            <small>{money(summary.pending)} pending</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">
            <WalletCards size={17} />
          </span>
          <div>
            <p>Spent / net</p>
            <strong>{money(summary.spent)}</strong>
            <small>{money(net)} net</small>
          </div>
        </article>
      </section>
      <div className="dashboard-grid">
        <section className="surface attention-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Attention queue</p>
              <h2>Relationships cooling down</h2>
            </div>
            <span>{summary.need_attention} total</span>
          </header>
          <div className="attention-list">
            {attention.map((contact, index) => (
              <article
                key={contact.id}
                className="attention-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelected(contact)}
                onKeyDown={(event) => keyOpen(event, contact)}
                aria-label={`Open ${contact.name}`}
              >
                <span className="queue-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="table-avatar">{initials(contact.name)}</span>
                <div className="attention-copy">
                  <strong>{contact.name}</strong>
                  <small>{contact.notes || `Currently ${contact.stage}`}</small>
                </div>
                <span className={`stage-chip stage-${contact.stage}`}>
                  {contact.stage}
                </span>
                <HeatChip contact={contact} />
                <ArrowRight size={14} />
              </article>
            ))}
          </div>
          {!attention.length && (
            <div className="panel-empty">
              <span>
                <Flame size={19} />
              </span>
              <div>
                <strong>No cooling relationships</strong>
                <p>Every active contact was touched within the last week.</p>
              </div>
            </div>
          )}
        </section>
        <section className="surface pipeline-meter-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Flow</p>
              <h2>Pipeline shape</h2>
            </div>
          </header>
          <div className="pipeline-meters">
            {pipelineStages.map(({ stage, label }) => {
              const count = Number(summary.pipeline_counts[stage] ?? 0);
              return (
                <div className="pipeline-meter" key={stage}>
                  <div>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      className={`bar-fill fill-${stage}`}
                      style={{ width: `${(count / maxPipeline) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="surface expense-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">Outflow</p>
              <h2>Expense mix</h2>
            </div>
            <span>{money(summary.spent)}</span>
          </header>
          <div className="expense-bars">
            {summary.expense_categories.slice(0, 5).map(({ name, total }) => (
              <div className="expense-bar" key={name}>
                <div>
                  <span>{name}</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${summary.spent ? (total / summary.spent) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {!summary.expense_categories.length && (
            <div className="panel-empty compact">
              <span>
                <Receipt size={18} />
              </span>
              <div>
                <strong>No expenses logged</strong>
                <p>Category totals will appear here.</p>
              </div>
            </div>
          )}
        </section>
        <section className="surface tasks-panel">
          <header className="panel-heading">
            <div>
              <p className="eyebrow">My work</p>
              <h2>Open tasks</h2>
            </div>
            <span>{summary.my_open_tasks} total</span>
          </header>
          <div className="dashboard-tasks">
            {tasks.map((task) => {
              const done = task.items?.filter((item) => item.done).length ?? 0;
              const total = task.items?.length ?? 0;
              return (
                <article className="dashboard-task" key={task.id}>
                  <span className={`priority-mark priority-${task.priority}`} />
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {total
                        ? `${done}/${total} checklist items`
                        : "No checklist yet"}
                    </small>
                  </div>
                  <span className="task-due">
                    <CalendarDays size={12} />
                    {fmtDay(task.due_date)}
                  </span>
                </article>
              );
            })}
          </div>
          {!tasks.length && (
            <div className="panel-empty compact">
              <span>
                <CalendarDays size={18} />
              </span>
              <div>
                <strong>Nothing assigned</strong>
                <p>Your open tasks will appear here.</p>
              </div>
            </div>
          )}
        </section>
      </div>
      {selected && (
        <ContactDrawer
          contact={selected}
          profiles={profiles}
          onClose={() => setSelected(null)}
          onChanged={refreshContact}
        />
      )}
    </div>
  );
}
