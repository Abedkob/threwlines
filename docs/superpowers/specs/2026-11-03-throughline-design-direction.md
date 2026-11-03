# Throughline — Design Direction

The binding visual spec for the Tailwind migration. Every task from Task 6 onward implements against this document. Where it and a task brief disagree, this document wins on appearance and the brief wins on scope.

## What this is

An internal console for a three-person software studio. It carries one customer lifecycle end to end: contact, pipeline stage, contract, invoice, payment, expense, and finally an issued software licence key with its activation state.

**Audience:** the same three people, every working day, all of them superadmin. They know every screen by heart. Nobody needs onboarding, persuading, or delighting.

**Primary job:** get through work fast. Scan a table, spot the row that needs attention, edit it, move on. Read a licence state correctly the first time. See which invoices are late without hunting.

**Design consequence:** this is a records tool, not a marketing surface. Density, scanability and state legibility beat generosity and polish. The hero is not a headline — it is the row. Everything in this document serves reading rows accurately at speed.

## The one idea

Throughline means a single unbroken line from first contact to an active licence. The design makes that line literal and structural:

**A 3px left edge on every record row and record surface, coloured by the record's position on the lifecycle.** Not decoration — it is the record's state, readable before any text is parsed. The codebase already does this in one place (`.invoice-row-late` uses `box-shadow: inset 3px 0 0`); the redesign promotes it to the system's signature device and drops the competing devices.

This is where the design spends its boldness. Everything around it stays quiet.

## Color

Six base values. Defined as tokens in `app/globals.css` `:root`; use the Tailwind theme names from Task 5, never raw hex.

| Role | Token | Value | Use |
|---|---|---|---|
| Chrome | `--ink` | `#14171F` | Sidebar, dark headers |
| Page | `--canvas` | `#F5F7FA` | Page background |
| Surface | `--surface` | `#FFFFFF` | Tables, panels, modals |
| Hairline | `--line` | `#DFE3EB` | Every border, every divider |
| Primary | `--primary` | `#3449E0` | Links, primary action, focus, selected state |
| Marker | `--accent-line` | `#B9FF00` | The position marker. Graphic only — never text, never a text background |

**The lifecycle ramp** carries the left edge, and nothing else: `--ramp-1` `#ECEFFE` → `--ramp-2` `#C3CBFA` → `--ramp-3` `#8EA0FF` → `--ramp-4` `#5467E8` → `--ramp-5` `#3449E0` → `--ramp-6` `#2537B8`, mapping lead → qualified → contract → invoiced → paid → licensed. A row deepens as its record advances. `--accent-line` marks the stage the record is in *now*, over the ramp colour.

**Status colours** keep their split from Task 2: text-safe (`--success` `#15775B`, `--warning` `#9A5B00`, `--danger` `#C0352A`) for text and borders, `-fill` variants for fills and icons. Status is a property of a record, not a position on the line, so status colour never touches the left edge.

**Rule:** colour encodes state. A colour that decorates is a bug. No gradient anywhere, including the sidebar rail, which currently has one.

## Type

Two families. The current three (Inter, Space Grotesk, JetBrains Mono) are one too many for a product whose entire job is reading dense rows.

- **Inter** — everything. UI, labels, headings, and the wordmark. It is here because it is genuinely the best available face at 13px in a dense table, which is this product's whole working condition, not because it is a default.
- **JetBrains Mono** — licence keys, invoice numbers, contract references, and nothing else. Justified by the subject: these are identifiers that get read aloud, retyped and compared, where `0` against `O` and `1` against `l` must be unambiguous. This is the one place a mono face does real work.

**Space Grotesk is dropped.** It currently sets the wordmark and some headings. The wordmark instead sets in Inter at `-0.03em` tracking with a 2px `--accent-line` rule passing under it — the brand carried by the line device, not by a typeface. One less font download.

**Tabular figures are mandatory** on every money column, quantity, count and date: `font-variant-numeric: tabular-nums`. Proportional digits make columns of money impossible to compare down a column, and the current CSS sets this nowhere. This is the single largest legibility gain available.

