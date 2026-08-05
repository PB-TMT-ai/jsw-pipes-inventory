# Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing

> Read this before touching `src/lib/calc.js` or anything that allocates, weighs, or costs coils.

Slitting splits mother→baby proportionally by width; Production FIFO-consumes **baby coils**; dispatch inherits the trace. **No density constants anywhere.**

Pure helpers live in `src/lib/calc.js`. Formulas:

- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Baby coil weight/cost = `(baby width / Σ sibling widths) × mother actualWeight / costPrice` (so baby and mother cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward}`. Production feeds it **baby coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: baby weight, dateOfInward: dateOfConversion}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the mother `hrCoilId`. Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU. Production passes **`thicknessRule: true`**, which matches on the plant's **RM→FG rule sheet** (`RM_TO_FG_THICKNESS` / `rmRollsFg`) instead of a tolerance band; other callers keep the legacy symmetric band (`thickTolMm` absolute, else ±`tol` relative). Sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND a legal RM→FG pairing**. The relation is asymmetric and many-to-many (2.3 coil rolls 2.5 pipe but not the reverse; 3.0 coil rolls both 3.0 and 3.2; 2.2 coil rolls both 2.2 and 2.3), which is why a ±band cannot express it — the old ±0.3 mm band both admitted pairings the mill never runs (2.6 coil → 2.5 pipe) and rejected ones it does. An FG gauge absent from the sheet yields **no** eligible coil; it never falls back to a band. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `Mother Coil Cost Price / Mother Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).
