// Single source of truth for color design tokens. Keys are token names without
// the "--" prefix; values are hex strings so contrastRatio can consume them.
// Spacing and type scales live in app/globals.css only.
export const TOKENS: Record<string, string> = {
  ink: "#14171F",
  canvas: "#F5F7FA",
  surface: "#FFFFFF",
  line: "#DFE3EB",
  text: "#20232C",
  muted: "#5F6673",
  primary: "#3449E0",
  "primary-pressed": "#2537B8",
  "primary-wash": "#ECEFFE",
  "accent-line": "#B9FF00",
  success: "#30866A",
  warning: "#E49A25",
  danger: "#D85252",
  "ramp-1": "#ECEFFE",
  "ramp-2": "#C3CBFA",
  "ramp-3": "#8EA0FF",
  "ramp-4": "#5467E8",
  "ramp-5": "#3449E0",
  "ramp-6": "#2537B8"
};

// Hard ceiling on hex literals in the legacy sheets, excluding :root and @theme.
// Later migration tasks lower this as screens move to tokens.
export const LEGACY_HEX_BUDGET = 1172;

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  let digits = hex.replace("#", "");
  if (digits.length === 3) {
    digits = digits.split("").map((d) => d + d).join("");
  }
  const r = channelToLinear(parseInt(digits.slice(0, 2), 16));
  const g = channelToLinear(parseInt(digits.slice(2, 4), 16));
  const b = channelToLinear(parseInt(digits.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2.1 contrast ratio between two hex colors.
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Removes a top-level `selector { ... }` block, matching nested braces.
function stripBlocks(css: string, selector: RegExp): string {
  let out = "";
  let index = 0;
  const pattern = new RegExp(selector.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const open = css.indexOf("{", match.index);
    if (open === -1) {
      break;
    }
    let depth = 1;
    let close = open + 1;
    while (close < css.length && depth > 0) {
      if (css[close] === "{") depth += 1;
      else if (css[close] === "}") depth -= 1;
      close += 1;
    }
    out += css.slice(index, match.index);
    index = close;
    pattern.lastIndex = close;
  }
  return out + css.slice(index);
}

// Counts hex color literals outside :root and @theme blocks.
export function countLegacyHex(css: string): number {
  const stripped = stripBlocks(stripBlocks(css, /:root\s*\{/), /@theme\s*\{/);
  return (stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}
