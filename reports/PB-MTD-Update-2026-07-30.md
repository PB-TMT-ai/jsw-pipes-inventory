# JSW Pipes & Tubes — PB MTD Update (2026-07-30)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-30
Revised Best Estimate --->	1750T
Total Orders --->	1249.5T
Current Month Orders --->	1171.0T
Invoiced Orders MTD --->	792.5T
Invoiced MTD (Previous Month) --->	1014.0T
Dispatch D-1 (Current Month) --->	40.9T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	129.0T
Non-Confirmed Orders --->	328.0T
Daily Run Rate Required --->	478.8T
Physical Inventory --->	1774.5T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	242.0T
Orders Logged D-2 --->	186.0T
```

Notes:
- **Revised Best Estimate** — not supplied for this run; **carried over from the 2026-07-25 /
  2026-07-26 / 2026-07-28 reports (1750 T for July)**, same month. Not a Supabase figure —
  correct it if the July target has been revised.
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining in
  July = (1750 − 792.5) ÷ 2 (Jul 30–31 inclusive) = **478.8 T/day**. Uses *calendar* days, not
  working days — the system has no holiday/Sunday calendar. With 957.5 T still to invoice in
  2 days against a July pace of ~37.7 T/day, the 1750 T estimate is **out of reach**; treat
  the run rate as a gap measure, not a plan.
- **Invoiced MTD (Previous Month)** = June invoiced **through the same day-of-month** (Jun 1–30),
  a like-for-like pace comparison — not a full-month figure (June has 30 days, so this happens
  to be all of June). July is pacing behind: 792.5 T vs 1014.0 T (**−221.5 T, −21.8%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 792.5 + 129.0 + 328.0 = 1249.5 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,498.4 − 2,723.9 = **1,774.5 T**. This is the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis production sum is 4,498.2 T (Δ 0.2 T vs live) — negligible master-weight drift, not
  used for this figure.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date
  2026-07-29 and dispatch date 2026-07-29 — one day behind the report date — not necessarily zero activity.
- **Orders Logged D-1 / D-2** (2026-07-29 / 2026-07-28) are genuine values inside the loaded window.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-30) — **PASS**

Every ✅ figure was reproduced by a second independent method.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–30) | 792.5 T | Σ bundle-entry line weights = 792.495 = Σ theoretical_weight | ✅ exact |
| Invoiced MTD prev month (Jun 1–30) | 1014.0 T | dual-method line-sum = 1013.999 (same day-of-month) | ✅ exact |
| Dispatch month total | 792.5 T | Σ of 21 daily dispatch buckets = 792.495 (partition check) | ✅ |
| Current-month orders | 1171.0 T | Σ of 18 daily order buckets = 1171.000 (partition check) | ✅ |
| Total Orders | 1249.5 T | 792.5 + 129.0 + 328.0 | ✅ arithmetic |
| Confirmed | 129.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 128.365 T → **Δ 0.635 T** (advisory; report uses the stored bucket) |
| Physical Inventory | 1,774.5 T | produced (live master recompute) 4,498.4 − invoiced 2,723.9 = Dashboard FG Left Inventory | ✅ matches Dashboard |
| Production stored vs live | 4,498.2 / 4,498.4 T | Δ 0.2 T master-weight drift | ✅ negligible |

**Data freshness:** latest `order_date` = 2026-07-29, latest `date_of_dispatch` = 2026-07-29 —
so Dispatch D-day and Orders Logged D-day are 0 **for lack of loaded data**, not zero activity.

## Change vs last report (2026-07-28 → 2026-07-30)

| Metric | 2026-07-28 | 2026-07-30 | Δ |
|---|---|---|---|
| Total Orders | 859.0 T | 1249.5 T | +390.5 T |
| Current Month Orders | 743.0 T | 1171.0 T | +428.0 T |
| Invoiced MTD | 663.0 T | 792.5 T | +129.5 T |
| Invoiced MTD (Prev Month, same days) | 909.8 T | 1014.0 T | +104.2 T (window Jun 1–28 → Jun 1–30) |
| Dispatch D-1 | 33.7 T | 40.9 T | +7.2 T |
| Confirmed Pending Invoice | 103.0 T | 129.0 T | +26.0 T |
| Non-Confirmed | 93.0 T | 328.0 T | +235.0 T |
| Daily Run Rate Required | 271.8 T | 478.8 T | +207.0 T (2 days left vs 4) |
| Physical Inventory (FG) | 1,857.6 T | 1,774.5 T | −83.1 T |

FG fell because invoicing (+129.5 T) outran production (+46.3 T live-recompute) over these two days.

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
