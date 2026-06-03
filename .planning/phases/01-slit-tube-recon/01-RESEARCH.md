# Phase 1 — Technical Research

**Researched:** 2026-06-03
**Method:** Direct codebase analysis of `src/App.jsx` (single-file SPA, ~2096 lines).

## Summary

All three changes are contained edits to `src/App.jsx`. No new persisted
localStorage fields are required — every cost rate already exists on SKU records,
and the dispatch/baby-coil/coil records already carry the trace and cost data
needed for the CSV. The hardest part is correct aggregation, not new plumbing.

---

## R1 — Stage 3 remaining-capacity bug (CONFIRMED)

**Component:** `SlitToTube` (`src/App.jsx:547`).

Current capacity calc (`:574-579`):
```js
const maxByWeight = baby?.weight && sku?.weightPerTube
  ? Math.floor((Number(baby.weight) * 1000) / Number(sku.weightPerTube))
  : null
const piecesOverMax = maxByWeight != null && Number(form.numberOfPieces || 0) > maxByWeight
```
- Uses the **full** `baby.weight` every time; never subtracts existing tube
  production for that baby coil. So a second batch sees full capacity again.
- `piecesOverMax` is only a soft **warning** (helper text `:651-653`); the Save
  button (`:670`) disables only on `slitTooNarrow`, never on over-production.
- The Baby Coil dropdown (`:602-607`) shows full weight and never drops a
  fully-converted coil.

**Proven pattern to mirror — Stage 4 `BundleFormation` (`:705-786`):**
```js
const allocatedPieces = useMemo(() =>
  bundles.filter(b => !b.deleted && b.babyCoilId === form.babyCoilId && b.id !== editId)
    .reduce((s, b) => s + Number(b.tubeCount || 0), 0), [...])
const remaining = totalProduced - allocatedPieces
...
const canSave = ... && Number(form.tubeCount) <= remaining   // hard block (:830)
```
And its `babyOptions` (`:775-786`) compute `rem` per coil, label `"X pcs remaining"`,
and `.filter(opt => editId && opt.value===form.babyCoilId ? true : opt._rem > 0)`.

**Fix shape for R1 (weight-based):**
- `consumedWeight = sum(theoreticalWeight)` over non-deleted tubes for the selected
  baby coil, excluding `editId`.
- `remainingWeight = Number(baby.weight) - consumedWeight`.
- `maxByWeight = Math.floor((remainingWeight * 1000) / sku.weightPerTube)`.
- Add `Number(form.numberOfPieces) <= maxByWeight` to the Save `disabled` condition.
- Rework `babyOptions` to show remaining weight and exclude exhausted coils
  (keep edited coil visible).

## R2 — Form reorder + SKU thickness filter (Stage 3)

- Field render order currently: Date, SKU (`:642`), Baby Coil (`:643`), Pieces…
  → swap so Baby Coil select precedes SKU select.
- `skuOptions` currently (`:608`):
  ```js
  const skus.filter(s => s.status === 'published').map(...)
  ```
  → make it a `useMemo` over `[skus, baby]`; when `baby` is set, additionally keep
  only SKUs within ±5% thickness:
  ```js
  Math.abs(Number(s.thickness) - Number(baby.thickness)) <= 0.05 * Number(baby.thickness)
  ```
  (`tolerance()` at `:50` is available, but a direct ±5% check on thickness is
  clearest here since `tolerance` compares ratio bands.)
- `baby` is already derived (`:554`) from `form.babyCoilId`; `baby.thickness` flows
  from the mother coil. SKU records carry `thickness` (`:1142`, `:1211`).

## R3 — Invoice Reconciliation CSV (Dispatch tab)

**Component:** `Dispatch` (`src/App.jsx:997`). It receives `bundles, dispatches,
babyCoils` but **not** `coils` or `skus` — both are needed for cost price/MT and
SKU cost rates. The parent render is at `:2077`-ish; the App holds `coils` and
`skus` state. **Plan must pass `coils` and `skus` props into `<Dispatch>`.**

Data shapes:
- `dispatch`: `{ dateOfDispatch, invoiceNo, bundleEntries:[{ skuCode, pieces,
  weight, traceBabyCoilId, ... }], deleted }` (`:1043-1049`, `:1026-1032`).
- `babyCoil`: `{ babyCoilId, hrCoilId, costPrice, weight, thickness, ... }`.
- `coil` (mother): `{ hrCoilId, costPrice, actualWeight, ... }` (`:209`).
- `sku`: `{ skuCode, description, thickness, baseConversion, thicknessExtra,
  ladderPrice, weightPerTube, ... }` (`:1142`, `:1157-1165`).

**Aggregation (per locked decisions):**
- For each non-deleted dispatch, group `bundleEntries` by `skuCode` → one CSV row
  per (date × invoice × SKU).
- `quantityMT = Σ entry.weight`.
- Mother coils: map each entry `traceBabyCoilId → babyCoils.find(...).hrCoilId`,
  dedupe, join with `;`.
- `costPricePerMT` = weighted avg of `coil.costPrice / coil.actualWeight` over the
  contributing mother coils, weighted by each contributing entry's weight.
- `conversionPerMT = sku.baseConversion`; `ladderPerMT = sku.ladderPrice`.
- `totalCost = (costPricePerMT + ladderPerMT) * quantityMT`.

**CSV utility:** no existing CSV/blob export in the codebase (grep for
`csv|blob|download` → none). Add a small helper: build rows → join with `,` (quote
fields with commas/quotes) → `new Blob([...], {type:'text/csv'})` → object URL →
temporary `<a download>` click. Pure client-side, fits the SPA model.

## Helpers available for reuse
- `today()` `:34`, `uid()` `:35`, `fmtT(v)` → `toFixed(3)` `:36`,
  `tolerance(actual, expected, tol=0.05)` `:50`, `skuDesc` `:698`.

## Risks / landmines
- **Props gap:** `Dispatch` lacks `coils`/`skus` — must thread them through (`:2077`).
- **Single trace coil per bundle:** `bundleEntry.traceBabyCoilId` is only the
  bundle's first row (`:1024-1031`). Multi-coil bundles undercount cost-price
  blending — acceptable for this phase, note as a known limitation.
- **Editing a tube batch (R1):** must exclude the edited row from `consumedWeight`
  (same `b.id !== editId` guard Stage 4 uses) or remaining double-counts.
- **Don't break single-file pattern** (CLAUDE.md) — keep edits within `App.jsx`.
