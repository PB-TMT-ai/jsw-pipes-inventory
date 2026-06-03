---
phase: 01-slit-tube-recon
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/App.jsx]
autonomous: true
requirements: [R1, R2, R3]

must_haves:
  truths:
    - "Recording a second tube batch from the same baby coil shows reduced remaining capacity (Max possible reflects already-produced tubes)."
    - "Save is blocked (button disabled) when requested pieces exceed the baby coil's remaining weight-based capacity."
    - "Editing an existing tube batch does not double-count that batch's own weight against remaining capacity."
    - "The Baby Coil dropdown in Stage 3 shows remaining weight and excludes fully-consumed coils (while keeping the currently-edited coil visible)."
    - "In Stage 3 the Baby Coil field renders before the SKU field."
    - "Selecting a baby coil filters the SKU dropdown to SKUs whose thickness is within ±5% of the baby coil's thickness; with no coil selected, all published SKUs show."
    - "The Dispatch tab has a 'Download Invoice Reconciliation (CSV)' button that exports one row per (dispatch date × invoice no. × SKU) with the 9 specified columns."
  artifacts:
    - path: "src/App.jsx"
      provides: "SlitToTube R1 weight-based remaining-capacity block, R2 form reorder + thickness-filtered SKU options, Dispatch R3 CSV export"
      contains: "consumedWeight"
  key_links:
    - from: "SlitToTube Save Btn disabled condition"
      to: "maxByWeight (now derived from remainingWeight)"
      via: "Number(form.numberOfPieces) <= maxByWeight added to disabled"
      pattern: "numberOfPieces.*maxByWeight"
    - from: "App parent render (Dispatch)"
      to: "Dispatch component"
      via: "coils={coils} skus={skus} props threaded"
      pattern: "<Dispatch[^>]*coils=\\{coils\\}[^>]*skus=\\{skus\\}"
    - from: "Dispatch CSV builder"
      to: "babyCoils / coils / skus"
      via: "traceBabyCoilId → babyCoil.hrCoilId → coil.costPrice/actualWeight; skuCode → sku rates"
      pattern: "traceBabyCoilId"
---

<objective>
Fix three contained defects/gaps in the single-file SPA `src/App.jsx`:
- R1: Stage 3 (Slit to Tube) must subtract already-produced tubes from a baby coil's remaining capacity (by weight) and hard-block over-production.
- R2: Stage 3 form must select Baby Coil first and filter SKU options to thickness-compatible SKUs (±5%).
- R3: Add an Invoice Reconciliation CSV export to the Dispatch tab.

Purpose: Stage 3 currently lets the same baby coil be over-produced because it always uses the full coil weight; the form order makes SKU/coil pairing awkward; and there is no per-SKU/per-date cost reconciliation export for invoicing.
Output: Modified `src/App.jsx` (single file, no decomposition, no new localStorage fields).
</objective>

<execution_context>
All three changes edit the SAME file (`src/App.jsx`). Execute the tasks in order (Task 1 → Task 2 → Task 3) to avoid edit conflicts. Do NOT split the file. Reuse existing helpers: `today` (:34), `uid` (:35), `fmtT` (:36, toFixed(3)), `tolerance` (:50), `skuDesc`-style lookups. Mirror Stage 4 `BundleFormation` patterns (allocated/remaining/canSave at :710-716/:670-style disabled; `babyOptions` "X remaining" at :775-786).
</execution_context>

<context>
@.planning/phases/01-slit-tube-recon/01-CONTEXT.md
@.planning/phases/01-slit-tube-recon/01-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- Key shapes the executor needs (from src/App.jsx). Use directly — no exploration needed. -->

SlitToTube({ babyCoils, tubes, setTubes, skus, coils }) — src/App.jsx:547
- `baby` (:554) = babyCoils.find(!deleted && babyCoilId === form.babyCoilId); has `.weight`, `.thickness`, `.width`, `.hrCoilId`.
- `sku` (:555) has `.weightPerTube`, `.thickness`, `.status`, `.description`, `.skuCode`.
- Tube batch record fields (set in save :583-591): `babyCoilId`, `skuCode`, `numberOfPieces`, `theoreticalWeight`, `thickness`, `width`, `length`, `deleted`, `id`.
- `maxByWeight` (:575-577) currently uses full `baby.weight`.
- `piecesOverMax` (:579) soft warning only; helper text :646-656.
- Save Btn (:670): disabled={!form.babyCoilId || !form.skuCode || !form.numberOfPieces || slitTooNarrow}
- `babyOptions` (:602-607) plain list, full weight, no exclusion.
- `skuOptions` (:608) = skus.filter(status==='published').map(...)
- Form field render order (:641-643): Date, SKU, Baby Coil.

