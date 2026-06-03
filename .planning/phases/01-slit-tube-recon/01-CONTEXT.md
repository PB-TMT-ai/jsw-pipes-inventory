# Phase 1: Slit-to-Tube Capacity Fix & Invoice Cost Reconciliation - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Source:** discuss-phase (interactive, run manually — gsd-sdk not installed)

<domain>
## Phase Boundary

Three contained changes to the single-file SPA `src/App.jsx`:

1. **R1 — Stage 3 remaining-capacity bug.** `SlitToTube` currently computes
   `maxByWeight` from the *full* baby-coil weight and never subtracts tubes
   already produced from that coil. Fix it to track consumed weight and block
   over-production.
2. **R2 — Stage 3 form reorder + SKU thickness filter.** Pick Baby Coil first,
   then show only SKUs whose thickness matches the coil's thickness (±5%).
3. **R3 — Invoice Reconciliation CSV export** on the Dispatch tab.

Out of scope: changing the proportionate weight/cost algorithm, the localStorage
schema (no new persisted fields required — all cost rates already exist on SKUs),
backend/server work, decomposing App.jsx.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### R1 — Remaining capacity (Stage 3)
- Remaining capacity is tracked **by weight**.
- `consumedWeight(babyCoilId)` = sum of `theoreticalWeight` over all non-deleted
  tube batches for that baby coil, **excluding** the row currently being edited.
- `remainingWeight` = `baby.weight − consumedWeight`.
- Remaining piece capacity = `floor((remainingWeight × 1000) / sku.weightPerTube)`.
- **Block** save when requested pieces exceed remaining capacity (mirror Stage 4
  Bundle Formation, which already blocks over-allocation via `canSave`). This is a
  hard block, not just the current soft warning.
- The Baby Coil dropdown should reflect remaining weight (not full weight) and
  exclude coils with no meaningful remaining capacity (keep the currently-edited
  coil visible). Mirror the Stage 4 `babyOptions` pattern.

### R2 — Form reorder + SKU thickness filter (Stage 3)
- Form field order: **Baby Coil ID first**, then SKU Code.
- SKU options filtered to SKUs where `|sku.thickness − baby.thickness|` is within
  **±5%** of the baby coil thickness (consistent with project-wide ±5% tolerance).
- Only `status === 'published'` SKUs remain eligible (preserve existing filter).
- When no baby coil is selected yet, SKU dropdown may show all published SKUs
  (filtering activates once a coil is chosen).
- If a previously-selected SKU becomes incompatible after changing the coil, that
  is acceptable (user re-picks).

### R3 — Invoice Reconciliation CSV (Dispatch tab)
- **Placement:** a "Download Invoice Reconciliation (CSV)" button on the Dispatch
  tab (Stage 5).
- **Row granularity:** one row per **(dispatch date × invoice no. × SKU)**.
  Within each non-deleted dispatch, group its `bundleEntries` by `skuCode`.
- **Columns (in order):**
  1. Date of dispatch — `dispatch.dateOfDispatch`
  2. Invoice no. — `dispatch.invoiceNo`
  3. SKU — sku description (rows are per-SKU; include for clarity)
  4. Quantity (MT) — sum of bundle-entry `weight` for that SKU in MT
  5. Mother coil — distinct contributing mother coil IDs (trace
     `bundleEntry.traceBabyCoilId → babyCoil.hrCoilId`), joined (e.g. `;`)
  6. Cost price per MT — weight-weighted average of
     `motherCoil.costPrice / motherCoil.actualWeight` across contributing coils
  7. Conversion cost per MT — `sku.baseConversion` (informational)
  8. Ladder cost per MT — `sku.ladderPrice` (= `baseConversion + thicknessExtra`)
  9. Total cost of invoice quantity —
     `(costPricePerMT + ladderPerMT) × quantityMT`
- **Cost model (LOCKED):** ladder cost already includes conversion, so the total
  uses cost price + ladder only (no double-count). The conversion column is
  informational. Quantity basis for all per-MT math is **weight in MT**.
- CSV escaping: quote fields containing commas/quotes; numeric costs rounded to a
  sensible precision (₹ to 2 dp, MT to 3 dp consistent with `fmtT`).

### Claude's Discretion
- Exact helper-text wording, CSV filename (e.g. `invoice-reconciliation-<date>.csv`),
  number formatting, and the small CSV/blob download utility implementation.
- Whether to memoize the reconciliation rows via `useMemo`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of truth
- `src/App.jsx` — the entire application (single file). Key regions:
  - `SlitToTube` component — lines ~547–680 (R1, R2)
  - Stage 4 `BundleFormation` remaining/allocation pattern to mirror — lines ~705–786
  - `Dispatch` component — lines ~997–1090 (R3 button placement, dispatch/bundleEntries shape)
  - `SKU Master` cost fields — lines ~1142–1165, 1220–1223 (`baseConversion`,
    `thicknessExtra`, `ladderPrice`, `totalConversion`, `thickness`)
  - `CoilInward` cost fields — `costPrice`, `actualWeight` (lines ~209, 270, 295)
- `CLAUDE.md` — project conventions (single-file pattern, ±5% tolerance, color-coded
  fields, soft-delete, proportionate weight/cost, no density constants).

### Data-flow facts
- Tube batch record fields: `babyCoilId`, `skuCode`, `numberOfPieces`,
  `theoreticalWeight`, `thickness`, `width`, `length` (set in `save`, ~583–591).
- Baby coil: `babyCoilId`, `hrCoilId` (mother coil), `width`, `weight`, `costPrice`,
  `thickness`.
- Dispatch: `dateOfDispatch`, `invoiceNo`, `bundleEntries[]` where each entry has
  `bundleId`, `skuCode`, `pieces`, `weight`, `traceBabyCoilId`, `width`, `thickness`.
  ⚠ Note: a dispatch `bundleEntry` traces only `firstRow`'s baby coil
  (`traceBabyCoilId`); multi-coil bundles record one trace coil per bundle.
</canonical_refs>

<specifics>
## Specific Ideas
- Mirror the proven Stage 4 patterns: `allocatedPieces`/`remaining`/`canSave`
  (lines 710–716, 830) for R1, and `babyOptions` "X remaining" labels (775–786).
- Reuse the existing `tolerance()` helper / ±5% convention for R2.
- `fmtT` is the existing tonne formatter; reuse for MT values.
</specifics>

<deferred>
## Deferred Ideas
- Multi-mother-coil precision: dispatch only stores one `traceBabyCoilId` per
  bundle (the first row), so cost price/MT weighting is limited to that trace coil
  per bundle. True multi-coil-per-bundle cost splitting is out of scope for this
  phase (would require richer dispatch tracing). Note as a known limitation.
</deferred>

---

*Phase: 01-slit-tube-recon*
*Context gathered: 2026-06-03 via interactive discuss-phase*
