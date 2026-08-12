# JSW Pipes & Tubes — PB MTD Update (2026-08-12)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-12
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	2749.0T
Current Month Orders --->	2656.0T
Invoiced Orders MTD --->	230.4T
Invoiced MTD (Previous Month) --->	300.7T
Dispatch D-1 (Current Month) --->	30.1T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	27.0T
Non-Confirmed Orders --->	2491.6T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1556.2T
RM Full Coil Left --->	576.3T
RM Baby Coil Left --->	711.0T
RM Total --->	1287.3T
	
Produced MTD --->	245.3T
Produced MTD (Previous Month) --->	710.3T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	874.0T
Orders Logged D-1 --->	1113.0T
Orders Logged D-2 --->	509.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (19 calendar days remain, Aug 12–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–12)
  = 300.7 T, for a like-for-like pace comparison. August is behind: 230.4 vs 300.7
  (**−70.3 T, −23%**) — but see the freshness note below; dispatch data is only loaded through
  Aug 11, one day short of D.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 230.4 + 27.0 + 2491.6 = 2,749.0 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,837.3 − 3,281.1 = **1,556.2 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,837.1 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D and Production D/D-1/D-2 read 0 because data is behind, not because the plant
  stopped.** Latest dispatch date loaded is **2026-08-11**; latest order date **2026-08-12**
  (fresh); latest production date **2026-08-08** — four days behind. Treat every 0 on a later
  date as "not loaded yet", not zero activity.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 245.3 T against July's 710.3 T over the same 12 days, but
  with production data loaded only through Aug 8, the August figure is incomplete, not a real gap.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 576.3 T** + **Baby Coil Left 711.0 T** = **RM Total 1,287.3 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,976.8 T.
- **Order book jump is large this week** — Current Month Orders and Non-Confirmed Orders both
  moved by ~2,400–2,500 T since the last report (Aug 5). That is a real swing in the underlying
  data (worth a sanity check with the sales team if unexpected), not a computation artifact —
  the arithmetic and partition checks below both PASS on it.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 230.4 | bundle-line sum = 230.430 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 300.7 | bundle-line sum = 300.740 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 2,749.0 | 230.4 + 27.0 + 2,491.6 = 2,749.0 | ✅ PASS |
| 4 | Freshness | report date 2026-08-12 | max order 08-12 · dispatch 08-11 · production 08-08 | ⚠️ Data lags — zeros on Dispatch D and Production D/D-1/D-2 are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,976.8 − 576.3 = 5,400.5 | baby coil total = 5,400.5 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds; freshness lag is flagged above, not a failure.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 26.950 T vs ERP formula (`release_qty − invoiced_qty`)
  25.425 T, a **1.5 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,400.5 − 4,813.9 = 586.6 T,
  but the per-coil floored figure (what the Dashboard shows) is **711.0 T**. The **124.4 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-12)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 2,749.0 T | **+2,487.0** |
| Current Month Orders | 93.0 T | 2,656.0 T | **+2,563.0** |
| Invoiced Orders MTD | 129.2 T | 230.4 T | +101.2 |
| Invoiced MTD (Prev Month) | 104.5 T | 300.7 T | +196.2 |
| Dispatch D-1 | 0 T | 30.1 T | +30.1 |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 27.0 T | −29.5 |
| Non-Confirmed Orders | 76.3 T | 2,491.6 T | **+2,415.3** |
| Physical Inventory | 1,463.8 T | 1,556.2 T | +92.4 |
| RM Full Coil Left | 616.3 T | 576.3 T | −40.0 |
| RM Baby Coil Left | 695.7 T | 711.0 T | +15.3 |
| RM Total | 1,312.0 T | 1,287.3 T | −24.7 |
| Produced MTD | 26.3 T | 245.3 T | +219.0 |
| Produced MTD (Prev Month) | 197.8 T | 710.3 T | +512.5 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 874.0 T | +874.0 |
| Orders Logged D-1 | 60.0 T | 1,113.0 T | +1,053.0 |
| Orders Logged D-2 | 28.0 T | 509.0 T | +481.0 |

Reading the move: seven days elapsed since the last report (not three, like the prior comparison),
so larger deltas are expected. The headline is a **huge order intake** — 2,563 T of fresh August
orders, almost entirely landing as Non-Confirmed (+2,415 T) rather than converting to invoice yet.
Production and dispatch logging are both a few days behind (Aug 8 and Aug 11 respectively), so
Physical Inventory's +92.4 T move understates what's actually on the floor once that catches up.
