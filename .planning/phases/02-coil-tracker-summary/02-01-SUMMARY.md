# Phase 2 — Execution Summary

> ⚠️ **PARTIALLY SUPERSEDED (2026-06-15 process change).** The 14-column "contractual"
> Coil Tracker summary defined here was reduced when the slit→tube stages were removed.
> The summary is now a 10-column, 3-stage view (Coil → Bundled → Dispatched): the baby-coil,
> converted, and tube columns were dropped and `balanceToRoll`/`tubeInventory` became
> `balanceToBundle`/`bundledInventory`. See `CLAUDE.md` and `LEARNINGS.md` (2026-06-15).

**Executed:** 2026-06-10
**Plan:** 02-PLAN.md (plan check: PASSED, 12 dimensions)
**Result:** ✓ Complete — R4–R7 implemented, build passes, all automated acceptance criteria green.
**Files modified:** `src/App.jsx` only (single-file pattern preserved; no data-model/Supabase changes)

## What was built

### R4 — 14-column Excel-style coil summary
- `inventorySummary` memo rewritten: maps over `filteredCoils`, computes per coil
  `coilWt`, `babyCount`, `babyWt`, `convertedCount`/`convertedWt` (baby coils with
  ≥1 tube record), `tubePcs`, `tubesWt`, `dispatchedPcs`/`dispatchedWt` (via
  `bundleEntries.traceBabyCoilId`), and deriveds `balanceToRoll = coilWt − babyWt`,
  `tubeInvWt = tubesWt − dispatchedWt`, `tubeInvPcs = tubePcs − dispatchedPcs`
  (negatives never clamped). Deps `[filteredCoils, ab, at, ad]`.
- Module consts `SUMMARY_HEADERS` (14 locked labels) + `SUMMARY_COLS` (12 numeric
  columns with wt/count formatting), `SUMMARY_TD`/`SUBTOTAL_TD` cell classes.
- Dead code removed: `summaryColumns`, `unbundledPcs`, CoilTracker's
  `undispatchedBundles`/`yieldPct`/`bundledPcs` aggregation. `YieldBadge`
  component retained (shared UI). Journey/weightFlowData memos byte-identical.

### R5 — Date period filter
- `dateFrom`/`dateTo` state + `filteredCoils` memo: inclusive lexicographic ISO
  compare on `coil.dateOfInward` (CoilToSlit precedent), open-ended bounds,
  rows sorted by `dateOfInward` then `hrCoilId`. From/To `<input type="date">`
  pair in the Section `actions` slot.
- Downstream quantities stay lifetime totals (locked decision — rows reconcile).

### R6 — Subtotals pinned at top
- `subtotals` memo (single reduce over `inventorySummary`): 12 numeric sums +
  `coilCount`. Rendered as the FIRST tbody row, `Total (N)` label, cells
  `sticky top-8 z-10` with opaque `bg-slate-100 dark:bg-slate-800`, bold,
  `border-b-2` — pins just below the `h-8` sticky header. No onClick.

### R7 — Excel-standard presentation
- Scrollport wrapper `overflow-auto max-h-96`; table `text-xs border-separate
  border-spacing-0`; every th/td `px-2 py-1` with `border-b border-r` gridlines;
  header `sticky top-0 z-20` opaque `bg-slate-50 dark:bg-slate-700`; numerics
  right-aligned `tabular-nums`; weights 2-dp via local `fmt2`, counts via
  `fmtCount` ('en-US' grouping → `1,011`); rounded-zero/blank renders `-`
  (round-before-zero-test kills float dust and `-0`, keeps `-17.89`);
  empty state `colSpan={14}`; dark-mode variants on every new element.
- Row click preserved: `setSelectedCoilId(row.hrCoilId)` + indigo highlight;
  Coil Journey section unchanged.

## Verification run
- `node node_modules/vite/bin/vite.js build` → ✓ built (only the pre-existing
  chunk-size warning).
- Sample-value reconciliation through the implemented formatters:
  `fmt2(20.63−20.51)` → `0.12`; `fmt2(0−17.89)` → `-17.89`;
  `fmtCount(1011−864)` → `147`; `fmt2(0)`/`fmtCount(0)`/`fmt2(-0)`/`fmt2(1e-15)`
  → `-`; `fmt2(-17.894)` → `-17.89`; `fmtCount(1011)` → `1,011`.
- Dead-code sweep: `unbundledPcs` 0 file-wide; `undispatchedBundles` only in
  Dispatch (:1036/:1048/:1052); `yieldPct` only in CoilInward (:256-257).
- `git status --porcelain`: `src/App.jsx` is the only modified source file.

## Manual browser checks (required — CSS assumptions A1/A2)

Run `npm run dev` (needs `.env.local` Supabase vars) and verify on the Coil
Tracker tab, in BOTH light and dark mode:

- [ ] (a) Scroll the summary table body — the header row AND the `Total (N)`
  subtotal row stay pinned at the top; cell gridlines persist while scrolling.
- [ ] (b) No data-row content bleeds through behind the sticky header/subtotal
  cells (backgrounds are opaque).
- [ ] (c) Set From/To dates — rows narrow by coil inward date and `Total (N)`
  recomputes; clear both — all coils return.
- [ ] (d) Click a coil row — indigo highlight + Coil Journey opens below; the
  subtotal row is not clickable.
- [ ] (e) Pick one coil and reconcile its 14 cells against manual sums of its
  Stage 2 (baby coils), Stage 3 (tubes), and Stage 5 (dispatch) records.
- [ ] (f) Accepted quirk: if the date filter hides a selected coil's row, its
  Journey stays open (journey reads unfiltered coils).
