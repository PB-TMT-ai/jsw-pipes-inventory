# JSW Pipes & Tubes — PB MTD Update (2026-08-05)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-05
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	262.0T
Current Month Orders --->	93.0T
Invoiced Orders MTD --->	129.2T
Invoiced MTD (Previous Month) --->	104.5T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	56.5T
Non-Confirmed Orders --->	76.3T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1463.8T
RM Full Coil Left --->	616.3T
RM Baby Coil Left --->	695.7T
RM Total --->	1312.0T

Produced MTD --->	26.3T
Produced MTD (Previous Month) --->	197.8T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	60.0T
Orders Logged D-2 --->	28.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (27 calendar days remain, Aug 5–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–5)
  = 104.5 T, for a like-for-like pace comparison. August is ahead: 129.2 vs 104.5
  (**+24.7 T, +24%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 129.2 + 56.5 + 76.3 = 262.0 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,618.1 − 3,154.3 = **1,463.8 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,617.9 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D / D-1 read 0 because data is behind, not because the plant stopped.** Latest
  dispatch date loaded is **2026-08-03**; latest order date **2026-08-04**; latest production
  date **2026-08-01**. Treat every 0 on a later date as "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 26.3 T against July's 197.8 T over the same 5 days — but with
  production data loaded only through Aug 1, the August figure is incomplete, not a real gap.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 616.3 T** + **Baby Coil Left 695.7 T** = **RM Total 1,312.0 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 5,783.3 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 129.2 | bundle-line sum = 129.235 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 104.5 | bundle-line sum = 104.475 | ✅ PASS |
| 2 | Partition — orders | month intake = 93.0 | Σ daily orders Aug = 93.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 129.2 | Σ daily dispatch Aug ≤ D = 129.235 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 262.0 | 129.2 + 56.5 + 76.3 = 262.0 | ✅ PASS |
| 4 | Freshness | report date 2026-08-05 | max order 08-04 · dispatch 08-03 · production 08-01 | ⚠️ Data lags — zeros on D/D-1 are "not loaded yet" |
| — | Mass balance (RM) | inward − full coil left = 5,783.3 − 616.3 = 5,167.0 | baby coil total = 5,167.0 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 56.450 T vs ERP formula (`release_qty − invoiced_qty`)
  51.115 T, a **5.3 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,167.0 − 4,594.6 = 572.4 T,
  but the per-coil floored figure (what the Dashboard shows) is **695.7 T**. The **123.3 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-02 → 2026-08-05)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 199.5 T | 262.0 T | **+62.5** |
| Current Month Orders | 5.0 T | 93.0 T | **+88.0** |
| Invoiced Orders MTD | 93.2 T | 129.2 T | **+36.0** |
| Invoiced MTD (Prev Month) | 78.4 T | 104.5 T | +26.1 |
| Dispatch D-1 | 93.2 T | 0 T | −93.2 (no data loaded) |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 77.0 T | 56.5 T | **−20.5** |
| Non-Confirmed Orders | 29.3 T | 76.3 T | **+47.0** |
| Physical Inventory | 1,458.7 T | 1,463.8 T | +5.1 |
| RM Full Coil Left | 466.2 T | 616.3 T | **+150.1** |
| RM Baby Coil Left | 650.5 T | 695.7 T | +45.2 |
| RM Total | 1,116.7 T | 1,312.0 T | **+195.3** |
| Produced MTD | 0 T | 26.3 T | +26.3 |
| Produced MTD (Prev Month) | 107.4 T | 197.8 T | +90.4 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 5.0 T | 60.0 T | +55.0 |
| Orders Logged D-2 | 5.0 T | 28.0 T | +23.0 |

Reading the move: three days added 88 T of fresh August orders and 36 T of invoicing, and
**195 T of raw material came in** (new mother coils plus fresh slitting). The order book shifted
toward non-confirmed (+47 T) as confirmed converted to invoice (−20.5 T).
