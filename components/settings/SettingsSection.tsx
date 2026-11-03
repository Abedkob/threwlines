"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One collapsible settings module. Settings was a single wall of cards where
 * everything was open at once; each concern now sits behind its own header so
 * the page reads as a list of things you can change.
 *
 * The trigger is type="button" on purpose: these sections live inside the
 * billing <form>, and a default-type button would submit it on every toggle.
 */
export function SettingsSection({
  title,
  summary,
  icon,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  icon?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="overflow-hidden rounded-surface border border-line bg-surface">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
        >
          {icon ? (
            <span className="shrink-0 text-muted" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-text">{title}</span>
            <span className="block text-xs text-muted">{summary}</span>
          </span>
          {meta ? <span className="shrink-0 text-xs tabular-nums text-muted">{meta}</span> : null}
          <ChevronDown
            size={16}
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className="border-t border-line p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
