# Tailwind Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 6,007 lines of hand-written global CSS with a single token-driven Tailwind v4 system, without visually regressing any screen or any printed invoice.

**Architecture:** Strangler migration in three phases. Phase A tokenizes the existing CSS in place, so consistency and accessibility land before Tailwind is installed and remain useful even if the migration stops there. Phase B installs Tailwind v4 with Preflight disabled and the legacy sheets demoted into a `legacy` cascade layer, so utilities win over old rules and both can coexist. Phase C converts shared primitives first, then one screen per task, deleting legacy CSS as it goes; the print stylesheet is converted last, or not at all.

**Tech Stack:** Next.js 15.2 (App Router), React 19, TypeScript strict, Tailwind CSS v4.3 via `@tailwindcss/postcss`, `node:test` for verification.

**Spec:** None written separately. This plan is self-specifying: the Spec section below is the agreed scope, captured from the 2026-11-03 conversation that requested it.

---

## Spec

**Intent.** The team is spending too much effort on UI work because there is no single source of truth for styling. 1,188 hardcoded hex colors (714 distinct) sit across five global stylesheets against only 395 `var(--…)` references, so one visual change means hunting through 6,007 lines. The goal is consistency and usability first; Tailwind is the vehicle, not the objective.

**Goals.**

1. One source of truth for color, spacing, radius, type and shadow, consumed by both legacy CSS and Tailwind utilities.
2. Every text/background pair in the UI meets WCAG AA (4.5:1 for body text, 3:1 for large text and UI borders).
3. Keyboard focus is visible on every interactive element on every screen.
4. New UI is written in Tailwind utilities; legacy CSS shrinks monotonically, enforced by a test.
5. No visual regression on any existing screen, and no change at all to printed A4 invoice output until a task deliberately addresses it.

**Non-goals.** Redesigning any screen. Changing component structure or data flow. Adding dark mode (the token structure must not preclude it, but no dark theme ships here). Adding a component library (shadcn/ui, Radix, Headless UI). Code-splitting the stylesheets.

**Anti-goals.** A half-migrated app where the same button is styled two ways and nobody knows which wins — this is the failure mode the `legacy` cascade layer and the ratchet test exist to prevent. A rewrite that cannot be stopped at a task boundary. Any change to invoice print output that reaches a customer unreviewed.

**Decisions made while planning (the planner's call, not the user's):** Tailwind v4 with CSS-first `@theme` config rather than v3 plus `tailwind.config.ts`; Preflight disabled until Phase C completes; legacy CSS demoted via `@layer` rather than deleted up front; the Throughline palette from the same conversation used as the token values; print CSS converted last and kept as hand-written CSS permanently.

## Global Constraints

- Tailwind `^4.3`, installed as `tailwindcss @tailwindcss/postcss postcss`. No `tailwind.config.js`/`.ts` — the theme lives in CSS via `@theme`.
- `@import "tailwindcss";` is forbidden until Task 12: it injects Preflight, which resets the browser defaults that 6,007 lines of legacy CSS depend on. Import the theme and utilities layers only.
- Every task ends with `npm run typecheck`, `npm run lint` (zero warnings), `npm test`, and `npm run build` all passing before its commit.
- Two-space indentation, semicolons, double quotes. Components and exported types in `PascalCase`, functions and variables in `camelCase`. Client components begin with `"use client"`.
- Token values are fixed by this plan: ink `#14171F`, canvas `#F5F7FA`, surface `#FFFFFF`, line `#DFE3EB`, primary `#3449E0`, primary-pressed `#2537B8`, primary-wash `#ECEFFE`, accent-line `#B9FF00`, success `#15775B`, warning `#9A5B00`, danger `#C0352A`, muted `#6B7280`, text `#20232C`.
- Never interpolate a Tailwind utility name into a template literal. Tailwind v4 scans source text and cannot see `` `status-${s}` ``; utilities must appear as complete literal strings, so dynamic variants resolve through a `Record<Status, string>` lookup.
- No visual change to `app/document-templates.css` or any `@media print` block before Task 12.

