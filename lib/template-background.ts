// The decorative background chosen for an invoice template. The value is
// persisted in document_templates.config and frozen into each invoice's own
// config when it is finalised, so it is data, not just a UI flag.
//
// "threwlines-wave" is the pre-rename spelling. Templates are migrated, but the
// copies frozen into historical invoices are a record of what was sent to a
// customer and are deliberately left alone - so reads accept both spellings
// forever. Only WAVE_BACKGROUND is ever written.
//
// Kept import-free so it can be unit tested: the components that use it resolve
// through the "@/" alias, which the test runner does not resolve.

export const WAVE_BACKGROUND = "signature-wave";
export const LEGACY_WAVE_BACKGROUND = "threwlines-wave";

export function isWaveBackground(style: string | null | undefined): boolean {
  return style === WAVE_BACKGROUND || style === LEGACY_WAVE_BACKGROUND;
}

// Collapses both stored spellings onto the one class the stylesheet defines, so
// an invoice finalised before the rename renders exactly as it did then.
export function backgroundClass(style: string | null | undefined): string {
  return isWaveBackground(style) ? WAVE_BACKGROUND : "clean";
}
