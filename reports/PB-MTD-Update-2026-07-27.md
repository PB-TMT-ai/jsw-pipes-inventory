# JSW Pipes & Tubes — PB MTD Update (2026-07-27)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-27
Revised Best Estimate --->	1750T
Total Orders --->	769.3T
Current Month Orders --->	687.0T
Invoiced Orders MTD --->	629.3T
Invoiced MTD (Previous Month) --->	909.8T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	71.0T
Non-Confirmed Orders --->	69.0T
Daily Run Rate Required --->	224.1T
Physical Inventory --->	1873.4T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	39.0T
```

Notes:
- **Data is two days stale.** Latest `order_date` = 2026-07-25 and latest `date_of_dispatch`
  = 2026-07-25. So Dispatch D / D-1 and Orders Logged D / D-1 all read 0 **for lack of loaded
  data**, not zero activity. Order/invoice MTD totals are unchanged from the 2026-07-26 report
  for the same reason — no new sales upload since then.
- **Revised Best Estimate** — not supplied for this run; **carried over from the 2026-07-26
  report (1750 T for July)**, same month. Not a Supabase figure — correct it if the July
  target has been revised.
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (1750 − 629.3) ÷ 5 (Jul 27–31 inclusive) = **224.1 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar, so this runs low
  against a working-day convention.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–27), for a like-for-like pace comparison — not the full June total. July is pacing
  well behind: 629.3 T vs 909.8 T over the same 27 days (**−280.5 T, −30.8%**). The gap widened
  sharply because June booked ~90 T on Jun 27 while July's D/D-1 have no data loaded.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 629.3 + 71.0 + 69.0 = 769.3 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,434.1 − 2,560.8 = **1,873.4 T**. This is the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis production sum is 4,433.9 T (Δ 0.2 T vs live) — negligible master-weight drift, not
  used for this figure. FG rose +53.8 T vs yesterday: production was recorded while no new
  dispatches were loaded.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-27) — **PASS**

Every ✅ figure was reproduced by a second independent method.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–27) | 629.3 T | Σ bundle-entry line weights = 629.310 = Σ theoretical_weight | ✅ exact |
| Invoiced MTD prev month (Jun 1–27) | 909.8 T | dual-method line-sum = 909.769 (same day-of-month) | ✅ exact |
| Dispatch month total | 629.3 T | Σ of 18 daily dispatch buckets = 629.310 (partition check) | ✅ |
| Current-month orders | 687.0 T | Σ of 15 daily order buckets = 687.000 (partition check) | ✅ |
| Total Orders | 769.3 T | 629.3 + 71.0 + 69.0 | ✅ arithmetic |
| Confirmed | 71.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 70.75 T → **Δ 0.25 T** (advisory; report uses the stored bucket) |
| Physical Inventory | 1,873.4 T | produced (live master recompute) 4,434.1 − invoiced 2,560.8 = Dashboard FG Left Inventory | ✅ matches Dashboard |
| Production stored vs live | 4,433.9 / 4,434.1 T | Δ 0.2 T master-weight drift | ✅ negligible |

**Data freshness:** latest `order_date` = 2026-07-25, latest `date_of_dispatch` = 2026-07-25 —
**two days behind the report date**. Dispatch D / D-1 and Orders Logged D / D-1 are 0 **for lack
of loaded data**, not zero activity. Run the daily Sales Excel upload to refresh.

## Change vs last report (2026-07-26 → 2026-07-27)

| Metric | 2026-07-26 | 2026-07-27 | Δ |
|---|---|---|---|
| Total Orders | 769.3 T | 769.3 T | 0 (no new sales upload) |
| Current Month Orders | 687.0 T | 687.0 T | 0 (no new sales upload) |
| Invoiced MTD | 629.3 T | 629.3 T | 0 (no new sales upload) |
| Invoiced MTD (Prev Month, same days) | 819.5 T | 909.8 T | +90.3 T (window Jun 1–26 → Jun 1–27) |
| Dispatch D-1 | 40.0 T | 0 T | −40.0 T (D-1 = Jul 26, no data loaded) |
| Confirmed Pending Invoice | 71.0 T | 71.0 T | 0 |
| Non-Confirmed | 69.0 T | 69.0 T | 0 |
| Daily Run Rate Required | 186.8 T | 224.1 T | +37.3 T (5 days left vs 6) |
| Physical Inventory (FG) | 1,819.6 T | 1,873.4 T | +53.8 T (production booked, no new dispatch) |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