## Review Focus

1. **Printed invoices.** `@media print` blocks at `globals.css:3476`, `globals.css:3480`, `globals.css:3722` and `document-templates.css:405` set A4 page size, `print-color-adjust: exact` and `!important` overrides. An `!important` declaration in the `legacy` layer still beats a normal utility in a higher layer, so print rules survive layering — but Preflight would break them. Task 4 pins this with a test that the print blocks survive the move intact.
2. **Interpolated status classes.** 70 dynamic `className` expressions exist, including `` `status-pill status-${row.status}` `` across invoices, payments and pipeline. Converting the containing screen without converting the lookup silently drops all status coloring — the element renders unstyled rather than erroring. Task 6 pins the lookup; each screen task asserts every status value maps to a non-empty class string.
3. **Mobile layouts.** 31 `mobile-*` classes and 49 `@media` blocks carry the responsive behavior. Tailwind is mobile-first (`md:` means "md and up") while several legacy blocks are max-width based, so a careless conversion inverts the breakpoint. Each screen task checks the screen at 375px and 1280px before its commit.
4. **Focus visibility.** `licensing.css`, `login.css` and `shell.css` contain zero `focus-visible` rules; the global ring in `globals.css` is keyed to the old brand color. Login and the licensing screens are reachable by keyboard today with no visible focus. Task 3 owns this.
5. **Cascade order after the first conversion.** Unlayered CSS beats layered CSS regardless of specificity, so if any legacy sheet is still imported from `app/layout.tsx` rather than through the `legacy` layer, every utility silently loses to it. Task 4's test asserts `layout.tsx` imports exactly one stylesheet.

---

## File Structure

**Created:**

- `lib/design-tokens.ts` — the token map and `contrastRatio()`; the single source of truth that both the test suite and `@theme` are checked against.
- `lib/design-tokens.test.ts` — token and contrast assertions plus the legacy-CSS ratchet.
- `postcss.config.mjs` — registers `@tailwindcss/postcss`.
- `app/legacy/` — the five existing sheets, moved unchanged, imported into `@layer legacy`.
- `components/ui/Button.tsx`, `components/ui/Field.tsx`, `components/ui/Modal.tsx` — Tailwind primitives replacing `.button`, `.field` and `.modal`.
- `lib/status-classes.ts` — `Record<Status, string>` lookups replacing interpolated class names.

**Modified:**

- `app/globals.css` — becomes the entry point: layer declaration, token block, Tailwind imports, `@theme`, legacy imports. Its 3,733 lines of rules move to `app/legacy/globals.css`.
- `app/layout.tsx:2-6` — five CSS imports collapse to one.
- 54 `.tsx` files under `app/` and `components/`, one screen per task in Phase C.

**Deleted (Phase C, progressively):** `app/legacy/*.css` as each screen's rules are converted.

---

# Phase A — Consistency and usability, before Tailwind

### Task 1: Token foundation and the ratchet

**Files:**

- Create: `lib/design-tokens.ts`, `lib/design-tokens.test.ts`
- Modify: `app/globals.css:3-27` (the `:root` block), `package.json` (test script)

**Interfaces:**

- Produces: `TOKENS: Record<string, string>` (token name without the `--` prefix → hex), `contrastRatio(a: string, b: string): number`, `LEGACY_HEX_BUDGET: number`, `countLegacyHex(css: string): number`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/design-tokens.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOKENS, contrastRatio, countLegacyHex, LEGACY_HEX_BUDGET } from "./design-tokens.ts";

test("contrastRatio matches known values", () => {
  assert.equal(Math.round(contrastRatio("#FFFFFF", "#000000")), 21);
  assert.ok(Math.abs(contrastRatio(TOKENS.primary, "#FFFFFF") - 6.61) < 0.02);
});

