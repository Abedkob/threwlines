"use client";

import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

// Tab stops inside the dialog. The dialog container itself carries tabIndex={-1} so that it can
// take initial focus, and is excluded here by the [tabindex="-1"] clause.
const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable]:not([contenteditable='false'])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * The footer row. Optional, and separate from `children` so that "bottom-right, primary
   * action last" is spelled once here instead of 60 times at the call sites.
   */
  actions?: ReactNode;
};

/**
 * --surface, 10px radius, overlay shadow, 20/28 title, no decorative icon in the header.
 * The shadow token is used here because this is an overlay; in-flow surfaces get the --line
 * hairline and nothing else.
 */
export function Modal({ open, onClose, title, children, actions }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  // Call sites pass an inline arrow for onClose, so depending on it directly would re-run the
  // effect below on every render and pull focus out of whatever the user was typing in.
  const latestOnClose = useRef(onClose);

  useEffect(() => {
    latestOnClose.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    // Keyboard has to be able to leave: Escape closes, and focus starts inside the dialog
    // rather than behind it. Focus returns to whatever opened the modal on close.
    const opener = document.activeElement as HTMLElement | null;
    // The page behind an open dialog must not scroll: on a trackpad the
    // content slides away under the overlay and the dialog appears to drift.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        latestOnClose.current();
        return;
      }
      // aria-modal="true" is a promise to assistive technology that the rest of the page is
      // unreachable. Without a trap, Tab walks straight out of the dialog into the page behind
      // the overlay, where the user cannot see what they have focused.
      if (event.key !== "Tab") return;
      const root = dialog.current;
      if (!root) return;
      const stops = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      const active = document.activeElement;
      if (stops.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const outside = !(active instanceof Node) || !root.contains(active);
      if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (outside || active === first || active === root)) {
        event.preventDefault();
        last.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  function onOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 p-6"
      onMouseDown={onOverlayMouseDown}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[calc(100vh-48px)] w-[min(600px,100%)] flex-col overflow-y-auto rounded-surface border border-line bg-surface shadow-[var(--shadow)] focus-visible:outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id={titleId} className="text-lg font-medium tracking-[-0.02em] text-text">
            {title}
          </h2>
          <Button variant="icon" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </Button>
        </header>
        <div className="px-6 py-4 text-base text-text">{children}</div>
        {actions && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
