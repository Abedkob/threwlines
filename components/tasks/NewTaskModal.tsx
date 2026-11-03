"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api/client";
import { useDialogFocus } from "@/lib/useDialogFocus";
import type { Profile, TaskPriority } from "@/types/db";

export function NewTaskModal({
  profiles,
  onClose,
  onCreated,
}: {
  profiles: Profile[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState(profiles[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        ...jsonBody({
          title: title.trim(),
          assigned_to: assignedTo || null,
          due_date: dueDate || null,
          priority,
        }),
      });
      await onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Task could not be created.",
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
        className="modal small-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">New work order</p>
            <h2 id="new-task-title">Create task</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field span-2">
              <span>Title</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to happen?"
                required
              />
            </label>
            <label className="field">
              <span>Assignee</span>
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
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
            <label className="field span-2">
              <span>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
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
              {saving ? "Creating…" : "Create task"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