test("every token is declared in globals.css", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const name of Object.keys(TOKENS)) {
    assert.match(css, new RegExp(`--${name}:\\s*${TOKENS[name]}`, "i"), `missing --${name}`);
  }
});

test("legacy hardcoded hex count does not grow", () => {
  const files = ["globals", "login", "document-templates", "licensing", "shell"];
  const total = files.reduce((n, f) => n + countLegacyHex(readFileSync(`app/${f}.css`, "utf8")), 0);
  assert.ok(total <= LEGACY_HEX_BUDGET, `${total} hex literals exceeds budget ${LEGACY_HEX_BUDGET}`);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types --test lib/design-tokens.test.ts`
Expected: FAIL — cannot find module `./design-tokens.ts`.

- [ ] **Step 3: Implement `lib/design-tokens.ts`**

`contrastRatio` is WCAG 2.1 relative luminance: channel `c/255`, linearize with `c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4`, weight `0.2126/0.7152/0.0722`, then `(lighter+0.05)/(darker+0.05)`. `countLegacyHex` strips `:root{…}` and `@theme{…}` blocks, then counts matches of `/#[0-9a-fA-F]{3,8}\b/g`. Set `LEGACY_HEX_BUDGET = 1188` — today's measured count, which later tasks lower.

- [ ] **Step 4: Rewrite the `:root` block in `app/globals.css` using the Global Constraints values**

Keep every existing variable name as an alias so no legacy rule breaks (`--brand: var(--primary)`, `--vault-lime: var(--accent-line)`), and add the missing scale: `--space-1` through `--space-8` in 4px steps, `--text-xs` through `--text-2xl`, and `--ramp-1` … `--ramp-6` for the lifecycle (`#ECEFFE`, `#C3CBFA`, `#8EA0FF`, `#5467E8`, `#3449E0`, `#2537B8`).

- [ ] **Step 5: Add the test file to the `test` script in `package.json` and run the full suite**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/design-tokens.ts lib/design-tokens.test.ts app/globals.css package.json
git commit -m "Add design token source of truth with legacy CSS ratchet"
```

### Task 2: Accessible status colors

**Files:**

- Modify: `lib/design-tokens.ts`, `lib/design-tokens.test.ts`, `app/globals.css`

**Interfaces:**

- Consumes: `TOKENS`, `contrastRatio` from Task 1.
- Produces: `AA_TEXT_PAIRS: ReadonlyArray<[string, string]>` — token pairs that must clear 4.5:1.

- [ ] **Step 1: Write the failing test**

```ts
test("status text colors meet WCAG AA on light surfaces", () => {
  for (const [fg, bg] of AA_TEXT_PAIRS) {
    const ratio = contrastRatio(TOKENS[fg], TOKENS[bg]);
    assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
  }
});
```

`AA_TEXT_PAIRS` covers `success`, `warning`, `danger`, `primary`, `muted` and `text` against both `surface` and `canvas` — 12 pairs.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types --test lib/design-tokens.test.ts`
Expected: FAIL — the pre-existing values measure 4.43:1 (success), 2.35:1 (attention) and 4.00:1 (danger).

- [ ] **Step 3: Split each status color into a text-safe and a fill variant in `app/globals.css`**

`--success: #15775B` / `--success-fill: #30866A`, `--warning: #9A5B00` / `--warning-fill: #E49A25`, `--danger: #C0352A` / `--danger-fill: #D85252`. Keep the old names pointing at the fill variants so icon and chart rules are untouched.

- [ ] **Step 4: Repoint text and border declarations to the text-safe variants**

Only declarations where the token sets `color` or `border-color` on a light background — `.status-pill`, `.invoice-row-late`, and the expense and license expiry labels. Fills, icon backgrounds and anything inside the dark sidebar keep the fill variants.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS. Then open `/invoices` and `/licensing` and confirm pill text is legible and layout is unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/design-tokens.ts lib/design-tokens.test.ts app/globals.css
git commit -m "Split status colors into AA-compliant text and fill variants"
```

### Task 3: Keyboard focus on every screen

**Files:**

- Modify: `app/globals.css:62-70` (the `focus-visible` block), `app/login.css`, `app/licensing.css`, `lib/design-tokens.test.ts`

**Interfaces:**

- Consumes: `TOKENS` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
test("every stylesheet that styles controls defines a focus ring", () => {
  for (const f of ["globals", "login", "licensing"]) {
    const css = readFileSync(`app/${f}.css`, "utf8");
    if (/\b(button|input|select|textarea|\[tabindex)/.test(css)) {
      assert.match(css, /:focus-visible/, `${f}.css styles controls but has no focus-visible rule`);
    }
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types --test lib/design-tokens.test.ts`
Expected: FAIL on `login.css` and `licensing.css`.

- [ ] **Step 3: Add a shared focus ring**

Define `--focus-ring: 0 0 0 3px color-mix(in srgb, var(--primary) 32%, transparent)` in `:root`, apply it as `box-shadow` on `:focus-visible` in each sheet, and add a light-on-dark variant for controls inside `.sidebar`, where the indigo ring fails against `--ink`.

- [ ] **Step 4: Verify by keyboard**

Tab through `/login`, `/licensing` and the sidebar; every stop shows a visible ring. Run `npm test && npm run build`.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/login.css app/licensing.css lib/design-tokens.test.ts
git commit -m "Add visible keyboard focus to login, licensing, and sidebar"
```

---

# Phase B — Tailwind alongside the legacy sheets

### Task 4: Install Tailwind without Preflight, demote legacy CSS

**Files:**

- Create: `postcss.config.mjs`, `app/legacy/{globals,login,document-templates,licensing,shell}.css`
- Modify: `app/globals.css` (becomes a short entry point), `app/layout.tsx:2-6`, `lib/design-tokens.test.ts`

**Interfaces:**

- Produces: the layer order `legacy, theme, base, components, utilities`, which every later task relies on for utilities to beat legacy rules.

- [ ] **Step 1: Write the failing test**

```ts
test("layout imports exactly one stylesheet", () => {
  const imports = readFileSync("app/layout.tsx", "utf8").match(/^import ".*\.css";$/gm) ?? [];
  assert.deepEqual(imports, ['import "./globals.css";']);
});

test("globals.css declares layer order with legacy lowest and omits Preflight", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /@layer legacy,\s*theme,\s*base,\s*components,\s*utilities;/);
  assert.match(css, /@import "tailwindcss\/utilities\.css" layer\(utilities\);/);
  assert.doesNotMatch(css, /preflight/);
});

