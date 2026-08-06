# JSW Pipes & Tubes — PB MTD Update (2026-08-06)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-06
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	185.9T
Current Month Orders --->	93.0T
Invoiced Orders MTD --->	183.7T
Invoiced MTD (Previous Month) --->	156.7T
Dispatch D-1 (Current Month) --->	25.8T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	2.0T
Non-Confirmed Orders --->	0.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1455.6T
RM Full Coil Left --->	616.3T
RM Baby Coil Left --->	623.8T
RM Total --->	1240.1T

Produced MTD --->	98.2T
Produced MTD (Previous Month) --->	296.9T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	60.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (26 calendar days remain, Aug 6–31 inclusive).
- **Order book collapsed because 527 order lines flipped to `delivered`.** Only 25 lines
  (`delivery in progress`, 100.0 T booked) remain open, carrying Confirmed 2.0 T and
  Non-Confirmed 0.2 T. This is a status change in the source feed, not lost orders — the
  Sales KPI excludes `delivered` lines by design (`isDeliveredStatus`). Total Orders drops
  262.0 → 185.9 T for the same reason.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–6)
  = 156.7 T. August is ahead: 183.7 vs 156.7 (**+27.0 T, +17%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 183.7 + 2.0 + 0.2 = 185.9 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,690.0 − 3,234.3 = **1,455.6 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,689.8 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D and both Production D/D-1 read 0 because data is behind, not because the plant
  stopped.** Latest dispatch date loaded is **2026-08-05**; latest order date **2026-08-04**;
  latest production date **2026-08-04**. Treat every 0 on a later date as "not loaded yet".
  Orders Logged D-1 (Aug 5) is a genuine zero-with-lag as well — Aug 4 is the last order date.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 98.2 T against July's 296.9 T over the same 6 days — with
  production loaded only through Aug 4, the August figure is incomplete, not a real gap.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 616.3 T** + **Baby Coil Left 623.8 T** = **RM Total 1,240.1 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,783.3 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 183.7 | bundle-line sum = 183.665 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 156.7 | bundle-line sum = 156.670 | ✅ PASS |
| 2 | Partition — orders | month intake = 93.0 | Σ daily orders Aug = 93.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 183.7 | Σ daily dispatch Aug ≤ D = 183.665 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 185.9 | 183.7 + 2.0 + 0.2 = 185.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-06 | max order 08-04 · dispatch 08-05 · production 08-04 | ⚠️ Data lags — zeros on D/D-1 are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,783.3 − 616.3 = 5,167.0 | baby coil total = 5,167.0 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 1.950 T vs ERP formula (`release_qty − invoiced_qty`)
  0.590 T, a **1.36 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
  The gap shrank with the order book (was 5.3 T on Aug 5).
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,167.0 − 4,666.5 = 500.5 T,
  but the per-coil floored figure (what the Dashboard shows) is **623.8 T**. The **123.3 T** gap
  is unchanged from Aug 5 — the same affected productions consumed beyond their recorded slit
  weight. Still worth a data check; it does not change the Dashboard-aligned number above.

## Change vs last report (2026-08-05 → 2026-08-06)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 185.9 T | **−76.1** |
| Current Month Orders | 93.0 T | 93.0 T | — |
| Invoiced Orders MTD | 129.2 T | 183.7 T | **+54.5** |
| Invoiced MTD (Prev Month) | 104.5 T | 156.7 T | +52.2 |
| Dispatch D-1 | 0 T | 25.8 T | +25.8 |
| Dispatch D Day | 0 T | 0 T | — (not loaded) |
| Confirmed Pending Invoice | 56.5 T | 2.0 T | **−54.5** |
| Non-Confirmed Orders | 76.3 T | 0.2 T | **−76.1** |
| Physical Inventory | 1,463.8 T | 1,455.6 T | −8.2 |
| RM Full Coil Left | 616.3 T | 616.3 T | — |
| RM Baby Coil Left | 695.7 T | 623.8 T | **−71.9** |
| RM Total | 1,312.0 T | 1,240.1 T | **−71.9** |
| Produced MTD | 26.3 T | 98.2 T | **+71.9** |
| Produced MTD (Prev Month) | 197.8 T | 296.9 T | +99.1 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — (not loaded) |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 60.0 T | 0 T | −60.0 |
| Orders Logged D-2 | 28.0 T | 60.0 T | +32.0 |

Reading the move: one day of catch-up loading added **54.5 T of invoicing** and **71.9 T of
production** (Aug 2–4 backfilled), and that production drew exactly 71.9 T out of baby coils —
RM Total fell by the same amount it converted. The **order book didn't shrink, it closed**:
527 lines went to `delivered`, so Confirmed and Non-Confirmed both emptied out. Nothing new was
ordered — August intake is flat at 93.0 T.
