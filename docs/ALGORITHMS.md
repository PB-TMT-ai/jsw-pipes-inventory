# Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing

> Read this before touching `src/lib/calc.js` or anything that allocates, weighs, or costs coils.

Slitting splits mother→baby proportionally by width; Production FIFO-consumes **baby coils**; dispatch inherits the trace. **No density constants anywhere.**

Pure helpers live in `src/lib/calc.js`. Formulas:

- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Baby coil weight/cost = `(baby width / Σ sibling widths) × mother actualWeight / costPrice` (so baby and mother cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward}`. Production feeds it **baby coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: baby weight, dateOfInward: dateOfConversion}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the mother `hrCoilId`. Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU — within `thickTolMm` (absolute mm) when the caller passes it (Production passes **±0.3 mm**), else within ±`tol` relative (default ±5%) — sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND thickness ±0.3 mm**. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `Mother Coil Cost Price / Mother Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).

# Campaign Planner — the rules the month is committed under

> Read this before touching the `campaign*` helpers in `src/lib/calc.js` or the Campaign tab's Plan side.

Locked decisions live in `.planning/phases/03-campaign-planner/03-CONTEXT.md`; the Baseline rule is `docs/adr/0003`.

The six pointers rendered above the Initiate button are these:

1. **Where the numbers come from** (`campaignSuggestion`) — Plant Best Estimate for VOLUME, trailing-month sales for the MIX, plus open orders, less family on-hand. No Best Estimate typed for the month → volume falls back to trailing sales and the screen says which source it used.
2. **Nothing computes on render** — Initiate snapshots demand when pressed (orders arrive late, so *when* is the operator's call). Re-pressing refreshes every suggestion and leaves every typed target alone.
3. **Over the Hour budget is a test, never a verdict** — the plan saves anyway and shows `336 / 312 h, over by 24 h ≈ 102 T`. No family is auto-deferred, nothing is trimmed pro-rata.
4. **The family target is the commitment** (`gaugeReconciliation`) — Σ gauge targets must equal it. The mismatch shows while Draft and blocks only Draft → Active; the family number is never silently rewritten to match an edited gauge.
5. **Revision 1 is the Baseline** — never overwritten. Revise writes revision n+1 with a mandatory one-line reason; the month is still scored against the first commitment.
6. **Unplanned production is reported, never deducted** (`campaignUnplanned`) — its hours are stated beside the gap and charged against neither the Hour budget nor any shortfall.

Constants, defined once: `MILL_RATE_TPH` 4.32 (measured — Jul 2026's 1,400.3 MT ÷ 27 days ÷ 12 h; the research corpus's 12 t/h is a large-mill figure, 2.8× too high, and appears nowhere), `SHIFT_HOURS` 12, `FAMILY_FLOOR_MT` 20, `GAUGE_FLOOR_MT` 3.

- Hour budget = `(calendar days − Sundays − operator exceptions) × 12 h`, then overridable by working days or outright hours. A Sunday typed as an exception is ignored — it is already not a working day.
- Feasible = `Hour budget × MILL_RATE_TPH`. Hours ↔ tonnes go through `mtToHours` / `hoursToMt` only, so a rate change cannot leave the two halves disagreeing. **Tonnage only — no `weightPerTube` and no density constant is involved.**
- The gap decomposes into exactly three causes that sum to it, asserted on load (`campaignDecomposition`): `Baseline − Achieved = (Baseline − Revised) + (Revised − Feasible) + (Feasible − Achieved)`. Causes are returned **signed**; a month committed under Feasible really did have hours going spare.

## Commit gate — unresolvable grid cells

Commit has **two** gates. The first is reconciliation (rule 4). The second is resolvability.

The grid lets any cell be typed, including a family + thickness the trailing month never saw. A freely-typed cell has to answer "which SKU is this?", and `gaugeIdentity(family, thickness, skus)` answers it from the master. When the master carries no such product, the cell gets a synthetic `unresolved|…` key that no production can ever match:

```
free-typed cell  →  campaign_gauges.sku_key = unresolved|SHS 50x50|6.00
                         │
   plant produces it ────┤
                         ├─► campaignProgress: skuOf(code) ≠ sku_key → not found
                         │      → gauge reads 0 achieved, forever
                         │      → family shows permanently behind
                         └─► campaignUnplanned: not in the planned-gauge set
                                → lands in the HIGHLIGHTED unplanned block
```

That inverts the Monitor: the three-cause decomposition blames "the mill missed" for tonnage the mill actually rolled. So — **type anything while Draft; Commit stays disabled until every typed cell resolves to a real SKU** (`unresolvedGauges`), surfaced the same way unreconciled families are. Only typed, positive cells count: a suggestion always came from a real SKU, and a typed 0 needs nothing to match it.

Two master SKUs sharing a family and thickness (different IS standard or length) are two gauges in one cell. That cell is read-only and shows their total, rather than the app picking one.
