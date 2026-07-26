# JSW Pipes & Tubes — PB MTD Update (2026-07-26)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-26
Revised Best Estimate --->	1750T
Total Orders --->	769.3T
Current Month Orders --->	687.0T
Invoiced Orders MTD --->	629.3T
Invoiced MTD (Previous Month) --->	819.5T
Dispatch D-1 (Current Month) --->	40.0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	71.0T
Non-Confirmed Orders --->	69.0T
Daily Run Rate Required --->	186.8T
Physical Inventory --->	1819.6T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	39.0T
Orders Logged D-2 --->	40.0T
```

Notes:
- **Revised Best Estimate** — not supplied for this run; **carried over from the 2026-07-25
  report (1750 T for July)**, since it is the same month. Not a Supabase figure — correct it
  if the July target has been revised.
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (1750 − 629.3) ÷ 6 (Jul 26–31 inclusive) = **186.8 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar, so this runs low
  against a working-day convention.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–26), for a like-for-like pace comparison — not the full June total. July is still
  pacing behind: 629.3 T vs 819.5 T over the same 26 days (**−190.2 T, −23%**).
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

## Verification (as of 2026-07-26) — **PASS**

Every ✅ figure was reproduced by a second independent method.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–26) | 629.3 T | Σ bundle-entry line weights = 629.310 = Σ theoretical_weight | ✅ exact |
| Invoiced MTD prev month (Jun 1–26) | 819.5 T | dual-method line-sum = 819.504 (same day-of-month) | ✅ exact |
| Dispatch month total | 629.3 T | Σ of 18 daily dispatch buckets = 629.310 (partition check) | ✅ |
| Current-month orders | 687.0 T | Σ of 15 daily order buckets = 687.000 (partition check) | ✅ |
| Total Orders | 769.3 T | 629.3 + 71.0 + 69.0 | ✅ arithmetic |
| Confirmed | 71.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 70.75 T → **Δ 0.25 T** (advisory; report uses the stored bucket) |
| Physical Inventory | 1,819.6 T | produced (live master recompute) 4,380.4 − invoiced 2,560.8 = Dashboard FG Left Inventory | ✅ matches Dashboard |
| Production stored vs live | 4,380.2 / 4,380.4 T | Δ 0.2 T master-weight drift | ✅ negligible |

**Data freshness:** latest `order_date` = 2026-07-25, latest `date_of_dispatch` = 2026-07-25 —
so Dispatch D-day and Orders Logged D-day are 0 **for lack of loaded data**, not zero activity.

## Change vs last report (2026-07-25 → 2026-07-26)

| Metric | 2026-07-25 | 2026-07-26 | Δ |
|---|---|---|---|
| Total Orders | 754.3 T | 769.3 T | +15.0 T |
| Current Month Orders | 673.0 T | 687.0 T | +14.0 T |
| Invoiced MTD | 589.3 T | 629.3 T | +40.0 T |
| Invoiced MTD (Prev Month, same days) | 803.1 T | 819.5 T | +16.4 T (window Jun 1–25 → Jun 1–26) |
| Dispatch D-1 | 26.9 T | 40.0 T | +13.1 T |
| Confirmed Pending Invoice | 25.0 T | 71.0 T | +46.0 T |
| Non-Confirmed | 140.0 T | 69.0 T | −71.0 T |
| Daily Run Rate Required | 165.8 T | 186.8 T | +21.0 T (6 days left vs 7) |
| Physical Inventory (FG) | 1,824.3 T | 1,819.6 T | −4.7 T |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
