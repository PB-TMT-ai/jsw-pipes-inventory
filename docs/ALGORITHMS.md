# Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing

> Read this before touching `src/lib/calc.js` or anything that allocates, weighs, or costs coils.
>
> The **strip width** half of Production eligibility has its own doc — `docs/STRIP-WIDTH-RULE.md`.
> Read that one before changing `requiredStripWidth` or the width input in Slitting: the outer
> perimeter summarised below is the current behaviour and is known to be wrong (one mill width feeds
> several sections, so no perimeter formula can express it — issue #99 step 2).

Slitting splits mother→baby proportionally by width; Production FIFO-consumes **baby coils**; dispatch inherits the trace. **No density constants anywhere.**

Pure helpers live in `src/lib/calc.js`. Formulas:

- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Baby coil weight/cost = `(baby width / Σ sibling widths) × mother actualWeight / costPrice` (so baby and mother cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward}`. Production feeds it **baby coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: baby weight, dateOfInward: dateOfConversion}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the mother `hrCoilId`. Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU. Production passes **`thicknessRule: true`**, which matches on the plant's **RM→FG rule sheet** (`RM_TO_FG_THICKNESS` / `rmRollsFg`) instead of a tolerance band; other callers keep the legacy symmetric band (`thickTolMm` absolute, else ±`tol` relative). Sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND a legal RM→FG pairing**. The relation is asymmetric and many-to-many (2.3 coil rolls 2.5 pipe but not the reverse; 3.0 coil rolls both 3.0 and 3.2; 2.2 coil rolls both 2.2 and 2.3), which is why a ±band cannot express it — the old ±0.3 mm band both admitted pairings the mill never runs (2.6 coil → 2.5 pipe) and rejected ones it does. An FG gauge absent from the sheet yields **no** eligible coil; it never falls back to a band. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
- **Capacity cap** (`capAllocationRows`): a manual row filled past **105%** of its coil's remaining weight now **blocks save** (it was warn-and-save, which is how 445 baby coils came to hold 123.3 T more than they physically could). The **Fix split** action caps each row at its coil's real capacity and spills the excess down the operator's own rows, then into eligible coils they had not used. It preserves their coil choices and row order, so it is a cap on their pick — **not** the FIFO suggestion, which stays non-binding. Whole pieces only; anything that still will not fit is returned as `leftoverPieces` for the caller to surface. Under-allocating is unaffected and still saves as `partial`.
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `Mother Coil Cost Price / Mother Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).
