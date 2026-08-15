# JSW Pipes & Tubes — PB MTD Update (2026-08-15)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-15
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	2972.1T
Current Month Orders --->	2883.0T
Invoiced Orders MTD --->	321.9T
Invoiced MTD (Previous Month) --->	348.4T
Dispatch D-1 (Current Month) --->	21.2T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	113.0T
Non-Confirmed Orders --->	2537.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1464.7T
RM Full Coil Left --->	619.1T
RM Baby Coil Left --->	711.0T
RM Total --->	1330.1T

Produced MTD --->	245.3T
Produced MTD (Previous Month) --->	874.0T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	474.0T
Orders Logged D-2 --->	52.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (17 calendar days remain, Aug 15–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–15)
  = 348.4 T, for a like-for-like pace comparison. August is **behind**: 321.9 vs 348.4
  (**−26.5 T, −7.6%**) — and dispatch is only loaded through Aug 14, so part of that gap is data lag.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 321.9 + 113.0 + 2537.2 = 2,972.1 T.
- **Order intake jumped hard.** August intake is **2,883.0 T** against 93.0 T at the Aug 5 report —
  +2,790 T in ten days, almost all of it landing in **Non-Confirmed (2,537.2 T)**. That single
  bucket is now 85% of the order book. Worth confirming the intake is genuine and not a bulk load.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,837.3 − 3,372.6 = **1,464.7 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,837.1 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Production D / D-1 read 0 because data is behind, not because the mill stopped.** Latest
  production date loaded is **2026-08-08** — seven days stale. Latest dispatch and order dates are
  both **2026-08-14**, so Dispatch D and Orders Logged D also read 0 as "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG can
  never disagree. August MTD is 245.3 T against July's 874.0 T over the same 15 days, but with
  production loaded only through Aug 8 the August figure is incomplete, not a real collapse.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 619.1 T** + **Baby Coil Left 711.0 T** = **RM Total 1,330.1 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,019.6 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 321.9 | bundle-line sum = 321.945 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 348.4 | bundle-line sum = 348.445 | ✅ PASS |
| 1 | Dispatch D-1 | `theoretical_weight` sum = 21.2 | bundle-line sum = 21.200 | ✅ PASS |
| 2 | Partition — orders | month intake = 2,883.0 | Σ daily orders Aug = 2,883.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 321.9 | Σ daily dispatch Aug ≤ D = 321.945 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 2,972.1 | 321.9 + 113.0 + 2,537.2 = 2,972.1 | ✅ PASS |
| 4 | Freshness | report date 2026-08-15 | max order 08-14 · dispatch 08-14 · production 08-08 | ⚠️ Data lags — zeros on D (and production D-1) are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 6,019.6 − 619.1 = 5,400.5 | baby coil total = 5,400.5 | ✅ PASS (exact) |
| — | FG reconciliation | live recompute 4,837.3 − invoiced 3,372.6 = 1,464.7 | stored-basis produced 4,837.1 (Δ 0.2) | ✅ PASS |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 113.000 T vs ERP formula (`release_qty − invoiced_qty`)
  111.535 T, a **1.5 T** gap (was 5.3 T on Aug 5 — narrowing). The report uses the **stored**
  bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,400.5 − 4,813.9 = 586.6 T,
  but the per-coil floored figure (what the Dashboard shows) is **711.0 T**. The **124.4 T** gap
  means some baby coils were consumed beyond their recorded slit weight — essentially unchanged
  from the 123.3 T flagged on Aug 5, so it is an existing data issue, not a new one. Worth a check
  on the affected productions; it does not change the Dashboard-aligned number above.

## Change vs last report (2026-08-05 → 2026-08-15)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 2,972.1 T | **+2,710.1** |
| Current Month Orders | 93.0 T | 2,883.0 T | **+2,790.0** |
| Invoiced Orders MTD | 129.2 T | 321.9 T | **+192.7** |
| Invoiced MTD (Prev Month) | 104.5 T | 348.4 T | +243.9 |
| Dispatch D-1 | 0 T | 21.2 T | +21.2 |
| Dispatch D Day | 0 T | 0 T | — (no data loaded) |
| Confirmed Pending Invoice | 56.5 T | 113.0 T | **+56.5** |
| Non-Confirmed Orders | 76.3 T | 2,537.2 T | **+2,460.9** |
| Physical Inventory | 1,463.8 T | 1,464.7 T | +0.9 |
| RM Full Coil Left | 616.3 T | 619.1 T | +2.8 |
| RM Baby Coil Left | 695.7 T | 711.0 T | +15.3 |
| RM Total | 1,312.0 T | 1,330.1 T | +18.1 |
| Produced MTD | 26.3 T | 245.3 T | **+219.0** |
| Produced MTD (Prev Month) | 197.8 T | 874.0 T | +676.2 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — (no data loaded) |
| Orders Logged D Day | 0 T | 0 T | — (no data loaded) |
| Orders Logged D-1 | 60.0 T | 474.0 T | **+414.0** |
| Orders Logged D-2 | 28.0 T | 52.0 T | +24.0 |

Reading the move: the story of these ten days is **order intake, not throughput**. The book grew
by 2,710 T and 91% of that landed in Non-Confirmed. Invoicing added 192.7 T and production 219.0 T
— healthy, but nowhere near the intake. FG barely moved (+0.9 T) because production and dispatch
nearly cancelled out, and RM is flat (+18.1 T), so nothing has been staged yet for the new book.