Stage 4 pattern to mirror (BundleFormation :686, :710-716, :775-786):
- allocatedPieces = bundles.filter(!deleted && babyCoilId===form.babyCoilId && b.id !== editId).reduce(...)
- babyOptions compute `_rem` per coil; .filter(opt => (editId && opt.value===form.babyCoilId) ? true : opt._rem > 0)

Dispatch({ bundles, setBundles, dispatches, setDispatches, babyCoils }) — src/App.jsx:997
- dispatch record: { dateOfDispatch, invoiceNo, vehicleNo, vehicleWeight, bundleEntries:[...], theoreticalWeight, variance, deleted, id }
- bundleEntry (:1026-1032): { bundleId, skuCode, pieces, weight, length, width, thickness, traceBabyCoilId }
- babyCoil: { babyCoilId, hrCoilId, costPrice, weight, thickness, width }
- coil (mother, :209): { hrCoilId, costPrice, actualWeight, ... }
- sku (:1142, :1157-1165): { skuCode, description, thickness, baseConversion, thicknessExtra, ladderPrice (=baseConversion+thicknessExtra), weightPerTube }
- Save-dispatch button row at :1124-1127 (inside showForm); Dispatch Records Section at :1131-1133.
- Parent render: src/App.jsx:2079 — `<Dispatch bundles={bundles} setBundles={setBundles} dispatches={dispatches} setDispatches={setDispatches} babyCoils={babyCoils} />` — MISSING coils/skus.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1 (R1): Weight-based remaining capacity + hard over-production block in Stage 3</name>
  <read_first>
    src/App.jsx:547-680 (SlitToTube), especially :570-579 (theoreticalWeight, maxByWeight, piecesOverMax), :602-607 (babyOptions), :646-656 (helper text), :670 (Save Btn disabled).
    src/App.jsx:710-716 and :775-786 (Stage 4 allocated/remaining + babyOptions `_rem` pattern to mirror).
  </read_first>
  <action>
    In `SlitToTube`:
    1. Add a memoized `consumedWeight` = sum of `Number(theoreticalWeight || 0)` over `tubes.filter(t => !t.deleted && t.babyCoilId === form.babyCoilId && t.id !== editId)`. Exclude the currently-edited row via `t.id !== editId` (mirror Stage 4 `allocatedPieces` guard). Depend on `[tubes, form.babyCoilId, editId]`.
    2. Add `remainingWeight` = `baby ? Number(baby.weight) - consumedWeight : 0`.
    3. Change `maxByWeight` (:575-577) to compute from `remainingWeight` instead of full `baby.weight`: `(remainingWeight && sku?.weightPerTube) ? Math.floor((remainingWeight * 1000) / Number(sku.weightPerTube)) : null`. Keep returning `null` when inputs missing.
    4. Convert `piecesOverMax` to a HARD block: add `(maxByWeight == null || Number(form.numberOfPieces || 0) <= maxByWeight)` requirement to the Save Btn `disabled` condition at :670 — i.e. disable when `piecesOverMax` is true. Keep existing `slitTooNarrow` and required-field checks.
    5. Update the "Max possible from this slit" helper text so it reflects `maxByWeight` (now remaining-based) and continues to show the over-cap warning when `piecesOverMax`.
    6. Rework `babyOptions` (:602-607) to mirror Stage 4 (:775-786): for each non-deleted baby coil compute its consumed weight from `tubes` and a `_rem` remaining weight; label `"${b.babyCoilId} (W:${b.width}mm, ${fmtT(rem)}T remaining)"`; `.filter(opt => (editId && opt.value === form.babyCoilId) ? true : opt._rem > 0)`. Use `fmtT` for tonnes. Add `tubes` to the dependency array.
    Do NOT add new localStorage fields. Do NOT change `theoreticalWeight` semantics (it stays pieces × weightPerTube / 1000).
  </action>
  <verify>
    Run `node node_modules/vite/bin/vite.js build` (or `npm run build`) — build succeeds with no errors.
    grep checks below pass.
  </verify>
  <acceptance_criteria>
    - `grep -n "consumedWeight" src/App.jsx` returns at least one match inside SlitToTube.
    - `grep -n "remainingWeight" src/App.jsx` returns a match.
    - The Save Btn `disabled` expression in SlitToTube includes a piece-count-vs-max condition (e.g. contains `piecesOverMax` or `numberOfPieces` compared to `maxByWeight`); bare `slitTooNarrow`-only disabling is gone.
    - `babyOptions` in SlitToTube filters on a remaining value (contains `_rem` and `editId` guard) and its label contains the substring `remaining`.
    - Behavior: with a baby coil that already has tubes produced, opening Stage 3 and selecting it shows a reduced "Max possible" vs the full-coil number; entering pieces above the remaining max disables Save; editing the existing batch keeps its own weight available (Save not falsely blocked at the original piece count).
  </acceptance_criteria>
  <done>R1 satisfied: remaining capacity subtracts produced tubes (excluding edited row), over-production hard-blocks Save, baby-coil dropdown shows remaining weight and hides exhausted coils.</done>
