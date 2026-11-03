"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "icon";

export type ButtonProps = {
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>;

// Utilities only, no legacy class names: emitting `button button-primary` here would pull back
// the 43px pill with the blue drop shadow that this migration replaces.
//
// 32px tall, 6px radius, 13px label, sentence case, verb first (the direction's Components and
// Writing sections). The 4px gap between icon and label is the half-step the 8px grid allows
// inside a control; 12px horizontal padding is on the grid.
const BASE = [
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-control",
  "text-sm font-medium",
  // One focus mechanism, drawn from the shared token so it matches every other control. The
  // transparent outline keeps an indicator in forced-colors mode, where box-shadow is dropped.
  "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent",
  // Motion only in response to an action, 120ms ease-out, removed under reduced motion.
  "transition-colors duration-[120ms] ease-out motion-reduce:transition-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary px-3 text-surface hover:bg-primary-pressed",
  secondary: "border border-line bg-surface px-3 text-text hover:bg-canvas",
  // --danger-pressed, not --danger-fill: white on --danger-fill is 4.0:1, the exact AA failure
  // Task 2 fixed on this button, so tinting toward the fill variant would reintroduce it.
  danger: "bg-danger px-3 text-surface hover:bg-danger-pressed active:bg-danger-pressed",
  // A 32px square, transparent until hover.
  icon: "w-8 bg-transparent text-muted hover:bg-canvas",
};

/**
 * The one button in the product. `secondary` is the default because the direction allows at
 * most one `primary` per view, so the louder variant has to be asked for.
 */
export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={[BASE, VARIANT[variant], className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
