# JSW Pipes & Tubes — PB MTD Update (2026-08-02)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-02
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	199.5T
Current Month Orders --->	5.0T
Invoiced Orders MTD --->	93.2T
Invoiced MTD (Previous Month) --->	78.4T
Dispatch D-1 (Current Month) --->	93.2T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	77.0T
Non-Confirmed Orders --->	29.3T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1458.7T
RM Full Coil Left --->	466.2T
RM Baby Coil Left --->	650.5T
RM Total --->	1116.7T

Produced MTD --->	0T
Produced MTD (Previous Month) --->	107.4T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	5.0T
Orders Logged D-2 --->	5.0T
```

Notes:
- **New month.** August is 2 days old, so MTD figures restart. Do not read the drop from the
  2026-07-28 report as a decline — July's book closed and August's began.
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. The July
  figure (1750 T) is **not** carried into a new month. Give a best estimate and both lines
  compute (29 calendar days remain, Aug 2–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–2)
  = 78.4 T, for a like-for-like pace comparison. August is ahead so far: 93.2 vs 78.4
  (**+14.8 T, +19%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 93.2 + 77.0 + 29.3 = 199.5 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,567.2 − 3,108.5 = **1,458.7 T**. This is the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis production sum is 4,567.0 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date
  2026-08-01 and dispatch date 2026-08-01 — one day behind the report date — not necessarily
  zero activity.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. All August production lines read 0 because the latest `date_of_production`
  loaded is **2026-07-31** — two days behind. July's first 2 days ran 107.4 T, so treat August's
  zeros as missing data, not a stopped mill. July closed at 1,414.2 T produced.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 466.2 T** (23 whole, unslit mother coils) + **Baby Coil Left 650.5 T** (slit,
  not yet produced) = **RM Total 1,116.7 T**. FG is a separate stage — never add it into RM.
  Total mother coil inward to date is 5,531.1 T; latest coil inward 2026-07-22, latest slitting
  2026-07-30.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-08-02) — **PASS**

Every ✅ figure was reproduced by a second independent method.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Aug 1–2) | 93.2 T | Σ bundle-entry line weights = 93.180 = Σ theoretical_weight | ✅ exact |
| Invoiced MTD prev month (Jul 1–2) | 78.4 T | dual-method line-sum = 78.350 (same day-of-month) | ✅ exact |
| Dispatch month total | 93.2 T | Σ of daily dispatch buckets (Aug 1 = 93.2, Aug 2 = 0) | ✅ partition |
| Current-month orders | 5.0 T | Σ of daily order buckets (Aug 1 = 5.0, Aug 2 = 0) | ✅ partition |
| Total Orders | 199.5 T | 93.2 + 77.0 + 29.3 | ✅ arithmetic |
| Confirmed | 77.0 T | stored bucket, app-consistent (`salesKpis`) = 76.950 | ⚠️ ERP Release−Invoiced = 73.735 T → **Δ 3.215 T** (advisory; report uses the stored bucket) |
| Physical Inventory | 1,458.7 T | produced (live master recompute) 4,567.2 − invoiced 3,108.5 = Dashboard FG Left Inventory | ✅ matches Dashboard |
| Production stored vs live | 4,567.0 / 4,567.2 T | Δ 0.2 T master-weight drift | ✅ negligible |
| Produced (3rd method) | 4,567.037 T | Σ `tube_count × weight_per_piece` = Σ `total_weight`, 0 row mismatches, 0 unmatched SKUs over 1,256 rows | ✅ exact |
| Invoiced (all-time) | 3,108.504 T | Σ line weights = Σ `theoretical_weight` | ✅ exact |
| RM Full Coil Left | 466.2 T | 23 mother coils with no baby coil; 0 T of them ≥95% dispatched | ✅ |
| RM Baby Coil Left | 650.5 T | mass balance: inward 5,531.1 − unslit 466.2 = 5,064.9 ≈ baby slit total 5,065.0 (Δ 0.1 T) | ✅ |
| Baby coil floor effect | 650.5 T | unfloored (5,065.0 − 4,543.8) = 521.2 T → **129.3 T over-consumed** on some baby coils, floored per coil as the app does | ⚠️ advisory |

**Data freshness:** latest `order_date` = 2026-08-01, latest `date_of_dispatch` = 2026-08-01 —
so Dispatch D-day and Orders Logged D-day are 0 **for lack of loaded data**, not zero activity.

## Change vs last report (2026-07-28 → 2026-08-02)

Month rolled over, so the MTD lines are **not** a like-for-like comparison — July's book
closed on Jul 31 and August restarted at zero.

| Metric | 2026-07-28 (Jul MTD) | 2026-08-02 (Aug MTD) | Δ |
|---|---|---|---|
| Total Orders | 859.0 T | 199.5 T | −659.5 T (month reset) |
| Current Month Orders | 743.0 T | 5.0 T | −738.0 T (month reset) |
| Invoiced MTD | 663.0 T | 93.2 T | −569.8 T (month reset) |
| Invoiced MTD (Prev Month, same days) | 909.8 T | 78.4 T | window Jun 1–28 → Jul 1–2 |
| Dispatch D-1 | 33.7 T | 93.2 T | +59.5 T |
| Confirmed Pending Invoice | 103.0 T | 77.0 T | −26.0 T (invoiced out) |
| Non-Confirmed | 93.0 T | 29.3 T | −63.7 T |
| Daily Run Rate Required | 271.8 T | ⚠️ N/A | no August target supplied |
| Physical Inventory (FG) | 1,857.6 T | 1,458.7 T | −398.9 T (dispatch outpaced production) |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