</task>

<task type="auto">
  <name>Task 2 (R2): Reorder Stage 3 form (Baby Coil first) + thickness-filtered SKU options</name>
  <read_first>
    src/App.jsx:547-672 (SlitToTube), especially :608 (skuOptions), :641-643 (form field order: Date, SKU, Baby Coil).
    src/App.jsx:554-555 (`baby`, `sku` derivations). Note `baby.thickness` flows from the mother coil.
  </read_first>
  <action>
    In `SlitToTube`:
    1. Convert `skuOptions` (:608) into a `useMemo` keyed on `[skus, baby]`. Always keep only `s.status === 'published'`. When `baby` is set, additionally keep only SKUs where `Math.abs(Number(s.thickness) - Number(baby.thickness)) <= 0.05 * Number(baby.thickness)` (direct ±5% thickness check, consistent with project ±5% convention). When `baby` is not set, return all published SKUs. Map to `{ value: s.skuCode, label: s.description || s.skuCode }`.
    2. Reorder the two `<Field>` blocks in the form grid so the **Baby Coil ID** field (currently :643) renders BEFORE the **SKU Code** field (currently :642). Do not change the Date field's position (Date stays first). Leave all downstream auto fields unchanged.
    Acceptable per CONTEXT: if a previously-selected SKU becomes incompatible after changing the coil, the user re-picks — no auto-clear required.
  </action>
  <verify>
    Run the build (`npm run build` or `node node_modules/vite/bin/vite.js build`) — succeeds.
    grep checks below pass.
  </verify>
  <acceptance_criteria>
    - `skuOptions` is a `useMemo` and its body contains a thickness ±5% comparison against `baby.thickness` (e.g. substring `0.05` together with `baby.thickness`, or an `Math.abs(... thickness ...)` expression).
    - In the form grid, the `Field label="Baby Coil ID"` block appears at an earlier source line than the `Field label="SKU Code"` block.
    - Behavior: with no baby coil selected, the SKU dropdown lists all published SKUs; after selecting a baby coil, the SKU dropdown is restricted to SKUs whose thickness is within ±5% of that coil's thickness.
  </acceptance_criteria>
  <done>R2 satisfied: Baby Coil field precedes SKU field; SKU options filter to thickness-compatible published SKUs once a coil is chosen, and show all published SKUs otherwise.</done>
</task>

