# JSW Pipes & Tubes — PB MTD Update (2026-07-25)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-25
Revised Best Estimate --->	1750T
Total Orders --->	754.3T
Current Month Orders --->	673.0T
Invoiced Orders MTD --->	589.3T
Invoiced MTD (Previous Month) --->	803.1T
Dispatch D-1 (Current Month) --->	26.9T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	25.0T
Non-Confirmed Orders --->	140.0T
Daily Run Rate Required --->	165.8T
Physical Inventory --->	1824.3T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	40.0T
Orders Logged D-2 --->	125.0T
```

Notes:
- **Revised Best Estimate** — manually supplied (1750 T for July), not in Supabase.
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (1750 − 589.3) ÷ 7 (Jul 25–31 inclusive) = **165.8 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar to exclude non-working
  days, so this will run slightly low if Sundays/holidays are excluded in the plant's own convention.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–25), for a like-for-like pace comparison — not the full June total. July is pacing
  behind: 589.3 T vs 803.1 T over the same 25 days.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 589.3 + 25.0 + 140.0 = 754.3 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,345.1 − 2,520.8 = **1,824.3 T**. This is the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis production sum is 4,344.9 T (Δ 0.2 T vs live) — negligible master-weight drift, not
  used for this figure.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date
  2026-07-24 and dispatch date 2026-07-24 — one day behind the report date — not necessarily zero activity.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-25)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul) | 589.3 T | Σ line weights = Σ theoretical_weight = 589.305 | ✅ exact |
| Invoiced MTD prev month (Jun 1–25) | 803.1 T | dual-method = 803.144 (same day-of-month) | ✅ exact |
| Dispatch month total | 589.3 T | = Invoiced MTD (partition check) | ✅ |
| Current-month orders | 673.0 T | Σ daily order intake (partition check) | ✅ |
| Total Orders | 754.3 T | 589.3 + 25.0 + 140.0 | ✅ arithmetic |
| Confirmed | 25.0 T | stored bucket, app-consistent (`salesKpis`) | ✅ ERP Release−Invoiced = 25.0 T → no variance |
| Physical Inventory | 1,824.3 T | produced (live master recompute) 4,345.1 − invoiced 2,520.8 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-24, latest `date_of_dispatch` = 2026-07-24 — so
Dispatch D-day and Orders Logged D-day are 0 for lack of loaded data, not zero activity.

## Change vs last report (2026-07-10 → 2026-07-25)

| Metric | 2026-07-10 | 2026-07-25 | Δ |
|---|---|---|---|
| Total Orders | 300.7 T | 754.3 T | +453.6 T |
| Current Month Orders | 226.0 T | 673.0 T | +447.0 T |
| Invoiced MTD | 249.4 T | 589.3 T | +339.9 T |
| Invoiced MTD (Prev Month, same days) | 257.9 T | 803.1 T | +545.2 T (wider window: Jun 1–10 → Jun 1–25) |
| Confirmed Pending Invoice | 26.0 T | 25.0 T | −1.0 T |
| Non-Confirmed | 25.3 T | 140.0 T | +114.7 T |
| Physical Inventory (FG) | 1,559.3 T | 1,824.3 T | +265.0 T |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
