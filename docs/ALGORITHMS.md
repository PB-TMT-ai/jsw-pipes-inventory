# Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing

> Read this before touching `src/lib/calc.js` or anything that allocates, weighs, or costs coils.

Slitting splits mother→baby proportionally by width; Production FIFO-consumes **baby coils**; dispatch inherits the trace. **No density constants anywhere.**

Pure helpers live in `src/lib/calc.js`. Formulas:

- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Baby coil weight/cost = `(baby width / Σ sibling widths) × mother actualWeight / costPrice` (so baby and mother cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward}`. Production feeds it **baby coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: baby weight, dateOfInward: dateOfConversion}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the mother `hrCoilId`. Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU. Production passes **`thicknessRule: true`**, which matches on the plant's **RM→FG rule sheet** (`RM_TO_FG_THICKNESS` / `rmRollsFg`) instead of a tolerance band; other callers keep the legacy symmetric band (`thickTolMm` absolute, else ±`tol` relative). Sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND a legal RM→FG pairing**. The relation is asymmetric and many-to-many (2.3 coil rolls 2.5 pipe but not the reverse; 3.0 coil rolls both 3.0 and 3.2; 2.2 coil rolls both 2.2 and 2.3), which is why a ±band cannot express it — the old ±0.3 mm band both admitted pairings the mill never runs (2.6 coil → 2.5 pipe) and rejected ones it does. An FG gauge absent from the sheet yields **no** eligible coil; it never falls back to a band. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
- **Capacity cap** (`capAllocationRows`): a manual row filled past **105%** of its coil's remaining weight now **blocks save** (it was warn-and-save, which is how 445 baby coils came to hold 123.3 T more than they physically could). The **Fix split** action caps each row at its coil's real capacity and spills the excess down the operator's own rows, then into eligible coils they had not used. It preserves their coil choices and row order, so it is a cap on their pick — **not** the FIFO suggestion, which stays non-binding. Whole pieces only; anything that still will not fit is returned as `leftoverPieces` for the caller to surface. Under-allocating is unaffected and still saves as `partial`.
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `Mother Coil Cost Price / Mother Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- **Distributor × SKU stock** (`salesByDistributor` with `opts.productions`) — per distributor and canonical SKU: `pending = confirmed + nonConfirmed`; `onhand = max(0, producedPool.availableWeight)`; `allPending` = Σ pending across **every** distributor for that SKU; `shortBy = max(0, pending − onhand)`. `onhand` is the **whole plant's** stock and is divided between nobody, so the identical tonnage repeats on every distributor's row for that size and `shortBy` can read 0 on a size that is oversubscribed several times over (ADR-0002 — 39.3 T of `50x50x2.0` against 78 T queued across five distributors). Both the Sales tab drill-down and the PB MTD workbook's **Distributor × SKU** sheet read this one function, so screen and workbook cannot disagree; the sheet lists only live pairs (pending or invoiced MTD above zero), sorts region → distributor → pending desc, and **never totals `onhand`** — summing it reports more stock than the plant holds. Each SKU row also carries its own **`description`** — the SKU master's when it has a row for the code, else the **order line's own** description. 37 of the ERP codes on the order book have no master row at all (ordered, never produced), and for those the order line is the only place the tube's name exists; without it both the screen and the workbook printed the raw MM ID (`1140-13075-10078295`) where the description belongs. The workbook's SKU label is derived from that description in the same `size x thickness` shape the SKU Ageing sheet uses, so the two sheets still join.
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).

## PB MTD workbook — the Distributor by Region sheet

`buildDistributorRegionData` (`src/lib/reports.js`) turns `salesByDistributor` rows into region blocks:
`Region | State | Distributor | Plan | Total Orders | Invoiced MTD | % of Plan | Gap to Plan`.

- **Region** comes from the state → region master (`distributorRegionResolver`), **State** from the
  distributor's own order and invoice lines. Neither is typed on this sheet, so a region shown in Excel
  and one shown on the Sales tab cannot diverge — `App.jsx` passes the same `stateRegions` rows in.
- **Blocks and totals.** Rows group under their region, each block closed by a region total, with a
  grand total at the foot. Region order is fixed: the four `REGIONS`, any off-list region a stored
  mapping holds, then `Unmapped` last. **State is a column only** — it gets no subtotal row. Within a
  region: biggest Plan first, then biggest invoiced, then name.
- **Plan** is the typed monthly Best Estimate, so Σ Plan **is** the Dashboard's Best Estimate KPI (both
  are Σ of the same estimates). `null` means no plan — never a plan of zero, which would read as a
  target that was then missed.
- **% of Plan** = invoiced ÷ plan, held as a **fraction** because the cell carries a percentage number
  format (`0.0%`). Measured against invoiced only, matching the plant-level Invoice % of BE.
- **One decimal, format-only.** Every tonnage cell holds the exact value and carries `#,##0.0`; nothing
  is rounded before it reaches the sheet, or the region totals and grand total would stop tying to the
  KPIs. The visible cost: displayed region totals can look a decimal off the displayed grand total
  (51.3 + 50.8 + 0.0 reads 102.1 against a grand total of 102.0). The exact values do add up. Unlike
  the SKU Ageing sheet, no `-` placeholder is used — every tonnage cell stays numeric so the sheet can
  be sorted, filtered and charted.
- **Two roads into `Unmapped`:** a state nobody has mapped, and a distributor with no order or invoice
  lines at all to derive a state from — a Plan set before its first order lands there, carrying real
  target tonnage. Both keep their full weight in the grand total.
- **Row filter:** listed if it has a Plan **or** any tonnage (invoiced or on the order book). Wider than
  the flat sheet this replaced, which dropped a distributor holding orders but no plan and no invoice —
  an omission that understated its region once Total Orders became a headline column.
- **Total Orders blends two time windows** — Invoiced MTD is this month, Confirmed / Non-Confirmed are
  an all-time snapshot of undelivered orders — so an old unserved backlog reads as heavy ordering. The
  sheet's footnote says so.