<task type="auto">
  <name>Task 3 (R3): Invoice Reconciliation CSV export on Dispatch tab</name>
  <read_first>
    src/App.jsx:997-1136 (Dispatch component): :1026-1032 (bundleEntry shape incl. traceBabyCoilId), :1043-1049 (dispatch record), :1124-1133 (button row + Records Section).
    src/App.jsx:2079 (parent render of Dispatch — missing coils/skus).
    src/App.jsx:1142, :1157-1165 (sku cost fields: baseConversion, thicknessExtra, ladderPrice). src/App.jsx:209 (coil costPrice/actualWeight).
    CONTEXT.md R3 section (locked column order + cost model) and RESEARCH.md R3 aggregation notes.
  </read_first>
  <action>
    1. Thread props: at src/App.jsx:2079, add `coils={coils}` and `skus={skus}` to the `<Dispatch ... />` render. Add `coils` and `skus` to the `Dispatch` function signature (:997).
    2. Build the reconciliation rows (optionally via `useMemo` over `[dispatches, babyCoils, coils, skus]`): for each non-deleted dispatch, group its `bundleEntries` by `skuCode`. Produce one row per (dispatch.dateOfDispatch × dispatch.invoiceNo × skuCode). For each group:
       - `quantityMT` = Σ `Number(entry.weight || 0)`.
       - Mother coils: map each entry's `traceBabyCoilId` → `babyCoils.find(b => b.babyCoilId === traceBabyCoilId)?.hrCoilId`; dedupe; join with `;`.
       - `costPricePerMT` = weight-weighted average of `(coil.costPrice / coil.actualWeight)` across contributing entries, weighting each entry by its `weight`. For each entry resolve its mother coil via babyCoil.hrCoilId → `coils.find(c => c.hrCoilId === ...)`. Guard divide-by-zero (skip when `actualWeight` missing/0). **Use a SEPARATE cost denominator (W2 fix):** accumulate `costNum += entryWeight × coilRate` and `costDen += entryWeight` ONLY for entries whose mother-coil rate resolves; final `costPricePerMT = costDen > 0 ? costNum / costDen : 0`. Do NOT divide by `quantityMT` — unresolved-coil entries must not dilute the average toward 0 (they still count in `quantityMT` for the Quantity column and the total).
       - `conversionPerMT` = `Number(sku.baseConversion || 0)` (informational).
       - `ladderPerMT` = `Number(sku.ladderPrice || 0)`.
       - `totalCost` = `(costPricePerMT + ladderPerMT) * quantityMT`.
       - SKU column = `sku.description || skuCode`.
       Resolve `sku` via `skus.find(s => s.skuCode === skuCode)`.
    3. Column order (exactly): Date of dispatch, Invoice no., SKU, Quantity (MT), Mother coil, Cost price/MT, Conversion cost/MT, Ladder cost/MT, Total cost of invoice quantity. Number formatting: MT to 3 dp (reuse `fmtT` for quantity), ₹ costs to 2 dp.
    4. Add a small client-side CSV download helper (Claude's discretion on exact impl): build a header row + data rows, escape any field containing a comma/quote/newline by wrapping in double quotes and doubling internal quotes, join cells with `,` and rows with `\n`, create `new Blob([csv], { type: 'text/csv' })`, an object URL, and a temporary `<a download="invoice-reconciliation-<today>.csv">` click; revoke the URL after. Use `today()` for the filename date.
    5. Add a "Download Invoice Reconciliation (CSV)" `Btn` on the Dispatch tab — place it near the "Dispatch Records" Section header (around :1131). Wire its onClick to build rows + trigger the download.
    Do NOT add new localStorage fields. Known limitation (note only, do not fix): a multi-coil bundle traces only its first row's baby coil, so cost-price blending is limited to that trace coil per bundle.
  </action>
  <verify>
    Run the build (`npm run build` or `node node_modules/vite/bin/vite.js build`) — succeeds.
    grep checks below pass.
  </verify>
  <acceptance_criteria>
    - src/App.jsx:2079 render line contains both `coils={coils}` and `skus={skus}` for `<Dispatch`.
    - The `Dispatch` function signature (`function Dispatch({ ... })`) includes `coils` and `skus`.
    - `grep -n "Invoice Reconciliation" src/App.jsx` matches a button/label.
    - `grep -n "text/csv" src/App.jsx` matches (Blob-based CSV helper present).
    - The CSV header (a string literal in the helper) contains, in order, the column names: Date of dispatch, Invoice no., SKU, Quantity (MT), Mother coil, Cost price/MT, Conversion cost/MT, Ladder cost/MT, Total cost of invoice quantity (wording may vary slightly but order and meaning must match).
    - Aggregation references `traceBabyCoilId`, resolves `hrCoilId`, and computes total as `(costPricePerMT + ladderPerMT) * quantityMT` (cost price + ladder only; no triple-add of conversion).
    - Behavior: clicking the button on the Dispatch tab downloads a CSV with one row per (date × invoice × SKU) and the 9 columns.
  </acceptance_criteria>
  <done>R3 satisfied: Dispatch receives coils+skus; a CSV export produces one row per (date × invoice × SKU) with the 9 locked columns and the locked cost model (total = (costPrice/MT + ladder/MT) × qtyMT).</done>
</task>

</tasks>

<verification>
- `npm run build` (or `node node_modules/vite/bin/vite.js build`) completes with no errors after all three tasks.
- R1: In Stage 3, a baby coil with prior production shows reduced "Max possible"; Save is disabled when pieces exceed remaining; editing a batch does not double-count its own weight.
- R2: Baby Coil field precedes SKU field; SKU dropdown filters to ±5%-thickness SKUs once a coil is chosen, all published otherwise.
- R3: Dispatch tab "Download Invoice Reconciliation (CSV)" exports one row per (date × invoice × SKU) with the 9 columns and locked cost model.
- All edits confined to `src/App.jsx`; no new localStorage keys; no density constants introduced.
</verification>

<success_criteria>
- R1, R2, R3 each provable by the acceptance criteria above and a passing build.
- Single-file pattern preserved (only `src/App.jsx` modified).
- Existing Stage 4 patterns reused for R1; ±5% convention reused for R2; existing SKU cost fields reused for R3 (no schema changes).
</success_criteria>

<output>
Create `.planning/phases/01-slit-tube-recon/01-01-SUMMARY.md` when done.
</output>
