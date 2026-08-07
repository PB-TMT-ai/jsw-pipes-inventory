# JSW Pipes & Tubes — PB MTD Update (2026-08-07)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-07
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	809.9T
Current Month Orders --->	717.0T
Invoiced Orders MTD --->	183.7T
Invoiced MTD (Previous Month) --->	213.5T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	2.0T
Non-Confirmed Orders --->	624.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1495.2T
RM Full Coil Left --->	705.9T
RM Baby Coil Left --->	603.9T
RM Total --->	1309.8T

Produced MTD --->	137.7T
Produced MTD (Previous Month) --->	400.3T
Production D-1 --->	37.6T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	624.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a
  best estimate and both lines compute (25 calendar days remain, Aug 7–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–7)
  = 213.5 T, for a like-for-like pace comparison. August is behind: 183.7 vs 213.5
  (**−29.8 T, −14%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 183.7 + 2.0 + 624.2 = 809.9 T.
  The order book flipped almost entirely to **non-confirmed** (624.2 T of 626.2 T open) — the
  Aug 6 log of 624.0 T is the driver.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,729.5 − 3,234.3 = **1,495.2 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,729.3 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D / D-1 read 0 because data is behind, not because the plant stopped.** Latest
  dispatch date loaded is **2026-08-05**; latest order date **2026-08-06**; latest production
  date **2026-08-06**. Treat every 0 on a later date as "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 137.7 T against July's 400.3 T over the same 7 days —
  Production D-1 (Aug 6) posted 37.6 T; Aug 7 is unloaded.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 705.9 T** + **Baby Coil Left 603.9 T** = **RM Total 1,309.8 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,891.8 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 183.7 | bundle-line sum = 183.665 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 213.5 | bundle-line sum = 213.480 | ✅ PASS |
| 2 | Partition — orders | month intake = 717.0 | Σ daily orders Aug = 717.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 183.7 | Σ daily dispatch Aug ≤ D = 183.665 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 809.9 | 183.7 + 2.0 + 624.2 = 809.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-07 | max order 08-06 · dispatch 08-05 · production 08-06 | ⚠️ Data lags — zeros on D (and Dispatch D-1) are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,891.8 − 705.9 = 5,185.9 | baby coil total = 5,185.9 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 1.950 T vs ERP formula (`release_qty − invoiced_qty`)
  0.590 T, a **1.36 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,185.9 − 4,706.1 = 479.8 T,
  but the per-coil floored figure (what the Dashboard shows) is **603.9 T**. The **124.1 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-07)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 809.9 T | **+547.9** |
| Current Month Orders | 93.0 T | 717.0 T | **+624.0** |
| Invoiced Orders MTD | 129.2 T | 183.7 T | **+54.5** |
| Invoiced MTD (Prev Month) | 104.5 T | 213.5 T | +109.0 |
| Dispatch D-1 | 0 T | 0 T | — (data lag) |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 2.0 T | **−54.5** |
| Non-Confirmed Orders | 76.3 T | 624.2 T | **+547.9** |
| Physical Inventory | 1,463.8 T | 1,495.2 T | +31.4 |
| RM Full Coil Left | 616.3 T | 705.9 T | +89.6 |
| RM Baby Coil Left | 695.7 T | 603.9 T | **−91.8** |
| RM Total | 1,312.0 T | 1,309.8 T | −2.2 |
| Produced MTD | 26.3 T | 137.7 T | **+111.4** |
| Produced MTD (Prev Month) | 197.8 T | 400.3 T | +202.5 |
| Production D-1 | 0 T | 37.6 T | +37.6 |
| Production D Day | 0 T | 0 T | — |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 60.0 T | 624.0 T | **+564.0** |
| Orders Logged D-2 | 28.0 T | 0 T | −28.0 |

Reading the move: the two days added **624 T of fresh August orders** (logged Aug 6),
essentially all non-confirmed — the confirmed bucket drained from 56.5 → 2.0 T as those
lines got invoiced (+54.5 T MTD). Production restarted at 37.6 T on Aug 6, lifting Produced
MTD to 137.7 T and pulling ~92 T out of baby coils (full coil inward roughly offset it, so
RM Total held flat).