**Scale**, four sizes and no more:

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--text-xs` | 12 / 16 | 500 | Table column headers, metadata |
| `--text-sm` | 13 / 20 | 400 | Table cells, form fields — the default |
| `--text-base` | 15 / 24 | 400 | Body prose, modal text |
| `--text-lg` | 20 / 28 | 500, `-0.02em` | Page titles, modal titles |

Sentence case everywhere. No ALL-CAPS labels. The codebase has 71 `eyebrow` class usages setting small tracked-out labels above content — **cut them**. A column header already says what a column is; an eyebrow above it is a second label doing the same job.

## Layout

Fixed 248px sidebar, fluid content, 24px page gutter, 8px spacing grid. All spacing is a multiple of 8 except the 4px half-step inside controls.

Data rows are **36px** tall with 12px horizontal cell padding. That is tight on purpose: more records visible without scrolling is the main thing these three people want.

```
┌──────────┬─────────────────────────────────────────────────┐
│          │  Invoices                            [New]      │  <- title row, 20/28
│ Through  │  ───────────────────────────────────────────────│  <- 1px --line
│  line    │   Number    Customer        Due      Amount     │  <- 12/16, 500, muted
│          │ ▍ INV-0043  Northwind Ltd   12 Mar    1,240.00  │  <- 3px ramp edge, mono
│ Dashboard│ ▍ INV-0042  Harbour Co       8 Mar    3,090.00  │     number, tabular money
│ Contacts │ ▍ INV-0041  Lumen Studio    1 Mar       480.00  │     right-aligned
│ Pipeline │                                                 │
│ ...      │                                                 │
└──────────┴─────────────────────────────────────────────────┘
   --ink                        --canvas, rows on --surface
```

Left-aligned throughout. Numbers right-aligned in their column — the only exception, and it is what makes a money column scannable. Nothing centred; centred text in a records table destroys the left edge the eye follows down.

Below 768px a row becomes a two-line list item, keeping its 3px left edge. Not a card: cards in a list add a border and a radius per record and halve the number of visible records for no gain.

## Components

**Surfaces.** One radius scale: `6px` on controls, `10px` on surfaces, `0` on anything with a single-sided border. No third value.

**Shadows are for overlays only** — modals, drawers, popovers, menus. In-flow surfaces are separated by the `--line` hairline and nothing else. The current `--shadow: 0 16px 45px rgba(25,31,48,.08)` sits under in-flow panels; that soft shadow under every card is the thing that makes an interface look assembled from a kit. Keep the token, restrict its use.

**Button.** Four variants, 32px tall, 6px radius, 13px label, sentence case, verb first. `primary` is `--primary` with white text; `secondary` is `--surface` with a `--line` border; `danger` is `--danger` with white text; `icon` is a 32px square, transparent until hover. At most one `primary` per view. No `→` appended to any label.

**Field.** 32px tall, `--line` border, 13px text, label above at 12px in `--muted`. Errors appear under the field in `--danger`, naming what to do: "Enter an amount", not "Invalid input". A field never shows an error before it has been edited.

**Modal.** `--surface`, 10px radius, overlay shadow, 20/28 title, no icon in the header, actions bottom-right with the primary action last.

**Status pill.** 20px tall, 4px radius, 12px text, the Task 2 tinted pairs unchanged — they now meet AA and must not regress.

**Left edge.** 3px, inset, no radius, ramp-coloured, on every record row and every record detail surface. One device, used consistently; it replaces the ad-hoc `heat-*`, `priority-border-*` and `invoice-row-late` edge treatments, which currently say related things in unrelated ways.

## Motion

Only in response to an action, and only to show what changed: a modal opening, a row confirming a delete, a drawer sliding in. 120ms, ease-out. No entrance animations, no hover transitions on rows or cards. `@media (prefers-reduced-motion: reduce)` removes all of it.

## Quality floor

Not announced, just met: visible keyboard focus on every control (Task 3), AA contrast on every text pair (Tasks 1–2), reduced motion respected, usable down to 375px, and every interactive element reachable and operable by keyboard.

## Writing

Plain verbs, sentence case, no filler. Name things as the three people name them, not as the database does. An action keeps one name through its whole flow: the button that says "Issue licence" produces "Licence issued". Errors say what happened and what to do, without apologising. An empty table is an invitation — "No invoices yet" with the action beside it, never "Nothing here".

## Self-review against the brief

Checked this plan for choices that are defaults rather than decisions, and revised three:

1. **Dropped the card grid.** My first instinct was record cards in a responsive grid, which is the SaaS-card kit — identical radius and soft shadow on everything regardless of hierarchy. Revised to dense rows with one structural edge, because these three users want more records per screen, not prettier containers.
2. **Dropped the display typeface.** Pairing a geometric display face with a neutral UI face is the reflex move and would have kept three families alive for one wordmark. Revised to Inter throughout with the brand carried by the lime rule, which is specific to this product's one idea.
3. **Kept monospace, but narrowed it.** The generic tell is mono for small data labels as texture. Revised to mono strictly for identifiers that get retyped and compared, where character disambiguation is a real functional requirement, and banned it everywhere else.

Also deliberately avoided: cream-and-terracotta, acid-green-on-near-black, hairline broadsheet columns, ALL-CAPS eyebrows (actively removing 71 of them), middle-dot meta strings, and arrows appended to buttons.
