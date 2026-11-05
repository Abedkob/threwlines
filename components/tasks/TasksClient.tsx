"use client";

import { Children, FormEvent, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { TaskDeleteDialog } from "@/components/tasks/TaskDeleteDialog";
import { Pagination } from "@/components/ui/Pagination";
import { apiFetch, buildQuery, jsonBody } from "@/lib/api/client";
import { fmtDay, initials } from "@/lib/format";
import type {
  Profile,
  PagedResult,
  Task,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from "@/types/db";

type View = "open" | "done" | "all";

// Checklist row actions: always visible on touch, revealed on hover from md up.
const ROW_ACTION =
  "h-6 shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100";

function ChecklistItem({
  item,
  children,
  onRefresh,
}: {
  item: TaskItem;
  children?: React.ReactNode;
  onRefresh: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(item.content);
  const [addingChild, setAddingChild] = useState(false);
  const [childContent, setChildContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await onRefresh();
      return true;
    } catch (caught) {
      window.dispatchEvent(
        new CustomEvent("nosterys:mutation-error", {
          detail:
            caught instanceof Error
              ? caught.message
              : "Checklist change could not be saved.",
        }),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const childCount = children ? Children.count(children) : 0;
  async function remove() {
    const removed = await run(() => apiFetch(`/api/tasks/${item.task_id}/items/${item.id}`, { method: "DELETE" }));
    if (removed) setDeleting(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    await run(() =>
      apiFetch(`/api/tasks/${item.task_id}/items/${item.id}`, {
        method: "PATCH",
        ...jsonBody({ content: content.trim() }),
      }),
    );
    setEditing(false);
  }
  async function addChild(event: FormEvent) {
    event.preventDefault();
    if (!childContent.trim()) return;
    await run(() =>
      apiFetch(`/api/tasks/${item.task_id}/items`, {
        method: "POST",
        ...jsonBody({ content: childContent.trim(), parent_id: item.id, sort_order: 0 }),
      }),
    );
    setChildContent("");
    setAddingChild(false);
  }
  return (
    <div className={item.parent_id ? "ml-5 border-l border-line pl-3" : ""}>
      <div className="group flex min-h-8 items-center gap-2 border-b border-line py-1 last:border-b-0">
        <button
          className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border p-0 leading-none transition-colors ${
            item.done
              ? "border-success bg-success text-surface"
              : "border-line bg-surface hover:border-primary"
          }`}
          onClick={() =>
            run(() =>
              apiFetch(`/api/tasks/${item.task_id}/items/${item.id}`, {
                method: "PATCH",
                ...jsonBody({ done: !item.done }),
              }),
            )
          }
          disabled={busy}
          aria-label={`${item.done ? "Reopen" : "Complete"} ${item.content}`}
        >
          {item.done ? <Check size={10} strokeWidth={3} aria-hidden="true" /> : null}
        </button>
        {editing ? (
          <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={save}>
            <input
              autoFocus
              value={content}
              onChange={(event) => setContent(event.target.value)}
              aria-label="Checklist item text"
              className="min-w-0 flex-1 rounded-control border border-line px-2 py-1 text-sm"
            />
            <button aria-label="Save item">
              <Save size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setContent(item.content);
              }}
              aria-label="Cancel editing"
            >
              <X size={13} />
            </button>
          </form>
        ) : (
          <>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${item.done ? "text-muted line-through" : "text-text"}`}
            >
              {item.content}
            </span>
            {/* Row actions stay out of the way on pointer devices and stay put
                on touch, where there is no hover to reveal them. */}
            <button
              className={`${ROW_ACTION} row-action`}
              onClick={() => setEditing(true)}
              aria-label={`Edit ${item.content}`}
            >
              <Pencil size={12} />
            </button>
            {!item.parent_id && (
              <button
                className={`${ROW_ACTION} row-action add-child text-xs`}
                onClick={() => setAddingChild((value) => !value)}
                aria-label={`Add sub-item to ${item.content}`}
              >
                <Plus size={12} />
                Sub-item
              </button>
            )}
          </>
        )}
        <button type="button" className={`${ROW_ACTION} row-action checklist-delete-button`} onClick={() => setDeleting(true)} disabled={busy} aria-label={`Delete ${item.content}`} title="Delete checklist item"><Trash2 size={12} /></button>
      </div>
      {addingChild && (
        <form className="add-item-form nested-add" onSubmit={addChild}>
          <span className="branch-hook" />
          <input
            autoFocus
            value={childContent}
            onChange={(event) => setChildContent(event.target.value)}
            placeholder="Add a sub-item"
            required
            className="text-sm"
          />
          <button disabled={busy}>Add</button>
        </form>
      )}
      {children}
      {deleting && <TaskDeleteDialog kind={item.parent_id ? "sub-item" : "item"} name={item.content} childCount={childCount} busy={busy} onClose={() => setDeleting(false)} onConfirm={remove} />}
    </div>
  );
}

function TaskCard({
  task,
  profiles,
  onRefresh,
  onDeleted,
}: {
  task: Task;
  profiles: Profile[];
  onRefresh: () => Promise<unknown>;
  onDeleted: () => Promise<void>;
}) {
  // Collapsed by default: an open checklist editor on every row turned the list
  // into four tasks per screen, which defeats the point of a work queue.
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState(task.assigned_to ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const roots = (task.items ?? []).filter((item) => !item.parent_id);
  const completed = task.items?.filter((item) => item.done).length ?? 0;
  async function run(action: () => Promise<void>, refresh = true) {
    setBusy(true);
    try {
      await action();
      if (refresh) await onRefresh();
      return true;
    } catch (caught) {
      window.dispatchEvent(
        new CustomEvent("nosterys:mutation-error", {
          detail:
            caught instanceof Error
              ? caught.message
              : "Task change could not be saved.",
        }),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function removeTask() {
    const removed = await run(() => apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" }), false);
    if (!removed) return;
    setDeleting(false);
    await onDeleted();
  }
  async function saveTask(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      apiFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        ...jsonBody({
          title: title.trim(),
          assigned_to: assignee || null,
          priority,
          due_date: dueDate || null,
        }),
      }),
    );
    setEditing(false);
  }
  async function addRoot(event: FormEvent) {
    event.preventDefault();
    if (!newItem.trim()) return;
    await run(() =>
      apiFetch(`/api/tasks/${task.id}/items`, {
        method: "POST",
        ...jsonBody({ content: newItem.trim(), parent_id: null, sort_order: roots.length }),
      }),
    );
    setNewItem("");
  }
  return (
    <article
      className={`border-b border-l-[3px] border-line bg-surface transition-colors hover:bg-canvas ${
        task.priority === "high"
          ? "border-l-danger"
          : task.priority === "normal"
            ? "border-l-ramp-3"
            : "border-l-line"
      }`}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <button
          className={`shrink-0 rounded-control p-0.5 ${task.status === "done" ? "text-success" : "text-muted hover:text-primary"}`}
          onClick={() =>
            run(() =>
              apiFetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                ...jsonBody({ status: task.status === "done" ? "open" : "done" }),
              }),
            )
          }
          disabled={busy}
          aria-label={`${task.status === "done" ? "Reopen" : "Complete"} task`}
        >
          {task.status === "done" ? (
            <CheckCircle2 size={19} />
          ) : (
            <Circle size={19} />
          )}
        </button>
        <h2
          className={`min-w-0 flex-1 truncate text-sm ${task.status === "done" ? "text-muted line-through" : "text-text"}`}
          title={task.title}
        >
          {task.title}
        </h2>
        {/* Only "high" is labelled: most tasks are normal, so printing every
            priority put a column of noise beside every title. Low and normal
            are carried by the left edge instead. */}
        {task.priority === "high" && (
          <span className="shrink-0 text-xs text-danger">High</span>
        )}
        {task.assignee ? (
          <span
            className="mini-avatar shrink-0"
            style={{ backgroundColor: task.assignee.color }}
            title={task.assignee.name}
          >
            {initials(task.assignee.name)}
          </span>
        ) : (
          <UserRound size={13} className="shrink-0 text-muted" aria-label="Unassigned" />
        )}
        <span
          className={`shrink-0 text-xs tabular-nums ${
            task.due_date &&
            task.due_date < new Date().toISOString().slice(0, 10) &&
            task.status === "open"
              ? "text-danger"
              : "text-muted"
          }`}
        >
          <CalendarDays size={12} className="mr-1 inline align-[-2px]" />
          {fmtDay(task.due_date)}
        </span>
        {(task.items?.length ?? 0) > 0 && (
          <span
            className="shrink-0 text-xs tabular-nums text-muted"
            title={`${completed} of ${task.items?.length} checklist items done`}
          >
            {completed}/{task.items?.length}
          </span>
        )}
        <button
          className="row-action task-edit-button"
          onClick={() => setEditing((value) => !value)}
          aria-label={`Edit ${task.title}`}
        >
          <Pencil size={14} />
        </button>
        <button
          className={`task-expand ${expanded ? "expanded" : ""}`}
          onClick={() => setExpanded((value) => !value)}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${task.title}`}
        >
          <ChevronDown size={17} />
        </button>
      </header>
      {editing && (
        <form className="task-edit-panel" onSubmit={saveTask}>
          <label className="field span-2">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Assignee</span>
            <select
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
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
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority)
              }
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="field">
            <span>Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <div className="task-edit-actions">
            <button type="button" className="button task-delete-trigger" onClick={() => setDeleting(true)} disabled={busy}><Trash2 size={14} /> Delete task</button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={busy}>
              Save changes
            </button>
          </div>
        </form>
      )}
      {expanded && (
        <div className="task-checklist">
          {roots.map((root) => (
            <ChecklistItem key={root.id} item={root} onRefresh={onRefresh}>
              {(task.items ?? [])
                .filter((item) => item.parent_id === root.id)
                .map((child) => (
                  <ChecklistItem
                    key={child.id}
                    item={child}
                    onRefresh={onRefresh}
                  />
                ))}
            </ChecklistItem>
          ))}
          {!roots.length && (
            <p className="empty-inline">
              Break this task into clear checklist items.
            </p>
          )}
          <form className="add-item-form" onSubmit={addRoot}>
            <Plus size={14} />
            <input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add a checklist item"
              required
              className="text-sm"
            />
            <button disabled={busy} className="text-xs">
              Add
            </button>
          </form>
        </div>
      )}
      {deleting && <TaskDeleteDialog kind="task" name={task.title} childCount={task.items?.length ?? 0} busy={busy} onClose={() => setDeleting(false)} onConfirm={removeTask} />}
    </article>
  );
}

export function TasksClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const requestedPageSize = [25, 50, 100].includes(
    Number(searchParams.get("pageSize")),
  )
    ? Number(searchParams.get("pageSize"))
    : 25;
  const requestedView = searchParams.get("view");
  const view: View =
    requestedView === "done" || requestedView === "all"
      ? requestedView
      : "open";
  const [result, setResult] = useState<PagedResult<Task>>({
    rows: [],
    page: requestedPage,
    pageSize: requestedPageSize,
    total: 0,
    totalPages: 1,
  });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [taskData, profileData] = await Promise.all([
        apiFetch<PagedResult<Task>>(
          `/api/tasks${buildQuery({
            page: requestedPage,
            pageSize: requestedPageSize,
            status: view,
          })}`,
        ),
        apiFetch<Profile[]>("/api/profiles"),
      ]);
      setResult(taskData);
      setProfiles(profileData);
      return taskData;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Tasks could not be loaded.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestedPage, requestedPageSize, view]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const showError = (event: Event) =>
      setError((event as CustomEvent<string>).detail);
    window.addEventListener("nosterys:mutation-error", showError);
    return () =>
      window.removeEventListener("nosterys:mutation-error", showError);
  }, []);
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
  if (loading)
    return (
      <div className="surface loading-state">
        <span className="spinner" />
        Loading tasks…
      </div>
    );
  return (
    <div className="tasks-view">
      <div className="workspace-toolbar">
        <div className="segmented">
          {(["open", "done", "all"] as View[]).map((value) => (
            <button
              key={value}
              className={view === value ? "selected" : ""}
              onClick={() => updateQuery({ view: value, page: 1 })}
            >
              {value}
              {view === value && <span>{result.total}</span>}
            </button>
          ))}
        </div>
        <button
          className="button button-primary"
          onClick={() => setNewOpen(true)}
        >
          <Plus size={16} />
          New task
        </button>
      </div>
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      <section className="overflow-hidden rounded-surface border border-line bg-surface [&>article:last-child]:border-b-0">
        {result.rows.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            profiles={profiles}
            onRefresh={load}
            onDeleted={async () => {
              const next = await load();
              if (next && next.rows.length === 0 && next.total > 0 && requestedPage > 1)
                updateQuery({ page: requestedPage - 1 });
            }}
          />
        ))}
      </section>
      {!result.rows.length && (
        <div className="surface empty-state">
          <span>
            <ListChecks size={24} />
          </span>
          <h3>{view === "open" ? "Open slate" : "Nothing here yet"}</h3>
          <p>
            {view === "open"
              ? "Create a task to give the next move an owner."
              : "Tasks in this state will appear here."}
          </p>
          {view === "open" && (
            <button
              className="button button-primary"
              onClick={() => setNewOpen(true)}
            >
              <Plus size={16} />
              Create task
            </button>
          )}
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
      {newOpen && (
        <NewTaskModal
          profiles={profiles}
          onClose={() => setNewOpen(false)}
          onCreated={async () => {
            setNewOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
