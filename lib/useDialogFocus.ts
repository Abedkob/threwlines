"use client";

import { useEffect, useRef } from "react";

const focusable =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus<T extends HTMLElement>(onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Capture the opener during render, not inside the effect. React applies
  // `autoFocus` while committing the dialog, which is before effects run — so
  // reading document.activeElement in the effect returns the dialog's own
  // first field, and closing then "restores" focus to a detached node and
  // drops the user on <body>.
  const openerRef = useRef<HTMLElement | null>(
    typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement,
  );

  useEffect(() => {
    const previous = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(focusable),
      ].filter((element) => element.offsetParent !== null);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keydown);
    // Focus synchronously: the DOM is committed by the time effects run, and
    // requestAnimationFrame never fires while the tab is not painting, which
    // would leave the dialog open with focus still behind it. The contains()
    // check keeps a field's own autoFocus if it already took focus.
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.querySelector<HTMLElement>(focusable)?.focus();
    }
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      // Only if it is still in the document; focusing a removed node silently
      // leaves focus on <body>.
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return dialogRef;
}
