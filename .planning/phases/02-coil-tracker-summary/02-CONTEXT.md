# Phase 2: Coil Tracker Excel-Style Summary - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning
**Source:** PRD Express Path (user-provided column spec + 54-row sample dataset)

<domain>
## Phase Boundary

Rebuild the Coil Tracker's "Inventory Summary — All Coils" section in
`src/App.jsx` as an Excel-style coil summary report. One row per mother coil,
14 fixed columns, a subtotals row pinned at the top, a From/To date period
filter, and Excel-standard row density/formatting.

In scope: the summary table inside the `CoilTracker` component only.
Out of scope: the Coil Journey detail section (keep as-is), other tabs, data
model changes, Supabase schema changes, decomposing App.jsx.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### R4 — Columns (exact order) and formulas

The user supplied a 54-row sample export; every derived-column formula below
was verified against that sample.

| # | Column | Source / Formula |
|---|--------|------------------|
| 1 | Coil ID | `coil.hrCoilId` |
| 2 | Grade | `coil.coilGrade` |
| 3 | Coil Wt (T) | `coil.actualWeight` |
| 4 | # Baby Coils | count of non-deleted baby coils with `hrCoilId === coil.hrCoilId` |
| 5 | Baby Coil Wt (T) | Σ `baby.weight` over those baby coils |
| 6 | # Converted | count of those baby coils having ≥1 non-deleted tube record |
| 7 | Converted Wt (T) | Σ `baby.weight` over the converted baby coils |
| 8 | # Tubes | Σ `tube.numberOfPieces` over tube records of this coil's babies |
| 9 | Tubes Wt (T) | Σ `tube.theoreticalWeight` over the same tube records |
| 10 | # Dispatched | Σ `bundleEntry.pieces` over dispatch `bundleEntries` with `traceBabyCoilId` among this coil's babies |
| 11 | Dispatched Wt (T) | Σ `bundleEntry.weight` over the same entries (existing CoilTracker logic) |
| 12 | Balance to Roll (T) | `Coil Wt − Baby Coil Wt` (sample: 20.63 − 20.51 = 0.12; unslit coil shows its full weight) |
| 13 | Tube Inventory (T) | `Tubes Wt − Dispatched Wt` (sample: blank Tubes Wt ⇒ 0 − 17.89 = −17.89) |
| 14 | Tube Inventory (#) | `# Tubes − # Dispatched` (sample: 1,011 − 864 = 147) |

- Negative derived values are legitimate and shown with a minus sign — do not
  clamp to 0.
- Soft-deleted records (`deleted: true`) excluded everywhere, matching the
  existing `active()` filter in `CoilTracker`.

### R5 — Date-based time period filter
- From/To `date` inputs above the table.
- Filter selects **mother coils by `dateOfInward`** within the inclusive range.
- Either bound may be empty (open-ended); both empty = all coils (default).
- Downstream quantities for an included coil are lifetime totals — they are
  NOT clipped to the period. The period selects which coils appear.

### R6 — Subtotals pinned at the top
- A single totals row rendered ABOVE all data rows (first row of the body, or
  a second sticky header row), labelled `Total` (with coil count).
- Sums columns 3–14 across the currently filtered rows; recomputes when the
  date filter changes.
- Stays at the top when the table scrolls (sticky alongside the header).

### R7 — Excel-standard presentation
- Compact row density: small font (text-xs), tight cell padding (~`px-2 py-1`),
  Excel-like row height (~22–24px) — NOT the existing roomy `px-4 py-3`
  DataTable cells.
- Visible gridlines on all cells (border on every td/th), light header fill.
- Numeric columns right-aligned; Coil ID / Grade left-aligned.
- Weights: **2 decimal places** (sample shows 20.63 / −0.08 — note this
  intentionally differs from the 3-dp `fmtT` used elsewhere).
- Counts: integer with thousands separators (`1,011`).
- Zero or empty values render as `-` (per sample), in both data and subtotal
  rows.
- Sticky header row; horizontal scroll allowed for narrow viewports.
- Dark mode variants consistent with the rest of the app.

### Placement & behavior
- **Replace** the existing "Inventory Summary — All Coils" `DataTable` section
  inside `CoilTracker` with this new table (custom `<table>` markup — the
  shared `DataTable` cannot render a pinned subtotal row or Excel density).
- Keep the existing row-click → coil journey behavior: clicking a coil row
  still sets `selectedCoilId` and shows the Journey section below, with the
  selected row highlighted.
- The Coil Journey detail section is unchanged.

### Claude's Discretion
- Exact Tailwind classes for Excel styling, sticky implementation details.
- Whether to keep/add column sorting and a search box on the new table (nice
  to have, not required).
- Default row order (coil ID or inward date ascending is fine).
- Small formatter helpers (e.g., `fmt2`, `fmtCount`) — local to the component
  or hoisted next to `fmtT`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of truth
- `src/App.jsx` — single-file application. Key regions:
  - `CoilTracker` component (~lines 1527–1760): `inventorySummary` useMemo,
    `summaryColumns`, the Section being replaced, `selectedCoilId` wiring.
  - Formatters `fmtT` / `fmtPct` (~lines 36–37); Dashboard `fmt2` precedent
    (~line 1299).
  - Record shapes: coil `emptyForm` (~line 209, `dateOfInward`,
    `coilGrade`, `actualWeight`), baby coil (~line 316), tube (~line 557),
    dispatch (~line 1026, `bundleEntries[]` with `traceBabyCoilId`, `pieces`,
    `weight`).
- `CLAUDE.md` — single-file pattern, soft-delete, color conventions, dark mode.

### Data-flow facts
- Trace chain: `coil.hrCoilId → baby.hrCoilId` / `baby.babyCoilId →
  tube.babyCoilId` and `→ dispatch.bundleEntries[].traceBabyCoilId`.
- ⚠ Known limitation (from Phase 1): a dispatch `bundleEntry` traces only the
  bundle's first-row baby coil, so dispatched pieces/weight attribute to that
  trace coil. Accept as-is; do not redesign tracing in this phase.
- Date fields: coils `dateOfInward`, baby coils & tubes `dateOfConversion`,
  dispatches `dateOfDispatch` (only `dateOfInward` is used for the R5 filter).
</canonical_refs>

<specifics>
## Specific Ideas
- The user's sample renders blank/zero as `-` and counts like `1,011` —
  mirror that exactly.
- Subtotal row look: bold, slightly shaded background, double/heavier border
  below it (classic Excel totals-at-top).
- Reuse the existing `active()` soft-delete filter and the dispatched-weight
  aggregation already in `inventorySummary` as the starting point — extend it
  with the new columns rather than rebuilding from scratch.
</specifics>

<deferred>
## Deferred Ideas
- CSV/XLSX export of this summary (user asked for on-screen format only).
- Period-clipping downstream quantities (e.g., "tubes produced during the
  period") — would need per-stage date filtering and a different reconciliation
  model.
- Grade-wise grouping/sub-subtotals.
</deferred>

---

*Phase: 02-coil-tracker-summary*
*Context gathered: 2026-06-10 via PRD Express Path*
