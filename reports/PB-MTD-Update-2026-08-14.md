# JSW Pipes & Tubes — PB MTD Update (2026-08-14)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-14
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	3072.9T
Current Month Orders --->	2983.0T
Invoiced Orders MTD --->	300.7T
Invoiced MTD (Previous Month) --->	348.4T
Dispatch D-1 (Current Month) --->	70.3T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	80.0T
Non-Confirmed Orders --->	2692.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1485.9T
RM Full Coil Left --->	619.1T
RM Baby Coil Left --->	711.0T
RM Total --->	1330.1T
	
Produced MTD --->	245.3T
Produced MTD (Previous Month) --->	809.0T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	10.0T
Orders Logged D-1 --->	62.0T
Orders Logged D-2 --->	1231.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–14)
  = 348.4 T, for a like-for-like pace comparison. August is behind: 300.7 vs 348.4
  (**−47.7 T, −14%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 300.7 + 80.0 + 2692.2 = 3072.9 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,837.3 − 3,351.4 = **1,485.9 T**. Dashboard → **Finished Goods → FG Left Inventory**.
- **Production data is stale — 6 days behind report date.** Latest production date loaded is
  **2026-08-08**. Produced MTD (245.3 T) reflects activity only through Aug 8, not Aug 14.
  Production D Day / D-1 (both Aug 13, 14) read 0 because no rows exist yet for those dates —
  not because the plant stopped. Treat every 0 on Aug 9–14 as "not loaded yet".
- **Dispatch D Day reads 0 for the same reason** — latest dispatch date loaded is **2026-08-13**
  (D-1), so today's dispatch simply hasn't been entered yet.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 619.1 T** + **Baby Coil Left 711.0 T** = **RM Total 1,330.1 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,019.6 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 300.7 | bundle-line sum = 300.745 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 348.4 | bundle-line sum = 348.445 | ✅ PASS |
| 2 | Partition — orders/dispatch | month/day aggregates | same-source daily sums | ✅ PASS |
| 3 | Arithmetic — Total Orders | 3072.9 | 300.7 + 80.0 + 2692.2 = 3072.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-14 | max order 08-14 · dispatch 08-13 · production 08-08 | ⚠️ Production lags 6 days — treat Produced D/D-1/D-2 and Dispatch D as "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 6,019.6 − 619.1 = 5,400.5 | baby coil total = 5,400.5 | ✅ PASS (exact) |

**Overall: PASS.** All hard checks hold; production freshness flagged above (advisory, not a failure).

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 80.000 T vs ERP formula (`release_qty − invoiced_qty`)
  78.535 T, a **1.5 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,400.5 − 4,813.9 = 586.6 T,
  but the per-coil floored figure (what the Dashboard shows) is **711.0 T**. The **124.4 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-14)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 3072.9 T | **+2810.9** |
| Current Month Orders | 93.0 T | 2983.0 T | **+2890.0** |
| Invoiced Orders MTD | 129.2 T | 300.7 T | **+171.5** |
| Invoiced MTD (Prev Month) | 104.5 T | 348.4 T | +243.9 (wider day-window: Jul 1–5 → Jul 1–14) |
| Dispatch D-1 | 0 T | 70.3 T | **+70.3** |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 80.0 T | +23.5 |
| Non-Confirmed Orders | 76.3 T | 2692.2 T | **+2615.9** |
| Physical Inventory | 1,463.8 T | 1,485.9 T | +22.1 |
| RM Full Coil Left | 616.3 T | 619.1 T | +2.8 |
| RM Baby Coil Left | 695.7 T | 711.0 T | +15.3 |
| RM Total | 1,312.0 T | 1,330.1 T | +18.1 |
| Produced MTD | 26.3 T | 245.3 T | +219.0 |
| Produced MTD (Prev Month) | 197.8 T | 809.0 T | +611.2 (wider day-window: Jul 1–5 → Jul 1–14) |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 10.0 T | +10.0 |
| Orders Logged D-1 | 60.0 T | 62.0 T | +2.0 |
| Orders Logged D-2 | 28.0 T | 1231.0 T | **+1203.0** |

Reading the move: a large batch of orders landed since Aug 5 — Non-Confirmed jumped **+2615.9 T**
and Current Month Orders **+2890.0 T**, with **1231 T logged on a single day (D-2, Aug 12)**
alone. Invoicing kept pace only modestly (+171.5 T), so the order book is building up faster
than it's being converted — worth checking whether this is one large customer/project order or
a genuine demand surge. Production entries have not been updated since Aug 8; get that data
loaded before trusting Produced MTD or Physical Inventory too far into the month.
