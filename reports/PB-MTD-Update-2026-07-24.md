# JSW Pipes & Tubes — PB MTD Update (2026-07-24)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-24
Revised Best Estimate --->	1750T
Total Orders --->	713.4T
Current Month Orders --->	633.0T
Invoiced Orders MTD --->	562.4T
Invoiced MTD (Previous Month) --->	750.6T
Dispatch D-1 (Current Month) --->	25.4T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	25.0T
Non-Confirmed Orders --->	126.0T
Daily Run Rate Required --->	148.5T
Physical Inventory --->	1835.4T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	125.0T
Orders Logged D-2 --->	26.0T
```

Notes:
- **Revised Best Estimate** — manually supplied (1,750 T for July), not in Supabase.
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–24), for a like-for-like pace comparison — not the full June total.
  July is pacing behind: 562.4 T vs 750.6 T over the same 24 days.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 562.4 + 25.0 + 126.0 = 713.4 T.
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (1,750 − 562.4) ÷ 8 (Jul 24–31 inclusive) = **148.5 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar to exclude non-working
  days, so this will run slightly low if Sundays/holidays are excluded in the plant's own convention.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,329.3 − 2,493.9 = **1,835.4 T**. This is the Dashboard → **Finished Goods → FG Left Inventory**
  card. The app recomputes production weight from the master on every view (`resolveProductionWeights`,
  `App.jsx:2758`) rather than trusting each production row's stored `total_weight` snapshot — that
  stored-basis sum (4,329.1 T) is 0.2 T lighter here, a negligible data-hygiene delta.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded
  is order_date 2026-07-23 and dispatch date 2026-07-23 — not necessarily zero activity for 07-24.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-24)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul) | 562.4 T | Σ line weights = Σ theoretical_weight = 562.440 | ✅ exact |
| Invoiced MTD prev month (Jun 1–24) | 750.6 T | dual-method = 750.644 (same day-of-month) | ✅ exact |
| Dispatch month total | 562.4 T | = Invoiced MTD (partition check) | ✅ |
| Total Orders | 713.4 T | 562.4 + 25.0 + 126.0 | ✅ arithmetic |
| Confirmed | 25.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 24.705 T → 0.295 T source variance |
| Physical Inventory | 1,835.4 T | produced (live master recompute) 4,329.3 − invoiced 2,493.9 = Dashboard FG Left Inventory | ✅ matches Dashboard (stored-basis produced 4,329.1 T, 0.2 T hygiene delta) |

**Data freshness:** latest `order_date` = 2026-07-23, latest `date_of_dispatch` = 2026-07-23 — so
Dispatch D-day and Orders Logged D-day are 0 for lack of loaded data on 07-24, not zero activity.

## Change vs last report (2026-07-10 → 2026-07-24)

| Line | 2026-07-10 | 2026-07-24 | Δ |
|---|---|---|---|
| Revised Best Estimate | 2,500 T | 1,750 T | −750 T |
| Total Orders | 300.7 T | 713.4 T | +412.7 T |
| Current Month Orders | 226.0 T | 633.0 T | +407.0 T |
| Invoiced Orders MTD | 249.4 T | 562.4 T | +313.0 T |
| Invoiced MTD (Prev Month, same days) | 257.9 T | 750.6 T | +492.7 T |
| Dispatch D-1 | 35.9 T | 25.4 T | −10.5 T |
| Confirmed Pending | 26.0 T | 25.0 T | −1.0 T |
| Non-Confirmed | 25.3 T | 126.0 T | +100.7 T |
| Daily Run Rate Required | 102.3 T | 148.5 T | +46.2 T |
| Physical Inventory | 1,559.3 T | 1,835.4 T | +276.1 T |

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._
