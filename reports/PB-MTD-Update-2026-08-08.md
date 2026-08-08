# JSW Pipes & Tubes — PB MTD Update (2026-08-08)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-08
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	826.9T
Current Month Orders --->	734.0T
Invoiced Orders MTD --->	200.4T
Invoiced MTD (Previous Month) --->	213.5T
Dispatch D-1 (Current Month) --->	16.7T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	2.0T
Non-Confirmed Orders --->	624.5T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1478.5T
RM Full Coil Left --->	710.9T
RM Baby Coil Left --->	642.0T
RM Total --->	1352.9T

Produced MTD --->	137.7T
Produced MTD (Previous Month) --->	495.8T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	17.0T
Orders Logged D-2 --->	624.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–8)
  = 213.5 T. August is behind: 200.4 vs 213.5 (**−13.1 T, −6%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 200.4 + 2.0 + 624.5 = 826.9 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,729.5 − 3,251.0 = **1,478.5 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,729.3 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D / Orders D / Production D & D-1 read 0 because data is behind, not because
  activity stopped.** Latest dispatch date loaded is **2026-08-07**; latest order date
  **2026-08-07**; latest production date **2026-08-06**. Treat every 0 on a later date as
  "not loaded yet" — this includes Production D-1 (2026-08-07), which is past the last
  production load date.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 137.7 T against July's 495.8 T over the same 8 days.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 710.9 T** + **Baby Coil Left 642.0 T** = **RM Total 1,352.9 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,934.9 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 200.4 | bundle-line sum = 200.355 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 213.5 | bundle-line sum = 213.480 | ✅ PASS |
| 2 | Partition — orders | month intake = 734.0 | Σ daily orders Aug ≤ D = 734.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 200.4 | Σ daily dispatch Aug ≤ D = 200.355 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 826.9 | 200.4 + 2.0 + 624.5 = 826.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-08 | max order 08-07 · dispatch 08-07 · production 08-06 | ⚠️ Data lags — zeros on D (and Production D-1) are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,934.9 − 710.9 = 5,224.0 | baby coil total = 5,224.0 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 1.950 T vs ERP formula (`release_qty − invoiced_qty`)
  0.600 T, a **1.35 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,224.0 − 4,706.1 = 517.9 T,
  but the per-coil floored figure (what the Dashboard shows) is **642.0 T**. The **124.1 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-08)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 826.9 T | **+564.9** |
| Current Month Orders | 93.0 T | 734.0 T | **+641.0** |
| Invoiced Orders MTD | 129.2 T | 200.4 T | **+71.2** |
| Invoiced MTD (Prev Month) | 104.5 T | 213.5 T | +109.0 |
| Dispatch D-1 | 0 T | 16.7 T | +16.7 |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 2.0 T | **−54.5** |
| Non-Confirmed Orders | 76.3 T | 624.5 T | **+548.2** |
| Physical Inventory | 1,463.8 T | 1,478.5 T | +14.7 |
| RM Full Coil Left | 616.3 T | 710.9 T | +94.6 |
| RM Baby Coil Left | 695.7 T | 642.0 T | −53.7 |
| RM Total | 1,312.0 T | 1,352.9 T | +40.9 |
| Produced MTD | 26.3 T | 137.7 T | +111.4 |
| Produced MTD (Prev Month) | 197.8 T | 495.8 T | +298.0 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 60.0 T | 17.0 T | −43.0 |
| Orders Logged D-2 | 28.0 T | 624.0 T | **+596.0** |

Reading the move: three days added a big batch of fresh August order entry (+641 T of current-month
orders, mostly landing non-confirmed) alongside +71 T of invoicing and +111 T of production. Confirmed
orders converted down sharply (−54.5 T) as the order book shifted heavily toward non-confirmed.
