# Phase 2 — Coil Tracker Excel-Style Summary — Research

**Researched:** 2026-06-10
**Method:** Direct codebase analysis of `src/App.jsx` (single-file SPA, 2215 lines). No external libraries needed — React 18 + Tailwind 3.4 only.
**Confidence:** HIGH (all line references verified this session)

<user_constraints>
## User Constraints (from 02-CONTEXT.md)

### Locked Decisions

**R4 — Columns (exact order) and formulas** (verified against user's 54-row sample):

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
| 12 | Balance to Roll (T) | `Coil Wt − Baby Coil Wt` (unslit coil shows its full weight) |
| 13 | Tube Inventory (T) | `Tubes Wt − Dispatched Wt` (negative is legitimate, e.g., −17.89) |
| 14 | Tube Inventory (#) | `# Tubes − # Dispatched` (e.g., 1,011 − 864 = 147) |

- Negative derived values shown with minus sign — do not clamp to 0.
- Soft-deleted records (`deleted: true`) excluded everywhere, matching the existing `active()` filter.

**R5 — Date filter:** From/To `date` inputs above the table; selects **mother coils by `dateOfInward`**, inclusive; either bound may be empty (open-ended); both empty = all coils (default). Downstream quantities are lifetime totals — NOT clipped to the period.

**R6 — Subtotals pinned at top:** single totals row ABOVE all data rows (first body row or second sticky header row), labelled `Total` (with coil count); sums columns 3–14 across currently filtered rows; recomputes on filter change; stays at top when the table scrolls (sticky alongside the header).

**R7 — Excel-standard presentation:** compact density (text-xs, ~`px-2 py-1`, ~22–24px rows — NOT the roomy `px-4 py-3`); gridlines on all cells, light header fill; numerics right-aligned, Coil ID/Grade left-aligned; weights **2 dp** (differs from 3-dp `fmtT`); counts with thousands separators (`1,011`); zero/empty renders `-` in data AND subtotal rows; sticky header; horizontal scroll allowed; dark-mode variants.

**Placement & behavior:** REPLACE the "Inventory Summary — All Coils" `DataTable` section inside `CoilTracker` with custom `<table>` markup (shared `DataTable` cannot render a pinned subtotal row or Excel density). Keep row-click → `selectedCoilId` → Journey behavior with selected-row highlight. Coil Journey detail section unchanged.

### Claude's Discretion
- Exact Tailwind classes for Excel styling; sticky implementation details.
- Keep/add column sorting and a search box (nice to have, not required).
- Default row order (coil ID or inward date ascending fine).
- Formatter helpers (`fmt2`, `fmtCount`) local to component or hoisted next to `fmtT`.

### Deferred Ideas (OUT OF SCOPE)
- CSV/XLSX export of this summary.
- Period-clipping downstream quantities (per-stage date filtering).
- Grade-wise grouping/sub-subtotals.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R4 | 14-column per-coil summary with locked formulas | §Current State: existing `inventorySummary` already computes 7 of 14 columns; §Record Shapes verifies every source field |
| R5 | From/To date filter on `dateOfInward` | §Date Filter Precedent: identical inclusive lexicographic pattern exists at `:448-471` |
| R6 | Subtotals row pinned at top | §Sticky Header & Pinned Subtotal: technique + why DataTable can't do it |
| R7 | Excel-standard formatting | §Formatting: existing formatter gaps, new `fmt2`/`fmtCount` shape, gridline technique |
</phase_requirements>

## Summary

This is a contained rewrite of one `Section` inside `CoilTracker` (`src/App.jsx:1532-1832`). The existing `inventorySummary` useMemo (`:1538-1566`) already computes columns 1–5, 8, and 11 with the exact trace chain the spec locks; four new aggregations (# Converted, Converted Wt, Tubes Wt, # Dispatched pieces) reuse patterns that already exist in the `journey` useMemo, and columns 12–14 are arithmetic on row fields. The From/To filter has a verbatim precedent in `CoilToSlit`. The only genuinely new technique is the sticky header + sticky subtotal row with persistent gridlines, which requires a vertically scrollable wrapper and `border-separate` (sticky-cell borders vanish under default `border-collapse`).

**Primary recommendation:** extend `inventorySummary` in place, replace the `DataTable` at `:1654-1664` with a custom `<table>` (`border-separate border-spacing-0`, sticky `th` + sticky subtotal `td` cells), and add two local formatters that treat rounded-zero as `-`.

## Current State: CoilTracker & inventorySummary (R4)

**Component:** `CoilTracker({ coils, babyCoils, tubes, bundles, dispatches })` at `:1532`. Already receives all five datasets as props (`:2193`) — **no prop threading needed** (unlike Phase 1's Dispatch gap).

- `active()` soft-delete filter `:1534`; `ac/ab/at/abn/ad` `:1535`.
- `inventorySummary` useMemo `:1538-1566` per coil already computes:
  - `babies` (col 4 = `babies.length`) and `babyIds` `:1540-1541`
  - `coilTubes = at.filter(t => babyIds.includes(t.babyCoilId))` `:1542`
  - `totalTubePcs` (col 8) `:1544`
  - `slitWt = babies.reduce(... Number(b.weight || 0))` (col 5) `:1561`
  - `dispatchedWt` (col 11) via `ad.flatMap(d => d.bundleEntries || []).filter(be => babyIds.includes(be.traceBabyCoilId))` `:1553-1555`
  - plus `unbundledPcs`, `undispatchedBundles`, `yieldPct` — dropped columns in the new spec (only used by the old table).
- **Missing aggregations to add** (all from data already in scope):
  - col 6 `# Converted`: `babies.filter(b => coilTubes.some(t => t.babyCoilId === b.babyCoilId)).length` — per-baby tube lookup pattern exists in `journey.babyDetails` `:1580-1588`
  - col 7 `Converted Wt`: Σ `Number(b.weight || 0)` over those converted babies
  - col 9 `Tubes Wt`: Σ `Number(t.theoreticalWeight || 0)` over `coilTubes` — same reduce at `:1584` and `:1614`
  - col 10 `# Dispatched`: same flatMap/filter as `:1553-1555` but `reduce` on `Number(be.pieces || 0)`
  - cols 12–14: derived arithmetic on the row.
- `summaryColumns` `:1637-1648` and the Section being replaced `:1654-1664` (`DataTable` with `onRowClick={(row) => setSelectedCoilId(row.hrCoilId)}` and `highlightRow={(row) => row.hrCoilId === selectedCoilId}`).
- Journey section `:1667-1830` reads only `selectedCoil`/`journey` — untouched by this phase.

## Verified Record Shapes

- **coil** — `emptyForm` `:209`: `dateOfInward` (ISO `yyyy-mm-dd` from `Input type="date"`), `coilGrade`, `thickness`, `width`, `invoiceWeight`, `actualWeight`, `costPrice`, `poNumber`; `hrCoilId` added at save `:229`; `deleted: false`.
- **babyCoil** — save record `:367-373`: `babyCoilId`, `babyCoilEntry`, `hrCoilId`, `dateOfConversion`, `width`, `weight` (proportionate), `costPrice`, `thickness`, `poNumber`, `deleted`.
- **tube** — save record `:602-609`: `dateOfConversion`, `skuCode`, `babyCoilId`, `numberOfPieces`, `theoreticalWeight` (T, `:579-581`), `thickness`, `width`, `length`, `deleted`.
- **dispatch** — `emptyForm` `:1026` + save `:1075-1080`: `dateOfDispatch`, `vehicleNo`, `invoiceNo`, `vehicleWeight`, `bundleEntries` (= `selectedBundles`), `theoreticalWeight`, `variance`, `deleted`. **bundleEntry** `:1057-1063`: `{ bundleId, skuCode, pieces, weight, length, width, thickness, traceBabyCoilId }` — no per-entry `deleted` flag (entries of deleted dispatches drop out via `ad`).
- Coercion convention everywhere: `Number(x || 0)` — fields can arrive as strings or `''`.

## Date Filter Precedent (R5)

`CoilToSlit` already implements exactly the R5 semantics:
- State `:320-322` (`customFrom`, `customTo` as `''`).
- Filter `:448-455`:
  ```js
  if (customFrom && b.dateOfConversion < customFrom) return false
  if (customTo && b.dateOfConversion > customTo) return false
  ```
  Lexicographic compare on ISO strings — inclusive bounds, empty = open-ended. Apply the same to `c.dateOfInward`, memoized on `[ac, from, to]`, **before** the aggregation map so subtotals recompute automatically.
- UI `:528-546`: raw `<input type="date">` with classes `px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100`, separated by a `to` span, placed in the `Section` `actions` prop. Mirror this (just the From/To pair; the preset dropdown is not required).

## Sticky Header & Pinned Subtotal (R6)

- DataTable's `th` already carries `sticky top-0` (`:168`) but its wrapper (`:163`) is `overflow-x-auto` with **no max-height** — there is no vertical scrollport, so the sticky never engages today. For R6 the new wrapper needs both axes: e.g., `overflow-auto max-h-96` (or taller standard step) so the table scrolls within its own container; sticky then pins to that container, safely below the app header (`sticky top-0 z-50` `:2144`).
- Apply `sticky` to **cells** (`th`/`td`), not `<tr>`/`<thead>` — sticky on table rows is unreliable across browsers [ASSUMED — standard CSS behavior; verify visually].
- Two-tier pinning: header cells `sticky top-0 z-20`; subtotal-row cells `sticky z-10` with `top` = header row height. To honor frontend-design.md's "no arbitrary values": give the header row a fixed height (`h-8` = 32px) and use `top-8` on subtotal cells — both standard classes.
- Sticky cells MUST have opaque backgrounds in both modes (e.g., header `bg-slate-50 dark:bg-slate-700`, subtotal `bg-slate-100 dark:bg-slate-800`) or data rows show through while scrolling.
- Subtotal styling precedent — BundleFormation group totals row `:999-1004`: `bg-slate-100/70 dark:bg-slate-800/50 border-b-2 border-slate-300 dark:border-slate-600` + `font-semibold` (use opaque, not /70, since it's sticky).
- **Why DataTable can't do this** (`:138-203`): hard-coded `px-4 py-3` cells (`:168`, `:185`), always-on search box (`:162`), internal sort over the full row array with no slot for a pinned row, and its own `!r.deleted` filter (`:144`). The locked decision to replace it with custom markup is correct.

## Formatting (R7)

- `fmtT` `:36` = `toFixed(3)`, `'—'` for null — wrong dp and wrong blank glyph for this table.
- SKUMaster's local `fmt2` `:1299` = `toFixed(2)` but returns `''` for blank and `'0.00'` for zero — also doesn't match R7. (Note: 02-CONTEXT.md attributes it to Dashboard; it actually lives in `SKUMaster` `:1260-1299`. Same precedent, corrected location.)
- **New helpers needed** (discretion: local to CoilTracker, or hoisted next to `fmtT` at `:36-37`):
  - `fmt2(v)`: round first, then test zero — `const r = Math.round(Number(v || 0) * 100) / 100; return r ? r.toFixed(2) : '-'`. Handles float dust (1e-15 → `-`), `-0`, and preserves the minus on real negatives (−17.89).
  - `fmtCount(v)`: `const n = Math.round(Number(v || 0)); return n ? n.toLocaleString('en-US') : '-'`. Explicit `'en-US'` matches the sample's `1,011` grouping and avoids en-IN lakh grouping on larger values (existing calls like `:270`, `:1729` use locale-default `toLocaleString()` — fine for ₹, ambiguous here).
- Alignment: `text-right` on numeric `td`/`th` (cols 3–14), `text-left` on Coil ID/Grade; `tabular-nums` is available in Tailwind 3.4 core and helps column alignment (optional).
- Gridlines: default `border-collapse` drops borders from sticky cells as content scrolls beneath them [ASSUMED — well-known CSS quirk; verify visually]. Use `border-separate border-spacing-0` on `<table>` (core utilities since Tailwind 3.1, no config change needed) and put `border-b border-r border-slate-200 dark:border-slate-600` on every `th`/`td`.

## Table Markup Precedents (to mirror)

- **BundleFormation accordion** `:922-1010`: `Section` + wrapper `overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700` (`:923`), header `tr bg-slate-50 dark:bg-slate-700`, `th` `text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap` with optional click-sort (`:930-933`), `tbody divide-y divide-slate-200 dark:divide-slate-700` (replace divide-y with per-cell borders here).
- **CoilTracker journey tables** `:1714-1739`, `:1747-1772`, `:1780-1804`: same header/body pattern, `hover:bg-slate-50 dark:hover:bg-slate-700/50` rows.
- **Row click/highlight**: new rows get `cursor-pointer`, `onClick={() => setSelectedCoilId(row.hrCoilId)}`, highlight `bg-indigo-50 dark:bg-indigo-900/20` (DataTable's highlight class, `:182`).

## Project Constraints (from CLAUDE.md)

- Single-file `App.jsx` — all edits stay in `src/App.jsx`; do not decompose.
- Functional components, `useMemo` for derived calculations.
- Soft-delete pattern: filter `deleted: true` everywhere (already via `active()`).
- No density constants — N/A here (pure aggregation of stored weights).
- Dark mode `class` strategy — every new cell/control needs `dark:` variants.
- Data via `useSupabaseStore` props — this phase is read-only over props; no storage/schema changes (also locked out of scope). Note: `.claude/skills/data-storage.md` still describes the old localStorage architecture — CLAUDE.md supersedes it.
- `.claude/skills/frontend-design.md`: slate/indigo palette, text-xs for table headers, "no arbitrary [spacing] values" — prefer `h-8`/`top-8` pairing for the sticky offset.

## Risks / Pitfalls

- **Sticky borders vanish** under `border-collapse` — must use `border-separate border-spacing-0` + per-cell borders, or gridlines scroll away with the body (the one visual technique with no in-repo precedent; verify in browser, light + dark).
- **Transparent sticky cells** — header/subtotal cells without opaque `bg-*` show data rows bleeding through on scroll.
- **Float dust / `-0`** — `Tubes Wt − Dispatched Wt` can produce `1e-15` or `-0`; round to 2 dp **before** the zero→`-` test (see `fmt2` shape above) so subtotals and cells never show `0.00` or `-0.00`.
- **Zero-baby coils** (fresh inward, e.g., `HYD-0426-09`): cols 4–11, 13, 14 are all 0 → render `-`; Balance to Roll = full `actualWeight` (formula yields this naturally — don't special-case).
- **Negatives are legitimate** — `-` is only for rounded-zero/blank; `−17.89` must render with its minus sign. Don't clamp, don't `Math.abs`.
- **String coercion** — `actualWeight`/`pieces`/`weight` may be strings or `''`; wrap every operand in `Number(x || 0)` like the rest of the file.
- **Subtotal vs sort** — if optional sorting is added, the subtotal row must be rendered outside the sorted/mapped data array (and sum the filtered set, not the sorted slice).
- **Known trace limitation** (accepted, locked): `bundleEntry.traceBabyCoilId` is only the bundle's first-row baby coil (`:1062`), so multi-coil bundles attribute all dispatched pieces/weight to that coil — col 10/11 inherit this. Do not redesign tracing.
- **Empty filtered set** — From/To range matching no coils: render the subtotal row with `Total (0)` and `-` cells plus an empty-state row (DataTable's "No records found" pattern `:177-179`), not a bare table.
- **Don't disturb the Journey** — `selectedCoilId` highlight must compare against `row.hrCoilId`; clearing/changing the date filter while a coil is selected may hide the selected row but the Journey section keys off `ac` (unfiltered), which is acceptable — note it in verification.

## Recommendations for the planner

1. Single task is feasible (one component section, ~120 lines changed); split at most into (a) aggregation + filter logic, (b) table markup/styling.
2. Extend `inventorySummary` `:1538-1566` in place: add `convertedCount`, `convertedWt`, `tubesWt`, `dispatchedPcs`, and derived `balanceToRoll`, `tubeInvWt`, `tubeInvPcs`; gate the input `ac` through a `filteredCoils` memo on `dateFrom`/`dateTo` state.
3. Compute subtotals in a separate `useMemo` over the summary rows (sum cols 3–11 raw; derive 12–14 as sums of row deriveds — same result either way since they're linear).
4. Replace `:1654-1664` only; leave `summaryColumns` removal to the same edit (it becomes dead code otherwise).
5. Keep old `yieldPct`/`unbundledPcs` logic only if something else consumes it (nothing does — safe to drop from the memo).
6. Verification: browser check both modes, scroll the wrapper to confirm header + subtotal pin and gridlines persist, click a row to confirm Journey still opens, set From/To to confirm rows + subtotal narrow, and reconcile one coil's 14 values against manual sums.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `position: sticky` must go on cells, not `tr`/`thead`, for cross-browser reliability | Sticky Header | Minor — fallback is the same markup; verify visually |
| A2 | Default `border-collapse` drops sticky-cell borders while scrolling (fix: `border-separate border-spacing-0`) | Formatting | Gridlines flicker/disappear on scroll; caught in browser verification |

## Metadata

**Confidence:** HIGH for all codebase findings (every line reference read this session). MEDIUM for the two CSS behavior claims above (training knowledge; both are verified trivially in the browser during execution).
**Research date:** 2026-06-10 · Valid until source file changes (line refs are against current `src/App.jsx`, 2215 lines).
