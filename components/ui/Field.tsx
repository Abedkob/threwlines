"use client";

import { useId, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";

export type FieldProps = {
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

// 32px tall, --line border, 13px text, label above at 12px in --muted (the direction's
// Components section). Utilities only: no `.field` class, so none of the legacy 45px input
// geometry or its soft blue focus halo comes back.
const INPUT = [
  "h-8 w-full rounded-control border border-line bg-surface px-3 text-sm text-text",
  "placeholder:text-muted",
  "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent",
  "transition-colors duration-[120ms] ease-out motion-reduce:transition-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

/**
 * A labelled text input. The error is held back until the field has been edited, which the
 * direction requires: a form that opens with every empty field already shouting is unreadable.
 * Validation stays with the caller; this only decides when its message may be shown.
 *
 * Error copy says what to do, not what went wrong - "Enter an amount", never "Invalid input".
 */
export function Field({ label, error, className, onChange, ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [edited, setEdited] = useState(false);
  const showError = Boolean(error) && edited;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!edited) setEdited(true);
    onChange?.(event);
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs text-muted">
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        onChange={handleChange}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errorId : props["aria-describedby"]}
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
