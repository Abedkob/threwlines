"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, InputHTMLAttributes } from "react";

export type FieldProps = {
  label: string;
  error?: string;
  /**
   * Overrides when the error may be shown. Pass `true` after a failed submit so a field the
   * user never touched still explains itself, or `false` to force it back out of sight.
   * Leave it off and the field decides for itself: the error appears once the field has been
   * edited or left, and a reset on the owning form puts it away again.
   */
  touched?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

// 32px tall, --line border, 13px text, label above at 12px in --muted (the direction's
// Components section). Utilities only: no `.field` class, so none of the legacy 45px input
// geometry or its soft blue focus halo comes back.
//
// `appearance-none` because Preflight is off: the UA stylesheet still styles a bare <input>.
const INPUT = [
  "h-8 w-full appearance-none rounded-control border border-line bg-surface px-3 text-sm text-text",
  "placeholder:text-muted",
  "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent",
  "transition-colors duration-[120ms] ease-out motion-reduce:transition-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

/**
 * A labelled text input. The error is held back until the field has been edited or left, which
 * the direction requires: a form that opens with every empty field already shouting is
 * unreadable. Validation stays with the caller; this only decides when its message may show.
 *
 * Error copy says what to do, not what went wrong - "Enter an amount", never "Invalid input".
 *
 * Deferred: select and textarea variants. Those screens are paused behind a backend migration
 * that may reshape them, so the shape is not fixed here. When they resume, the suggested
 * approach is either an `as` prop ("input" | "select" | "textarea") switching the rendered
 * element while keeping this label, error and timing logic, or a render-prop child handed the
 * `id` and `aria-describedby` this component computes, so the caller renders its own control.
 */
export function Field({ label, error, touched, className, onChange, onBlur, ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const errorId = `${inputId}-error`;
  const input = useRef<HTMLInputElement>(null);
  const [interacted, setInteracted] = useState(false);
  // An explicit `touched` wins; otherwise the field's own history decides.
  const showError = Boolean(error) && (touched ?? interacted);

  // A programmatic form.reset() has to clear the error state too, or a cleared form keeps
  // complaining about values that are no longer in it.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setInteracted(false);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setInteracted(true);
    onChange?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setInteracted(true);
    onBlur?.(event);
  }

  // Merged, not replaced: a caller pointing at its own hint keeps it, and the error is added.
  const describedBy =
    [props["aria-describedby"], showError ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs text-muted">
        {label}
      </label>
      <input
        {...props}
        ref={input}
        id={inputId}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={showError || undefined}
        aria-describedby={describedBy}
        className={[INPUT, className].filter(Boolean).join(" ")}
      />
      {showError && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
