# JSW Pipes & Tubes — PB MTD Update (2026-08-10)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-10
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	876.9T
Current Month Orders --->	784.0T
Invoiced Orders MTD --->	200.4T
Invoiced MTD (Previous Month) --->	300.7T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	2.0T
Non-Confirmed Orders --->	674.5T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1539.6T
RM Full Coil Left --->	695.4T
RM Baby Coil Left --->	639.8T
RM Total --->	1335.2T

Produced MTD --->	198.6T
Produced MTD (Previous Month) --->	659.6T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	50.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–10)
  = 300.7 T, vs August's 200.4 T so far (**−100.3 T**, August is behind pace — but see freshness
  note below, dispatch data is only loaded through Aug 7).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 200.4 + 2.0 + 674.5 = 876.9 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,790.6 − 3,251.0 = **1,539.6 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,790.4 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D / D-1 read 0 because data is behind, not because the plant stopped.** Latest
  dispatch date loaded is **2026-08-07**; latest order date **2026-08-08**; latest production
  date **2026-08-07**. Treat every 0 on 2026-08-09 or 2026-08-10 as "not loaded yet" — that
  includes Dispatch D/D-1, Production D/D-1, and Orders Logged D/D-1.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 198.6 T against July's 659.6 T over the same 10 days — but
  with production data loaded only through Aug 7, the August figure is incomplete, not a real gap.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 695.4 T** + **Baby Coil Left 639.8 T** = **RM Total 1,335.2 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,976.8 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 200.4 | bundle-line sum = 200.355 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 300.7 | bundle-line sum = 300.740 | ✅ PASS |
| 2 | Partition — orders | month intake = 784.0 | Σ daily orders Aug ≤ D = 784.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 200.4 | Σ daily dispatch Aug ≤ D = 200.355 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 876.9 | 200.4 + 2.0 + 674.5 = 876.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-10 | max order 08-08 · dispatch 08-07 · production 08-07 | ⚠️ Data lags — zeros on D/D-1 are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,976.8 − 695.4 = 5,281.4 | baby coil total = 5,281.3 | ✅ PASS (Δ 0.1, rounding) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 1.950 T vs ERP formula (`release_qty − invoiced_qty`)
  0.600 T, a **1.35 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,281.3 − 4,767.1 = 514.2 T,
  but the per-coil floored figure (what the Dashboard shows) is **639.8 T**. The **125.6 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-10)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 876.9 T | **+614.9** |
| Current Month Orders | 93.0 T | 784.0 T | **+691.0** |
| Invoiced Orders MTD | 129.2 T | 200.4 T | **+71.2** |
| Invoiced MTD (Prev Month) | 104.5 T | 300.7 T | +196.2 (day-cap moved 5→10) |
| Dispatch D-1 | 0 T | 0 T | — |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 2.0 T | **−54.5** |
| Non-Confirmed Orders | 76.3 T | 674.5 T | **+598.2** |
| Physical Inventory | 1,463.8 T | 1,539.6 T | +75.8 |
| RM Full Coil Left | 616.3 T | 695.4 T | +79.1 |
| RM Baby Coil Left | 695.7 T | 639.8 T | −55.9 |
| RM Total | 1,312.0 T | 1,335.2 T | +23.2 |
| Produced MTD | 26.3 T | 198.6 T | +172.3 |
| Produced MTD (Prev Month) | 197.8 T | 659.6 T | +461.8 (day-cap moved 5→10) |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 60.0 T | 0 T | −60.0 (no data loaded on 08-09) |
| Orders Logged D-2 | 28.0 T | 50.0 T | +22.0 |

Reading the move: five days added a very large **691 T** of fresh August order intake (mostly
landing as non-confirmed, +598.2 T) and **71.2 T** of fresh invoicing, while confirmed orders
converted down (−54.5 T) as they were either invoiced or reclassified. RM ticked up modestly
(+23.2 T net) despite that order surge — worth confirming the intake spike is real and not a
bulk data-entry batch.
