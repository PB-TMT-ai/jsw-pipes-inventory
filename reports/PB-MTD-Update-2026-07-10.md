# JSW Pipes & Tubes — PB MTD Update (2026-07-10)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-10
Revised Best Estimate --->	2500T
Total Orders --->	300.7T
Current Month Orders --->	226.0T
Invoiced Orders MTD --->	249.4T
Invoiced MTD (Previous Month) --->	257.9T
Dispatch D-1 (Current Month) --->	35.9T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	26.0T
Non-Confirmed Orders --->	25.3T
Daily Run Rate Required --->	102.3T
Physical Inventory --->	1559.3T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	51.0T
```

Notes:
- **Revised Best Estimate** — manually supplied (2500 T for July), not in Supabase.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–10), for a like-for-like pace comparison — not the full June total (1,014.0 T).
  July is pacing slightly behind: 249.4 T vs 257.9 T over the same 10 days.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI).
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (2500 − 249.4) ÷ 22 (Jul 10–31 inclusive) = **102.3 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar to exclude non-working
  days, so this will run slightly low if Sundays/holidays are excluded in the plant's own convention.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  3,740.2 − 2,180.9 = **1,559.3 T**. This is the Dashboard → **Finished Goods → FG Left Inventory**
  card. The app recomputes production weight from the master on every view (`resolveProductionWeights`,
  `App.jsx:2758`) rather than trusting each production row's stored `total_weight` snapshot — those
  snapshots run ~128 T heavier here because the master's `weightPerTube` was edited after the
  productions were saved, so a stored-basis sum (1,687.3 T) overstates it and is not used.
- **Dispatch D Day / Orders Logged D Day / D-1** read 0 because the latest data loaded
  is order_date 2026-07-08 and dispatch date 2026-07-09 — not necessarily zero activity.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-10)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul) | 249.4 T | Σ line weights = Σ theoretical_weight = 249.410 | ✅ exact |
| Invoiced MTD prev month (Jun 1–10) | 257.9 T | dual-method = 257.930 (same day-of-month) | ✅ exact |
| Dispatch month total | 249.4 T | = Invoiced MTD (partition check) | ✅ |
| Current-month orders | 226.0 T | Σ daily order intake = 226 (partition check) | ✅ |
| Total Orders | 300.7 T | 249.4 + 26.0 + 25.3 | ✅ arithmetic |
| Confirmed | 26.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 24.8 T → 1.2 T source variance |
| Physical Inventory | 1,559.3 T | produced (live master recompute) 3,740.2 − invoiced 2,180.9 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-08, latest `date_of_dispatch` = 2026-07-09 — so
Dispatch D-day and Orders Logged D / D-1 are 0 for lack of loaded data, not zero activity.

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
