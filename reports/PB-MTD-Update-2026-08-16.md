# JSW Pipes & Tubes — PB MTD Update (2026-08-16)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-16
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	2972.5T
Current Month Orders --->	2883.0T
Invoiced Orders MTD --->	352.3T
Invoiced MTD (Previous Month) --->	387.5T
Dispatch D-1 (Current Month) --->	30.3T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	83.0T
Non-Confirmed Orders --->	2537.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1434.4T
RM Full Coil Left --->	619.1T
RM Baby Coil Left --->	711.0T
RM Total --->	1330.1T
	
Produced MTD --->	245.3T
Produced MTD (Previous Month) --->	947.8T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	474.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (16 calendar days remain, Aug 16–31 inclusive).
- **Order book exploded this fortnight.** Current-month orders went 93.0 → **2,883.0 T** and
  non-confirmed 76.3 → **2,537.2 T** since the Aug-5 report. Almost all of the growth sits in the
  **non-confirmed** bucket, so it is order intake, not committed volume — confirmed pending invoice
  moved only 56.5 → 83.0 T.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–16)
  = 387.5 T, for a like-for-like pace comparison. August is **behind**: 352.3 vs 387.5
  (**−35.2 T, −9%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 352.3 + 83.0 + 2,537.2 = 2,972.5 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,837.3 − 3,402.9 = **1,434.4 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,837.1 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Zeros on D / D-1 are data lag, not a stopped plant.** Latest dispatch date loaded is
  **2026-08-15**; latest order date **2026-08-14**; latest production date **2026-08-08**. Every 0
  on a later date means "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG can
  never disagree. August is at 245.3 T against July's 947.8 T over the same 16 days — but with
  production loaded only through Aug 8, the August figure is incomplete, not a real 74% collapse.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 619.1 T** + **Baby Coil Left 711.0 T** = **RM Total 1,330.1 T**. FG is a separate
  stage — never add it into RM. Total mother coil inward to date is 6,019.6 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 352.3 | bundle-line sum = 352.265 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 387.5 | bundle-line sum = 387.505 | ✅ PASS |
| 2 | Partition — orders | month intake = 2,883.0 | Σ daily orders Aug = 2,883.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 352.3 | Σ daily dispatch Aug ≤ D = 352.265 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 2,972.5 | 352.3 + 83.0 + 2,537.2 = 2,972.5 | ✅ PASS |
| 4 | Freshness | report date 2026-08-16 | max order 08-14 · dispatch 08-15 · production 08-08 | ⚠️ Data lags — zeros on D/D-1 are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 6,019.6 − 619.1 = 5,400.5 | baby coil total = 5,400.5 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 83.000 T vs ERP formula (`release_qty − invoiced_qty`)
  81.215 T, a **1.8 T** gap (was 5.3 T on Aug 5 — narrowing). The report uses the **stored** bucket,
  matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,400.5 − 4,813.9 = 586.6 T,
  but the per-coil floored figure (what the Dashboard shows) is **711.0 T**. The **124.4 T** gap
  means some baby coils were consumed beyond their recorded slit weight (was 123.3 T on Aug 5 — the
  same pre-existing coils, essentially unchanged). Worth a data check on the affected productions;
  it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-16)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 2,972.5 T | **+2,710.5** |
| Current Month Orders | 93.0 T | 2,883.0 T | **+2,790.0** |
| Invoiced Orders MTD | 129.2 T | 352.3 T | **+223.1** |
| Invoiced MTD (Prev Month) | 104.5 T | 387.5 T | +283.0 |
| Dispatch D-1 | 0 T | 30.3 T | +30.3 |
| Dispatch D Day | 0 T | 0 T | — (not loaded) |
| Confirmed Pending Invoice | 56.5 T | 83.0 T | **+26.5** |
| Non-Confirmed Orders | 76.3 T | 2,537.2 T | **+2,460.9** |
| Physical Inventory | 1,463.8 T | 1,434.4 T | −29.4 |
| RM Full Coil Left | 616.3 T | 619.1 T | +2.8 |
| RM Baby Coil Left | 695.7 T | 711.0 T | +15.3 |
| RM Total | 1,312.0 T | 1,330.1 T | +18.1 |
| Produced MTD | 26.3 T | 245.3 T | **+219.0** |
| Produced MTD (Prev Month) | 197.8 T | 947.8 T | +750.0 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — (not loaded) |
| Orders Logged D Day | 0 T | 0 T | — (not loaded) |
| Orders Logged D-1 | 60.0 T | 0 T | −60.0 (not loaded) |
| Orders Logged D-2 | 28.0 T | 474.0 T | +446.0 |

Reading the move: the headline is a **~2,800 T order intake** landing in the first half of August,
sitting almost entirely in non-confirmed — a book to convert, not volume to ship yet. Against that,
invoicing added 223 T but is still **9% behind July's pace** on the same days, and production added
219 T. FG stock drew down 29 T (invoiced faster than produced). RM barely moved (+18 T) — no
meaningful new coil inward this fortnight, which is the constraint to watch if that order book
starts converting.
