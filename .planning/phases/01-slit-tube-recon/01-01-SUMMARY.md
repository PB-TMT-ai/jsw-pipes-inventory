# Phase 1 — Execution Summary

**Executed:** 2026-06-03
**Plan:** 01-01-PLAN.md
**Result:** ✓ Complete — all 3 requirements implemented, build passes.
**Files modified:** `src/App.jsx` (single-file pattern preserved; no new localStorage fields)

## What was built

### R1 — Stage 3 remaining capacity (the confirmed bug)
- Added `consumedWeight` (memoized): sum of `theoreticalWeight` over prior
  non-deleted tube batches for the selected baby coil, **excluding the edited row**
  (`t.id !== editId`).
- `remainingWeight = baby.weight − consumedWeight`; `maxByWeight` now derives from
  `remainingWeight` (clamped at 0 once the coil is spent).
- Over-production is now a **hard block** — `piecesOverMax` added to the Save
  button `disabled` condition (was a soft warning only).
- Baby Coil dropdown shows **remaining** tonnes (`… T remaining`), hides
  fully-consumed coils, and keeps the currently-edited coil visible.
- Helper text reworked to show remaining capacity + tonnes left.

### R2 — Stage 3 form reorder + thickness-filtered SKUs
- **Baby Coil ID** field now renders before **SKU Code** (`src/App.jsx:661-662`).
- `skuOptions` is now a `useMemo`: published SKUs only; once a coil is selected,
  restricted to SKUs within **±5%** of the coil thickness
  (`Math.abs(s.thickness − baby.thickness) <= 0.05 × baby.thickness`).
- Added a helper label on the SKU field when a coil is selected.

### R3 — Invoice Reconciliation CSV (Dispatch tab)
- Threaded `coils` and `skus` into `<Dispatch>` (signature + render `:2079`).
- `buildReconciliationRows()`: one row per (dispatch date × invoice × SKU);
  groups each dispatch's `bundleEntries` by `skuCode`.
- Columns: Date of Dispatch, Invoice No., SKU, Quantity (MT), Mother Coil,
  Cost Price/MT, Conversion Cost/MT, Ladder Cost/MT, Total Cost of Invoice Qty.
- Cost model (locked): cost price/MT = weight-weighted avg of
  `coil.costPrice / coil.actualWeight` (W2 fix: unresolved coils use a separate
  denominator so they don't dilute toward 0); ladder/MT = `sku.ladderPrice`;
  conversion/MT = `sku.baseConversion` (informational);
  **total = (costPrice/MT + ladder/MT) × quantityMT**.
- Client-side Blob download → `invoice-reconciliation-<date>.csv`; button disabled
  when no dispatches exist.

## Verification
- `npm run build` ✓ (Vite, 0 errors) — run after R1+R2 and again after R3.
- Acceptance-criteria grep checks: all ✓ (consumedWeight, remainingWeight,
  hard-block, `_rem` dropdown, ±5% filter, field order, props threaded, signature,
  button label, `text/csv`, total formula).
- Cost-model smoke test: `(30000 + 3100) × 5 = 165500` matched exactly.

## Known limitation (carried from plan, not a defect)
- A multi-coil bundle records only its first row's baby coil in
  `bundleEntry.traceBabyCoilId`, so cost-price blending uses that trace coil per
  bundle. True per-bundle multi-coil cost splitting would require richer dispatch
  tracing — out of scope for this phase.

## Commits
- `67c115a` feat(slit-to-tube): remaining-capacity by weight + coil-first thickness-filtered SKUs
- `839fd9d` feat(dispatch): invoice reconciliation CSV export
