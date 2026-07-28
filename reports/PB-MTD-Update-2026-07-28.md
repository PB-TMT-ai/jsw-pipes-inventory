# JSW Pipes & Tubes — PB MTD Update (2026-07-28)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-28
Revised Best Estimate --->	1750T
Total Orders --->	859.0T
Current Month Orders --->	743.0T
Invoiced Orders MTD --->	663.0T
Invoiced MTD (Previous Month) --->	909.8T
Dispatch D-1 (Current Month) --->	33.7T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	103.0T
Non-Confirmed Orders --->	93.0T
Daily Run Rate Required --->	271.8T
Physical Inventory --->	1857.6T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	90.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Revised Best Estimate** — not supplied for this run; **carried over from the 2026-07-25 /
  2026-07-26 reports (1750 T for July)**, since it is the same month. Not a Supabase figure —
  correct it if the July target has been revised.
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (1750 − 663.0) ÷ 4 (Jul 28–31 inclusive) = **271.8 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar, so this runs low
  against a working-day convention.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–28), for a like-for-like pace comparison — not the full June total. July is still
  pacing behind: 663.0 T vs 909.8 T over the same 28 days (**−246.8 T, −27%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 663.0 + 103.0 + 93.0 = 859.0 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,452.1 − 2,594.4 = **1,857.6 T**. This is the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis production sum is 4,451.9 T (Δ 0.2 T vs live) — negligible master-weight drift, not
  used for this figure.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date
  2026-07-27 and dispatch date 2026-07-27 — one day behind the report date — not necessarily zero activity.
- **Orders Logged D-2** (2026-07-26) is a **genuine zero** — that date is within the loaded window.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-28) — **PASS**

Every ✅ figure was reproduced by a second independent method.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–28) | 663.0 T | Σ bundle-entry line weights = 662.980 = Σ theoretical_weight | ✅ exact |
| Invoiced MTD prev month (Jun 1–28) | 909.8 T | dual-method line-sum = 909.769 (same day-of-month) | ✅ exact |
| Dispatch month total | 663.0 T | Σ of daily dispatch buckets = 662.980 (partition check) | ✅ |
| Current-month orders | 743.0 T | Σ of daily order buckets = 743.000 (partition check) | ✅ |
| Total Orders | 859.0 T | 663.0 + 103.0 + 93.0 | ✅ arithmetic |
| Confirmed | 103.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 102.75 T → **Δ 0.25 T** (advisory; report uses the stored bucket) |
| Physical Inventory | 1,857.6 T | produced (live master recompute) 4,452.1 − invoiced 2,594.4 = Dashboard FG Left Inventory | ✅ matches Dashboard |
| Production stored vs live | 4,451.9 / 4,452.1 T | Δ 0.2 T master-weight drift | ✅ negligible |

**Data freshness:** latest `order_date` = 2026-07-27, latest `date_of_dispatch` = 2026-07-27 —
so Dispatch D-day and Orders Logged D-day are 0 **for lack of loaded data**, not zero activity.

## Change vs last report (2026-07-26 → 2026-07-28)

| Metric | 2026-07-26 | 2026-07-28 | Δ |
|---|---|---|---|
| Total Orders | 769.3 T | 859.0 T | +89.7 T |
| Current Month Orders | 687.0 T | 743.0 T | +56.0 T |
| Invoiced MTD | 629.3 T | 663.0 T | +33.7 T |
| Invoiced MTD (Prev Month, same days) | 819.5 T | 909.8 T | +90.3 T (window Jun 1–26 → Jun 1–28) |
| Dispatch D-1 | 40.0 T | 33.7 T | −6.3 T |
| Confirmed Pending Invoice | 71.0 T | 103.0 T | +32.0 T |
| Non-Confirmed | 69.0 T | 93.0 T | +24.0 T |
| Daily Run Rate Required | 186.8 T | 271.8 T | +85.0 T (4 days left vs 6) |
| Physical Inventory (FG) | 1,819.6 T | 1,857.6 T | +38.0 T |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
