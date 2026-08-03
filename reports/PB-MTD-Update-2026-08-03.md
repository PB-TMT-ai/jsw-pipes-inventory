# JSW Pipes & Tubes — PB MTD Update (2026-08-03)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-03
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	199.5T
Current Month Orders --->	5.0T
Invoiced Orders MTD --->	93.2T
Invoiced MTD (Previous Month) --->	78.4T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	77.0T
Non-Confirmed Orders --->	29.3T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1456.0T
RM Full Coil Left --->	428.4T
RM Baby Coil Left --->	689.0T
RM Total --->	1117.4T

Produced MTD --->	0T
Produced MTD (Previous Month) --->	185.2T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	5.0T
```

Notes:
- **Data is 2 days stale.** Latest `order_date` and `date_of_dispatch` loaded = **2026-08-01**;
  latest `date_of_production` = **2026-07-31**. Every D-day and D-1 zero on this report means
  "not loaded yet", **not** zero activity. Yesterday's report showed Dispatch D-1 = 93.2 T
  (that was Aug 1); today Aug 2 shows nothing because Aug 2 was never uploaded.
- **Invoiced MTD (Previous Month)** = July invoiced through the same day-of-month (Jul 1–3)
  = 78.4 T. August is ahead on pace: 93.2 vs 78.4 (**+14.8 T, +19%**) — but on 1 loaded day
  vs July's 3, so don't over-read it.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 93.2 + 77.0 + 29.3 = 199.5 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,564.5 − 3,108.5 = **1,456.0 T** (Dashboard → Finished Goods → FG Left Inventory).
  Stored-basis production sum is 4,564.3 T (Δ 0.2 T) — negligible master-weight drift.
  FG fell 2.7 T since yesterday's report with no new dispatch — that is a **production-record
  edit**, not a shipment.
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give one and
  both lines compute (28 calendar days remain, Aug 3–31 inclusive).
- **RM (raw material)** mirrors the Dashboard → **Coil** cards: **Full Coil Left 428.4 T** +
  **Baby Coil Left 689.0 T** = **RM Total 1,117.4 T**. Full coil dropped 37.8 T and baby coil
  rose 38.5 T since 2026-08-02 — a mother coil was slit. FG is a separate stage; never added in.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-08-03) — **PASS**

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Aug 1–3) | 93.2 T | Σ bundle-entry line weights = 93.180 = Σ theoretical_weight | ✅ exact |
| Invoiced MTD prev month (Jul 1–3) | 78.4 T | dual-method line-sum = 78.350 (same day-of-month) | ✅ exact |
| Dispatch month total | 93.2 T | Σ of daily dispatch buckets = 93.18 | ✅ partition |
| Current-month orders | 5.0 T | Σ of daily order buckets = 5.00 | ✅ partition |
| Total Orders | 199.5 T | 93.2 + 77.0 + 29.3 | ✅ arithmetic |
| Confirmed | 77.0 T | stored bucket, app-consistent (`salesKpis`) = 76.950 | ⚠️ ERP Release−Invoiced = 73.735 T → **Δ 3.215 T** (advisory; report uses the stored bucket) |
| Physical Inventory | 1,456.0 T | produced (live master recompute) 4,564.5 − invoiced 3,108.5 = Dashboard FG Left Inventory | ✅ matches Dashboard |
| Production stored vs live | 4,564.3 / 4,564.5 T | Δ 0.2 T master-weight drift | ✅ negligible |
| RM mass balance | — | inward 5,531.1 − full coil left 428.4 = 5,102.7 = baby slit total 5,102.7 | ✅ exact |
| Baby coil floor effect | 689.0 T | unfloored (5,102.7 − 4,541.0) = 561.7 T → **127.3 T over-consumed** on some baby coils, floored per coil as the app does | ⚠️ advisory |

**Data freshness:** latest `order_date` = 2026-08-01, latest `date_of_dispatch` = 2026-08-01,
latest `date_of_production` = 2026-07-31. All D-day / D-1 zeros are missing uploads.

## Change vs last report (2026-08-02 → 2026-08-03)

| Metric | 2026-08-02 | 2026-08-03 | Δ |
|---|---|---|---|
| Total Orders | 199.5 T | 199.5 T | 0 |
| Current Month Orders | 5.0 T | 5.0 T | 0 |
| Invoiced MTD | 93.2 T | 93.2 T | 0 (no new dispatch loaded) |
| Invoiced MTD (Prev Month, same days) | 78.4 T | 78.4 T | 0 (Jul 3 had no dispatch) |
| Dispatch D-1 | 93.2 T | 0 T | window moved to Aug 2 — not loaded |
| Confirmed Pending Invoice | 77.0 T | 77.0 T | 0 |
| Non-Confirmed | 29.3 T | 29.3 T | 0 |
| Produced MTD (Prev Month, same days) | 107.4 T | 185.2 T | +77.8 T (window Jul 1–2 → Jul 1–3) |
| Physical Inventory (FG) | 1,458.7 T | 1,456.0 T | −2.7 T (production-record edit) |
| RM Full Coil Left | 466.2 T | 428.4 T | −37.8 T (mother coil slit) |
| RM Baby Coil Left | 650.5 T | 689.0 T | +38.5 T |
| RM Total | 1,116.7 T | 1,117.4 T | +0.7 T |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