test("print blocks survive the move", () => {
  const legacy = readFileSync("app/legacy/globals.css", "utf8");
  assert.equal((legacy.match(/@media print/g) ?? []).length, 3);
  assert.match(legacy, /print-color-adjust:\s*exact/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types --test lib/design-tokens.test.ts`
Expected: FAIL — five imports in `layout.tsx`, and no `app/legacy/` directory.

- [ ] **Step 3: Install and configure**

```bash
npm install tailwindcss@^4.3 @tailwindcss/postcss postcss
```

`postcss.config.mjs` exports `{ plugins: { "@tailwindcss/postcss": {} } }`.

- [ ] **Step 4: Move the five sheets into `app/legacy/` unchanged with `git mv`, then write the new `app/globals.css`**

```css
@layer legacy, theme, base, components, utilities;
@import "./legacy/globals.css" layer(legacy);
@import "./legacy/shell.css" layer(legacy);
@import "./legacy/document-templates.css" layer(legacy);
@import "./legacy/licensing.css" layer(legacy);
@import "./legacy/login.css" layer(legacy);
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

The `:root` token block from Task 1 moves into this file, above the imports, so it stays unlayered and applies everywhere. Update the two test regexes from Tasks 1 and 3 to read `app/legacy/*.css` for rule assertions while token assertions keep reading `app/globals.css`.

- [ ] **Step 5: Reduce `app/layout.tsx` to the single `./globals.css` import**

- [ ] **Step 6: Prove a utility beats a legacy rule**

Temporarily add `className="p-0"` to an element whose legacy rule sets padding, run `npm run dev`, confirm in devtools that the utility wins and the legacy declaration is struck through, then revert the probe.

- [ ] **Step 7: Verify print is untouched**

Open an invoice, print to PDF, and compare against a PDF produced before this task; keep both as the baseline for Task 12. Page size, colors and pagination must match. Run `npm test && npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Install Tailwind v4 with legacy CSS demoted to a cascade layer"
```

### Task 5: Project the tokens into `@theme`

**Files:**

- Modify: `app/globals.css`, `lib/design-tokens.test.ts`

**Interfaces:**

- Consumes: `TOKENS` from Task 1.
- Produces: utility names `bg-primary`, `text-danger`, `border-line`, `bg-ramp-1` … `bg-ramp-6`, used by every Phase C task.

- [ ] **Step 1: Write the failing test**

```ts
test("every token is exposed to Tailwind as a theme color", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const theme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  for (const name of Object.keys(TOKENS)) {
    assert.match(theme, new RegExp(`--color-${name}:\\s*var\\(--${name}\\)`), `--color-${name} not in @theme`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — there is no `@theme` block.

- [ ] **Step 3: Add the `@theme` block to `app/globals.css`**

Each entry aliases the existing variable (`--color-primary: var(--primary);`) so the `:root` block stays the only place a hex literal appears. Include the spacing and type scale as `--spacing-*` and `--text-*`.

- [ ] **Step 4: Verify**

Run `npm test && npm run build`, then confirm `bg-primary` renders the indigo in dev.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css lib/design-tokens.test.ts
git commit -m "Expose design tokens to Tailwind via @theme"
```

---

# Phase C — Convert primitives, then screens

### Task 6: Shared primitives and the status lookup

This task carries the largest consistency win in the plan: 144 `button` usages, 124 `field` usages, 60 `modal` usages and 70 interpolated class expressions each collapse to one definition.

**Files:**

- Create: `components/ui/Button.tsx`, `components/ui/Field.tsx`, `components/ui/Modal.tsx`, `lib/status-classes.ts`, `lib/status-classes.test.ts`
- Modify: `package.json` (test script)

**Interfaces:**

- Produces:
  - `Button(props: { variant?: "primary" | "secondary" | "danger" | "icon" } & React.ButtonHTMLAttributes<HTMLButtonElement>)`
  - `Field(props: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>)`
  - `Modal(props: { open: boolean; onClose: () => void; title: string; children: React.ReactNode })`
  - `statusPillClass(status: InvoiceStatus | TaskStatus | PipelineStage): string`
  - `ALL_STATUSES: ReadonlyArray<InvoiceStatus | TaskStatus | PipelineStage>`

- [ ] **Step 1: Write the failing test**

```ts
// lib/status-classes.test.ts
test("every status value maps to a literal utility string", () => {
  for (const s of ALL_STATUSES) {
    const cls = statusPillClass(s);
    assert.ok(cls.length > 0, `${s} has no classes`);
    assert.doesNotMatch(cls, /\$\{/, `${s} must not interpolate`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — cannot find module `./status-classes.ts`.

- [ ] **Step 3: Implement `lib/status-classes.ts` as an explicit `Record` of complete utility strings, then the three primitives**

Status values come from `types/db.ts`. Each primitive renders Tailwind utilities only, reading colors through the Task 5 theme names, and keeps the existing DOM shape (`Button` renders a bare `<button>`) so no layout shifts. Variants match the legacy classes one for one: `primary`, `secondary`, `danger`, `icon`.

- [ ] **Step 4: Verify and commit — primitives only, no call sites converted yet**

Run: `npm test && npm run typecheck && npm run lint && npm run build`

```bash
git add components/ui lib/status-classes.ts lib/status-classes.test.ts package.json
git commit -m "Add Tailwind UI primitives and status class lookup"
```

### Tasks 7–11: One screen per task

Each task takes one screen, replaces its markup with the Task 6 primitives and Tailwind utilities, deletes the now-dead rules from the matching `app/legacy/*.css` region, and lowers `LEGACY_HEX_BUDGET` to the new measured count. Order is by risk, lowest first; none of these touch invoice print output.

| Task | Screen | Components | Legacy region |
|---|---|---|---|
| 7 | Dashboard | `components/dashboard/` (330 lines) | `.stat-*`, `.section-*` |
| 8 | Contacts | `ContactsClient`, `ContactDrawer`, `NewContactModal`, `BulkContactsModal` (1,541 lines) | `.contact-*`, `.drawer-*`, `.bulk-*` |
| 9 | Tasks and pipeline | `TasksClient`, `PipelineClient` (1,040 lines) | `.task-*`, `.pipeline-*` |
| 10 | Expenses and payments | `ExpensesClient`, `EditExpenseModal`, `PaymentsClient` (993 lines) | `.expense-*`, `.payment-*` |
| 11 | Settings, login, licensing | `SettingsClient` (492 lines), login and licensing pages | `login.css`, `licensing.css` |

**Steps, identical for each — substitute the screen:**

- [ ] **Step 1: Record the baseline** — screenshot the screen at 375px and 1280px before touching it.
- [ ] **Step 2: Lower the budget first** — set `LEGACY_HEX_BUDGET` to the count that will remain once this screen's rules are deleted, run `npm test`, and confirm it FAILS. This is the task's failing test.
- [ ] **Step 3: Convert the markup** — replace `.button`, `.field` and `.modal` usages with the Task 6 primitives, remaining classes with utilities, and every `` `x-${v}` `` expression with a `Record` lookup.
- [ ] **Step 4: Delete the screen's rules** from its `app/legacy/*.css` region.
- [ ] **Step 5: Run the suite** — `npm test && npm run typecheck && npm run lint && npm run build`; the budget test now PASSES.
- [ ] **Step 6: Compare against the baseline** at 375px and 1280px. Any difference must be deliberate and listed in the commit message.
- [ ] **Step 7: Commit** — `git commit -m "Convert <screen> to Tailwind"`.

### Task 12: Invoices, print, and Preflight

Last on purpose: this is the only task whose mistakes reach a customer.

**Files:**

- Create: `app/print.css`
- Modify: `components/billing/**` (1,000+ lines), `app/globals.css`, `lib/design-tokens.test.ts`
- Delete: `app/legacy/`

**Interfaces:**

- Consumes: every primitive and lookup from Task 6.

- [ ] **Step 1: Write the failing test**

```ts
test("no legacy stylesheets remain and Preflight is enabled", () => {
  assert.equal(existsSync("app/legacy"), false);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /@import "tailwindcss\/preflight\.css" layer\(base\);/);
});
```

- [ ] **Step 2: Run it to verify it fails**

- [ ] **Step 3: Convert the billing screens** — invoices, contracts, templates, payments — moving `.invoice-document` and every `@media print` rule into `app/print.css`, imported into `@layer legacy`. Print layout stays hand-written CSS permanently: mm page geometry and `print-color-adjust` are not utility work.

- [ ] **Step 4: Enable Preflight** by adding `@import "tailwindcss/preflight.css" layer(base);` between the theme and utilities imports, then fix what it resets. Expect four: heading margins, list markers, `button` background, and `img` display.

- [ ] **Step 5: Print-verify every template** — each template in `components/billing/templates/`, both orientations, printed to PDF and compared against the Task 4 baselines. Any difference blocks the commit.

- [ ] **Step 6: Replace the ratchet** — `countLegacyHex` across `app/` must now equal 0, except `app/print.css`, which is exempt by name.

- [ ] **Step 7: Run the full suite and commit**

```bash
git add -A
git commit -m "Convert billing to Tailwind, isolate print CSS, enable Preflight"
```
