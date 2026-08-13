# JSW Pipes & Tubes — PB MTD Update (2026-08-13)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-13
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	3106.0T
Current Month Orders --->	3013.0T
Invoiced Orders MTD --->	230.4T
Invoiced MTD (Previous Month) --->	323.3T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	129.0T
Non-Confirmed Orders --->	2746.6T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1556.2T
RM Full Coil Left --->	576.3T
RM Baby Coil Left --->	711.0T
RM Total --->	1287.3T

Produced MTD --->	245.3T
Produced MTD (Previous Month) --->	750.1T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	1333.0T
Orders Logged D-2 --->	1113.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (18 calendar days remain, Aug 13–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–13)
  = 323.3 T. August is behind that pace: 230.4 vs 323.3 (**−92.9 T, −29%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 230.4 + 129.0 + 2746.6 = 3106.0 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,837.3 − 3,281.1 = **1,556.2 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,837.1 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch/Production data is lagging, not zero-activity.** Latest dispatch date loaded is
  **2026-08-11**; latest order date **2026-08-12**; latest production date **2026-08-08**.
  So Dispatch D (08-13) *and* D-1 (08-12) both read 0 because neither day is loaded yet — same for
  all three Production D/D-1/D-2 slices (loaded only through 08-08). Treat every 0 on a date after
  its max-loaded date as "not loaded yet", not a stopped line.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 576.3 T** + **Baby Coil Left 711.0 T** = **RM Total 1,287.3 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,976.8 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 230.4 | bundle-line sum = 230.430 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 323.3 | bundle-line sum = 323.290 | ✅ PASS |
| 2 | Partition — orders | month intake = 3013.0 | Σ daily orders Aug = 3013.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 230.4 | Σ daily dispatch Aug ≤ D = 230.430 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 3106.0 | 230.4 + 129.0 + 2746.6 = 3106.0 | ✅ PASS |
| 4 | Freshness | report date 2026-08-13 | max order 08-12 · dispatch 08-11 · production 08-08 | ⚠️ Data lags — zeros on D/D-1 (dispatch) and D/D-1/D-2 (production) are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,976.8 − 576.3 = 5,400.5 | baby coil total = 5,400.5 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 128.950 T vs ERP formula (`release_qty − invoiced_qty`)
  127.425 T, a **1.5 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,400.5 − 4,813.9 = 586.6 T,
  but the per-coil floored figure (what the Dashboard shows) is **711.0 T**. The **124.4 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-13)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 3106.0 T | **+2844.0** |
| Current Month Orders | 93.0 T | 3013.0 T | **+2920.0** |
| Invoiced Orders MTD | 129.2 T | 230.4 T | **+101.2** |
| Invoiced MTD (Prev Month) | 104.5 T | 323.3 T | +218.8 (wider day-of-month window: Jul 1–5 → Jul 1–13) |
| Dispatch D-1 | 0 T | 0 T | — (still not loaded) |
| Dispatch D Day | 0 T | 0 T | — (still not loaded) |
| Confirmed Pending Invoice | 56.5 T | 129.0 T | **+72.5** |
| Non-Confirmed Orders | 76.3 T | 2746.6 T | **+2670.3** |
| Physical Inventory | 1,463.8 T | 1,556.2 T | +92.4 |
| RM Full Coil Left | 616.3 T | 576.3 T | **−40.0** |
| RM Baby Coil Left | 695.7 T | 711.0 T | +15.3 |
| RM Total | 1,312.0 T | 1,287.3 T | −24.7 |
| Produced MTD | 26.3 T | 245.3 T | +219.0 |
| Produced MTD (Prev Month) | 197.8 T | 750.1 T | +552.3 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 60.0 T | 1,333.0 T | **+1273.0** |
| Orders Logged D-2 | 28.0 T | 1,113.0 T | **+1085.0** |

Reading the move: 8 days added ~2,920 T of fresh August order intake (dominated by a large batch
logged 08-12: 1,333 T in one day) — most of it landed **non-confirmed** (+2,670 T), while only
101 T more got invoiced. RM full coil fell 40 T even as baby coil rose 15 T (net slitting, no
fresh mother-coil inward keeping pace with consumption).
