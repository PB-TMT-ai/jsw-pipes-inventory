# Blueprint: SKU ageing report (finished-goods inventory ageing)

## Goal
Answer "give the ageing of these SKUs" — for each requested SKU, how much finished stock is
on hand and how long it has been sitting since production, bucketed by age.

## Definition
- **On-hand stock = produced − dispatched** (the app's inventory model; see `producedPool` /
  `buildFinishedStockData` in `src/lib/calc.js` / `src/lib/reports.js`).
- **Ageing = days since production** of the **un-dispatched** remainder, drained **FIFO**
  (dispatches consume the oldest production batches first — the same oldest-first logic as
  `dispatchCoilTrace`, `src/lib/calc.js:974`).
- Buckets: **0–30 / 31–60 / 61–90 / 90+ days**. Weight = each batch's produced tonnage.

## Input
Live Supabase tables: `productions` (`date_of_production`, `sku_code`, `tube_count`,
`total_weight`), `dispatches` (`bundle_entries[]` JSONB carrying `skuCode` + `pieces`), `skus`
(dimension master). No file upload needed.

## Steps
1. Use **`scripts/sku-ageing.sql`** — set the `as_of` date at the top.
2. Run it against the Supabase project (SQL Editor, or MCP `execute_sql`).
   - Netting key = physical **size (height×breadth or NB) + thickness** from the `skus` master,
     so variant ERP codes for the same tube (e.g. several `1139-13064-1005942x` for 50×50) net
     together. IS-standard is intentionally NOT split — the request is by size+thickness.
3. To scope to a specific SKU list, join the final `group by` output to a `VALUES` list of
   `(size_part, thickness)` — e.g. `'50x50', 2.0` for `50X50X2`, `'32', 2.5` for `32NBX2.5`
   (SHS/RHS → `'HxB'`, CHS → the bare NB number; match on `size_part` + numeric `thk`).
4. Write results to `reports/SKU-Ageing-<as_of>.md` (+ `.csv`). See the 2026-07-14 run for the
   layout (headline KPIs → watchlist → full table → notes).

## Edge cases
- **Over-dispatched SKU** (dispatched > in-system production; e.g. pre-tracking opening stock or
  a data gap) → on-hand clamps to **0**, age is null. FIFO uses `greatest(0, …)` so a negative
  never corrupts the bucketing. Flag these rows.
- **Variant thickness in the master** (e.g. a `50×50×2.9` code) stays a **separate** key — it is
  a different physical tube, so it is not merged with `50×50×2.8`. Netting is by the master's
  own dimension values.
- **Max age is bounded by the tracking start** (first `date_of_production` ≈ 2026-03-28). "90+"
  means the batch dates to the very start of the tracked period.
- A dispatched `skuCode` absent from `skus` would be dropped from netting — the report's
  validation step confirms there are none (all dispatch codes resolve to a master row).

## Verify
- Spot-check a SKU: `onhand_pcs` should equal `Σ tube_count − Σ dispatched pieces` for that key.
- `Σ` of the four age buckets must equal `onhand_mt` per row.
- Total on-hand MT should reconcile with the Dashboard "Finished Stock" report for the same SKUs.
