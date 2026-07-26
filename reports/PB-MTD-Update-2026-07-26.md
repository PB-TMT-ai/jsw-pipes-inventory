# JSW Pipes & Tubes — PB MTD Update (2026-07-26)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-26
Revised Best Estimate --->	⚠️ N/A (not supplied)
Total Orders --->	769.3T
Current Month Orders --->	687.0T
Invoiced Orders MTD --->	629.3T
Invoiced MTD (Previous Month) --->	819.5T
Dispatch D-1 (Current Month) --->	40.0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	71.0T
Non-Confirmed Orders --->	69.0T
Daily Run Rate Required --->	⚠️ N/A (no Best Estimate supplied)
Physical Inventory --->	1819.6T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	39.0T
Orders Logged D-2 --->	40.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no `best_estimate` input supplied for this run, so both are N/A.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–26), for a like-for-like pace comparison — not the full June total. July is pacing
  behind: 629.3 T vs 819.5 T over the same 26 days.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 629.3 + 71.0 + 69.0 = 769.3 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,380.4 − 2,560.8 = **1,819.6 T**. This is the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis production sum is 4,380.2 T (Δ 0.2 T vs live) — negligible master-weight drift, not
  used for this figure.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date
  2026-07-25 and dispatch date 2026-07-25 — one day behind the report date — not necessarily zero activity.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-26)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul) | 629.3 T | Σ line weights = Σ theoretical_weight = 629.310 | ✅ exact |
| Invoiced MTD prev month (Jun 1–26) | 819.5 T | dual-method = 819.504 (same day-of-month) | ✅ exact |
| Dispatch month total | 629.3 T | = Invoiced MTD (partition check) | ✅ |
| Current-month orders | 687.0 T | Σ daily order intake (partition check) | ✅ |
| Total Orders | 769.3 T | 629.3 + 71.0 + 69.0 | ✅ arithmetic |
| Confirmed | 71.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 70.75 T → 0.25 T variance (minor) |
| Physical Inventory | 1,819.6 T | produced (live master recompute) 4,380.4 − invoiced 2,560.8 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-25, latest `date_of_dispatch` = 2026-07-25 — so
Dispatch D-day and Orders Logged D-day are 0 for lack of loaded data, not zero activity.

## Change vs last report (2026-07-25 → 2026-07-26)

| Metric | 2026-07-25 | 2026-07-26 | Δ |
|---|---|---|---|
| Total Orders | 754.3 T | 769.3 T | +15.0 T |
| Current Month Orders | 673.0 T | 687.0 T | +14.0 T |
| Invoiced MTD | 589.3 T | 629.3 T | +40.0 T |
| Invoiced MTD (Prev Month, same days) | 803.1 T | 819.5 T | +16.4 T (wider window: Jun 1–25 → Jun 1–26) |
| Confirmed Pending Invoice | 25.0 T | 71.0 T | +46.0 T |
| Non-Confirmed | 140.0 T | 69.0 T | −71.0 T |
| Physical Inventory (FG) | 1,824.3 T | 1,819.6 T | −4.7 T |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
